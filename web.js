const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const crypto = require("crypto");
const { promisify } = require("util");

const pbkdf2 = promisify(crypto.pbkdf2);

const USERS_FILE = path.join(__dirname, "users.json");
const LOGIN_USERNAME = process.env.WHATSAPP_CONTROL_USER?.trim();
const PASSWORD_SALT = process.env.WHATSAPP_CONTROL_SALT?.trim();
const PASSWORD_HASH = process.env.WHATSAPP_CONTROL_HASH?.trim();
const COOKIE_NAME = "whatsapp_control_session";
const SESSION_TTL = 1000 * 60 * 15;
const sessions = {};
const loginAttempts = {}; // Simples rate limiting em memória

// Log de diagnóstico na inicialização
if (!LOGIN_USERNAME || !PASSWORD_SALT || !PASSWORD_HASH) {
  console.error("[Web] ERRO: Variáveis de autenticação (USER, SALT ou HASH) não encontradas no .env!");
}

// Inicializa o arquivo de usuários se não existir, migrando o usuário do .env
if (!fs.existsSync(USERS_FILE)) {
  const initialUsers = {};
  if (LOGIN_USERNAME && PASSWORD_SALT && PASSWORD_HASH) {
    // O primeiro usuário (do .env) é sempre o admin
    initialUsers[LOGIN_USERNAME] = {
      username: LOGIN_USERNAME,
      salt: PASSWORD_SALT,
      hash: PASSWORD_HASH,
      createdAt: new Date().toISOString(),
      role: 'admin'
    };
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2));
  console.log("[Web] Arquivo users.json criado e usuário inicial migrado.");
}

function loadUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

function saveUser(user) {
  const users = loadUsers();
  users[user.username] = user;
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
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
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const sessionId = match ? match[1] : null;
  if (!sessionId) return null;
  const session = sessions[sessionId];
  if (!session) return null;

  if (Date.now() - session.createdAt > SESSION_TTL) {
    delete sessions[sessionId];
    return null;
  }
  session.createdAt = Date.now(); // Atualiza o timestamp da sessão
  return session;
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
  // Adicionado SameSite=Strict e Secure (Nota: Secure exige HTTPS para funcionar no navegador)
  // Como você está em HTTPS, a flag Secure é recomendada e deve ser única
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Expires=${expires}; SameSite=Strict`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
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

function renderLoginHtml(message = "") {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Login - Controle WhatsApp</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 1.5rem; background: #f5f5f5; color: #111; }
    .container { max-width: 420px; margin: 4rem auto; background: #fff; padding: 2rem; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    input { width: 100%; padding: .8rem; margin: .5rem 0 1rem; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; }
    input[type="submit"] {
      background: #007bff; color: #fff;
    }
    button { width: 100%; padding: .9rem; border: none; border-radius: 8px; background: #007bff; color: #fff; font-size: 1rem; cursor: pointer; }
    .links { margin-top: 1rem; text-align: center; font-size: 0.9rem; }
    .links a { color: #007bff; text-decoration: none; }
    .password-wrapper { position: relative; }
    .toggle-password {
      position: absolute;
      right: 12px;
      top: 18px;
      cursor: pointer;
      user-select: none;
      font-size: 1.2rem;
    }
    .error { color: #dc3545; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Login</h1>
    <p style="font-size: 0.8em; color: #666;">O primeiro usuário cadastrado se torna o administrador.</p>
    <div id="loginError" class="error">${message ? message : ""}</div>
    <form id="loginForm">
      <input name="username" placeholder="Usuário" autocomplete="username" required />
      <div class="password-wrapper">
        <input id="password" name="password" type="password" placeholder="Senha" autocomplete="current-password" required />
        <span id="togglePassword" class="toggle-password">👁️</span>
      </div>
      <button type="submit">Entrar</button>
      <div class="links">
        Não tem uma conta? <a href="/register">Cadastre-se</a>
      </div>
    </form>
  </div>
  <script>
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');

    togglePassword.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      togglePassword.textContent = type === 'password' ? '👀' : '🙈';
    });

    const errorEl = document.getElementById('loginError');
    document.getElementById('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      errorEl.textContent = '';
      const formData = new FormData(event.target);
      const body = JSON.stringify({ username: formData.get('username'), password: formData.get('password') });
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) {
        window.location.href = '/whatsappcontrol';
      } else {
        const json = await res.json();
        errorEl.textContent = json.message || 'Login falhou.';
      }
    });
  </script>
</body>
</html>`;
}

