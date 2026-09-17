const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createMessageHandler } = require("../bot/messageHandler");
const { AGENDAS_INTERNAS } = require("../bot/agendasInternas");

function criarHarness({ usuarios = [], calendarEvents = [] } = {}) {
  const etapas = {};
  const diretasEnviadas = [];
  const gruposEnviados = [];
  const eventosGravados = [];

  const JID_GRUPO_SECRETARIA = "111111111111111@g.us";
  const JID_GRUPO_PASTORAL = "222222222222222@g.us";

  const client = {
    sendMessage: async (to, content) => {
      const texto = typeof content === "string" ? content : content?.caption || "";
      if (to === JID_GRUPO_SECRETARIA || to === JID_GRUPO_PASTORAL) {
        gruposEnviados.push({ to, texto });
      } else {
        diretasEnviadas.push({ to, texto });
      }
    },
    getChats: async () => [
      { id: { _serialized: JID_GRUPO_SECRETARIA }, isGroup: true, name: "Mensagens Secretaria" },
      { id: { _serialized: JID_GRUPO_PASTORAL }, isGroup: true, name: "Atendimento Pastoral" },
    ],
  };

  const calendar = {
    events: {
      insert: async ({ calendarId, resource }) => {
        eventosGravados.push({ calendarId, resource });
        return { data: { id: "evento-pastoral-123" } };
      },
    },
  };

  const agendasParaLer = [
    "agenda-0", "agenda-1", "agenda-2", "agenda-3", "agenda-4",
    "agenda-5", "agenda-6", "agenda-7", "agenda-8", "agenda-9",
    "agenda-10", AGENDAS_INTERNAS.REUNIOES, AGENDAS_INTERNAS.ATENDIMENTO,
    AGENDAS_INTERNAS.LIMPEZA, AGENDAS_INTERNAS.ENSAIOS,
  ];

  const handleMessage = createMessageHandler({
    client,
    calendar,
    agendasParaLer,
    lideres: usuarios.filter((u) => u.cargos?.includes("lider")).map((u) => u.telefone),
    etapas,
    buscarEventos: async () => calendarEvents,
    listLideres: () => usuarios,
  });

  async function enviar(numero, texto) {
    const respostas = [];
    const msg = {
      from: numero.includes("@c.us") ? numero : `${numero}@c.us`,
      fromMe: false,
      body: texto,
      reply: async (t) => {
        respostas.push(t);
        return t;
      },
      getContact: async () => ({
        id: { _serialized: numero.includes("@c.us") ? numero : `${numero}@c.us` },
        pushname: "Usuario",
      }),
      respostas,
    };
    await handleMessage(msg);
    return respostas;
  }

  return { etapas, client, calendar, handleMessage, enviar, diretasEnviadas, gruposEnviados, eventosGravados };
}

test("Área Pastoral: somente usuário com cargo 'pastor' visualiza menu pastoral e acessa opção 7", async () => {
  const NUMERO_PASTOR = "5511999991111";
  const NUMERO_LIDER_COMUM = "5511999992222";

  const harness = criarHarness({
    usuarios: [
      { nome: "Pr. Marcos", telefone: NUMERO_PASTOR, cargos: ["pastor", "lider"] },
      { nome: "Líder Carlos", telefone: NUMERO_LIDER_COMUM, cargos: ["lider"] },
    ],
  });

  // Pastor recebe Área Pastoral no menu
  const [menuPastor] = await harness.enviar(NUMERO_PASTOR, "Olá");
  assert.match(menuPastor, /7️⃣ Área Pastoral/);

  // Líder comum NÃO recebe Área Pastoral no menu
  const [menuLider] = await harness.enviar(NUMERO_LIDER_COMUM, "Olá");
  assert.doesNotMatch(menuLider, /7️⃣ Área Pastoral/);

  // Pastor acessa opção 7 com sucesso
  const [resp7Pastor] = await harness.enviar(NUMERO_PASTOR, "7");
  assert.match(resp7Pastor, /Graça e Paz, Pastor\(a\)!/);
  assert.match(resp7Pastor, /1️⃣ Ver agenda completa da igreja/);
  assert.match(resp7Pastor, /2️⃣ Adicionar atendimento pastoral/);

  // Líder comum tenta opção 7 e não acessa
  const [resp7Lider] = await harness.enviar(NUMERO_LIDER_COMUM, "7");
  assert.doesNotMatch(resp7Lider, /Área Pastoral/);
});

