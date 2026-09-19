// Testes completos para estrutura de cargos múltiplos:
// 1. Banco de Dados / Backend (armazenamento e serialização de cargos)
// 2. Rotas de API (POST/PUT/GET com envio e retorno de múltiplos cargos)
// 3. Validação de múltiplas permissões no bot (Líder, Pastor, Diretor, Membro)

const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-cargos-test-"));
process.env.DB_PATH = path.join(tmpDir, "dados.db");
process.env.COMBINED_LOG_PATH = path.join(tmpDir, "combined.log");
fs.writeFileSync(process.env.COMBINED_LOG_PATH, "log inicial\n");

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startWebServer, addUser } = require("../web");
const {
  addLider,
  loadLideres,
  listLideres,
  updateLider,
  removeLider,
  normalizarCargos,
  obterUsuarioPorTelefone,
  telefonesLideres,
} = require("../web/lideres");
const { createMessageHandler, temPermissao, identificarUsuario } = require("../bot/messageHandler");

const getStatus = () => ({ connected: true, initializing: false, generatingQr: false, canceling: false, hasQr: false });
const noop = async () => ({ ok: true });

let server;
let baseUrl;
let adminCookie;

before(async () => {
  server = startWebServer({ getStatus, startClient: noop, cancelQr: noop, disconnectClient: noop, port: 0 });
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await addUser({ username: "admin-cargos", password: "senhaAdmin123", role: "admin", status: "active" });

  const loginRes = await fetch(`${baseUrl}/secretaria/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin-cargos", password: "senhaAdmin123" }),
  });
  const setCookie = loginRes.headers.get("set-cookie");
  adminCookie = setCookie.split(";")[0];
});

after(() => {
  server.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

// ============================================================================
// 1. BANCO DE DADOS & BACKEND (Módulo web/lideres.js)
// ============================================================================

test("normalizarCargos: trata array, string e valores padrão", () => {
  assert.deepEqual(normalizarCargos(["lider", "pastor"]), ["lider", "pastor"]);
  assert.deepEqual(normalizarCargos(["LÍDER", " PASTOR "]), ["líder", "pastor"]);
  assert.deepEqual(normalizarCargos(["lider", "lider"]), ["lider"]);
  assert.deepEqual(normalizarCargos('["lider", "diretor"]'), ["lider", "diretor"]);
  assert.deepEqual(normalizarCargos("pastor, membro"), ["pastor", "membro"]);
  assert.deepEqual(normalizarCargos(null), ["lider"]);
  assert.deepEqual(normalizarCargos([]), ["lider"]);
});

test("addLider: salva usuário com múltiplos cargos no banco SQLite", () => {
  const res = addLider({
    nome: "Pastor Marcos",
    telefone: "5511999990001",
    cargos: ["lider", "pastor"],
  });
  assert.equal(res.ok, true);

  const usuario = obterUsuarioPorTelefone("5511999990001");
  assert.equal(usuario.nome, "Pastor Marcos");
  assert.equal(usuario.telefone, "5511999990001");
  assert.deepEqual(usuario.cargos, ["lider", "pastor"]);
});

test("telefonesLideres sincroniza apenas usuários que possuem a permissão 'lider'", () => {
  addLider({ nome: "Diretor Carlos", telefone: "5511999990002", cargos: ["diretor"] });
  addLider({ nome: "Membro Ana", telefone: "5511999990003", cargos: ["membro"] });

  assert.ok(telefonesLideres.includes("5511999990001")); // tem lider + pastor
  assert.ok(!telefonesLideres.includes("5511999990002")); // apenas diretor
  assert.ok(!telefonesLideres.includes("5511999990003")); // apenas membro
});

test("updateLider: atualiza os cargos de um usuário existente", () => {
  const res = updateLider("5511999990001", {
    nome: "Pastor Marcos Silva",
    telefone: "5511999990001",
    cargos: ["pastor", "diretor"],
  });
  assert.equal(res.ok, true);

  const atualizado = obterUsuarioPorTelefone("5511999990001");
  assert.equal(atualizado.nome, "Pastor Marcos Silva");
  assert.deepEqual(atualizado.cargos, ["pastor", "diretor"]);
});

// ============================================================================
// 2. ROTAS DE API (Backend Web)
// ============================================================================

test("POST /secretaria/api/admin/lideres com múltiplos cargos persiste e retorna 200", async () => {
  const res = await fetch(`${baseUrl}/secretaria/api/admin/lideres`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      nome: "Pra. Juliana",
      telefone: "5511988887777",
      cargos: ["lider", "pastor", "diretor"],
    }),
  });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.ok, true);

  // Consulta lista
  const listRes = await fetch(`${baseUrl}/secretaria/api/admin/lideres`, {
    headers: { Cookie: adminCookie },
  });
  const listJson = await listRes.json();
  const encontrada = listJson.lideres.find((u) => u.telefone === "5511988887777");
  assert.ok(encontrada);
  assert.deepEqual(encontrada.cargos, ["lider", "pastor", "diretor"]);
});

test("PUT /secretaria/api/admin/lideres/:telefone altera os cargos do usuário", async () => {
  const res = await fetch(`${baseUrl}/secretaria/api/admin/lideres/5511988887777`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      nome: "Pra. Juliana Santos",
      telefone: "5511988887777",
      cargos: ["pastor"],
    }),
  });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.ok, true);

  const usuario = obterUsuarioPorTelefone("5511988887777");
  assert.equal(usuario.nome, "Pra. Juliana Santos");
  assert.deepEqual(usuario.cargos, ["pastor"]);
});

test("Rota alias /secretaria/api/admin/usuarios funciona de forma idêntica", async () => {
  const res = await fetch(`${baseUrl}/secretaria/api/admin/usuarios`, {
    headers: { Cookie: adminCookie },
  });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(json.usuarios));
});

test("POST e PUT /secretaria/api/admin/lideres salvam e atualizam departamento", async () => {
  const postRes = await fetch(`${baseUrl}/secretaria/api/admin/lideres`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      nome: "Líder Débora",
      telefone: "5511999998888",
      cargos: ["lider"],
      departamento: "Rede de Mulheres",
    }),
  });
  const postJson = await postRes.json();
  assert.equal(postRes.status, 200);
  assert.equal(postJson.ok, true);

  const u1 = obterUsuarioPorTelefone("5511999998888");
  assert.equal(u1.departamento, "Rede de Mulheres");

  const putRes = await fetch(`${baseUrl}/secretaria/api/admin/lideres/5511999998888`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      nome: "Líder Débora Alterada",
      telefone: "5511999998888",
      cargos: ["lider", "pastor"],
      departamento: "Intercessão",
    }),
  });
  const putJson = await putRes.json();
  assert.equal(putRes.status, 200);
  assert.equal(putJson.ok, true);

  const u2 = obterUsuarioPorTelefone("5511999998888");
  assert.equal(u2.nome, "Líder Débora Alterada");
  assert.equal(u2.departamento, "Intercessão");

  const postMultiRes = await fetch(`${baseUrl}/secretaria/api/admin/lideres`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      nome: "Líder Multi",
      telefone: "5511999997777",
      cargos: ["lider"],
      departamentos: ["Rede de Casais", "Rede Ruach"],
    }),
  });
  const postMultiJson = await postMultiRes.json();
  assert.equal(postMultiRes.status, 200);
  assert.equal(postMultiJson.ok, true);

  const uMulti = obterUsuarioPorTelefone("5511999997777");
  assert.deepEqual(uMulti.departamentos, ["Rede de Casais", "Rede Ruach"]);
});

// ============================================================================
// 3. LÓGICA DO BOT & VALIDAÇÃO DE MÚLTIPLAS PERMISSÕES
// ============================================================================

function criarBotHarness(usuariosCadastrados = [], { calendarEvents = [], agendasParaLer = [] } = {}) {
  const etapas = {};
  const respostasEnviadas = [];

  const client = {
    sendMessage: async (to, texto) => {
      respostasEnviadas.push({ to, texto });
    },
  };

  const handleMessage = createMessageHandler({
    client,
    calendar: {},
    agendasParaLer,
    lideres: [],
    etapas,
    buscarEventos: async () => calendarEvents,
    listLideres: () => usuariosCadastrados,
  });

  async function enviarMsg(numero, texto) {
    const respostas = [];
    const msg = {
      from: numero,
      body: texto,
      id: { _serialized: `msg-${Date.now()}` },
      getContact: async () => ({ id: { _serialized: numero }, pushname: "Contato Teste" }),
      reply: async (txt) => {
        respostas.push(txt);
        return txt;
      },
    };
    await handleMessage(msg);
    return respostas;
  }

  return { handleMessage, enviarMsg, etapas };
}

test("identificarUsuario exibe múltiplos cargos formatados", () => {
  const contato = { id: { _serialized: "5511999990001@c.us" }, pushname: "Marcos" };
  const str = identificarUsuario(contato, "5511999990001", true, {
    cargos: ["lider", "pastor"],
  });
  assert.match(str, /\(Líder, Pastor\)/);
});

test("temPermissao valida corretamente as permissões no array", () => {
  const user = { cargos: ["lider", "pastor"] };
  assert.equal(temPermissao(user, "lider"), true);
  assert.equal(temPermissao(user, "pastor"), true);
  assert.equal(temPermissao(user, "diretor"), false);
  assert.equal(temPermissao(user, "membro"), false);
});

test("Simulação Bot: usuário com múltiplos cargos ('lider', 'pastor') recebe ambas permissões", async () => {
  const bot = criarBotHarness([
    {
      nome: "Pr. Roberto",
      telefone: "5511977770001",
      cargos: ["lider", "pastor"],
    },
  ]);

  const NUMERO = "5511977770001@c.us";

  // 1. Saudação / Menu: Pastor tem Área Pastoral com todas as opções de liderança integradas (sem menus separados duplicados)
  const [menu] = await bot.enviarMsg(NUMERO, "Olá");
  assert.match(menu, /7️⃣ Área Pastoral/, "Deveria exibir Área Pastoral para quem tem cargo pastor");
  assert.doesNotMatch(menu, /7️⃣ Área do Líder/, "Não deve exibir Área do Líder duplicada para quem já é pastor");

  // 2. Acesso à Área Pastoral (comando 8 ou 7) contém os subgrupos integrados
  const [respPastoral] = await bot.enviarMsg(NUMERO, "8");
  assert.match(respPastoral, /⛪ \*Área Pastoral\*/, "Usuário com cargo pastor deve conseguir acessar a Área Pastoral");
  assert.match(respPastoral, /Agenda, Eventos e Reuniões/);
  assert.match(respPastoral, /Atendimento Pastoral/);
});

test("Simulação Bot: usuário com apenas 'lider' acessa opção 7 mas não opção 8", async () => {
  const bot = criarBotHarness([
    {
      nome: "Líder Amanda",
      telefone: "5511977770002",
      cargos: ["lider"],
    },
  ]);

  const NUMERO = "5511977770002@c.us";

  // Menu: exibe apenas Área do Líder
  const [menu] = await bot.enviarMsg(NUMERO, "oi");
  assert.match(menu, /7️⃣ Área do Líder/);
  assert.doesNotMatch(menu, /8️⃣ Área Pastoral/);

  // Acessa opção 7 com sucesso
  const [resp7] = await bot.enviarMsg(NUMERO, "7");
  assert.match(resp7, /👑 \*Área do Líder\*/);

  // Volta ao menu
  await bot.enviarMsg(NUMERO, "menu");

  // Tenta acessar opção 8 (não autorizada para quem não é pastor)
  const [resp8] = await bot.enviarMsg(NUMERO, "8");
  assert.match(resp8, /Não entendi sua mensagem/);
});

test("Simulação Bot: usuário com apenas 'membro' visualiza uso do salão no 5 e secretaria no 6", async () => {
  const bot = criarBotHarness([
    {
      nome: "Membro Gabriel",
      telefone: "5511977770003",
      cargos: ["membro"],
    },
  ]);

  const NUMERO = "5511977770003@c.us";

  // Menu: exibe opções 1 a 4, uso do salão no 5 e secretaria no 6 (sem espaço vago)
  const [menu] = await bot.enviarMsg(NUMERO, "bom dia");
  assert.match(menu, /5️⃣ Solicitar uso do salão/);
  assert.match(menu, /6️⃣ Falar com a secretaria/);
  assert.doesNotMatch(menu, /Área do Líder/);
  assert.doesNotMatch(menu, /8️⃣ Área Pastoral/);
  assert.doesNotMatch(menu, /9️⃣ Área da Direção/);

  // Opção 6 para membro é Falar com a Secretaria (não acessa Área do Líder)
  const [resp6] = await bot.enviarMsg(NUMERO, "6");
  assert.match(resp6, /📞 \*Secretaria\*/);
  assert.doesNotMatch(resp6, /Área do Líder/);

  // Opção 8 não é reconhecida (não acessa Área Pastoral)
  await bot.enviarMsg(NUMERO, "menu");
  const [resp8] = await bot.enviarMsg(NUMERO, "8");
  assert.match(resp8, /Não entendi sua mensagem/);
});

test("Simulação Bot: usuário com cargo 'diretor' recebe e acessa Área da Direção (9)", async () => {
  const bot = criarBotHarness([
    {
      nome: "Diretora Fabiana",
      telefone: "5511977770004",
      cargos: ["diretor"],
    },
  ]);

  const NUMERO = "5511977770004@c.us";

  const [menu] = await bot.enviarMsg(NUMERO, "olá");
  assert.match(menu, /7️⃣ Área da Direção/);

  const [resp9] = await bot.enviarMsg(NUMERO, "9");
  assert.match(resp9, /📋 \*Área da Direção\*/);
  assert.match(resp9, /Agenda, Eventos e Reuniões/);
});

test("Simulação Bot: diretor consulta 'Ver todos os eventos da igreja' e visualiza agendas internas", async () => {
  const { AGENDAS_INTERNAS } = require("../bot/agendasInternas");
  const eventoDiretoria = {
    id: "reuniao-diretoria-1",
    summary: "Reunião de Diretoria e Planejamento",
    calendarId: AGENDAS_INTERNAS.REUNIOES,
    start: { dateTime: "2026-11-20T19:30:00-03:00" },
    end: { dateTime: "2026-11-20T21:30:00-03:00" },
    location: "Igreja",
  };

  const bot = criarBotHarness(
    [
      {
        nome: "Diretora Fabiana",
        telefone: "5511977770004",
        cargos: ["diretor"],
      },
    ],
    {
      calendarEvents: [eventoDiretoria],
      agendasParaLer: [
        "agenda-0", "agenda-1", "agenda-2", "agenda-3", "agenda-4",
        "agenda-5", "agenda-6", "agenda-7", "agenda-8", "agenda-9",
        "agenda-10", AGENDAS_INTERNAS.REUNIOES, AGENDAS_INTERNAS.ATENDIMENTO,
      ],
    }
  );

  const NUMERO = "5511977770004@c.us";

  // 1. Entra na Área da Direção
  const [resp9] = await bot.enviarMsg(NUMERO, "9");
  assert.match(resp9, /Agenda, Eventos e Reuniões/);

  // 2. Escolhe subgrupo 1 (Agenda) e depois opção 1 (Ver todos os eventos)
  const [subAgenda] = await bot.enviarMsg(NUMERO, "1");
  assert.match(subAgenda, /Ver Todos os Eventos da Igreja/i);
  const [r1] = await bot.enviarMsg(NUMERO, "1");
  assert.match(r1, /Ver Todos os Eventos da Igreja/);

  // 3. Escolhe o mês de Novembro (mês 11)
  const [r2, r3] = await bot.enviarMsg(NUMERO, "11");
  const msgEventos = r3 || r2;
  // A reunião de diretoria DEVE constar para o diretor
  assert.match(msgEventos, /Reunião de Diretoria e Planejamento/);
});
