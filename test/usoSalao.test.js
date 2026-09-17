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
        return { data: { id: "evento-salao-123" } };
      },
    },
  };

  const agendasParaLer = [
    "agenda-0", "agenda-1", "agenda-2", "agenda-3", "agenda-4",
    "agenda-5", "agenda-6", "agenda-7", "agenda-8", "agenda-9",
    "agenda-10", AGENDAS_INTERNAS.REUNIOES, AGENDAS_INTERNAS.ATENDIMENTO,
    AGENDAS_INTERNAS.LIMPEZA, AGENDAS_INTERNAS.ENSAIOS, AGENDAS_INTERNAS.USO_SALAO,
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
        pushname: "Membro",
      }),
      respostas,
    };
    await handleMessage(msg);
    return respostas;
  }

  async function responderNoGrupoSecretaria(texto, quotedBody) {
    const respostas = [];
    const msg = {
      from: JID_GRUPO_SECRETARIA,
      fromMe: false,
      body: texto,
      hasQuotedMsg: true,
      getChat: async () => ({ name: "Mensagens Secretaria", isGroup: true }),
      getQuotedMessage: async () => ({ fromMe: true, body: quotedBody }),
      reply: async (t) => {
        respostas.push(t);
        return t;
      },
      respostas,
    };
    await handleMessage(msg);
    return respostas;
  }

  return {
    etapas,
    client,
    calendar,
    handleMessage,
    enviar,
    responderNoGrupoSecretaria,
    diretasEnviadas,
    gruposEnviados,
    eventosGravados,
    JID_GRUPO_SECRETARIA,
  };
}

test("Uso do Salão: membro solicita uso do salão e termo de responsabilidade é obrigatório", async () => {
  const NUMERO_MEMBRO = "5511988887777";
  const harness = criarHarness({
    usuarios: [{ nome: "Mariana Costa", telefone: NUMERO_MEMBRO, cargos: ["membro"] }],
  });

  // 1. Menu exibe opção 5 para membros (e opção 6 para secretaria, sem salto de números)
  const [menu] = await harness.enviar(NUMERO_MEMBRO, "olá");
  assert.match(menu, /5️⃣ Solicitar uso do salão/);
  assert.match(menu, /6️⃣ Falar com a secretaria/);

  // 2. Acessa via opção 5 (opção 9 também continua compatível)
  const [r1] = await harness.enviar(NUMERO_MEMBRO, "5");
  assert.match(r1, /Solicitação de Uso do Salão/);
  assert.match(r1, /Qual é a \*data\* desejada\?/);

  // 3. Informa data no passado e depois data válida
  const [rDataPassada] = await harness.enviar(NUMERO_MEMBRO, "01/01/2020");
  assert.match(rDataPassada, /Essa data já passou!/);

  const [rDataOk] = await harness.enviar(NUMERO_MEMBRO, "20/12/2026");
  assert.match(rDataOk, /Qual é o \*horário de início\* do uso do salão\?/);

  // 4. Informa horário início
  const [rInicio] = await harness.enviar(NUMERO_MEMBRO, "14:00");
  assert.match(rInicio, /Qual é o \*horário total \/ término\* do uso do salão\?/);

  // 5. Informa término inválido (anterior ao início)
  const [rTerminoInvalido] = await harness.enviar(NUMERO_MEMBRO, "12:00");
  assert.match(rTerminoInvalido, /horário de término deve ser posterior/);

  // 6. Informa término válido
  const [rTerminoOk] = await harness.enviar(NUMERO_MEMBRO, "18:00");
  assert.match(rTerminoOk, /Qual será a \*finalidade\* do uso do salão\?/);

  // 7. Informa finalidade
  const [rTermo] = await harness.enviar(NUMERO_MEMBRO, "Aniversário de Família");
  assert.match(rTermo, /Termo de Uso e Responsabilidade do Salão/);
  assert.match(rTermo, /mantidas intactas/);
  assert.match(rTermo, /mesmas condições/);
  assert.match(rTermo, /Digite \*SIM\* para aceitar/);

  // 8. Tenta responder "talvez" ou algo diferente de SIM
  const [rNaoAceitou] = await harness.enviar(NUMERO_MEMBRO, "talvez");
  assert.match(rNaoAceitou, /necessário aceitar o termo de responsabilidade/);

  // 9. Aceita com "SIM"
  const [rSucesso] = await harness.enviar(NUMERO_MEMBRO, "SIM");
  assert.match(rSucesso, /Solicitação de Uso do Salão Enviada!/);
  assert.match(rSucesso, /20\/12\/2026/);
  assert.match(rSucesso, /14:00 às 18:00/);

  // Sessão do membro foi finalizada
  assert.equal(harness.etapas[`${NUMERO_MEMBRO}@c.us`], undefined);

  // Notificação enviada para o grupo da secretaria
  const msgSecretaria = harness.gruposEnviados.find((g) => g.texto.includes("NOVA SOLICITAÇÃO DE USO DO SALÃO"));
  assert.ok(msgSecretaria, "deve notificar o grupo da secretaria");
  assert.match(msgSecretaria.texto, /Mariana Costa/);
  assert.match(msgSecretaria.texto, /20\/12\/2026/);
  assert.match(msgSecretaria.texto, /14:00 às 18:00/);
  assert.match(msgSecretaria.texto, /Aniversário de Família/);
  assert.match(msgSecretaria.texto, /Termo de Responsabilidade:\* Aceito pelo solicitante/);
  assert.match(msgSecretaria.texto, /aprovar salão/);
});

