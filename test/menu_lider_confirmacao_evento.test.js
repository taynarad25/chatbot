const os = require("os");
const path = require("path");
const fs = require("fs");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-lider-menu-test-"));
process.env.DB_PATH = path.join(tmpDir, "dados.db");

const db = require("../db");
const { createMessageHandler } = require("../bot/messageHandler");
const {
  buscarLembreteAguardandoResposta,
  registrarLembreteAguardandoResposta,
  limparLembretesEventosPassados,
  isDataEventoPassada
} = require("../bot/lembretes");
const {
  CATALOGO_EVENTOS,
  obterEventosInscricaoParaUsuario,
  isEventoExpirado
} = require("../bot/consultaInscricoes");

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

function criarContexto(etapasCompartilhadas = {}) {
  const etapas = etapasCompartilhadas;
  const enviadas = [];
  const client = {
    getChats: async () => [
      { id: { _serialized: "111111111111111@g.us" }, isGroup: true, name: "Mensagens Secretaria" }
    ],
    sendMessage: async (jid, texto) => {
      enviadas.push({ jid, texto });
      return { id: { _serialized: "mid-1" } };
    },
  };
  const calendar = {
    events: {
      list: async () => ({ data: { items: [] } }),
      insert: async () => ({ data: { id: "ev-1" } }),
    },
  };
  const agendasParaLer = ["cal-lideres"];
  const lideres = ["5511999991111"];

  const handler = createMessageHandler({
    client,
    calendar,
    agendasParaLer,
    lideres,
    etapas,
    buscarEventos: async () => [],
    notificarSecretaria: async () => {},
    notificarMultimidia: async () => {},
  });

  return { handler, etapas, enviadas, client };
}

function criarMensagem(body, numero = "5511999991111@c.us") {
  const replies = [];
  return {
    msg: {
      body,
      from: numero,
      fromMe: false,
      hasQuotedMsg: false,
      getContact: async () => ({
        id: { _serialized: numero },
        pushname: "Líder Teste",
        name: "Líder Teste",
      }),
      reply: async (txt) => {
        replies.push(txt);
        return { id: { _serialized: "rep-1" } };
      },
    },
    replies,
  };
}

test("Área do Líder: Opção 1 abre submenu de Agenda e NUNCA confirma presença de evento", async () => {
  const NUM_LIDER = "5511999991111@c.us";
  const { handler, etapas } = criarContexto();

  // 1. Líder entra na Área do Líder
  etapas[NUM_LIDER] = { fluxo: "area_lider", etapa: "menu_lider" };

  // 2. Líder digita "1"
  const { msg, replies } = criarMensagem("1", NUM_LIDER);
  await handler(msg);

  // 3. Validações críticas
  assert.equal(replies.length, 1);
  const resposta = replies[0];

  // Deve abrir o submenu de agenda
  assert.match(resposta, /📅 \*Agenda, Eventos e Reuniões\*/);
  assert.match(resposta, /1️⃣ 🎪 \*Eventos da Igreja\*/);

  // JAMAIS deve conter mensagem de confirmação de presença ou The Chosen
  assert.doesNotMatch(resposta, /Presença Confirmada/i);
  assert.doesNotMatch(resposta, /The Chosen/i);
  assert.doesNotMatch(resposta, /Que alegria/i);
  assert.doesNotMatch(resposta, /portaria/i);

  // Estado deve ter avançado para o submenu de agenda do líder
  assert.equal(etapas[NUM_LIDER].fluxo, "area_lider");
  assert.equal(etapas[NUM_LIDER].etapa, "lider_sub_agenda");
});

test("Área do Líder: mesmo se houver lembrete antigo no banco, digitar 1 no menu não é interceptado", async () => {
  const NUM_LIDER = "5511999991111@c.us";
  const TEL_DIGITOS = "5511999991111";
  const { handler, etapas } = criarContexto();

  // Registra um lembrete no banco com data passada (ontem)
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const dataOntemIso = ontem.toISOString().slice(0, 10);

  registrarLembreteAguardandoResposta(
    TEL_DIGITOS,
    "evento-passado-1",
    "Evento Anterior",
    "evento",
    dataOntemIso,
    "19:00",
    "Rede",
    "",
    "Líder Teste"
  );

  // Líder está no menu do líder
  etapas[NUM_LIDER] = { fluxo: "area_lider", etapa: "menu_lider" };

  // Líder digita "1"
  const { msg, replies } = criarMensagem("1", NUM_LIDER);
  await handler(msg);

  assert.equal(replies.length, 1);
  assert.match(replies[0], /📅 \*Agenda, Eventos e Reuniões\*/);
  assert.doesNotMatch(replies[0], /Presença Confirmada/i);
  assert.equal(etapas[NUM_LIDER].etapa, "lider_sub_agenda");
});

test("Limpeza automática: evento passado é identificado e removido no dia seguinte", () => {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const dataOntem = ontem.toISOString().slice(0, 10);

  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const dataAmanha = amanha.toISOString().slice(0, 10);

  assert.equal(isDataEventoPassada(dataOntem), true);
  assert.equal(isDataEventoPassada(dataAmanha), false);

  // Testa isEventoExpirado
  assert.equal(isEventoExpirado({ dataEvento: dataOntem + " 19:00" }), true);
  assert.equal(isEventoExpirado({ dataEvento: dataAmanha + " 19:00" }), false);

  // Testa limparLembretesEventosPassados no banco
  registrarLembreteAguardandoResposta(
    "5511988880001",
    "evento-expirado",
    "Evento Expirado",
    "evento",
    dataOntem,
    "10:00",
    "Rede",
    "",
    "Líder Teste"
  );

  assert.equal(buscarLembreteAguardandoResposta("5511988880001"), null); // auto-purga ao buscar
});

test("Catálogo de eventos: The Chosen não está mais no catálogo e eventos expirados não são listados", () => {
  const eventos = obterEventosInscricaoParaUsuario({
    usuario: { nome: "Pr. Teste", cargos: ["pastor"], departamentos: [] },
    isPastor: true,
  });

  assert.ok(!eventos.some((e) => e.id === "the_chosen"));
  assert.ok(!eventos.some((e) => isEventoExpirado(e)));
});
