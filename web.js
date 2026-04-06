const http = require("http");
const { URL } = require("url");
const crypto = require("crypto");

const LOGIN_USERNAME = process.env.WHATSAPP_CONTROL_USER;
const PASSWORD_SALT = process.env.WHATSAPP_CONTROL_SALT;
const PASSWORD_HASH = process.env.WHATSAPP_CONTROL_HASH;
const COOKIE_NAME = "whatsapp_control_session";
const SESSION_TTL = 1000 * 60 * 15;
const sessions = {};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendHtml(res, html) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, PASSWORD_SALT, 100000, 64, "sha512").toString("hex");
}

function validatePassword(password) {
  return hashPassword(password) === PASSWORD_HASH;
}

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = { createdAt: Date.now() };
  return token;
}

function getSessionId(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

function isAuthenticated(req) {
  const sessionId = getSessionId(req);
  if (!sessionId) return false;
  const session = sessions[sessionId];
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    delete sessions[sessionId];
    return false;
  }
  return true;
}

function setSessionCookie(res, token) {
  const expires = new Date(Date.now() + SESSION_TTL).toUTCString();
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Expires=${expires}`);
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
    button { width: 100%; padding: .9rem; border: none; border-radius: 8px; background: #007bff; color: #fff; font-size: 1rem; cursor: pointer; }
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
    <div id="loginError" class="error">${message ? message : ""}</div>
    <form id="loginForm">
      <input name="username" placeholder="Usuário" autocomplete="username" required />
      <div class="password-wrapper">
        <input id="password" name="password" type="password" placeholder="Senha" autocomplete="current-password" required />
        <span id="togglePassword" class="toggle-password">👁️</span>
      </div>
      <button type="submit">Entrar</button>
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
    #qr img { max-width: 100%; height: auto; }
    #status { margin-bottom: 1rem; }
    .note { color: #555; font-size: .95rem; margin-top: .5rem; }
    .up{position: relative; padding: 1rem;}
    .up-child{position: absolute; top: 1rem; right: 1rem;}
  </style>
</head>
<body>
  <div class="container">
    <div class="up">
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
      try {
        const res = await fetch('/status');
        
        // Se o servidor retornar qualquer status diferente de 200 (Sucesso) ou redirecionar
        if (res.status !== 200 || res.redirected || res.url.includes('/login')) {
          window.location.href = '/login';
          return;
        }
        const json = await res.json();

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
      messageEl.textContent = json.message || 'Ok';
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

    if (req.method === 'POST' && path === '/login') {
      try {
        const body = await parseRequestBody(req);
        const username = body.username?.trim();
        const password = body.password?.trim();
        console.log(`[Web] Tentativa de login iniciada para o usuário: "${username}"`);

        if (username === LOGIN_USERNAME && validatePassword(password)) {
          const token = createSession();
          setSessionCookie(res, token);
          console.log(`[Web] Login bem-sucedido: Usuário "${username}" autenticado.`);
          return sendJson(res, 200, { ok: true });
        }
        console.warn(`[Web] Falha de login: Credenciais inválidas fornecidas para o usuário "${username}".`);
        return sendJson(res, 401, { ok: false, message: 'Usuário ou senha inválidos.' });
      } catch (err) {
        console.error(`[Web] Erro crítico ao processar requisição de login: ${err.message}`);
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
      console.log("[Web] Requisição recebida: Solicitar QR Code");
      const status = getStatus();
      if (status.connected) {
        return sendJson(res, 200, { ok: false, message: 'O bot já está conectado. Desconecte antes de gerar um novo QR Code.' });
      }
      await startClient();
      return sendJson(res, 200);
    }

    if (req.method === 'POST' && path === '/cancel-qr') {
      console.log("[Web] Requisição recebida: Cancelar solicitação");
      await cancelQr();
      return sendJson(res, 200);
    }

    if (req.method === 'POST' && path === '/disconnect') {
      console.log("[Web] Requisição recebida: Desconectar WhatsApp");
      const result = await disconnectClient();
      return sendJson(res, result.ok ? 200 : 500, result);
    }

    if (req.method === 'POST' && path === '/logout') {
      console.log("[Web] Usuário realizou logout do painel.");
      const sessionId = getSessionId(req);
      if (sessionId) {
        delete sessions[sessionId];
      }
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.listen(3000, () => {
    console.log('✅ Site de controle rodando em http://localhost:3000');
  });
}

module.exports = { startWebServer };
