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
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com"
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
    const userCount = Object.keys(currentUsers).length;
    const hasAdminUser = Object.values(currentUsers).some(u => u.role === 'admin');

    if (req.method === 'GET' && pathName === '/register') {
      // Self-registration is disabled if an admin user already exists
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

        if (user) {
          if (user.status === 'pending_password_creation') {
            // For users created by admin, redirect to set password page
            const tempToken = auth.createSession(username, user.role, 'pending_password_setup'); // Create a temporary session
            auth.setSessionCookie(res, tempToken);
            return sendJson(res, 200, { ok: true, redirect: '/set-password' });
          } else if (await auth.validatePassword(password, user.salt, user.hash)) {
            console.log(`[Web] Login realizado com sucesso: ${username} (IP: ${ip})`);
            const token = auth.createSession(username, user.role);
            delete loginAttempts[ip];
            auth.setSessionCookie(res, token);
            return sendJson(res, 200, { ok: true });
          }
        }

        console.warn(`[Web] Tentativa de login falhou para: ${username} (IP: ${ip})`);
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

        usersStore.saveUser({ username, salt, hash, role: 'user', createdAt: new Date().toISOString(), status: 'active' });
        console.log(`[Web] Novo registro de usuário: ${username}`);
        return sendJson(res, 201, { ok: true, message: 'Usuário cadastrado com sucesso.' });
      } catch (err) { console.error("[Web] Erro no cadastro:", err); return sendJson(res, 500, { ok: false, message: 'Erro ao processar cadastro.' }); }
    }

    if (!auth.isAuthenticated(req) && pathName !== '/login' && pathName !== '/register') {
      if (req.method === 'GET') { res.writeHead(302, { Location: '/login' }); return res.end(); }
      return sendJson(res, 401, { ok: false, message: 'Login requerido.' });
    }

    if (req.method === 'GET' && (pathName === '/' || pathName === '/whatsappcontrol')) return sendHtml(res, views.renderIndexHtml());

    if (pathName.startsWith('/api/admin')) {
      if (!auth.isAdmin(req)) return sendJson(res, 403, { ok: false, message: 'Acesso negado.' });
      if (req.method === 'GET' && (pathName === '/api/admin/users' || pathName === '/api/admin/users/')) return sendJson(res, 200, { ok: true, users: Object.values(currentUsers) });
      
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
          console.log(`[Admin] Usuário '${username}' criado por '${auth.getSession(req).username}'`);
          return sendJson(res, 201, { ok: true, message: 'Usuário adicionado com sucesso.' });
        } catch (err) { console.error("[Web] Erro ao adicionar usuário:", err); return sendJson(res, 500, { ok: false, message: 'Erro ao adicionar usuário.' }); }
      }
      
      if (req.method === 'DELETE' && pathName.startsWith('/api/admin/users/')) {
        const usernameToDelete = pathName.split('/').pop();
        if (currentUsers[usernameToDelete]?.role !== 'admin') {
          usersStore.deleteUser(usernameToDelete);
          console.log(`[Admin] Usuário '${usernameToDelete}' excluído por '${auth.getSession(req).username}'`);
          return sendJson(res, 200, { ok: true, message: `Usuário '${usernameToDelete}' excluído.` });
        }
        return sendJson(res, 403, { ok: false, message: `Não é possível excluir o usuário '${usernameToDelete}'.` });
      }
    }

    if (req.method === 'GET' && pathName === '/status') return sendJson(res, 200, getStatus());
    
    if (req.method === 'GET' && pathName === '/api/logs') {
      const session = auth.getSession(req);
      if (!session || !auth.isAdmin(req)) {
        console.warn(`[Web] Tentativa de acesso a logs por não-admin ou não autenticado (User: ${session?.username || 'N/A'}, IP: ${getClientIp(req)})`);
        return sendJson(res, 403, { ok: false, message: 'Acesso negado. Apenas administradores podem ver os logs.' });
      }
      const logFilePath = path.join(process.cwd(), "combined.log");
      console.log(`[Web] Admin '${session.username}' solicitou logs. Tentando ler de: ${logFilePath}`);
      try {
        if (!fs.existsSync(logFilePath)) {
          console.warn(`[Web] Arquivo de log não encontrado em: ${logFilePath}`);
          return sendJson(res, 200, { ok: true, logs: "Arquivo de log 'combined.log' não encontrado no servidor." });
        }
        const logContent = fs.readFileSync(logFilePath, 'utf8');
        const lastLines = logContent.split('\n').slice(-50).join('\n');
        console.log(`[Web] Logs lidos com sucesso para '${session.username}'. ${lastLines.length} caracteres enviados.`);
        return sendJson(res, 200, { ok: true, logs: lastLines });
      } catch (e) {
        console.error(`[Web] Erro ao ler arquivo de log para '${session.username}':`, e);
        return sendJson(res, 200, { ok: true, logs: `Erro ao ler log: ${e.message}` });
      }
    }

    if (req.method === 'POST' && pathName === '/request-qr') {
      const status = getStatus();
      if (status.connected) return sendJson(res, 200, { ok: false, message: 'O bot já está conectado.' });
      console.log(`[Web] Comando: Solicitar QR Code (por: ${auth.getSession(req).username})`);
      await startClient();
      return sendJson(res, 200, { ok: true, message: 'Solicitação de QR enviada.' });
    }
    if (req.method === 'POST' && pathName === '/cancel-qr') {
      console.log(`[Web] Comando: Cancelar QR Code (por: ${auth.getSession(req).username})`);
      await cancelQr();
      return sendJson(res, 200, { ok: true, message: 'Solicitação de QR cancelada.' });
    }
    if (req.method === 'POST' && pathName === '/disconnect') {
      console.log(`[Web] Comando: Desconectar WhatsApp (por: ${auth.getSession(req).username})`);
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
      if (session) console.log(`[Web] Logout realizado: ${session.username} (ID da sessão: ${session.id})`);
      auth.clearSessionCookie(res, session?.id);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { ok: false, message: 'Rota não encontrada.' });
  }).listen(3000, '0.0.0.0', () => console.log('✅ Web rodando em :3000'));
}

module.exports = { startWebServer };
