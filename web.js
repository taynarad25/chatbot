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
const theChosen = require("./web/the_chosen");
const theChosenSheets = require("./web/the_chosen_sheets");
const theChosenNotificacoes = require("./web/the_chosen_notificacoes");
const { gerarDescricaoEvento, salvarDescricaoEvento, listarDescricoesEventos } = require("./bot/descricaoEvento");

// Rate limiting de login por IP: 10 tentativas a cada 15 minutos, depois reseta sozinho
const loginRateLimiter = createRateLimiter({ maxAttempts: 10, windowMs: 15 * 60 * 1000 });
// Sobrescrevível via env var (usado pelos testes, para nunca ler/limpar o log real de produção).
const LOG_FILE = process.env.COMBINED_LOG_PATH || path.join(__dirname, "combined.log");
const FAVICON_FILE = path.join(__dirname, "web", "public", "favicon.png");
const faviconBuffer = fs.existsSync(FAVICON_FILE) ? fs.readFileSync(FAVICON_FILE) : null;
const LOGO_FILE = fs.existsSync(path.join(__dirname, "public", "logo.png"))
  ? path.join(__dirname, "public", "logo.png")
  : path.join(__dirname, "web", "public", "logo.png");
const logoBuffer = fs.existsSync(LOGO_FILE) ? fs.readFileSync(LOGO_FILE) : null;
const HOME_HTML_FILE = fs.existsSync(path.join(__dirname, "public", "home.html"))
  ? path.join(__dirname, "public", "home.html")
  : path.join(__dirname, "web", "public", "home.html");
const MINISTERIOS_HTML_FILE = fs.existsSync(path.join(__dirname, "public", "ministerios.html"))
  ? path.join(__dirname, "public", "ministerios.html")
  : path.join(__dirname, "web", "public", "ministerios.html");
const LIDERANCA_HTML_FILE = fs.existsSync(path.join(__dirname, "public", "lideranca.html"))
  ? path.join(__dirname, "public", "lideranca.html")
  : path.join(__dirname, "web", "public", "lideranca.html");
const THE_CHOSEN_HTML_FILE = fs.existsSync(path.join(__dirname, "public", "the-chosen.html"))
  ? path.join(__dirname, "public", "the-chosen.html")
  : path.join(__dirname, "web", "public", "the-chosen.html");

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
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'"
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