test("Uso do Salão: secretaria aprova no grupo, grava na agenda de Uso do Salão e notifica membro", async () => {
  const NUMERO_MEMBRO = "5511988887777";
  const harness = criarHarness({
    usuarios: [{ nome: "Mariana Costa", telefone: NUMERO_MEMBRO, cargos: ["membro"] }],
  });

  // Realiza a solicitação completa
  await harness.enviar(NUMERO_MEMBRO, "9");
  await harness.enviar(NUMERO_MEMBRO, "25/12/2026");
  await harness.enviar(NUMERO_MEMBRO, "15:00");
  await harness.enviar(NUMERO_MEMBRO, "20:00");
  await harness.enviar(NUMERO_MEMBRO, "Confraternização de Natal");
  await harness.enviar(NUMERO_MEMBRO, "SIM");

  const msgSecretaria = harness.gruposEnviados.find((g) => g.texto.includes("NOVA SOLICITAÇÃO DE USO DO SALÃO"));
  assert.ok(msgSecretaria);

  // Secretaria responde "aprovar salão" citando a mensagem
  const [respGrupo] = await harness.responderNoGrupoSecretaria("aprovar salão", msgSecretaria.texto);
  assert.match(respGrupo, /Uso do Salão aprovado, registrado na agenda/);

  // Valida inserção na agenda de Uso do Salão
  assert.equal(harness.eventosGravados.length, 1);
  const eventoGravado = harness.eventosGravados[0];
  assert.equal(eventoGravado.calendarId, AGENDAS_INTERNAS.USO_SALAO);
  assert.equal(eventoGravado.calendarId, "49b999ac91607d07310d7e36a26fe088ddc3cd2b34ff741a0e139b43a18bdabc@group.calendar.google.com");
  assert.match(eventoGravado.resource.summary, /Uso do Salão - Mariana Costa/);
  assert.match(eventoGravado.resource.start.dateTime, /2026-12-25T15:00:00/);
  assert.match(eventoGravado.resource.end.dateTime, /2026-12-25T20:00:00/);

  // Membro recebe mensagem direta confirmando e relembrando cuidados
  const msgMembro = harness.diretasEnviadas.find((d) => d.to === `${NUMERO_MEMBRO}@c.us`);
  assert.ok(msgMembro);
  assert.match(msgMembro.texto, /Solicitação de Uso do Salão Aprovada!/);
  assert.match(msgMembro.texto, /25\/12\/2026/);
  assert.match(msgMembro.texto, /mantidas intactas/);
});