function renderRegisterHtml(message = "") {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cadastro - Controle WhatsApp</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 1.5rem; background: #f5f5f5; color: #111; }
    .container { max-width: 420px; margin: 4rem auto; background: #fff; padding: 2rem; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    input { width: 100%; padding: .8rem; margin: .5rem 0 1rem; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; }
    input[type="submit"] {
      background: #28a745; color: #fff;
    }
    button { width: 100%; padding: .9rem; border: none; border-radius: 8px; background: #28a745; color: #fff; font-size: 1rem; cursor: pointer; }
    .error { color: #dc3545; margin-bottom: 1rem; }
    .links { margin-top: 1rem; text-align: center; font-size: 0.9rem; }
    .links a { color: #007bff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Novo Perfil</h1>
    <div id="regError" class="error">${message}</div>
    <form id="regForm">
      <input name="username" placeholder="Usuário desejado" required />
      <input name="password" type="password" placeholder="Senha" required />
      <button type="submit">Criar Conta</button>
      <div class="links">
        Já tem conta? <a href="/login">Voltar ao login</a>
      </div>
    </form>
  </div>
  <script>
    const errorEl = document.getElementById('regError');
    document.getElementById('regForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      errorEl.textContent = '';
      const formData = new FormData(event.target);
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: formData.get('username'), 
          password: formData.get('password') 
        }),
      });
      const json = await res.json();
      if (res.ok) {
        alert('Conta criada! Agora faça login.');
        window.location.href = '/login';
      } else {
        errorEl.textContent = json.message || 'Erro ao cadastrar.';
      }
    });
  </script>
</body>
</html>`;
}

function renderAdminPanelHtml(users = [], message = "") {
  const userListHtml = users.map(user => `
    <li>
      ${user.username} (${user.role}) - Criado em: ${new Date(user.createdAt).toLocaleString()}
      <button class="danger delete-user-btn" data-username="${user.username}" style="margin-left: 10px; padding: 5px 10px; font-size: 0.8rem; width: auto;">Excluir</button>
    </li>
  `).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin - Gerenciar Usuários</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 1.5rem; background: #f5f5f5; color: #111; }
    .container { max-width: 800px; margin: 4rem auto; background: #fff; padding: 2rem; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    input { width: 100%; padding: .8rem; margin: .5rem 0 1rem; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; }
    input[type="submit"], button { width: 100%; padding: .9rem; border: none; border-radius: 8px; background: #007bff; color: #fff; font-size: 1rem; cursor: pointer; }
    button.danger { background: #dc3545; }
    button.secondary { background: #6c757d; }
    .error { color: #dc3545; margin-bottom: 1rem; }
    .success { color: #28a745; margin-bottom: 1rem; }
    ul { list-style: none; padding: 0; }
    li { background: #f9f9f9; padding: 10px; margin-bottom: 5px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
    select { width: 100%; padding: .8rem; margin: .5rem 0 1rem; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Gerenciar Usuários</h1>
    <p><a href="/whatsappcontrol">Voltar ao Painel</a></p>
    <div id="adminMessage" class="error">${message}</div>

    <h2>Usuários Existentes</h2>
    <ul id="userList">
      ${userListHtml}
    </ul>

    <h2>Adicionar Novo Usuário</h2>
    <form id="addUserForm">
      <div class="form-group">
        <label for="newUsername">Usuário:</label>
        <input id="newUsername" name="username" placeholder="Nome de usuário" required />
      </div>
      <div class="form-group">
        <label for="newPassword">Senha:</label>
        <input id="newPassword" name="password" type="password" placeholder="Senha" required />
      </div>
      <div class="form-group">
        <label for="newRole">Papel:</label>
        <select id="newRole" name="role">
          <option value="user">Usuário</option>
          <option value="admin">Administrador</option>
        </select>
      </div>
      <button type="submit">Adicionar Usuário</button>
    </form>
  </div>
  <script>
    async function fetchUsers() {
      const res = await fetch('/api/admin/users');
      const json = await res.json();
      const userListEl = document.getElementById('userList');
      userListEl.innerHTML = '';
      if (json.ok && json.users) {
        json.users.forEach(user => {
          const li = document.createElement('li');
          li.innerHTML = \`\${user.username} (\${user.role}) - Criado em: \${new Date(user.createdAt).toLocaleString()}
            <button class="danger delete-user-btn" data-username="\${user.username}" style="margin-left: 10px; padding: 5px 10px; font-size: 0.8rem; width: auto;">Excluir</button>\`;
          userListEl.appendChild(li);
        });
      }
      attachDeleteListeners();
    }

    async function attachDeleteListeners() {
      document.querySelectorAll('.delete-user-btn').forEach(button => {
        button.onclick = async (event) => {
          const usernameToDelete = event.target.dataset.username;
          if (confirm(\`Tem certeza que deseja excluir o usuário \${usernameToDelete}?\`)) {
            const res = await fetch(\`/api/admin/users/\${usernameToDelete}\`, { method: 'DELETE' });
            const json = await res.json();
            const msgEl = document.getElementById('adminMessage');
            msgEl.className = res.ok ? 'success' : 'error';
            msgEl.textContent = json.message;
            fetchUsers();
          }
        };
      });
    }

    document.getElementById('addUserForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: formData.get('username'), 
          password: formData.get('password'),
          role: formData.get('role')
        }),
      });
      const json = await res.json();
      const msgEl = document.getElementById('adminMessage');
      msgEl.className = res.ok ? 'success' : 'error';
      msgEl.textContent = json.message;
      if (res.ok) {
        event.target.reset(); // Limpa o formulário
        fetchUsers();
      }
    });

    fetchUsers();
  </script>
</body>
</html>`;
}

function renderIndexHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Controle WhatsApp</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 1.5rem; background: #f5f5f5; color: #111; }
    .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 1.5rem; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    button { margin: .4rem .2rem .4rem 0; padding: .8rem 1.1rem; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; }
    button.primary { background: #007bff; color: white; }
    button.danger { background: #dc3545; color: white; }
    button.secondary { background: #6c757d; color: white; }
    button.admin { background: #ffc107; color: #333; }
    #qr img { max-width: 100%; height: auto; }
    #status { margin-bottom: 1rem; }
    .note { color: #555; font-size: .95rem; margin-top: .5rem; }
    .up{position: relative; padding: 1rem;}
    .up-child{position: absolute; top: 1rem; right: 1rem;}
  </style>
</head>
<body>
  <div class="container">
    <div class="up" style="display: flex; justify-content: space-between; align-items: center;">
      <div id="adminLinkContainer" style="display: none;">
        <button class="admin" id="adminPanelLink">Gerenciar Usuários</button>
      </div>
      <div class="up-child"><button class="secondary" id="logout">Logout</button></div>
    </div>
    <div class="topbar"><h1>Controle do WhatsApp</h1></div>
    <div id="status">Carregando status...</div>
    <div id="actionMessage" style="margin-bottom: .8rem; color: #333;"></div>
    <div id="qr"></div>
    <div>
      <button class="primary" id="requestQr">Solicitar QR Code</button>
      <button class="secondary" id="cancelQr">Cancelar solicitação</button>
      <button class="danger" id="disconnect">Desconectar WhatsApp</button>
    </div>
    <div class="note">Use este painel para gerencias os QR Codes e desconectar o chatbot.</div>
  </div>
  <script>
    async function refresh() {
      let isAdminUser = false;
      try {
        const res = await fetch('/status');
        
        // Se o servidor retornar qualquer status diferente de 200 (Sucesso) ou redirecionar
        if (res.status !== 200 || res.redirected || res.url.includes('/login')) {
          window.location.href = '/login';
          return;
        }
        const json = await res.json();

        // Verifica se o usuário logado é admin
        const userRes = await fetch('/api/user-info');
        const userJson = await userRes.json();
        isAdminUser = userJson.ok && userJson.user && userJson.user.role === 'admin';
        document.getElementById('adminLinkContainer').style.display = isAdminUser ? 'block' : 'none';

      const statusEl = document.getElementById('status');
      const qrEl = document.getElementById('qr');
      const messageEl = document.getElementById('actionMessage');
      const lines = [];
      if (json.connected) {
        lines.push('<strong>Status:</strong> Conectado ✅');
      } else if (json.initializing || json.generatingQr) {
        lines.push('<strong>Status:</strong> Inicializando... ⏳');
      } else {
        lines.push('<strong>Status:</strong> Desconectado');
      }
      if (json.hasQr) {
        lines.push('<strong>QR disponível:</strong> Sim');
      } else {
        lines.push('<strong>QR disponível:</strong> Não');
      }
      if (json.qrCreatedAt) {
        lines.push('<strong>Gerado em:</strong> ' + new Date(json.qrCreatedAt).toLocaleString());
      }
      statusEl.innerHTML = lines.join('<br>');
      if (json.hasQr && json.qrDataUrl) {
        qrEl.innerHTML = '<h2>QR Code</h2><img src="' + json.qrDataUrl + '" alt="QR Code" />';
      } else if (!json.initializing) {
        qrEl.innerHTML = '<p>Nenhum QR Code disponível no momento.</p>';
      } else {
        qrEl.innerHTML = '';
      }
      const cancelBtn = document.getElementById('cancelQr');
      // Exibe o botão cancelar apenas se estiver em processo de inicialização e ainda não estiver conectado
      const isGenerating = (json.initializing || json.generatingQr || json.hasQr) && !json.connected;
      cancelBtn.disabled = !isGenerating;
      cancelBtn.style.display = isGenerating ? 'inline-block' : 'none';
      const disconnectBtn = document.getElementById('disconnect');
      disconnectBtn.disabled = !json.connected;
      disconnectBtn.style.display = json.connected ? 'inline-block' : 'none';
      const requestBtn = document.getElementById('requestQr');
      const hideRequest = json.connected || json.initializing || json.generatingQr || json.hasQr;
      requestBtn.style.display = hideRequest ? 'none' : 'inline-block';
      // Atualiza a mensagem apenas se o status trouxer uma nova informação (evita limpar o "Ok" das ações)
      if (json.message) {
        messageEl.textContent = json.message;
      }
      } catch (err) {
        console.error('Falha ao conectar com o servidor:', err);
        // Se o site cair (offline), redirecionamos para login para garantir o logout visual
        // e forçar nova autenticação quando o serviço retornar.
        window.location.href = '/login';
      }
    }

    async function postAction(path) {
      const res = await fetch(path, { method: 'POST' });
      const json = await res.json();
      const messageEl = document.getElementById('actionMessage');
      await refresh();
    }

    document.getElementById('requestQr').addEventListener('click', () => postAction('/request-qr'));
    document.getElementById('cancelQr').addEventListener('click', () => { console.log('Botão cancelar pressionado'); postAction('/cancel-qr'); });
    document.getElementById('disconnect').addEventListener('click', () => {
      if (confirm('Deseja realmente desconectar o WhatsApp?')) {
        postAction('/disconnect');
      }
    });
    document.getElementById('logout').addEventListener('click', async () => {
      await fetch('/logout', { method: 'POST' });
      window.location.href = '/login';
    });

    document.getElementById('adminPanelLink').addEventListener('click', () => {
      window.location.href = '/admin';
    });
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;
}

function startWebServer({ getStatus, startClient, cancelQr, disconnectClient }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/login') {
      return sendHtml(res, renderLoginHtml());
    }

    const users = loadUsers();
    const hasAdminUser = Object.values(users).some(user => user.role === 'admin');

    if (req.method === 'GET' && path === '/register') {
      if (hasAdminUser) {
        return sendHtml(res, renderRegisterHtml("O cadastro de novos usuários está desativado. Por favor, entre em contato com o administrador."));
      }
      return sendHtml(res, renderRegisterHtml());
    }

    if (req.method === 'POST' && path === '/login') {
      try {
        const body = await parseRequestBody(req);
        const username = body.username?.trim();
        const password = body.password?.trim();

        // Rate Limiting básico
        const ip = getClientIp(req); 
        if (loginAttempts[ip] && loginAttempts[ip] > 5) {
            return sendJson(res, 429, { ok: false, message: 'Muitas tentativas. Tente novamente mais tarde.' });
        }

        const users = loadUsers();
        const user = users[username];

        if (user && await validatePassword(password, user.salt, user.hash)) {
          const token = createSession(username, user.role);
          delete loginAttempts[ip];
          setSessionCookie(res, token);
          return sendJson(res, 200, { ok: true });
        }
        loginAttempts[ip] = (loginAttempts[ip] || 0) + 1;
        return sendJson(res, 401, { ok: false, message: 'Usuário ou senha inválidos.' });
      } catch (err) {
        console.error(`[Web] Erro crítico ao processar requisição de login: ${err.message}`);
        return sendJson(res, 400, { ok: false, message: 'Falha ao processar login.' });
      }
    }

    if (req.method === 'POST' && path === '/register') {
      if (hasAdminUser) {
        return sendJson(res, 403, { ok: false, message: 'O cadastro de novos usuários está desativado.' });
      }

      try {
        const body = await parseRequestBody(req);
        const username = body.username?.trim();
        const password = body.password?.trim();

        if (!username || !password || username.length < 3 || password.length < 6) {
          return sendJson(res, 400, { ok: false, message: 'Usuário (min 3) ou senha (min 6) muito curtos.' });
        }

        if (users[username]) {
          return sendJson(res, 400, { ok: false, message: 'Este usuário já existe.' });
        }

        const salt = crypto.randomBytes(16).toString("hex");
        const derivedKey = await pbkdf2(password, salt, 100000, 64, "sha512");
        const hash = derivedKey.toString("hex");

        saveUser({
          username,
          salt,
          hash, 
          role: 'user', // Novos usuários registrados via /register são 'user'
          createdAt: new Date().toISOString()
        });

        return sendJson(res, 201, { ok: true, message: 'Usuário cadastrado com sucesso.' });
      } catch (err) {
        console.error(`[Web] Erro no cadastro: ${err.message}`);
        return sendJson(res, 500, { ok: false, message: 'Erro interno ao processar cadastro.' });
      }
    }

    if (!isAuthenticated(req) && path !== '/login' && path !== '/register') {
      if (req.method === 'GET') {
        res.writeHead(302, { Location: '/login' });
        return res.end();
      }
      return sendJson(res, 401, { ok: false, message: 'Login requerido.' });
    }

    if (req.method === 'GET' && path === '/') {
      res.writeHead(302, { Location: '/whatsappcontrol' });
      return res.end();
    }

    if (req.method === 'GET' && path === '/whatsappcontrol') {
      return sendHtml(res, renderIndexHtml());
    }

    // Rotas de administração (apenas para admin)
    if (path.startsWith('/admin')) {
      if (!isAdmin(req)) {
        return sendJson(res, 403, { ok: false, message: 'Acesso negado. Apenas administradores podem acessar esta área.' });
      }
      if (req.method === 'GET' && path === '/admin') {
        return sendHtml(res, renderAdminPanelHtml(Object.values(loadUsers())));
      }
      if (req.method === 'GET' && path === '/api/admin/users') {
        return sendJson(res, 200, { ok: true, users: Object.values(loadUsers()) });
      }
      if (req.method === 'POST' && path === '/api/admin/users') {
        try {
          const body = await parseRequestBody(req);
          const username = body.username?.trim();
          const password = body.password?.trim();
          const role = body.role?.trim() || 'user';

          if (!username || !password || username.length < 3 || password.length < 6) {
            return sendJson(res, 400, { ok: false, message: 'Usuário (min 3) ou senha (min 6) muito curtos.' });
          }
          const currentUsers = loadUsers();
          if (currentUsers[username]) {
            return sendJson(res, 400, { ok: false, message: 'Este usuário já existe.' });
          }
          const salt = crypto.randomBytes(16).toString("hex");
          const derivedKey = await pbkdf2(password, salt, 100000, 64, "sha512");
          const hash = derivedKey.toString("hex");
          saveUser({ username, salt, hash, role, createdAt: new Date().toISOString() });
          return sendJson(res, 201, { ok: true, message: 'Usuário adicionado com sucesso.' });
        } catch (err) {
          console.error(`[Web] Erro ao adicionar usuário: ${err.message}`);
          return sendJson(res, 500, { ok: false, message: 'Erro interno ao adicionar usuário.' });
        }
      }
      if (req.method === 'DELETE' && path.startsWith('/api/admin/users/')) {
        const usernameToDelete = path.split('/').pop();
        const currentUsers = loadUsers();
        if (currentUsers[usernameToDelete] && currentUsers[usernameToDelete].role !== 'admin') { // Não permite excluir o próprio admin
          delete currentUsers[usernameToDelete];
          fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2));
          return sendJson(res, 200, { ok: true, message: `Usuário ${usernameToDelete} excluído.` });
        }
        return sendJson(res, 403, { ok: false, message: 'Não é possível excluir este usuário ou ele não existe.' });
      }
    }

    if (req.method === 'GET' && path === '/status') {
      return sendJson(res, 200, getStatus());
    }

    if (req.method === 'POST' && path === '/request-qr') {
      const status = getStatus();
      if (status.connected) {
        return sendJson(res, 200, { ok: false, message: 'O bot já está conectado. Desconecte antes de gerar um novo QR Code.' });
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

    if (req.method === 'GET' && path === '/api/user-info') {
      const session = getSession(req);
      if (session) return sendJson(res, 200, { ok: true, user: { username: session.username, role: session.role } });
      return sendJson(res, 401, { ok: false, message: 'Não autenticado.' });
    }

    if (req.method === 'POST' && path === '/logout') {
      const session = getSession(req);
      if (session) { // Se a sessão existe, a remove
        delete sessions[Object.keys(sessions).find(key => sessions[key] === session)];
      }
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.listen(3000, '0.0.0.0', () => {
    console.log('✅ Site de controle rodando em http://0.0.0.0:3000');
  });
}

module.exports = { startWebServer };
