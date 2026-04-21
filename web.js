const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { promisify } = require("util");
const crypto = require("crypto");
const pbkdf2 = promisify(crypto.pbkdf2);

const usersStore = require("./web/users");
const auth = require("./web/auth");
const views = require("./web/views");

const loginAttempts = {};

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
        if (loginAttempts[ip] && loginAttempts[ip] > 5) return sendJson(res, 429, { ok: false, message: 'Bloqueado por tentativas.' });

        const user = currentUsers[username];
        if (user && await auth.validatePassword(password, user.salt, user.hash)) {
          const token = auth.createSession(username, user.role);
          delete loginAttempts[ip];
          auth.setSessionCookie(res, token);
          return sendJson(res, 200, { ok: true });
        }
        loginAttempts[ip] = (loginAttempts[ip] || 0) + 1;
        return sendJson(res, 401, { ok: false, message: 'Usuário ou senha inválidos.' });
      } catch (err) { return sendJson(res, 400, { ok: false, message: 'Erro ao processar login.' }); }
    }

    if (req.method === 'POST' && pathName === '/register') {
      if (hasAdminUser) return sendJson(res, 403, { ok: false, message: 'Cadastro desativado.' });
      try {
        const body = await parseRequestBody(req);
        const { username, password } = body;
        if (!username || !password || username.length < 3 || password.length < 6) {
          return sendJson(res, 400, { ok: false, message: 'Usuário (min 3) ou senha (min 6) muito curtos.' });
        }
        if (currentUsers[username]) return sendJson(res, 400, { ok: false, message: 'Já existe.' });
        
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = (await pbkdf2(password, salt, 100000, 64, "sha512")).toString("hex");

        usersStore.saveUser({ username, salt, hash, role: 'user', createdAt: new Date().toISOString() });
        return sendJson(res, 201, { ok: true, message: 'Usuário cadastrado com sucesso.' });
      } catch (err) { console.error("[Web] Erro no cadastro:", err); return sendJson(res, 500, { ok: false, message: 'Erro ao processar cadastro.' }); }
    }

    if (!auth.isAuthenticated(req) && pathName !== '/login' && pathName !== '/register') {
      if (req.method === 'GET') { res.writeHead(302, { Location: '/login' }); return res.end(); }
      return sendJson(res, 401, { ok: false, message: 'Login requerido.' });
    }

    if (req.method === 'GET' && (pathName === '/' || pathName === '/whatsappcontrol')) return sendHtml(res, views.renderIndexHtml());

    if (pathName.startsWith('/admin')) {
      if (!auth.isAdmin(req)) return sendJson(res, 403, { ok: false, message: 'Acesso negado.' });
      if (req.method === 'GET' && pathName === '/api/admin/users') return sendJson(res, 200, { ok: true, users: Object.values(currentUsers) });
      
      if (req.method === 'POST' && pathName === '/api/admin/users') {
        try {
          const body = await parseRequestBody(req);
          const username = body.username?.trim();
          const password = body.password?.trim();
          const role = body.role?.trim();

          if (!username || !password || !role) {
            return sendJson(res, 400, { ok: false, message: 'Dados incompletos.' });
          }
          if (username.length < 3 || password.length < 6) {
            return sendJson(res, 400, { ok: false, message: 'Usuário (min 3) ou senha (min 6) muito curtos.' });
          }
          if (currentUsers[username]) return sendJson(res, 400, { ok: false, message: 'Já existe.' });

          const salt = crypto.randomBytes(16).toString("hex");
          const hash = (await pbkdf2(password, salt, 100000, 64, "sha512")).toString("hex");
          usersStore.saveUser({ username, salt, hash, role, createdAt: new Date().toISOString() });
          return sendJson(res, 201, { ok: true, message: 'Usuário adicionado com sucesso.' });
        } catch (err) { console.error("[Web] Erro ao adicionar usuário:", err); return sendJson(res, 500, { ok: false, message: 'Erro ao adicionar usuário.' }); }
      }
      
      if (req.method === 'DELETE' && pathName.startsWith('/api/admin/users/')) {
        const usernameToDelete = pathName.split('/').pop();
        if (currentUsers[usernameToDelete]?.role !== 'admin') {
          usersStore.deleteUser(usernameToDelete);
          return sendJson(res, 200, { ok: true, message: `Usuário '${usernameToDelete}' excluído.` });
        }
        return sendJson(res, 403, { ok: false, message: `Não é possível excluir o usuário '${usernameToDelete}'.` });
      }
    }

    if (req.method === 'GET' && pathName === '/status') return sendJson(res, 200, getStatus());
    
    if (req.method === 'GET' && pathName === '/api/logs') {
      if (!auth.isAdmin(req)) return sendJson(res, 403, { ok: false, message: 'Acesso negado. Apenas administradores podem ver os logs.' });
      try {
        const log = fs.readFileSync(path.join(process.cwd(), "combined.log"), 'utf8');
        return sendJson(res, 200, { ok: true, logs: log.split('\n').slice(-50).join('\n') });
      } catch (e) { return sendJson(res, 200, { ok: true, logs: "Nenhum log gerado ainda." }); }
    }

    if (req.method === 'POST' && pathName === '/request-qr') {
      const status = getStatus();
      if (status.connected) return sendJson(res, 200, { ok: false, message: 'O bot já está conectado.' });
      await startClient();
      return sendJson(res, 200, { ok: true, message: 'Solicitação de QR enviada.' });
    }
    if (req.method === 'POST' && pathName === '/cancel-qr') {
      await cancelQr();
      return sendJson(res, 200, { ok: true, message: 'Solicitação de QR cancelada.' });
    }
    if (req.method === 'POST' && pathName === '/disconnect') {
      const result = await disconnectClient();
      return sendJson(res, result.ok ? 200 : 500, result);
    }
    
    if (req.method === 'GET' && pathName === '/api/user-info') {
      const session = auth.getSession(req);
      if (session) return sendJson(res, 200, { ok: true, user: { username: session.username, role: session.role } });
      return sendJson(res, 401, { ok: false, message: 'Não autenticado.' }); // Adicionado mensagem para consistência
    }

    if (req.method === 'POST' && pathName === '/logout') {
      const session = auth.getSession(req);
      auth.clearSessionCookie(res, session?.id);
      return sendJson(res, 200, { ok: true });
    }

    res.writeHead(404); res.end('Not Found');
  }).listen(3000, '0.0.0.0', () => console.log('✅ Web rodando em :3000'));
}

module.exports = { startWebServer };
