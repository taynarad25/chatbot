const crypto = require("crypto");
const { promisify } = require("util");
const pbkdf2 = promisify(crypto.pbkdf2);
const db = require("../db");

const COOKIE_NAME = "whatsapp_control_session";
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 dias de sessão persistente
const sessions = {};

async function validatePassword(password, salt, hash) {
  try {
    if (!salt || !hash) return false;
    const derivedKey = await pbkdf2(password, salt, 100000, 64, "sha512");
    console.log(`[Auth] Validating password.`);
    const derivedBuffer = derivedKey;
    const hashBuffer = Buffer.from(hash, "hex");
    // timingSafeEqual exige buffers do mesmo tamanho; tamanhos diferentes já indicam senha inválida
    if (derivedBuffer.length !== hashBuffer.length) return false;
    return crypto.timingSafeEqual(derivedBuffer, hashBuffer);
  } catch (err) {
    return false;
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await pbkdf2(password.trim(), salt, 100000, 64, "sha512")).toString("hex");
  return { salt, hash };
}

function createSession(username, role, status = 'active') {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL;
  const sessionData = { username, role, status, createdAt: now, expiresAt };
  sessions[token] = sessionData;

  try {
    if (db) {
      db.prepare(`
        INSERT INTO sessions (id, username, role, status, createdAt, expiresAt)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          username = excluded.username,
          role = excluded.role,
          status = excluded.status,
          createdAt = excluded.createdAt,
          expiresAt = excluded.expiresAt
      `).run(token, username, role, status, now, expiresAt);
    }
  } catch (err) {
    console.error("[Auth] Erro ao persistir sessão no banco:", err.message);
  }

  return token;
}

function getSessionId(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  
  const cookies = {};
  cookie.split(';').forEach(c => {
    const [key, ...value] = c.trim().split('=');
    if (key) cookies[key] = value.join('=');
  });
  return cookies[COOKIE_NAME];
}

function getSession(req) {
  const sessionId = getSessionId(req);

  if (!sessionId) return null;

  let session = sessions[sessionId];

  if (!session && db) {
    try {
      const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
      if (row) {
        session = {
          username: row.username,
          role: row.role,
          status: row.status,
          createdAt: Number(row.createdAt),
          expiresAt: Number(row.expiresAt)
        };
        sessions[sessionId] = session;
      }
    } catch (err) {
      console.error("[Auth] Erro ao recuperar sessão do banco:", err.message);
    }
  }

  if (!session) return null;

  const now = Date.now();
  if (now > (session.expiresAt || (session.createdAt + SESSION_TTL))) {
    delete sessions[sessionId];
    try {
      if (db) db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    } catch {}
    return null;
  }

  return { ...session, id: sessionId };
}

function isAuthenticated(req) {
  const session = getSession(req);
  // Permite acesso se o status for 'active' ou se não estiver definido (caso de usuários legados/admin)
  return session && (session.status === 'active' || session.status === undefined);
}

function isAdmin(req) {
  const session = getSession(req);
  return session && session.role === 'admin';
}

function setSessionCookie(res, token) {
  const expires = new Date(Date.now() + SESSION_TTL).toUTCString();
  const maxAgeSec = Math.floor(SESSION_TTL / 1000);
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Expires=${expires}; Max-Age=${maxAgeSec}; SameSite=Strict`);
}

function clearSessionCookie(res, sessionId) {
  if (sessionId) {
    delete sessions[sessionId];
    try {
      if (db) db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    } catch {}
  }
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Strict`);
}

module.exports = { validatePassword, hashPassword, createSession, getSession, getSessionId, isAuthenticated, isAdmin, setSessionCookie, clearSessionCookie, sessions };