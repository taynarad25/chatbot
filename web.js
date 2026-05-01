const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const crypto = require("crypto"); // Already imported in auth.js, but needed here for addUser
const { promisify } = require("util");
const { loadUsers, saveUser, deleteUser } = require("./web/users");
const { validatePassword, createSession, isAuthenticated, getSession, setSessionCookie, clearSessionCookie, getSessionId, sessions, isAdmin } = require("./web/auth");
const { renderLoginHtml, renderRegisterHtml, renderIndexHtml } = require("./web/views");

const pbkdf2 = promisify(crypto.pbkdf2);
const loginAttempts = {}; // Simples rate limiting em memória


function findUser(username) {
  const users = loadUsers();
  const normalized = username?.toLowerCase().trim();
  console.log(`[Web] Buscando usuário: '${normalized}' dentro das chaves: [${Object.keys(users).join(", ")}]`);
  return users[normalized] || null;
}

async function addUser({ username, password, role = 'user', status = 'active' }) {
  // This function is used by the /register route.
  const users = loadUsers();
  const normalizedUser = username?.toLowerCase().trim();
  if (users[normalizedUser]) return { ok: false, message: "Usuário já existe" };
  
  let salt = null;
  let hash = null;
  let userStatus = status;

  if (password) {
    const normalizedPassword = password.trim();
    salt = crypto.randomBytes(16).toString("hex");
    hash = (await pbkdf2(normalizedPassword, salt, 100000, 64, "sha512")).toString("hex");
  } else {
    // Se não veio senha, é criação via admin e fica pendente até o usuário concluir o cadastro
    userStatus = 'pending';
  }

  saveUser({
    username: normalizedUser, // Store normalized username
    salt,
    hash,
    status: userStatus,
    role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return { ok: true, message: userStatus === 'pending' ? "Usuário pré-cadastrado. O líder deve agora acessar a tela de cadastro para definir sua senha." : "Usuário criado com sucesso." };
}

/**
 * Obtém o IP real do cliente, considerando proxies/Docker
 */
function getClientIp(req) {
  return req.headers['cf-connecting-ip'] ||
         req.headers['x-forwarded-for']?.split(',')[0].trim() || 
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
    const start = Date.now();
    const ip = getClientIp(req);

    // Intercepta o final da resposta para garantir que TUDO seja logado com o status correto
    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Date.now() - start;
      return originalEnd.apply(this, args);
    };

    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      if (req.method === 'GET' && pathname === '/login') {
        return sendHtml(res, renderLoginHtml());   
      }
      if (req.method === 'POST' && pathname === '/login') {
        try {
          const body = await parseRequestBody(req);
          const username = body.username?.trim();
          const password = body.password?.trim();

          if (loginAttempts[ip] && loginAttempts[ip] > 10) {
              console.warn(`[Web] Rate limit atingido para o IP: ${ip}`);
              return sendJson(res, 429, { ok: false, message: 'Muitas tentativas. Tente novamente mais tarde.' });
          }

          const user = findUser(username);
          if (!user) {
            console.warn(`[Web] Login falhou: Usuário '${username}' não encontrado (IP: ${ip})`);
          } else {
            const isPasswordValid = await validatePassword(password, user.salt, user.hash);
            const isActive = (user.status === 'active' || user.status === undefined);

            if (isPasswordValid && isActive) {
              const token = createSession(username, user.role, user.status);
              delete loginAttempts[ip];
              setSessionCookie(res, token);
              console.log(`[Web] Login bem-sucedido: ${username} (IP: ${ip})`);
              return sendJson(res, 200, { ok: true });
            } else if (!isPasswordValid) {
              console.warn(`[Web] Login falhou: Senha incorreta para o usuário '${username}' (IP: ${ip}). Verifique o hash no log de Auth.`);
            } else {
              console.warn(`[Web] Login falhou: Usuário '${username}' está com status inativo (${user.status}) (IP: ${ip})`);
            }
          }
          loginAttempts[ip] = (loginAttempts[ip] || 0) + 1;
          return sendJson(res, 401, { ok: false, message: 'Usuário ou senha inválidos.' });
        } catch (err) {
          console.error(`[Web] Erro ao processar login: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Falha ao processar login.' });
        }
      }
      if (pathname !== '/login' && !isAuthenticated(req)) {
        if (req.method === 'GET') {
          res.writeHead(302, { Location: '/login' });
          return res.end();
        }
        console.warn(`[Web] 401 Acesso negado para ${pathname} | IP: ${ip}`);
        return sendJson(res, 401, { ok: false, message: 'Login requerido.' });
      }
      if (req.method === 'GET' && pathname === '/register') {
        return sendHtml(res, renderRegisterHtml());
      
      }
      if (req.method === 'POST' && pathname === '/register') {
        try {
          const body = await parseRequestBody(req);
          const { username, password } = body;
          const normalizedUser = username?.toLowerCase().trim();
          
          const users = loadUsers();
          const user = users[normalizedUser];

          if (!user) {
            return sendJson(res, 404, { ok: false, message: "Usuário não encontrado. Peça para o administrador criar sua conta primeiro." });
          }

          if (user.status !== 'pending') {
            return sendJson(res, 400, { ok: false, message: "Este usuário já concluiu o cadastro anteriormente." });
          }

          const salt = crypto.randomBytes(16).toString("hex");
          const hash = (await pbkdf2(password.trim(), salt, 100000, 64, "sha512")).toString("hex");

          saveUser({ ...user, salt, hash, status: 'active', updatedAt: new Date().toISOString() });
          return sendJson(res, 200, { ok: true, message: "Cadastro concluído! Agora você já pode fazer login." });
        } catch (err) {
          console.error(`[Web] Erro no registro: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Dados inválidos.' });
        }
      }
      if (req.method === 'GET' && pathname === '/') {
        res.writeHead(302, { Location: '/whatsappcontrol' });
        return res.end();
      }
      if (req.method === 'GET' && pathname === '/whatsappcontrol') {
        try {
          const html = renderIndexHtml();
          return sendHtml(res, html);
        } catch (renderErr) {
          console.error(`[Web] Erro ao renderizar Index:`, renderErr);
          throw renderErr; // Repassa para o catch global
        }
      }
      if (req.method === 'GET' && pathname === '/status') {
        return sendJson(res, 200, getStatus());
      }

      // API: Informações do Usuário Logado
      if (req.method === 'GET' && pathname === '/api/user-info') {
        const session = getSession(req);
        return sendJson(res, 200, { ok: true, user: session });
      }

      // API: Deletar Usuário (Apenas Admin)
      if (req.method === 'DELETE' && pathname.startsWith('/api/admin/users/') && isAdmin(req)) {
        const target = pathname.replace('/api/admin/users/', '');
        deleteUser(target);
        return sendJson(res, 200, { ok: true, message: `Usuário ${target} excluído.` });
      }

      // API: Listar Usuários (Apenas Admin)
      if (req.method === 'GET' && pathname === '/api/admin/users' && isAdmin(req)) {
        const users = loadUsers();
        const userList = Object.values(users).map(u => ({ username: u.username, role: u.role }));
        return sendJson(res, 200, { ok: true, users: userList });
      }

      // API: Criar Usuário (Apenas Admin)
      if (req.method === 'POST' && pathname === '/api/admin/users' && isAdmin(req)) {
        try {
          const body = await parseRequestBody(req);
          const result = await addUser(body);
          return sendJson(res, result.ok ? 200 : 400, result);
        } catch (err) {
          console.error(`[Web] Erro ao criar usuário via Admin: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Dados inválidos.' });
        }
      }

      // API: Ler Logs (Apenas Admin)
      if (req.method === 'GET' && pathname === '/api/logs' && isAdmin(req)) {
        const logFile = path.join(__dirname, 'combined.log');
        try {
          const content = fs.readFileSync(logFile, 'utf8');
          return sendJson(res, 200, { ok: true, logs: content });
        } catch (e) {
          return sendJson(res, 500, { ok: false, message: 'Erro ao ler arquivo de log' });
        }
      }

      // API: Limpar Logs (Apenas Admin)
      if (req.method === 'DELETE' && pathname === '/api/logs' && isAdmin(req)) {
        try {
          const logFile = path.join(__dirname, 'combined.log');
          fs.writeFileSync(logFile, '');
          return sendJson(res, 200, { ok: true });
        } catch (e) {
          return sendJson(res, 500, { ok: false });
        }
      }

      if (req.method === 'POST' && pathname === '/request-qr') {
        const status = getStatus();
        if (status.connected) {
          return sendJson(res, 200, { ok: false, message: 'Bot conectado.' });
        }
        await startClient();
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'POST' && pathname === '/cancel-qr') {
        await cancelQr();
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'POST' && pathname === '/disconnect') {
        const result = await disconnectClient();
        return sendJson(res, result.ok ? 200 : 500, result);
      }
      if (req.method === 'POST' && pathname === '/logout') {
        const sessionId = getSessionId(req);
        if (sessionId) delete sessions[sessionId];
        clearSessionCookie(res);
        return sendJson(res, 200, { ok: true });
      }
      // Rota não encontrada
      console.warn(`[Web] 404 Not Found: ${req.method} ${pathname}`);
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
