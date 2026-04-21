const crypto = require("crypto");
const { promisify } = require("util");
const pbkdf2 = promisify(crypto.pbkdf2);

const COOKIE_NAME = "whatsapp_control_session";
const SESSION_TTL = 1000 * 60 * 15;
const sessions = {};

async function validatePassword(password, salt, hash) {
  try {
    const derivedKey = await pbkdf2(password, salt, 100000, 64, "sha512");
    return derivedKey.toString("hex") === hash;
  } catch (err) {
    return false;
  }
}

function createSession(username, role) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = { username, role, createdAt: Date.now() };
  return token;
}

function getSession(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  
  const cookies = Object.fromEntries(cookie.split(';').map(c => c.trim().split('=')));
  const sessionId = cookies[COOKIE_NAME];

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
  return !!getSession(req);
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

module.exports = { validatePassword, createSession, getSession, isAuthenticated, isAdmin, setSessionCookie, clearSessionCookie, sessions };