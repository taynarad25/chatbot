const crypto = require("crypto");
const { promisify } = require("util");
const pbkdf2 = promisify(crypto.pbkdf2);

const COOKIE_NAME = "whatsapp_control_session";
const SESSION_TTL = 1000 * 60 * 15;
const sessions = {};

async function validatePassword(password, salt, hash) {
  try {
    const derivedKey = await pbkdf2(password, salt, 100000, 64, "sha512");
    const derivedKeyHex = derivedKey.toString("hex");
    console.log(`[Auth] Validating password.`);
    return derivedKeyHex === hash;
  } catch (err) {
    return false;
  }
}

function createSession(username, role, status = 'active') {
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = { username, role, status, createdAt: Date.now() };
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
  const session = sessions[sessionId];
  if (!session) return null;

  if (Date.now() - session.createdAt > SESSION_TTL) {
    delete sessions[sessionId];
    return null;
  }
  session.createdAt = Date.now();
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
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Expires=${expires}; SameSite=Strict`);
}

function clearSessionCookie(res, sessionId) {
  if (sessionId) delete sessions[sessionId];
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

module.exports = { validatePassword, createSession, getSession, getSessionId, isAuthenticated, isAdmin, setSessionCookie, clearSessionCookie, sessions };