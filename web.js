const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { loadUsers, saveUser, deleteUser } = require("./web/users");
const { listLideres, addLider, updateLider, removeLider } = require("./web/lideres");
const { validatePassword, hashPassword, createSession, isAuthenticated, getSession, setSessionCookie, clearSessionCookie, getSessionId, sessions, isAdmin } = require("./web/auth");
const { renderLoginHtml, renderRegisterHtml, renderIndexHtml } = require("./web/views");
const { createRateLimiter } = require("./web/rateLimiter");
const { getClientIp } = require("./web/clientIp");

// Rate limiting de login por IP: 10 tentativas a cada 15 minutos, depois reseta sozinho
const loginRateLimiter = createRateLimiter({ maxAttempts: 10, windowMs: 15 * 60 * 1000 });
// Sobrescrevível via env var (usado pelos testes, para nunca ler/limpar o log real de produção).
const LOG_FILE = process.env.COMBINED_LOG_PATH || path.join(__dirname, "combined.log");

// Evita log injection (CWE-117): sem isso, alguém poderia mandar um username ou
// URL com quebra de linha embutida e forjar uma linha de log falsa (ex: fingir um
// "Login bem-sucedido" que nunca aconteceu) em combined.log ou num alerta do WhatsApp.
// Verificado por teste (ver test/web.test.js). O SonarCloud não reconhece sanitizadores
// próprios nesse rastreamento de dado sensível — por isso os usos abaixo têm // NOSONAR.
function sanitizarParaLog(valor) {
  return String(valor ?? "").replace(/[\x00-\x1f\x7f]/g, " ");
}

