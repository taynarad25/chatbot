const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const crypto = require("crypto"); // Necessário para gerar salt/hash no registro

const usersStore = require("./web/users");
const auth = require("./web/auth");
const views = require("./web/views");

const loginAttempts = {}; // Simples rate limiting em memória

// Configuração inicial vinda do .env
usersStore.initAdmin(
  process.env.WHATSAPP_CONTROL_USER?.trim(),
  process.env.WHATSAPP_CONTROL_SALT?.trim(),
  process.env.WHATSAPP_CONTROL_HASH?.trim()
);

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.socket.remoteAddress;
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendHtml(res, html) {
  res.writeHead(200, { 
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
  });
  res.end(html);
}

async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = ""; 
    req.on("data", chunk => body += chunk.toString());
    req.on("end", () => {
      try {
        resolve(req.headers["content-type"]?.includes("application/json") ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body)));
      } catch (e) { reject(e); }
    });
  });
}

function startWebServer({ getStatus, startClient, cancelQr, disconnectClient }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathName = url.pathname;

    if (req.method === 'GET' && pathName === '/login') return sendHtml(res, views.renderLoginHtml());

    const currentUsers = usersStore.loadUsers();
    const hasAdminUser = Object.values(currentUsers).some(u => u.role === 'admin');

    if (req.method === 'GET' && pathName === '/register') {
      return hasAdminUser ? sendHtml(res, views.renderRegisterHtml("Desativado.")) : sendHtml(res, views.renderRegisterHtml());
    }

    if (req.method === 'POST' && pathName === '/login') {
      try {
        const body = await parseRequestBody(req);
        const username = body.username?.trim();
        const password = body.password?.trim();
        const ip = getClientIp(req); 
        if (loginAttempts[ip] > 5) return sendJson(res, 429, { ok: false, message: 'Bloqueado por tentativas.' });

        const user = currentUsers[username];
        if (user && await auth.validatePassword(password, user.salt, user.hash)) {
          const token = auth.createSession(username, user.role);
          delete loginAttempts[ip];
          auth.setSessionCookie(res, token);
          return sendJson(res, 200, { ok: true });
        }
        loginAttempts[ip] = (loginAttempts[ip] || 0) + 1;
        return sendJson(res, 401, { ok: false, message: 'Usuário ou senha inválidos.' });
      } catch (err) { return sendJson(res, 400, { ok: false }); }
    }

    if (req.method === 'POST' && pathName === '/register') {
      if (hasAdminUser) return sendJson(res, 403, { ok: false });
      try {
        const body = await parseRequestBody(req);
        const { username, password } = body;
        if (currentUsers[username]) return sendJson(res, 400, { ok: false, message: 'Já existe.' });
        
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = (await promisify(crypto.pbkdf2)(password, salt, 100000, 64, "sha512")).toString("hex");

        usersStore.saveUser({ username, salt, hash, role: 'user', createdAt: new Date().toISOString() });
        return sendJson(res, 201, { ok: true, message: 'Usuário cadastrado com sucesso.' });
      } catch (err) { return sendJson(res, 500, { ok: false }); }
    }

    if (!auth.isAuthenticated(req) && pathName !== '/login' && pathName !== '/register') {
      if (req.method === 'GET') { res.writeHead(302, { Location: '/login' }); return res.end(); }
      return sendJson(res, 401, { ok: false });
    }

    if (req.method === 'GET' && (pathName === '/' || pathName === '/whatsappcontrol')) return sendHtml(res, views.renderIndexHtml());

    if (pathName.startsWith('/admin')) {
      if (!auth.isAdmin(req)) return sendJson(res, 403, { ok: false });
      if (req.method === 'GET' && pathName === '/api/admin/users') return sendJson(res, 200, { ok: true, users: Object.values(currentUsers) });
      
      if (req.method === 'POST' && pathName === '/api/admin/users') {
        const body = await parseRequestBody(req);
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = (await promisify(crypto.pbkdf2)(body.password, salt, 100000, 64, "sha512")).toString("hex");
        usersStore.saveUser({ username: body.username, salt, hash, role: body.role, createdAt: new Date().toISOString() });
        return sendJson(res, 201, { ok: true, message: 'Adicionado.' });
      }
      
      if (req.method === 'DELETE' && pathName.startsWith('/api/admin/users/')) {
        const usernameToDelete = pathName.split('/').pop();
        if (currentUsers[usernameToDelete]?.role !== 'admin') {
          usersStore.deleteUser(usernameToDelete);
          return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 403, { ok: false });
      }
    }

    if (req.method === 'GET' && pathName === '/status') return sendJson(res, 200, getStatus());
    
    if (req.method === 'GET' && pathName === '/api/logs') {
      if (!auth.isAdmin(req)) return sendJson(res, 403, { ok: false });
      try {
        const log = fs.readFileSync(path.join(process.cwd(), "combined.log"), 'utf8');
        return sendJson(res, 200, { ok: true, logs: log.split('\n').slice(-50).join('\n') });
      } catch (e) { return sendJson(res, 200, { ok: true, logs: "Vazio" }); }
    }

    if (req.method === 'POST' && pathName === '/request-qr') { await startClient(); return sendJson(res, 200, { ok: true }); }
    if (req.method === 'POST' && pathName === '/cancel-qr') { await cancelQr(); return sendJson(res, 200, { ok: true }); }
    if (req.method === 'POST' && pathName === '/disconnect') return sendJson(res, 200, await disconnectClient());
    
    if (req.method === 'GET' && pathName === '/api/user-info') {
      const session = auth.getSession(req);
      if (session) return sendJson(res, 200, { ok: true, user: { username: session.username, role: session.role } });
      return sendJson(res, 401, { ok: false });
    }

    if (req.method === 'POST' && pathName === '/logout') {
      const session = auth.getSession(req);
      auth.clearSessionCookie(res, session?.id);
      return sendJson(res, 200, { ok: true });
    }

    res.writeHead(404); res.end();
  }).listen(3000, '0.0.0.0', () => console.log('✅ Web rodando em :3000'));
}

module.exports = { startWebServer };
