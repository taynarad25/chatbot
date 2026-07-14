// Isola completamente de arquivos reais de produção (login.json, combined.log) ANTES de
// exigir qualquer módulo — este ambiente também roda o bot de produção de verdade, então
// nunca podemos ler/escrever nos arquivos reais durante os testes. Cada arquivo de teste
// roda em processo separado no test runner do Node, então isso não vaza para outros testes.
const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-web-test-"));
process.env.LOGIN_FILE_PATH = path.join(tmpDir, "login.json");
process.env.LIDERES_FILE_PATH = path.join(tmpDir, "lideres.json");
process.env.COMBINED_LOG_PATH = path.join(tmpDir, "combined.log");
fs.writeFileSync(process.env.COMBINED_LOG_PATH, "linha de log de teste\n");

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startWebServer, addUser, sanitizarParaLog } = require("../web");
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

test("GET /favicon.ico: retorna 204 (sem conteúdo), sem cair no 404", async () => {
  const res = await fetch(`${baseUrl}/favicon.ico`);
  assert.equal(res.status, 204);
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

test("POST /login: username com quebra de linha não injeta uma linha de log falsa (log injection)", async () => {
  const payloadInjecao = "admin\n[Web] Login bem-sucedido: forjado (IP: 1.2.3.4)";
  const chamadas = [];
  const originalWarn = console.warn;
  console.warn = (...args) => chamadas.push(args.join(" "));
  try {
    const { res } = await fazerLogin(payloadInjecao, "qualquercoisa");
    assert.equal(res.status, 401);
  } finally {
    console.warn = originalWarn;
  }

  assert.ok(chamadas.length > 0, "esperava pelo menos um console.warn (usuário não encontrado)");
  chamadas.forEach((linha) => {
    assert.doesNotMatch(linha, /\n/, "a quebra de linha do username não deveria sobreviver sem tratamento no log");
  });
});

test("sanitizarParaLog: remove quebras de linha e caracteres de controle", () => {
  assert.equal(sanitizarParaLog("admin\n[Web] linha forjada"), "admin [Web] linha forjada");
  assert.equal(sanitizarParaLog("a\r\nb\tc"), "a  b c");
});

test("sanitizarParaLog: valores vazios/ausentes viram string vazia, sem lançar erro", () => {
  assert.equal(sanitizarParaLog(undefined), "");
  assert.equal(sanitizarParaLog(null), "");
  assert.equal(sanitizarParaLog(""), "");
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

test("DELETE /api/admin/users/:username: usuário inexistente retorna 404 (não finge sucesso)", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");
  const del = await fetch(`${baseUrl}/api/admin/users/ninguem-com-esse-nome`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(del.status, 404);
});

test("DELETE /api/admin/users/:username: nome com acentuação é decodificado da URL corretamente antes de excluir", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");
  await addUser({ username: "Joãozinho", password: "senha123456", role: "user", status: "active" });

  // O front-end chama encodeURIComponent(name) — reproduz isso aqui para garantir
  // que o servidor decodifica antes de procurar o usuário.
  const del = await fetch(`${baseUrl}/api/admin/users/${encodeURIComponent("Joãozinho")}`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(del.status, 200);

  const lista = await fetch(`${baseUrl}/api/admin/users`, { headers: { Cookie: cookie } });
  const listaJson = await lista.json();
  assert.ok(!listaJson.users.some((u) => u.username === "joãozinho"));
});

test("GET /api/admin/lideres (como admin): lista vazia quando não há líderes cadastrados", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");
  const res = await fetch(`${baseUrl}/api/admin/lideres`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json.lideres, []);
});

test("POST /api/admin/lideres (como admin): adiciona um líder novo", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");

  const res = await fetch(`${baseUrl}/api/admin/lideres`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ nome: "Taynara Diniz", telefone: "+55 (11) 94659-3056" }),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);

  const lista = await fetch(`${baseUrl}/api/admin/lideres`, { headers: { Cookie: cookie } });
  const listaJson = await lista.json();
  // O telefone é normalizado (só dígitos) na hora de salvar
  assert.ok(listaJson.lideres.some((l) => l.nome === "Taynara Diniz" && l.telefone === "5511946593056"));
});

test("POST /api/admin/lideres: telefone duplicado é rejeitado", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");

  const res = await fetch(`${baseUrl}/api/admin/lideres`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ nome: "Outro Nome", telefone: "5511946593056" }),
  });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.ok, false);
});

test("PUT /api/admin/lideres/:telefone (como admin): edita o nome mantendo o telefone", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");

  const res = await fetch(`${baseUrl}/api/admin/lideres/5511946593056`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ nome: "Taynara D. Silva", telefone: "5511946593056" }),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);

  const lista = await fetch(`${baseUrl}/api/admin/lideres`, { headers: { Cookie: cookie } });
  const listaJson = await lista.json();
  assert.ok(listaJson.lideres.some((l) => l.nome === "Taynara D. Silva" && l.telefone === "5511946593056"));
});

test("PUT /api/admin/lideres/:telefone: também troca o telefone do líder", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");

  await fetch(`${baseUrl}/api/admin/lideres`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ nome: "Temporário", telefone: "5511900000000" }),
  });

  const res = await fetch(`${baseUrl}/api/admin/lideres/5511900000000`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ nome: "Temporário", telefone: "5511911111111" }),
  });
  assert.equal(res.status, 200);

  const lista = await fetch(`${baseUrl}/api/admin/lideres`, { headers: { Cookie: cookie } });
  const listaJson = await lista.json();
  assert.ok(!listaJson.lideres.some((l) => l.telefone === "5511900000000"));
  assert.ok(listaJson.lideres.some((l) => l.telefone === "5511911111111"));

  // Limpeza: remove o líder temporário criado só para este teste, para não
  // interferir nos testes seguintes.
  await fetch(`${baseUrl}/api/admin/lideres/5511911111111`, { method: "DELETE", headers: { Cookie: cookie } });
});

test("PUT /api/admin/lideres/:telefone: líder inexistente retorna 400", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");
  const res = await fetch(`${baseUrl}/api/admin/lideres/0000000000000`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ nome: "Ninguem", telefone: "0000000000000" }),
  });
  assert.equal(res.status, 400);
});

test("usuário comum (não-admin) não consegue acessar rotas de líderes", async () => {
  // Cria um usuário próprio para este teste (em vez de reusar "lider-novo", já
  // removido pelo teste de DELETE /api/admin/users anterior), evitando depender
  // da ordem de execução dos testes.
  await addUser({ username: "usuario-comum-lideres", password: "senha123456", role: "user", status: "active" });
  const { cookie } = await fazerLogin("usuario-comum-lideres", "senha123456");
  const res = await fetch(`${baseUrl}/api/admin/lideres`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 404);
});

test("DELETE /api/admin/lideres/:telefone (como admin): remove o líder", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");

  const del = await fetch(`${baseUrl}/api/admin/lideres/5511946593056`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(del.status, 200);

  const lista = await fetch(`${baseUrl}/api/admin/lideres`, { headers: { Cookie: cookie } });
  const listaJson = await lista.json();
  assert.ok(!listaJson.lideres.some((l) => l.telefone === "5511946593056"));
});

test("DELETE /api/admin/lideres/:telefone: líder inexistente retorna 404", async () => {
  const { cookie } = await fazerLogin("admin-teste", "senhaSegura123");
  const del = await fetch(`${baseUrl}/api/admin/lideres/0000000000000`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(del.status, 404);
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
