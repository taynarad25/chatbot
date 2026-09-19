const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createMessageHandler } = require("../bot/messageHandler");
const { AGENDAS_INTERNAS } = require("../bot/agendasInternas");

function criarHarness({ usuarios = [], calendarEvents = [] } = {}) {
  const etapas = {};
  const diretasEnviadas = [];
  const gruposEnviados = [];
  const eventosGravados = [];
  const eventosAlterados = [];
  const eventosDeletados = [];

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
      patch: async ({ calendarId, eventId, resource }) => {
        eventosAlterados.push({ calendarId, eventId, resource });
        return { data: { id: eventId, ...resource } };
      },
      delete: async ({ calendarId, eventId }) => {
        eventosDeletados.push({ calendarId, eventId });
        return { data: {} };
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

  return { etapas, client, calendar, handleMessage, enviar, diretasEnviadas, gruposEnviados, eventosGravados, eventosAlterados, eventosDeletados };
}

test("Área Pastoral: somente usuário com cargo 'pastor' visualiza menu pastoral e acessa opção 8", async () => {
  const NUMERO_PASTOR = "5511999991111";
  const NUMERO_LIDER_COMUM = "5511999992222";

  const harness = criarHarness({
    usuarios: [
      { nome: "Pr. Marcos", telefone: NUMERO_PASTOR, cargos: ["pastor", "lider"] },
      { nome: "Líder Carlos", telefone: NUMERO_LIDER_COMUM, cargos: ["lider"] },
    ],
  });

  // Pastor recebe Área Pastoral no menu (agora 7️⃣ unificado)
  const [menuPastor] = await harness.enviar(NUMERO_PASTOR, "Olá");
  assert.match(menuPastor, /7️⃣ Área Pastoral/);

  // Líder comum NÃO recebe Área Pastoral no menu
  const [menuLider] = await harness.enviar(NUMERO_LIDER_COMUM, "Olá");
  assert.doesNotMatch(menuLider, /Área Pastoral/);

  // Pastor acessa opção 7 com sucesso
  const [resp8Pastor] = await harness.enviar(NUMERO_PASTOR, "7");
  assert.match(resp8Pastor, /Graça e Paz, Pastor\(a\)!/);
  assert.match(resp8Pastor, /1️⃣ 📅 \*Agenda, Eventos e Reuniões\*/);
  assert.match(resp8Pastor, /2️⃣ 🤝 \*Atendimento Pastoral\*/);
  assert.match(resp8Pastor, /3️⃣ 📢 \*Comunicação e Mídia\*/);

  // Líder comum tenta opção 8 e não acessa
  const [resp8Lider] = await harness.enviar(NUMERO_LIDER_COMUM, "8");
  assert.doesNotMatch(resp8Lider, /Área Pastoral/);
});

test("Área Pastoral: pastor adiciona atendimento pastoral diretamente no Google Calendar e notifica grupo pastoral", async () => {
  const NUMERO_PASTOR = "5511999991111";

  const harness = criarHarness({
    usuarios: [
      { nome: "Pr. Roberto", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
  });

  // 1. Entra na área pastoral
  await harness.enviar(NUMERO_PASTOR, "8");

  // 2. Escolhe opção 2 (Atendimento pastoral -> abre submenu)
  const [rSubmenu] = await harness.enviar(NUMERO_PASTOR, "2");
  assert.match(rSubmenu, /Atendimento Pastoral/);
  assert.match(rSubmenu, /1️⃣ Agendar novo atendimento pastoral/);
  assert.match(rSubmenu, /2️⃣ Alterar atendimento existente/);
  assert.match(rSubmenu, /3️⃣ Desmarcar atendimento existente/);

  // 3. Escolhe 1 (Agendar novo atendimento)
  const [r1] = await harness.enviar(NUMERO_PASTOR, "1");
  assert.match(r1, /Qual é o nome da pessoa \/ discípulo a ser atendido\(a\)\?/);

  // 4. Informa nome
  const [r2] = await harness.enviar(NUMERO_PASTOR, "Ana Paula Souza");
  assert.match(r2, /Qual é a \*data\* do atendimento para \*Ana Paula Souza\*\?/);

  // 5. Informa data
  const [r3] = await harness.enviar(NUMERO_PASTOR, "20/11/2026");
  assert.match(r3, /Qual é o \*horário de início\* do atendimento\?/);

  // 6. Informa horário
  const [r4] = await harness.enviar(NUMERO_PASTOR, "15:30");
  assert.match(r4, /Qual espaço da igreja será utilizado\?/);

  // 7. Informa local / espaço (1 - Gabinete Pastoral)
  const [r5] = await harness.enviar(NUMERO_PASTOR, "1");
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
  await harness.enviar(NUMERO_PASTOR, "8");

  // 2. Escolhe submenu 1 (Agenda, Eventos e Reuniões) e opção 1 (Ver agenda completa)
  await harness.enviar(NUMERO_PASTOR, "1");
  const [r1] = await harness.enviar(NUMERO_PASTOR, "1");
  assert.match(r1, /Ver Agenda Completa/);

  // 3. Escolhe o mês de Outubro (mês 10)
  const [r2, r3] = await harness.enviar(NUMERO_PASTOR, "10");
  const msgEventos = r3 || r2;
  // A reunião interna DEVE ser exibida na agenda completa do pastor
  assert.match(msgEventos, /Reunião de Obreiros/);
});

test("Área Pastoral: pastor altera horário de atendimento existente com sucesso", async () => {
  const NUMERO_PASTOR = "5511999991111";

  const atendimentoExistente = {
    id: "atend-123",
    summary: "Atendimento Pastoral - Marcos Vinicius",
    calendarId: AGENDAS_INTERNAS.ATENDIMENTO,
    start: { dateTime: "2026-11-25T14:00:00-03:00" },
    end: { dateTime: "2026-11-25T15:00:00-03:00" },
    location: "Gabinete Pastoral",
  };

  const harness = criarHarness({
    usuarios: [
      { nome: "Pr. Paulo", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
    calendarEvents: [atendimentoExistente],
  });

  // 1. Entra na Área Pastoral
  await harness.enviar(NUMERO_PASTOR, "8");

  // 2. Escolhe opção 2 (Atendimento pastoral -> abre submenu)
  await harness.enviar(NUMERO_PASTOR, "2");

  // 3. Escolhe subopção 2 (Alterar atendimento)
  const [r1, r2] = await harness.enviar(NUMERO_PASTOR, "2");
  const msgLista = r2 || r1;
  assert.match(msgLista, /Atendimentos Pastorais Agendados/);
  assert.match(msgLista, /Marcos Vinicius/);

  // 4. Seleciona o item 1
  const [rOQue] = await harness.enviar(NUMERO_PASTOR, "1");
  assert.match(rOQue, /O que você deseja alterar\?/);
  assert.match(rOQue, /1 - Horário/);

  // 5. Escolhe alterar Horário (1)
  const [rNovoHorario] = await harness.enviar(NUMERO_PASTOR, "1");
  assert.match(rNovoHorario, /novo horário de início/);

  // 6. Envia novo horário (16:30)
  const [rFinal] = await harness.enviar(NUMERO_PASTOR, "16:30");
  assert.match(rFinal, /Atendimento Pastoral Alterado com Sucesso!/);
  assert.match(rFinal, /16:30/);

  // Valida que o patch foi chamado no calendar
  assert.equal(harness.eventosAlterados.length, 1);
  assert.equal(harness.eventosAlterados[0].calendarId, AGENDAS_INTERNAS.ATENDIMENTO);
  assert.equal(harness.eventosAlterados[0].eventId, "atend-123");
  assert.match(harness.eventosAlterados[0].resource.start.dateTime, /16:30:00/);

  // Notificação no grupo pastoral
  const msgGrupo = harness.gruposEnviados.find((g) => g.texto.includes("ATENDIMENTO PASTORAL ALTERADO"));
  assert.ok(msgGrupo);
  assert.match(msgGrupo.texto, /Marcos Vinicius/);
  assert.match(msgGrupo.texto, /16:30/);
});

test("Área Pastoral: pastor desmarca atendimento existente após confirmação com SIM", async () => {
  const NUMERO_PASTOR = "5511999991111";

  const atendimentoExistente = {
    id: "atend-456",
    summary: "Atendimento Pastoral - Carla Silveira",
    calendarId: AGENDAS_INTERNAS.ATENDIMENTO,
    start: { dateTime: "2026-11-28T10:00:00-03:00" },
    end: { dateTime: "2026-11-28T11:00:00-03:00" },
    location: "Gabinete Pastoral",
  };

  const harness = criarHarness({
    usuarios: [
      { nome: "Pr. Paulo", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
    calendarEvents: [atendimentoExistente],
  });

  // 1. Entra na Área Pastoral
  await harness.enviar(NUMERO_PASTOR, "8");

  // 2. Escolhe opção 2 (Atendimento pastoral -> abre submenu)
  await harness.enviar(NUMERO_PASTOR, "2");

  // 3. Escolhe subopção 3 (Desmarcar atendimento)
  const [r1, r2] = await harness.enviar(NUMERO_PASTOR, "3");
  const msgLista = r2 || r1;
  assert.match(msgLista, /Qual atendimento você deseja desmarcar\?/);
  assert.match(msgLista, /Carla Silveira/);

  // 4. Seleciona o item 1
  const [rConfirma] = await harness.enviar(NUMERO_PASTOR, "1");
  assert.match(rConfirma, /Confirma o cancelamento do atendimento pastoral/);
  assert.match(rConfirma, /Carla Silveira/);

  // 5. Confirma com SIM
  const [rSucesso] = await harness.enviar(NUMERO_PASTOR, "SIM");
  assert.match(rSucesso, /Atendimento Pastoral Desmarcado com Sucesso!/);

  // Valida que delete foi chamado no calendar
  assert.equal(harness.eventosDeletados.length, 1);
  assert.equal(harness.eventosDeletados[0].calendarId, AGENDAS_INTERNAS.ATENDIMENTO);
  assert.equal(harness.eventosDeletados[0].eventId, "atend-456");

  // Notificação no grupo pastoral
  const msgGrupo = harness.gruposEnviados.find((g) => g.texto.includes("ATENDIMENTO PASTORAL DESMARCADO"));
  assert.ok(msgGrupo);
  assert.match(msgGrupo.texto, /Carla Silveira/);
});

test("Área Pastoral: pastor acessa ferramentas de liderança (eventos e reuniões) diretamente no menu pastoral", async () => {
  const NUMERO_PASTOR = "5511999991111";

  const harness = criarHarness({
    usuarios: [
      { nome: "Pr. Roberto", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
  });

  // 1. Acessa menu de eventos a partir da Área Pastoral
  await harness.enviar(NUMERO_PASTOR, "8");
  await harness.enviar(NUMERO_PASTOR, "1");
  const [rEventos] = await harness.enviar(NUMERO_PASTOR, "2");
  assert.match(rEventos, /Eventos da Igreja|Menu de Eventos/);
  assert.match(rEventos, /1 - Agendar novo evento/);

  // Volta ao menu principal
  await harness.enviar(NUMERO_PASTOR, "menu");

  // 2. Acessa menu de reuniões a partir da Área Pastoral
  await harness.enviar(NUMERO_PASTOR, "8");
  await harness.enviar(NUMERO_PASTOR, "1");
  const [rReunioes] = await harness.enviar(NUMERO_PASTOR, "3");
  assert.match(rReunioes, /Reuniões/);
  assert.match(rReunioes, /1 - Agendar reunião/);
});

test("Área Pastoral: atendimento em Gabinete Pastoral com atividade concorrente na igreja consulta pastor (confirmar)", async () => {
  const NUMERO_PASTOR = "5511999991111";

  const eventoConcorrente = {
    id: "ensaio-louvor-1",
    summary: "Ensaio Ministério de Louvor",
    calendarId: AGENDAS_INTERNAS.ENSAIOS,
    start: { dateTime: "2026-11-20T15:00:00-03:00" },
    end: { dateTime: "2026-11-20T17:00:00-03:00" },
  };

  const harness = criarHarness({
    usuarios: [{ nome: "Pr. Roberto", telefone: NUMERO_PASTOR, cargos: ["pastor"] }],
    calendarEvents: [eventoConcorrente],
  });

  await harness.enviar(NUMERO_PASTOR, "8");
  await harness.enviar(NUMERO_PASTOR, "2");
  await harness.enviar(NUMERO_PASTOR, "1");
  await harness.enviar(NUMERO_PASTOR, "Lucas Oliveira");
  await harness.enviar(NUMERO_PASTOR, "20/11/2026");
  await harness.enviar(NUMERO_PASTOR, "15:30");

  // Escolhe Gabinete Pastoral (opção 1)
  const [rConflito] = await harness.enviar(NUMERO_PASTOR, "1");
  assert.match(rConflito, /Aviso de Atividade Concorrente/);
  assert.match(rConflito, /Ensaio Ministério de Louvor/);
  assert.match(rConflito, /o Salão permanece livre/);

  // Pastor confirma (opção 1)
  const [rConfirma] = await harness.enviar(NUMERO_PASTOR, "1");
  assert.match(rConfirma, /Atendimento Pastoral Agendado com Sucesso!/);
  assert.match(rConfirma, /Lucas Oliveira/);
  assert.match(rConfirma, /Gabinete Pastoral/);
  assert.equal(harness.eventosGravados.length, 1);
});

test("Área Pastoral: atendimento em Gabinete Pastoral com atividade concorrente na igreja consulta pastor (remarcar)", async () => {
  const NUMERO_PASTOR = "5511999991111";

  const eventoConcorrente = {
    id: "culto-oracao-1",
    summary: "Reunião de Oração",
    calendarId: AGENDAS_INTERNAS.REUNIOES,
    start: { dateTime: "2026-11-20T15:00:00-03:00" },
    end: { dateTime: "2026-11-20T17:00:00-03:00" },
  };

  const harness = criarHarness({
    usuarios: [{ nome: "Pr. Roberto", telefone: NUMERO_PASTOR, cargos: ["pastor"] }],
    calendarEvents: [eventoConcorrente],
  });

  await harness.enviar(NUMERO_PASTOR, "8");
  await harness.enviar(NUMERO_PASTOR, "2");
  await harness.enviar(NUMERO_PASTOR, "1");
  await harness.enviar(NUMERO_PASTOR, "Lucas Oliveira");
  await harness.enviar(NUMERO_PASTOR, "20/11/2026");
  await harness.enviar(NUMERO_PASTOR, "15:30");

  // Escolhe Gabinete Pastoral
  await harness.enviar(NUMERO_PASTOR, "1");

  // Pastor prefere remarcar (opção 2)
  const [rRemarcar] = await harness.enviar(NUMERO_PASTOR, "2");
  assert.match(rRemarcar, /informe a nova \*data\* do atendimento/);
  assert.equal(harness.eventosGravados.length, 0);
});

test("Área Pastoral: atendimento reservando todo o espaço da igreja bloqueia quando ocupado", async () => {
  const NUMERO_PASTOR = "5511999991111";

  const eventoCulto = {
    id: "culto-celeb-1",
    summary: "Culto Especial",
    calendarId: "agenda-culto",
    start: { dateTime: "2026-11-20T15:00:00-03:00" },
    end: { dateTime: "2026-11-20T17:00:00-03:00" },
  };

  const harness = criarHarness({
    usuarios: [{ nome: "Pr. Roberto", telefone: NUMERO_PASTOR, cargos: ["pastor"] }],
    calendarEvents: [eventoCulto],
  });

  await harness.enviar(NUMERO_PASTOR, "8");
  await harness.enviar(NUMERO_PASTOR, "2");
  await harness.enviar(NUMERO_PASTOR, "1");
  await harness.enviar(NUMERO_PASTOR, "Lucas Oliveira");
  await harness.enviar(NUMERO_PASTOR, "20/11/2026");
  await harness.enviar(NUMERO_PASTOR, "15:30");

  // Escolhe Todo o espaço da igreja (opção 2)
  const [rBloqueado] = await harness.enviar(NUMERO_PASTOR, "2");
  assert.match(rBloqueado, /Espaço Indisponível/);
  assert.match(rBloqueado, /Culto Especial/);
  assert.equal(harness.eventosGravados.length, 0);
});
