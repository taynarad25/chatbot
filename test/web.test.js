// Isola completamente de arquivos reais de produção (login.json, combined.log) ANTES de
// exigir qualquer módulo — este ambiente também roda o bot de produção de verdade, então
// nunca podemos ler/escrever nos arquivos reais durante os testes. Cada arquivo de teste
// roda em processo separado no test runner do Node, então isso não vaza para outros testes.
const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-web-test-"));
process.env.LOGIN_FILE_PATH = path.join(tmpDir, "login.json");
process.env.COMBINED_LOG_PATH = path.join(tmpDir, "combined.log");
fs.writeFileSync(process.env.COMBINED_LOG_PATH, "linha de log de teste\n");

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startWebServer, addUser } = require("../web");
const { sessions } = require("../web/auth");

const getStatus = () => ({ connected: false, initializing: false, generatingQr: false, canceling: false, hasQr: false });
const noop = async () => ({ ok: true });

let server;
let baseUrl;

before(async () => {
  server = startWebServer({ getStatus, startClient: noop, cancelQr: noop, disconnectClient: noop, port: 0 });
  // server.listen() é assíncrono — aguarda o evento "listening" antes de saber a porta real
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function extraiCookie(res) {
  const setCookie = res.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : null;
}

async function fazerLogin(username, password) {
  const res = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return { res, cookie: extraiCookie(res) };
}

test("GET /login: retorna a página de login com status 200", async () => {
  const res = await fetch(`${baseUrl}/login`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<form id="loginForm">/);
});

test("GET /register: retorna a página de cadastro com status 200", async () => {
  const res = await fetch(`${baseUrl}/register`);
  assert.equal(res.status, 200);
});

test("GET /whatsappcontrol sem sessão: redireciona para /login (302)", async () => {
  const res = await fetch(`${baseUrl}/whatsappcontrol`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /\/login/);
});

test("POST /disconnect sem sessão: 401 (rota protegida, método não-GET)", async () => {
  const res = await fetch(`${baseUrl}/disconnect`, { method: "POST" });
  assert.equal(res.status, 401);
});

test("POST /login: credenciais de usuário inexistente retorna 401", async () => {
  const { res } = await fazerLogin("usuario-que-nao-existe", "qualquercoisa");
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.ok, false);
});

test("fluxo completo: cria admin, faz login, acessa rota autenticada e rota admin", async () => {
  await addUser({ username: "admin-teste", password: "senhaSegura123", role: "admin", status: "active" });

  const { res, cookie } = await fazerLogin("admin-teste", "senhaSegura123");
  assert.equal(res.status, 200);
  assert.ok(cookie, "deveria retornar um cookie de sessão");
  assert.match(cookie, /whatsapp_control_session=/);

  const userInfo = await fetch(`${baseUrl}/api/user-info`, { headers: { Cookie: cookie } });
  assert.equal(userInfo.status, 200);
  const userInfoJson = await userInfo.json();
  assert.equal(userInfoJson.user.username, "admin-teste");
  assert.equal(userInfoJson.user.role, "admin");

  const adminUsers = await fetch(`${baseUrl}/api/admin/users`, { headers: { Cookie: cookie } });
  assert.equal(adminUsers.status, 200);
  const adminUsersJson = await adminUsers.json();
  assert.ok(adminUsersJson.users.some((u) => u.username === "admin-teste"));
});

test("POST /api/admin/users (como admin): cria um novo usuário pendente", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");

  const res = await fetch(`${baseUrl}/api/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ username: "lider-novo", role: "user" }),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);

  const lista = await fetch(`${baseUrl}/api/admin/users`, { headers: { Cookie: cookie } });
  const listaJson = await lista.json();
  assert.ok(listaJson.users.some((u) => u.username === "lider-novo"));
});

test("POST /register: usuário pendente consegue definir a senha e concluir o cadastro", async () => {
  const res = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "lider-novo", password: "outraSenha456" }),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);

  const { res: loginRes } = await fazerLogin("lider-novo", "outraSenha456");
  assert.equal(loginRes.status, 200, "deveria conseguir logar depois de concluir o cadastro");
});

test("POST /register: usuário desconhecido retorna 404", async () => {
  const res = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "ninguem-criou-esse", password: "senha123" }),
  });
  assert.equal(res.status, 404);
});

test("usuário comum (não-admin) não consegue acessar rota de admin", async () => {
  const { cookie } = await fazerLogin("lider-novo", "outraSenha456");
  const res = await fetch(`${baseUrl}/api/admin/users`, { headers: { Cookie: cookie } });
  // isAdmin(req) faz parte da própria condição da rota — sem ser admin, cai no 404 padrão
  assert.equal(res.status, 404);
});

test("DELETE /api/admin/users/:username (como admin): remove o usuário", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");

  const del = await fetch(`${baseUrl}/api/admin/users/lider-novo`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(del.status, 200);

  const lista = await fetch(`${baseUrl}/api/admin/users`, { headers: { Cookie: cookie } });
  const listaJson = await lista.json();
  assert.ok(!listaJson.users.some((u) => u.username === "lider-novo"));
});

test("GET /api/logs (como admin): lê o arquivo de log isolado do teste", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");
  const res = await fetch(`${baseUrl}/api/logs`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.match(json.logs, /linha de log de teste/);
});

test("DELETE /api/logs (como admin): limpa o arquivo de log isolado do teste", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");

  const del = await fetch(`${baseUrl}/api/logs`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(del.status, 200);

  const res = await fetch(`${baseUrl}/api/logs`, { headers: { Cookie: cookie } });
  const json = await res.json();
  assert.equal(json.logs, "");
});

test("POST /logout: invalida a sessão (rota volta a exigir login)", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");
  const logout = await fetch(`${baseUrl}/logout`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);

  // /api/user-info é uma rota GET: sem sessão válida, o gate de autenticação redireciona (302)
  // para /login em vez de responder 401 — precisa de redirect:"manual" pra não seguir e mascarar
  // o resultado com o 200 da própria página de login.
  const depois = await fetch(`${baseUrl}/api/user-info`, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(depois.status, 302);
});

test("rota desconhecida retorna 404 (quando autenticado, passa pelo gate e cai no fallback)", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");
  const res = await fetch(`${baseUrl}/essa-rota-nao-existe`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 404);
});

test("rota desconhecida sem sessão: redireciona para /login (mesmo gate de autenticação, não chega a 404)", async () => {
  const res = await fetch(`${baseUrl}/essa-rota-nao-existe`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /\/login/);
});

// Deixado por último de propósito: consome o limite de tentativas do rate limiter,
// que é compartilhado (por IP) entre todas as requisições deste arquivo de teste.
test("rate limiting: bloqueia login após muitas tentativas com senha errada", async () => {
  let bloqueado = false;
  for (let i = 0; i < 15 && !bloqueado; i++) {
    const { res } = await fazerLogin("admin-teste", "senhaErrada");
    if (res.status === 429) bloqueado = true;
  }
  assert.ok(bloqueado, "deveria bloquear o IP após várias tentativas com senha errada");

  // Reseta a sessão em memória usada pelos testes anteriores para não vazar estado
  Object.keys(sessions).forEach((key) => delete sessions[key]);
});