test("Área Pastoral: pastor adiciona atendimento pastoral diretamente no Google Calendar e notifica grupo pastoral", async () => {
  const NUMERO_PASTOR = "5511999991111";

  const harness = criarHarness({
    usuarios: [
      { nome: "Pr. Roberto", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
  });

  // 1. Entra na área pastoral
  await harness.enviar(NUMERO_PASTOR, "7");

  // 2. Escolhe opção 2 (Adicionar atendimento pastoral)
  const [r1] = await harness.enviar(NUMERO_PASTOR, "2");
  assert.match(r1, /Qual é o nome da pessoa \/ discípulo a ser atendido\(a\)\?/);

  // 3. Informa nome
  const [r2] = await harness.enviar(NUMERO_PASTOR, "Ana Paula Souza");
  assert.match(r2, /Qual é a \*data\* do atendimento para \*Ana Paula Souza\*\?/);

  // 4. Informa data
  const [r3] = await harness.enviar(NUMERO_PASTOR, "20/11/2026");
  assert.match(r3, /Qual é o \*horário de início\* do atendimento\?/);

  // 5. Informa horário
  const [r4] = await harness.enviar(NUMERO_PASTOR, "15:30");
  assert.match(r4, /Onde será o atendimento\?/);

  // 6. Informa local
  const [r5] = await harness.enviar(NUMERO_PASTOR, "Gabinete Pastoral");
  assert.match(r5, /Atendimento Pastoral Agendado com Sucesso!/);
  assert.match(r5, /Ana Paula Souza/);
  assert.match(r5, /20\/11\/2026/);
  assert.match(r5, /15:30 às 16:30/);
  assert.match(r5, /Gabinete Pastoral/);

  // Valida inserção no Google Calendar
  assert.equal(harness.eventosGravados.length, 1);
  const evento = harness.eventosGravados[0];
  assert.equal(evento.calendarId, AGENDAS_INTERNAS.ATENDIMENTO);
  assert.equal(evento.resource.summary, "Atendimento Pastoral - Ana Paula Souza");
  assert.equal(evento.resource.location, "Gabinete Pastoral");
  assert.match(evento.resource.start.dateTime, /2026-11-20T15:30:00/);
  assert.match(evento.resource.end.dateTime, /2026-11-20T16:30:00/);

  // Valida notificação enviada ao grupo pastoral
  const msgPastoral = harness.gruposEnviados.find((g) => g.texto.includes("NOVO ATENDIMENTO PASTORAL AGENDADO"));
  assert.ok(msgPastoral, "deve notificar o grupo oficial da pastoral");
  assert.match(msgPastoral.texto, /Ana Paula Souza/);
  assert.match(msgPastoral.texto, /Pr\. Roberto/);

  // Sessão limpa
  assert.equal(harness.etapas[`${NUMERO_PASTOR}@c.us`], undefined);
});

test("Área Pastoral: pastor consulta agenda completa da igreja incluindo agendas internas", async () => {
  const NUMERO_PASTOR = "5511999991111";

  const eventoInterno = {
    id: "reuniao-pastoral-1",
    summary: "Reunião de Obreiros",
    calendarId: AGENDAS_INTERNAS.REUNIOES,
    start: { dateTime: "2026-10-15T19:00:00-03:00" },
    end: { dateTime: "2026-10-15T21:00:00-03:00" },
    location: "Igreja",
  };

  const harness = criarHarness({
    usuarios: [
      { nome: "Pr. Marcos", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
    calendarEvents: [eventoInterno],
  });

  // 1. Entra na área pastoral
  await harness.enviar(NUMERO_PASTOR, "7");

  // 2. Escolhe opção 1 (Ver agenda completa)
  const [r1] = await harness.enviar(NUMERO_PASTOR, "1");
  assert.match(r1, /Ver Agenda Completa/);

  // 3. Escolhe o mês de Outubro (mês 10)
  const [r2, r3] = await harness.enviar(NUMERO_PASTOR, "10");
  const msgEventos = r3 || r2;
  // A reunião interna DEVE ser exibida na agenda completa do pastor
  assert.match(msgEventos, /Reunião de Obreiros/);
});