function findUser(username) {
  const users = loadUsers();
  const normalized = username?.toLowerCase().trim();
  console.log(`[Web] Buscando usuário: '${sanitizarParaLog(normalized)}' dentro das chaves: [${Object.keys(users).join(", ")}]`); // NOSONAR
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
    const hashedPassword = await hashPassword(password);
    salt = hashedPassword.salt;
    hash = hashedPassword.hash;
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

function startWebServer({ getStatus, startClient, cancelQr, disconnectClient, port = 3000 }) {
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
      let url;
      try {
        url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      } catch (urlErr) {
        console.warn(`[Web] URL inválida ou malformada recebida de ${sanitizarParaLog(ip)}: ${sanitizarParaLog(req.url)}`); // NOSONAR
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end('Bad Request: Invalid URL');
      }
      const pathname = url.pathname;

      // Navegadores pedem isso sozinhos em toda navegação; sem essa rota, cai no
      // fallback de "404 Not Found" e loga um aviso a cada login/troca de página.
      if (pathname === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
      }

      if (req.method === 'GET' && pathname === '/login') {
        return sendHtml(res, renderLoginHtml());   
      }
      if (req.method === 'POST' && pathname === '/login') {
        try {
          const body = await parseRequestBody(req);
          const username = body.username?.trim();
          const password = body.password?.trim();

          if (loginRateLimiter.isBlocked(ip)) {
              console.warn(`[Web] Rate limit atingido para o IP: ${sanitizarParaLog(ip)}`); // NOSONAR
              return sendJson(res, 429, { ok: false, message: 'Muitas tentativas. Tente novamente mais tarde.' });
          }

          const user = findUser(username);
          if (!user) {
            console.warn(`[Web] Login falhou: Usuário '${sanitizarParaLog(username)}' não encontrado (IP: ${sanitizarParaLog(ip)})`); // NOSONAR
          } else {
            const isPasswordValid = await validatePassword(password, user.salt, user.hash);
            const isActive = (user.status === 'active' || user.status === undefined);

            if (isPasswordValid && isActive) {
              const token = createSession(username, user.role, user.status);
              loginRateLimiter.reset(ip);
              setSessionCookie(res, token);
              console.log(`[Web] Login bem-sucedido: ${sanitizarParaLog(username)} (IP: ${sanitizarParaLog(ip)})`); // NOSONAR
              return sendJson(res, 200, { ok: true });
            } else if (!isPasswordValid) {
              console.warn(`[Web] Login falhou: Senha incorreta para o usuário '${sanitizarParaLog(username)}' (IP: ${sanitizarParaLog(ip)}). Verifique o hash no log de Auth.`); // NOSONAR
            } else {
              console.warn(`[Web] Login falhou: Usuário '${sanitizarParaLog(username)}' está com status inativo (${user.status}) (IP: ${sanitizarParaLog(ip)})`); // NOSONAR
            }
          }
          loginRateLimiter.registerFailure(ip);
          return sendJson(res, 401, { ok: false, message: 'Usuário ou senha inválidos.' });
        } catch (err) {
          console.error(`[Web] Erro ao processar login: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Falha ao processar login.' });
        }
      }
      if (pathname !== '/login' && pathname !== '/register' && !isAuthenticated(req)) {
        if (req.method === 'GET') {
          res.writeHead(302, { Location: '/login' });
          return res.end();
        }
        console.warn(`[Web] 401 Acesso negado para ${sanitizarParaLog(pathname)} | IP: ${sanitizarParaLog(ip)}`); // NOSONAR
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

          const { salt, hash } = await hashPassword(password);
          
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
        const target = decodeURIComponent(pathname.replace('/api/admin/users/', ''));
        const result = deleteUser(target);
        return sendJson(res, result.ok ? 200 : 404, result);
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

      // API: Listar Líderes (Apenas Admin)
      if (req.method === 'GET' && pathname === '/api/admin/lideres' && isAdmin(req)) {
        const lideres = listLideres();
        return sendJson(res, 200, { ok: true, lideres });
      }

      // API: Adicionar Líder (Apenas Admin)
      if (req.method === 'POST' && pathname === '/api/admin/lideres' && isAdmin(req)) {
        try {
          const body = await parseRequestBody(req);
          const result = addLider(body);
          return sendJson(res, result.ok ? 200 : 400, result);
        } catch (err) {
          console.error(`[Web] Erro ao adicionar líder via Admin: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Dados inválidos.' });
        }
      }

      // API: Editar Líder (Apenas Admin)
      if (req.method === 'PUT' && pathname.startsWith('/api/admin/lideres/') && isAdmin(req)) {
        try {
          const target = decodeURIComponent(pathname.replace('/api/admin/lideres/', ''));
          const body = await parseRequestBody(req);
          const result = updateLider(target, body);
          return sendJson(res, result.ok ? 200 : 400, result);
        } catch (err) {
          console.error(`[Web] Erro ao editar líder via Admin: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Dados inválidos.' });
        }
      }

      // API: Remover Líder (Apenas Admin)
      if (req.method === 'DELETE' && pathname.startsWith('/api/admin/lideres/') && isAdmin(req)) {
        const target = decodeURIComponent(pathname.replace('/api/admin/lideres/', ''));
        const result = removeLider(target);
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      // API: Ler Logs (Apenas Admin)
      if (req.method === 'GET' && pathname === '/api/logs' && isAdmin(req)) {
        try {
          const content = fs.readFileSync(LOG_FILE, 'utf8');
          return sendJson(res, 200, { ok: true, logs: content });
        } catch (e) {
          return sendJson(res, 500, { ok: false, message: 'Erro ao ler arquivo de log' });
        }
      }

      // API: Limpar Logs (Apenas Admin)
      if (req.method === 'DELETE' && pathname === '/api/logs' && isAdmin(req)) {
        try {
          fs.writeFileSync(LOG_FILE, '');
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
      console.warn(`[Web] 404 Not Found: ${req.method} ${sanitizarParaLog(pathname)}`); // NOSONAR
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch (globalErr) {
      console.error(`[ALERTA:web] 500 Internal Server Error em ${sanitizarParaLog(req.url)}:`, globalErr); // NOSONAR
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'Erro interno no servidor.' }));
      }
    }
  });

  // Captura erros globais do servidor para evitar crash e logar Erro 500
  server.on('error', (err) => {
    console.error(`[ALERTA:web] Erro crítico no servidor:`, err);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`✅ Site de controle rodando em http://0.0.0.0:${server.address().port}`);
  });

  return server;
}

// Removido getUsers que não estava definido e corrigido exportação
module.exports = { startWebServer, addUser, sanitizarParaLog };
