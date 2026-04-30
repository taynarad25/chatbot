const http = require("http");
const { URL } = require("url");
const { loadUsers, saveUser, initAdmin } = require("./web/users");
const { validatePassword, createSession, isAuthenticated, setSessionCookie, clearSessionCookie, getSessionId, sessions } = require("./web/auth");
const { renderLoginHtml, renderRegisterHtml, renderIndexHtml } = require("./web/views");

const loginAttempts = {}; // Simples rate limiting em memória


function findUser(username) {
  const users = loadUsers();
  return users[username] || null;
}

async function addUser({ username, password, role = 'user', status = 'active' }) {
  const users = loadUsers();
  if (users[username]) return { ok: false, message: "Usuário já existe" };
  
  const crypto = require("crypto");
  const salt = crypto.randomBytes(16).toString("hex");
  const pbkdf2 = require("util").promisify(crypto.pbkdf2);
  const hash = (await pbkdf2(password, salt, 100000, 64, "sha512")).toString("hex");

  saveUser({
    username,
    salt,
    hash,
    status,
    role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return { ok: true };
}

/**
 * Obtém o IP real do cliente, considerando proxies/Docker
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.socket.remoteAddress;
}

function sendJson(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendHtml(res, html) {
  if (res.headersSent) return;
  // Configura os cabeçalhos de segurança antes de enviar para evitar ERR_HTTP_HEADERS_SENT
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
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        if (req.headers["content-type"]?.includes("application/json")) {
          resolve(JSON.parse(body));
        } else {
          const params = new URLSearchParams(body);
          const data = {};
          for (const [key, value] of params.entries()) {
            data[key] = value;
          }
          resolve(data);
        }
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function startWebServer({ getStatus, startClient, cancelQr, disconnectClient }) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;
      const ip = getClientIp(req);
      // Log de toda requisição recebida
      console.log(`[Web] ${req.method} ${path} - IP: ${ip}`);
      if (req.method === 'GET' && path === '/login') {
        return sendHtml(res, renderLoginHtml());   
      }
      if (req.method === 'POST' && path === '/login') {
        try {
          const body = await parseRequestBody(req);
          const username = body.username?.trim();
          const password = body.password?.trim();

          if (loginAttempts[ip] && loginAttempts[ip] > 5) {
              return sendJson(res, 429, { ok: false, message: 'Muitas tentativas. Tente novamente mais tarde.' });
          }

          const user = findUser(username);
          const isPassValid = user ? await validatePassword(password, user.salt, user.hash) : false;

          if (user && isPassValid && (user.status === 'active' || user.status === undefined)) {
            const token = createSession();
            delete loginAttempts[ip];
            setSessionCookie(res, token);
            console.log(`[Web] Login bem-sucedido: ${username}`);
            return sendJson(res, 200, { ok: true });
          }
          loginAttempts[ip] = (loginAttempts[ip] || 0) + 1;
          return sendJson(res, 401, { ok: false, message: 'Usuário ou senha inválidos.' });
        } catch (err) {
          console.error(`[Web] Erro ao processar login: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Falha ao processar login.' });
        }
      }
      if (path !== '/login' && !isAuthenticated(req)) {
        if (req.method === 'GET') {
          res.writeHead(302, { Location: '/login' });
          return res.end();
        }
        return sendJson(res, 401, { ok: false, message: 'Login requerido.' });
      }
      if (req.method === 'GET' && path === '/register') {
        return sendHtml(res, renderRegisterHtml());
      
      }
      if (req.method === 'POST' && path === '/register') {
        try {
          const body = await parseRequestBody(req);
          const result = await addUser(body);
          return sendJson(res, result.ok ? 200 : 400, result);
        } catch (err) {
          console.error(`[Web] Erro no registro: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Dados inválidos.' });
        }
      }
      if (req.method === 'GET' && path === '/') {
        res.writeHead(302, { Location: '/whatsappcontrol' });
        return res.end();
      }
      if (req.method === 'GET' && path === '/whatsappcontrol') {
        return sendHtml(res, renderIndexHtml());
      }
      if (req.method === 'GET' && path === '/status') {
        return sendJson(res, 200, getStatus());
      }
      if (req.method === 'POST' && path === '/request-qr') {
        const status = getStatus();
        if (status.connected) {
          return sendJson(res, 200, { ok: false, message: 'Bot conectado.' });
        }
        await startClient();
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/cancel-qr') {
        await cancelQr();
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/disconnect') {
        const result = await disconnectClient();
        return sendJson(res, result.ok ? 200 : 500, result);
      }
      if (req.method === 'POST' && path === '/logout') {
        const sessionId = getSessionId(req);
        if (sessionId) delete sessions[sessionId];
        clearSessionCookie(res);
        return sendJson(res, 200, { ok: true });
      }
      // Rota não encontrada
      console.warn(`[Web] 404 Not Found: ${req.method} ${path}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch (globalErr) {
      console.error(`[Web] 500 Internal Server Error em ${req.url}:`, globalErr);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'Erro interno no servidor.' }));
      }
    }
  });

  // Captura erros globais do servidor para evitar crash e logar Erro 500
  server.on('error', (err) => {
    console.error(`[Web] Erro crítico no servidor:`, err);
  });

  server.listen(3000, '0.0.0.0', () => {
    console.log('✅ Site de controle rodando em http://0.0.0.0:3000');
  });
}

// Removido getUsers que não estava definido e corrigido exportação
module.exports = { startWebServer, addUser };