test("Uso do Salão: secretaria recusa no grupo e notifica membro", async () => {
  const NUMERO_MEMBRO = "5511988887777";
  const harness = criarHarness({
    usuarios: [{ nome: "Mariana Costa", telefone: NUMERO_MEMBRO, cargos: ["membro"] }],
  });

  await harness.enviar(NUMERO_MEMBRO, "salão");
  await harness.enviar(NUMERO_MEMBRO, "28/12/2026");
  await harness.enviar(NUMERO_MEMBRO, "10:00");
  await harness.enviar(NUMERO_MEMBRO, "14:00");
  await harness.enviar(NUMERO_MEMBRO, "Reunião de Amigos");
  await harness.enviar(NUMERO_MEMBRO, "SIM");

  const msgSecretaria = harness.gruposEnviados.find((g) => g.texto.includes("NOVA SOLICITAÇÃO DE USO DO SALÃO"));
  assert.ok(msgSecretaria);

  // Secretaria responde "recusar salão"
  const [respGrupo] = await harness.responderNoGrupoSecretaria("recusar salão", msgSecretaria.texto);
  assert.match(respGrupo, /Solicitante notificado sobre a recusa do uso do salão/);

  // Nenhum evento gravado no calendar
  assert.equal(harness.eventosGravados.length, 0);

  // Membro recebe aviso de recusa
  const msgMembro = harness.diretasEnviadas.find((d) => d.to === `${NUMERO_MEMBRO}@c.us`);
  assert.ok(msgMembro);
  assert.match(msgMembro.texto, /Infelizmente não pudemos aprovar sua solicitação para uso do salão/);
});

test("Regra de visibilidade: eventos de Uso do Salão NÃO aparecem na agenda de membros e aparecem na agenda total", async () => {
  const NUMERO_MEMBRO = "5511988887777";
  const NUMERO_PASTOR = "5511999991111";

  const eventoPublico = {
    id: "culto-domingo-1",
    summary: "Culto de Celebração",
    calendarId: "agenda-0",
    start: { dateTime: "2026-10-18T18:00:00-03:00" },
    end: { dateTime: "2026-10-18T20:00:00-03:00" },
  };

  const eventoUsoSalao = {
    id: "salao-privado-1",
    summary: "Uso do Salão - Aniversário",
    calendarId: AGENDAS_INTERNAS.USO_SALAO,
    start: { dateTime: "2026-10-18T14:00:00-03:00" },
    end: { dateTime: "2026-10-18T17:00:00-03:00" },
  };

  const harness = criarHarness({
    usuarios: [
      { nome: "Membro Lucas", telefone: NUMERO_MEMBRO, cargos: ["membro"] },
      { nome: "Pr. Marcos", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
    calendarEvents: [eventoPublico, eventoUsoSalao],
  });

  // 1. Membro consulta a agenda oficial (opção 2 -> mês de Outubro/10)
  await harness.enviar(NUMERO_MEMBRO, "2");
  const [rMembro1, rMembro2] = await harness.enviar(NUMERO_MEMBRO, "10");
  const msgMembro = rMembro2 || rMembro1;

  // Culto de Celebração DEVE aparecer
  assert.match(msgMembro, /Culto de Celebração/);
  // Uso do Salão NÃO PODE aparecer na agenda oficial para membros!
  assert.doesNotMatch(msgMembro, /Uso do Salão/);

  // 2. Pastor consulta a agenda completa/total (Área Pastoral -> opção 1 -> mês 10)
  await harness.enviar(NUMERO_PASTOR, "7");
  await harness.enviar(NUMERO_PASTOR, "1");
  const [rPastor1, rPastor2] = await harness.enviar(NUMERO_PASTOR, "10");
  const msgPastor = rPastor2 || rPastor1;

  // Ambos devem aparecer na agenda completa/total, agrupados pelas respectivas seções
  assert.match(msgPastor, /⛪ \*Eventos e Cultos da Igreja\*/);
  assert.match(msgPastor, /🏛️ \*Uso do Salão\*/);
  assert.match(msgPastor, /Culto de Celebração/);
  assert.match(msgPastor, /Uso do Salão/);
});