function startWebServer({ getStatus, startClient, cancelQr, disconnectClient, getClient = () => null, port = 3000 }) {
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
      let decodedPathname = pathname;
      try {
        decodedPathname = decodeURIComponent(pathname);
      } catch {
        decodedPathname = pathname;
      }

      // Navegadores pedem isso sozinhos em toda navegação; sem essa rota, cai no
      // fallback de "404 Not Found" e loga um aviso a cada login/troca de página.
      if (pathname === '/favicon.ico' || pathname === '/favicon.png' || pathname.startsWith('/favicon-')) {
        const iconName = pathname.replace(/^\//, '');
        const pubPath = path.join(__dirname, 'public', iconName.endsWith('.ico') ? 'favicon.ico' : iconName);
        const webPubPath = path.join(__dirname, 'web', 'public', iconName.endsWith('.ico') ? 'favicon.ico' : iconName);
        const fileToRead = fs.existsSync(pubPath) ? pubPath : (fs.existsSync(webPubPath) ? webPubPath : FAVICON_FILE);
        const iconBuf = fs.existsSync(fileToRead) ? fs.readFileSync(fileToRead) : faviconBuffer;
        if (iconBuf) {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0' });
          return res.end(iconBuf);
        }
        res.writeHead(204);
        return res.end();
      }

      // Servir imagens estáticas (logo, favicon, ícones de ministérios sob /images/)
      if (req.method === 'GET' && (pathname.startsWith('/images/') || pathname.startsWith('/public/images/'))) {
        const cleanPath = pathname.replace(/^\/public/, '');
        const safePath = path.normalize(cleanPath).replace(/^(\.\.[\/\\])+/, '');
        const imgPath = path.join(__dirname, 'public', safePath);
        const webImgPath = path.join(__dirname, 'web', 'public', safePath);
        const fileToRead = (fs.existsSync(imgPath) && fs.statSync(imgPath).isFile())
          ? imgPath
          : ((fs.existsSync(webImgPath) && fs.statSync(webImgPath).isFile()) ? webImgPath : null);
        if (fileToRead) {
          const ext = path.extname(fileToRead).toLowerCase();
          const mimeTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.ico': 'image/x-icon'
          };
          res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'image/png',
            'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0'
          });
          return res.end(fs.readFileSync(fileToRead));
        }
      }

      // Servir manifest.json (PWA)
      if (req.method === 'GET' && (pathname === '/manifest.json' || pathname === '/site.webmanifest')) {
        const manifestPath = fs.existsSync(path.join(__dirname, 'public', 'manifest.json'))
          ? path.join(__dirname, 'public', 'manifest.json')
          : path.join(__dirname, 'web', 'public', 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8' });
          return res.end(fs.readFileSync(manifestPath));
        }
      }

      // Servir logo da Comunidade Cristã Curados
      if (req.method === 'GET' && (pathname === '/logo.png' || pathname === '/public/logo.png' || pathname === '/home/logo.png')) {
        if (fs.existsSync(LOGO_FILE)) {
          const buf = fs.readFileSync(LOGO_FILE);
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0' });
          return res.end(buf);
        }
        if (logoBuffer) {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0' });
          return res.end(logoBuffer);
        }
      }

      // Rota raiz (/) e /home: Página institucional da Comunidade Cristã Curados
      if (req.method === 'GET' && (pathname === '/' || pathname === '/home' || pathname === '/home/' || pathname === '/home.html')) {
        if (fs.existsSync(HOME_HTML_FILE)) {
          const content = fs.readFileSync(HOME_HTML_FILE, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'"
          });
          return res.end(content);
        }
      }

      // Rota /ministerios (e variações como /ministérios): Página dedicada aos Ministérios da Comunidade Cristã Curados
      if (req.method === 'GET' && (
        pathname === '/ministerios' || pathname === '/ministerios/' || pathname === '/ministerios.html' ||
        decodedPathname === '/ministerios' || decodedPathname === '/ministerios/' || decodedPathname === '/ministerios.html' ||
        decodedPathname === '/ministérios' || decodedPathname === '/ministérios/' || decodedPathname === '/ministérios.html'
      )) {
        if (fs.existsSync(MINISTERIOS_HTML_FILE)) {
          const content = fs.readFileSync(MINISTERIOS_HTML_FILE, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'"
          });
          return res.end(content);
        }
      }

      // Rota /lideranca (e variações como /nossa-lideranca, /liderança): Página dedicada à Liderança da Comunidade Cristã Curados
      if (req.method === 'GET' && (
        pathname === '/lideranca' || pathname === '/lideranca/' || pathname === '/lideranca.html' ||
        pathname === '/nossa-lideranca' || pathname === '/nossa-lideranca/' || pathname === '/nossa-lideranca.html' ||
        decodedPathname === '/liderança' || decodedPathname === '/liderança/' || decodedPathname === '/liderança.html' ||
        decodedPathname === '/nossa-liderança' || decodedPathname === '/nossa-liderança/' || decodedPathname === '/nossa-liderança.html'
      )) {
        const fileToServe = fs.existsSync(path.join(__dirname, "public", "lideranca.html"))
          ? path.join(__dirname, "public", "lideranca.html")
          : (fs.existsSync(path.join(__dirname, "web", "public", "lideranca.html")) ? path.join(__dirname, "web", "public", "lideranca.html") : LIDERANCA_HTML_FILE);
        if (fs.existsSync(fileToServe)) {
          const content = fs.readFileSync(fileToServe, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'"
          });
          return res.end(content);
        }
      }

      // Rota /the-chosen (e variações como /thechosen): Inscrição exclusiva para a Pré-estreia The Chosen
      if (req.method === 'GET' && (
        pathname === '/the-chosen' || pathname === '/the-chosen/' || pathname === '/the-chosen.html' ||
        pathname === '/thechosen' || pathname === '/thechosen/' || pathname === '/thechosen.html'
      )) {
        if (theChosen.estaExpirado()) {
          // Conforme solicitado: no dia 04/10 a página é desativada
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Evento Encerrado</title></head><body style="background:#0d0d12;color:#fff;font-family:sans-serif;text-align:center;padding:80px 20px;"><h1>Evento Encerrado</h1><p>A Pré-estreia de The Chosen ocorreu em 03/10/2026 e esta página foi encerrada.</p><p><a href="/" style="color:#00B7D9;">Voltar para a página inicial</a></p></body></html>');
        }

        const fileToServe = fs.existsSync(path.join(__dirname, "public", "the-chosen.html"))
          ? path.join(__dirname, "public", "the-chosen.html")
          : (fs.existsSync(path.join(__dirname, "web", "public", "the-chosen.html")) ? path.join(__dirname, "web", "public", "the-chosen.html") : THE_CHOSEN_HTML_FILE);
        if (fs.existsSync(fileToServe)) {
          const content = fs.readFileSync(fileToServe, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'"
          });
          return res.end(content);
        }
      }

      // API: Consulta de vagas em tempo real (sincronizada com Google Sheets de forma segura)
      if (req.method === 'GET' && pathname === '/the-chosen/api/vagas') {
        try {
          const statusVagas = typeof theChosen.obterStatusVagasAsync === 'function'
            ? await theChosen.obterStatusVagasAsync()
            : theChosen.obterStatusVagas();
          return sendJson(res, 200, statusVagas);
        } catch (errVagas) {
          console.error('[Web] Erro ao consultar vagas The Chosen:', errVagas.message);
          return sendJson(res, 200, theChosen.obterStatusVagas());
        }
      }

      // API: Processamento de inscrição (/the-chosen/api/inscrever e /the-chosen)
      if (req.method === 'POST' && (
        pathname === '/the-chosen/api/inscrever' ||
        pathname === '/the-chosen' ||
        pathname === '/the-chosen/'
      )) {
        try {
          const body = await parseRequestBody(req);
          const resultado = await theChosen.realizarInscricao(body);
          if (resultado.ok) {
            // Disparo não-bloqueante de confirmação oficial no WhatsApp do participante
            try {
              const botClient = typeof getClient === 'function' ? getClient() : null;
              if (botClient) {
                theChosenNotificacoes.enviarMensagemConfirmacaoInscricao(botClient, resultado.inscricao)
                  .catch(errZap => console.error('[The Chosen] Erro no envio WhatsApp:', errZap.message));
              }
            } catch (errDisparo) {
              console.error('[The Chosen] Erro ao obter cliente WhatsApp:', errDisparo.message);
            }
            return sendJson(res, 200, resultado);
          } else {
            const status = resultado.code === 'ESGOTADO' || resultado.code === 'VAGAS_INSUFICIENTES' ? 409 : 400;
            return sendJson(res, status, resultado);
          }
        } catch (err) {
          console.error('[The Chosen] Erro ao processar inscrição:', err);
          return sendJson(res, 500, { ok: false, message: 'Erro interno ao processar inscrição.' });
        }
      }

      // API: Listagem de inscritos para a administração/secretaria
      if (req.method === 'GET' && pathname === '/the-chosen/api/inscritos') {
        if (!isAuthenticated(req)) {
          return sendJson(res, 401, { ok: false, message: 'Não autorizado.' });
        }

        // Se solicitado via ?sync=1 ou se o banco local estiver vazio, puxa da planilha
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const shouldSync = parsedUrl.searchParams.get('sync') === '1' || theChosen.listarInscricoes().length === 0;
        if (shouldSync && typeof theChosen.sincronizarInscricoesComNuvem === 'function') {
          await theChosen.sincronizarInscricoesComNuvem().catch(err => {
            console.warn('[Web] Aviso ao sincronizar com Google Sheets em /the-chosen/api/inscritos:', err.message);
          });
        }

        return sendJson(res, 200, { 
          ok: true, 
          inscricoes: theChosen.listarInscricoes(),
          estatisticas: theChosen.obterEstatisticasConfirmacao()
        });
      }

      // API: Sincronização manual com a planilha do Google (Secretaria)
      if (req.method === 'POST' && pathname === '/the-chosen/api/sincronizar') {
        if (!isAuthenticated(req)) {
          return sendJson(res, 401, { ok: false, message: 'Não autorizado.' });
        }
        try {
          const resultado = typeof theChosen.sincronizarInscricoesComNuvem === 'function'
            ? await theChosen.sincronizarInscricoesComNuvem()
            : { ok: false, message: 'Função de sincronização não disponível.' };
          return sendJson(res, resultado.ok ? 200 : 500, resultado);
        } catch (err) {
          console.error('[Web] Erro ao sincronizar com Google Sheets:', err.message);
          return sendJson(res, 500, { ok: false, message: err.message });
        }
      }

      // Rota: Folha de Presença / Relatório Oficial em PDF (Protegido por login)
      if (req.method === 'GET' && (pathname === '/the-chosen/api/relatorio-pdf' || pathname === '/the-chosen/relatorio-pdf')) {
        if (!isAuthenticated(req)) {
          res.writeHead(302, { Location: '/secretaria/login?message=Faça login para acessar o relatório.' });
          return res.end();
        }
        return sendHtml(res, theChosen.renderTheChosenPdfHtml());
      }

      // API: Alterar status de confirmação de presença (Secretaria / Presença)
      if (req.method === 'POST' && pathname === '/the-chosen/api/confirmar-presenca') {
        if (!isAuthenticated(req)) {
          return sendJson(res, 401, { ok: false, message: 'Não autorizado.' });
        }
        try {
          const body = await parseRequestBody(req);
          const termo = body.id || body.codigo || body.telefone;
          const status = body.status || 'confirmado'; // 'confirmado' | 'cancelado' | 'pendente'
          const resultado = theChosen.confirmarPresenca(termo, status);
          return sendJson(res, resultado.ok ? 200 : 404, resultado);
        } catch (err) {
          return sendJson(res, 500, { ok: false, message: 'Erro ao registrar status de confirmação.' });
        }
      }

      // API: Excluir inscrição (Secretaria)
      if ((req.method === 'POST' && pathname === '/the-chosen/api/excluir-inscricao') ||
          (req.method === 'DELETE' && pathname.startsWith('/the-chosen/api/inscricoes/'))) {
        if (!isAuthenticated(req)) {
          return sendJson(res, 401, { ok: false, message: 'Não autorizado.' });
        }
        try {
          let termo = '';
          if (req.method === 'DELETE') {
            termo = decodeURIComponent(pathname.replace('/the-chosen/api/inscricoes/', ''));
          } else {
            const body = await parseRequestBody(req);
            termo = body.id || body.codigo || body.telefone;
          }
          const resultado = theChosen.excluirInscricao(termo);
          if (resultado.ok && resultado.inscricao && typeof theChosenSheets.excluirInscricaoPlanilha === 'function') {
            await theChosenSheets.excluirInscricaoPlanilha(resultado.inscricao).catch(err => {
              console.error('[Web] Erro ao sincronizar exclusão com a planilha:', err.message);
            });
          }
          return sendJson(res, resultado.ok ? 200 : 404, resultado);
        } catch (err) {
          console.error('[The Chosen] Erro ao excluir inscrição:', err.message);
          return sendJson(res, 500, { ok: false, message: 'Erro interno ao excluir inscrição.' });
        }
      }

      // API: Limpar todas as inscrições de teste (Secretaria)
      if (req.method === 'POST' && pathname === '/the-chosen/api/limpar-testes') {
        if (!isAuthenticated(req)) {
          return sendJson(res, 401, { ok: false, message: 'Não autorizado.' });
        }
        try {
          const resultado = theChosen.limparInscricoesTeste();
          if (resultado.ok && Array.isArray(resultado.removidasInscricoes) && typeof theChosenSheets.excluirInscricaoPlanilha === 'function') {
            for (const item of resultado.removidasInscricoes) {
              await theChosenSheets.excluirInscricaoPlanilha(item).catch(() => {});
            }
          }
          return sendJson(res, 200, resultado);
        } catch (err) {
          console.error('[The Chosen] Erro ao limpar inscrições de teste:', err.message);
          return sendJson(res, 500, { ok: false, message: 'Erro interno ao limpar testes.' });
        }
      }

      if (req.method === 'GET' && pathname === '/secretaria/login') {
        return sendHtml(res, renderLoginHtml());
      }
      if (req.method === 'POST' && pathname === '/secretaria/login') {
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
      // O gate de autenticação só se aplica a rotas dentro de /secretaria — outras
      // rotas (ex: uma futura landing page em "/") ficam livres, sem exigir login.
      if (pathname.startsWith('/secretaria') && pathname !== '/secretaria/login' && pathname !== '/secretaria/register' && !isAuthenticated(req)) {
        if (req.method === 'GET') {
          res.writeHead(302, { Location: '/secretaria/login' });
          return res.end();
        }
        console.warn(`[Web] 401 Acesso negado para ${sanitizarParaLog(pathname)} | IP: ${sanitizarParaLog(ip)}`); // NOSONAR
        return sendJson(res, 401, { ok: false, message: 'Login requerido.' });
      }
      if (req.method === 'GET' && pathname === '/secretaria/register') {
        return sendHtml(res, renderRegisterHtml());

      }
      if (req.method === 'POST' && pathname === '/secretaria/register') {
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

      if (req.method === 'GET' && pathname === '/secretaria') {
        try {
          const html = renderIndexHtml();
          return sendHtml(res, html);
        } catch (renderErr) {
          console.error(`[Web] Erro ao renderizar Index:`, renderErr);
          throw renderErr; // Repassa para o catch global
        }
      }
      if (req.method === 'GET' && pathname === '/secretaria/status') {
        return sendJson(res, 200, getStatus());
      }

      // API: Informações do Usuário Logado
      if (req.method === 'GET' && pathname === '/secretaria/api/user-info') {
        const session = getSession(req);
        return sendJson(res, 200, { ok: true, user: session });
      }

      // API: Listar Eventos Cadastrados
      if (req.method === 'GET' && pathname === '/secretaria/api/eventos') {
        const eventos = listarDescricoesEventos();
        return sendJson(res, 200, { ok: true, eventos });
      }

      // API: Gerar Descrição Automática (IA) para Evento
      if (req.method === 'POST' && pathname === '/secretaria/api/eventos/gerar-descricao') {
        try {
          const body = await parseRequestBody(req);
          const { evento, tipoDuracao, horarios, departamento, local, tema, publico, observacoes } = body;
          if (!evento || !evento.trim()) {
            return sendJson(res, 400, { ok: false, message: 'Nome do evento é obrigatório.' });
          }
          const descricao = gerarDescricaoEvento({
            evento,
            tipoDuracao: tipoDuracao || "unico",
            horarios,
            departamento: departamento || "Comunidade Cristã Curados",
            local: local || "Comunidade Cristã Curados",
            tema,
            publico,
            observacoes
          });
          return sendJson(res, 200, { ok: true, descricao });
        } catch (err) {
          console.error('[Web] Erro ao gerar descrição IA:', err.message);
          return sendJson(res, 500, { ok: false, message: 'Erro ao gerar descrição do evento.' });
        }
      }

      // API: Cadastrar e Agendar Evento
      if (req.method === 'POST' && pathname === '/secretaria/api/eventos') {
        try {
          const body = await parseRequestBody(req);
          const { evento, departamento, local, tipoDuracao, horarios, descricao, tema, publico, observacoes } = body;
          if (!evento || !evento.trim()) {
            return sendJson(res, 400, { ok: false, message: 'Nome do evento é obrigatório.' });
          }

          // Validação rigorosa: horário de início obrigatório (sem 'dia todo' ou genérico)
          if (tipoDuracao === "unico") {
            const h = Array.isArray(horarios) ? horarios[0] : horarios;
            if (!h || !h.data || !h.inicio || !h.fim) {
              return sendJson(res, 400, { ok: false, message: 'Para evento de 1 dia, data, horário de início e término são obrigatórios.' });
            }
            if (/dia\s*(todo|inteiro)/i.test(h.inicio)) {
              return sendJson(res, 400, { ok: false, message: 'O horário de início é obrigatório mesmo para eventos de dia todo. Informe no formato HH:MM.' });
            }
          } else if (tipoDuracao === "consecutivo") {
            const h = Array.isArray(horarios) ? horarios[0] : horarios;
            if (!h || !h.dataInicio || !h.horaInicio || !h.dataFim || !h.horaFim) {
              return sendJson(res, 400, { ok: false, message: 'Para evento consecutivo, data/hora de início e data/hora de término são obrigatórias.' });
            }
            if (/dia\s*(todo|inteiro)/i.test(h.horaInicio)) {
              return sendJson(res, 400, { ok: false, message: 'O horário de início é obrigatório. Informe no formato HH:MM.' });
            }
          } else if (tipoDuracao === "multiplo") {
            const blocos = Array.isArray(horarios) ? horarios : [horarios];
            if (!blocos || blocos.length === 0) {
              return sendJson(res, 400, { ok: false, message: 'Adicione ao menos um bloco de horário.' });
            }
            for (let i = 0; i < blocos.length; i++) {
              const b = blocos[i];
              if (!b.data || !b.inicio || !b.fim) {
                return sendJson(res, 400, { ok: false, message: `O bloco ${i + 1} está incompleto (data, início e fim são obrigatórios).` });
              }
              if (/dia\s*(todo|inteiro)/i.test(b.inicio)) {
                return sendJson(res, 400, { ok: false, message: `O bloco ${i + 1} exige um horário de início específico no formato HH:MM.` });
              }
            }
          }

          const descFinal = descricao || gerarDescricaoEvento({
            evento,
            tipoDuracao: tipoDuracao || "unico",
            horarios,
            departamento,
            local,
            tema,
            publico,
            observacoes
          });

          const id = salvarDescricaoEvento({
            evento,
            departamento: departamento || "",
            local: local || "",
            tipoDuracao: tipoDuracao || "unico",
            horarios,
            descricao: descFinal
          });

          return sendJson(res, 200, { 
            ok: true, 
            message: 'Evento cadastrado e descrição gerada com sucesso!', 
            id,
            descricao: descFinal 
          });
        } catch (err) {
          console.error('[Web] Erro ao cadastrar evento:', err.message);
          return sendJson(res, 500, { ok: false, message: 'Erro ao cadastrar evento no sistema.' });
        }
      }

      // API: Deletar Usuário (Apenas Admin)
      if (req.method === 'DELETE' && pathname.startsWith('/secretaria/api/admin/users/') && isAdmin(req)) {
        const target = decodeURIComponent(pathname.replace('/secretaria/api/admin/users/', ''));
        const result = deleteUser(target);
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      // API: Listar Usuários (Apenas Admin)
      if (req.method === 'GET' && pathname === '/secretaria/api/admin/users' && isAdmin(req)) {
        const users = loadUsers();
        const userList = Object.values(users).map(u => ({ username: u.username, role: u.role }));
        return sendJson(res, 200, { ok: true, users: userList });
      }

      // API: Criar Usuário (Apenas Admin)
      if (req.method === 'POST' && pathname === '/secretaria/api/admin/users' && isAdmin(req)) {
        try {
          const body = await parseRequestBody(req);
          const result = await addUser(body);
          return sendJson(res, result.ok ? 200 : 400, result);
        } catch (err) {
          console.error(`[Web] Erro ao criar usuário via Admin: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Dados inválidos.' });
        }
      }

      // API: Listar Líderes e Usuários por Telefone (Apenas Admin)
      if (req.method === 'GET' && (pathname === '/secretaria/api/admin/lideres' || pathname === '/secretaria/api/admin/usuarios') && isAdmin(req)) {
        const lideres = listLideres();
        return sendJson(res, 200, { ok: true, lideres, usuarios: lideres });
      }

      // API: Adicionar Líder / Usuário (Apenas Admin)
      if (req.method === 'POST' && (pathname === '/secretaria/api/admin/lideres' || pathname === '/secretaria/api/admin/usuarios') && isAdmin(req)) {
        try {
          const body = await parseRequestBody(req);
          const result = addLider(body);
          return sendJson(res, result.ok ? 200 : 400, result);
        } catch (err) {
          console.error(`[Web] Erro ao adicionar usuário/líder via Admin: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Dados inválidos.' });
        }
      }

      // API: Editar Líder / Usuário (Apenas Admin)
      if (req.method === 'PUT' && (pathname.startsWith('/secretaria/api/admin/lideres/') || pathname.startsWith('/secretaria/api/admin/usuarios/')) && isAdmin(req)) {
        try {
          const prefix = pathname.startsWith('/secretaria/api/admin/lideres/') ? '/secretaria/api/admin/lideres/' : '/secretaria/api/admin/usuarios/';
          const target = decodeURIComponent(pathname.replace(prefix, ''));
          const body = await parseRequestBody(req);
          const result = updateLider(target, body);
          return sendJson(res, result.ok ? 200 : 400, result);
        } catch (err) {
          console.error(`[Web] Erro ao editar usuário/líder via Admin: ${err.message}`);
          return sendJson(res, 400, { ok: false, message: 'Dados inválidos.' });
        }
      }

      // API: Remover Líder / Usuário (Apenas Admin)
      if (req.method === 'DELETE' && (pathname.startsWith('/secretaria/api/admin/lideres/') || pathname.startsWith('/secretaria/api/admin/usuarios/')) && isAdmin(req)) {
        const prefix = pathname.startsWith('/secretaria/api/admin/lideres/') ? '/secretaria/api/admin/lideres/' : '/secretaria/api/admin/usuarios/';
        const target = decodeURIComponent(pathname.replace(prefix, ''));
        const result = removeLider(target);
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      // API: Ler Logs (Apenas Admin)
      if (req.method === 'GET' && pathname === '/secretaria/api/logs' && isAdmin(req)) {
        try {
          const content = fs.readFileSync(LOG_FILE, 'utf8');
          return sendJson(res, 200, { ok: true, logs: content });
        } catch (e) {
          return sendJson(res, 500, { ok: false, message: 'Erro ao ler arquivo de log' });
        }
      }

      // API: Limpar Logs (Apenas Admin)
      if (req.method === 'DELETE' && pathname === '/secretaria/api/logs' && isAdmin(req)) {
        try {
          fs.writeFileSync(LOG_FILE, '');
          return sendJson(res, 200, { ok: true });
        } catch (e) {
          return sendJson(res, 500, { ok: false });
        }
      }

      if (req.method === 'POST' && pathname === '/secretaria/request-qr') {
        const status = getStatus();
        if (status.connected) {
          return sendJson(res, 200, { ok: false, message: 'Bot conectado.' });
        }
        await startClient();
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'POST' && pathname === '/secretaria/cancel-qr') {
        await cancelQr();
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'POST' && pathname === '/secretaria/disconnect') {
        const result = await disconnectClient(true);
        return sendJson(res, result.ok ? 200 : 500, result);
      }
      if (req.method === 'POST' && pathname === '/secretaria/reset-session') {
        await disconnectClient(true);
        await startClient({ forceClean: true });
        return sendJson(res, 200, { ok: true, message: 'Sessão reiniciada do zero.' });
      }
      if (req.method === 'POST' && pathname === '/secretaria/logout') {
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

    // Sincroniza dados da planilha ao iniciar o servidor
    if (typeof theChosen.sincronizarInscricoesComNuvem === 'function' && !process.env.THE_CHOSEN_DATA_PATH) {
      theChosen.sincronizarInscricoesComNuvem().catch(err => {
        console.warn('[Web] Aviso na sincronização inicial com a planilha Google:', err.message);
      });
    }
  });

  return server;
}

// Removido getUsers que não estava definido e corrigido exportação
module.exports = { startWebServer, addUser, sanitizarParaLog };
