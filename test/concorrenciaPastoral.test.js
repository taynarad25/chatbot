const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-concorrencia-pastoral-test-"));
process.env.DB_PATH = path.join(tmpDir, "concorrencia_pastoral.db");

const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const db = require("../db");
const { createMessageHandler } = require("../bot/messageHandler");
const { AGENDAS_INTERNAS } = require("../bot/agendasInternas");
const { salvarPendente } = require("../bot/pendentesAprovacao");
const { addLider, listLideres } = require("../web/lideres");

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

function criarHarness({ usuarios = [], calendarEvents = [] } = {}) {
  const etapas = {};
  const diretasEnviadas = [];
  const gruposEnviados = [];

  const JID_GRUPO_SECRETARIA = "secretaria@g.us";
  const JID_GRUPO_PASTORAL = "pastoral@g.us";

  const client = {
    sendMessage: async (to, content) => {
      const texto = typeof content === "string" ? content : content?.caption || "";
      gruposEnviados.push({ to, texto });
      return { id: { _serialized: "msg-enviada-1" } };
    },
    getChats: async () => [
      { id: { _serialized: JID_GRUPO_SECRETARIA }, isGroup: true, name: "Mensagens Secretaria" },
      { id: { _serialized: JID_GRUPO_PASTORAL }, isGroup: true, name: "Atendimento Pastoral" },
    ],
  };

  const agendasParaLer = [
    "agenda-0", "agenda-1", "agenda-2", "agenda-3", "agenda-4",
    "agenda-5", "agenda-6", "agenda-7", "agenda-8", "agenda-9",
    "agenda-10", AGENDAS_INTERNAS.REUNIOES, AGENDAS_INTERNAS.ATENDIMENTO,
    AGENDAS_INTERNAS.LIMPEZA, AGENDAS_INTERNAS.ENSAIOS, AGENDAS_INTERNAS.USO_SALAO,
  ];

  const handleMessage = createMessageHandler({
    client,
    calendar: {},
    agendasParaLer,
    lideres: usuarios.filter((u) => u.cargos?.includes("lider")).map((u) => u.telefone),
    etapas,
    buscarEventos: async () => calendarEvents,
    listLideres: () => usuarios,
  });

  async function enviar(numero, texto) {
    const respostas = [];
    const jid = numero.includes("@c.us") ? numero : `${numero}@c.us`;
    const msg = {
      from: jid,
      fromMe: false,
      body: texto,
      reply: async (t) => {
        respostas.push(t);
        return t;
      },
      getContact: async () => ({
        id: { _serialized: jid },
        pushname: "Membro",
      }),
      getChat: async () => ({ isGroup: false }),
      respostas,
    };
    await handleMessage(msg);
    return respostas;
  }

  async function responderNoGrupoPastoral(texto, quotedBody) {
    const respostas = [];
    const msg = {
      from: JID_GRUPO_PASTORAL,
      fromMe: false,
      body: texto,
      hasQuotedMsg: true,
      getChat: async () => ({ name: "Atendimento Pastoral", isGroup: true }),
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
    handleMessage,
    enviar,
    responderNoGrupoPastoral,
    diretasEnviadas,
    gruposEnviados,
    JID_GRUPO_PASTORAL,
    JID_GRUPO_SECRETARIA,
  };
}

test("Concorrência Pastoral: consulta pastor no privado quando uso do salão coincide com atendimento pastoral (não envia à secretaria ainda)", async () => {
  const NUMERO_MEMBRO = "5511988887777";
  const NUMERO_PASTOR = "5511999991111";
  const eventosAtendimento = [
    {
      id: "ev-atendimento-02",
      summary: "Atendimento Pastoral - Casal Silva",
      description: `👤 Discípulo: Casal Silva\n👔 Pastor: Pr. Gabriel\n📱 Telefone Pastor: ${NUMERO_PASTOR}`,
      location: "Gabinete Pastoral",
      calendarId: AGENDAS_INTERNAS.ATENDIMENTO,
      start: { dateTime: "2026-11-10T14:00:00-03:00" },
      end: { dateTime: "2026-11-10T16:00:00-03:00" },
      status: "confirmed",
    },
  ];

  const harness = criarHarness({
    usuarios: [
      { nome: "Mariana Costa", telefone: NUMERO_MEMBRO, cargos: ["membro"] },
      { nome: "Pr. Gabriel", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
    calendarEvents: eventosAtendimento,
  });

  // 1. Membro solicita uso do salão
  await harness.enviar(NUMERO_MEMBRO, "5");
  await harness.enviar(NUMERO_MEMBRO, "10/11/2026");
  await harness.enviar(NUMERO_MEMBRO, "14:00");
  await harness.enviar(NUMERO_MEMBRO, "16:00");
  await harness.enviar(NUMERO_MEMBRO, "Confraternização de Casais");
  const [resFinal] = await harness.enviar(NUMERO_MEMBRO, "SIM");

  // Solicitante recebe aviso de análise pastoral
  assert.match(resFinal, /Solicitação de Uso do Salão em Análise Pastoral/);
  assert.match(resFinal, /Pr\. Gabriel/);

  // Consulta DEVE ter ido exclusivamente para o WhatsApp privado do Pastor, e NÃO no grupo
  const msgPrivadaPastor = harness.gruposEnviados.find(m => m.to.includes(NUMERO_PASTOR) && m.texto.includes("CONSULTA PASTORAL"));
  assert.ok(msgPrivadaPastor, "Pastor do atendimento deve receber a consulta no seu privado");
  assert.match(msgPrivadaPastor.texto, /Atendimento Pastoral - Casal Silva/);
  assert.match(msgPrivadaPastor.texto, /Confraternização de Casais/);
  assert.match(msgPrivadaPastor.texto, /autoriza o uso do salão/i);

  // NÃO deve ter sido enviado para o grupo da Secretaria ainda!
  const msgSecInicial = harness.gruposEnviados.find(m => m.to === harness.JID_GRUPO_SECRETARIA);
  assert.equal(msgSecInicial, undefined, "Secretaria NÃO deve ser consultada antes do pastor responder");

  // 2. Pastor responde "SIM" no privado
  const resPastor = await harness.enviar(NUMERO_PASTOR, "SIM");
  assert.match(resPastor[0], /autorização para a realização de \*Confraternização de Casais\* no salão foi registrada/);

  // Agora SIM deve ter sido encaminhado para o grupo da Secretaria com a autorização pastoral
  const msgSecFinal = harness.gruposEnviados.find(m => m.to === harness.JID_GRUPO_SECRETARIA);
  assert.ok(msgSecFinal, "Secretaria DEVE receber a solicitação após autorização do pastor");
  assert.match(msgSecFinal.texto, /NOVA SOLICITAÇÃO DE USO DO SALÃO/);
  assert.match(msgSecFinal.texto, /Autorização Pastoral/);
});

test("Concorrência Pastoral: se pastor responder NÃO no privado, cancela e NÃO envia para a secretaria", async () => {
  const NUMERO_MEMBRO = "5511988887777";
  const NUMERO_PASTOR = "5511999991111";
  const eventosAtendimento = [
    {
      id: "ev-atendimento-recusa",
      summary: "Atendimento Pastoral - Casal Silva",
      description: `Telefone Pastor: ${NUMERO_PASTOR}`,
      location: "Gabinete Pastoral",
      calendarId: AGENDAS_INTERNAS.ATENDIMENTO,
      start: { dateTime: "2026-11-10T14:00:00-03:00" },
      end: { dateTime: "2026-11-10T16:00:00-03:00" },
      status: "confirmed",
    },
  ];

  const harness = criarHarness({
    usuarios: [
      { nome: "Mariana Costa", telefone: NUMERO_MEMBRO, cargos: ["membro"] },
      { nome: "Pr. Gabriel", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
    calendarEvents: eventosAtendimento,
  });

  await harness.enviar(NUMERO_MEMBRO, "5");
  await harness.enviar(NUMERO_MEMBRO, "10/11/2026");
  await harness.enviar(NUMERO_MEMBRO, "14:00");
  await harness.enviar(NUMERO_MEMBRO, "16:00");
  await harness.enviar(NUMERO_MEMBRO, "Confraternização de Casais");
  await harness.enviar(NUMERO_MEMBRO, "SIM");

  // Pastor responde NÃO no privado
  const resPastor = await harness.enviar(NUMERO_PASTOR, "NÃO");
  assert.match(resPastor[0], /foi recusada e cancelada/);

  // Membro solicitante é avisado da recusa
  const msgMembroRecusa = harness.gruposEnviados.find(m => m.to.includes(NUMERO_MEMBRO) && m.texto.includes("Solicitação Não Autorizada"));
  assert.ok(msgMembroRecusa, "Membro solicitante deve ser avisado sobre a recusa do pastor");

  // NUNCA envia para a Secretaria
  const msgSec = harness.gruposEnviados.find(m => m.to === harness.JID_GRUPO_SECRETARIA);
  assert.equal(msgSec, undefined, "Secretaria NUNCA deve receber solicitação recusada pelo pastor");
});

test("Concorrência Pastoral: notifica pastor no privado quando reunião na igreja coincide com atendimento pastoral", async () => {
  const NUMERO_LIDER = "5511977776666";
  const JID_LIDER = `${NUMERO_LIDER}@c.us`;
  const NUMERO_PASTOR = "5511999992222";
  const eventosAtendimento = [
    {
      id: "ev-atendimento-reuniao",
      summary: "Atendimento Pastoral - Discípulo Pedro",
      description: `Telefone Pastor: ${NUMERO_PASTOR}`,
      location: "Gabinete Pastoral",
      calendarId: AGENDAS_INTERNAS.ATENDIMENTO,
      start: { dateTime: "2026-11-12T19:30:00-03:00" },
      end: { dateTime: "2026-11-12T21:00:00-03:00" },
      status: "confirmed",
    },
  ];

  const harness = criarHarness({
    usuarios: [
      { nome: "Líder Pedro", telefone: NUMERO_LIDER, cargos: ["lider"], departamentos: ["Rede de Homens"] },
      { nome: "Pr. Marcos", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
    calendarEvents: eventosAtendimento,
  });

  harness.etapas[JID_LIDER] = {
    fluxo: "reunioes",
    etapa: "reuniao_local",
    reuniaoDepartamento: "Rede de Homens",
    reuniaoData: { dia: 12, mes: 11, ano: 2026, formatada: "12/11/2026" },
    reuniaoHorarioInicio: "19:30",
    reuniaoHorarioFim: "21:00",
  };

  const [resFinal] = await harness.enviar(NUMERO_LIDER, "1"); // 1 - Na Igreja
  assert.match(resFinal, /Solicitação de Reunião em Análise Pastoral/);

  // Verifica se a consulta foi enviada no privado do pastor
  const msgPrivadaPastor = harness.gruposEnviados.find(m => m.to.includes(NUMERO_PASTOR) && m.texto.includes("CONSULTA PASTORAL"));
  assert.ok(msgPrivadaPastor, "Pastor deve receber consulta no privado sobre a reunião");
  assert.match(msgPrivadaPastor.texto, /Atendimento Pastoral - Discípulo Pedro/);
  assert.match(msgPrivadaPastor.texto, /autoriza o uso do salão da igreja/i);
});

test("Concorrência Pastoral: evento com conflito pastoral vai pro pastor no privado e só após SIM vai pra secretaria", async () => {
  const NUMERO_LIDER = "5511977778888";
  const JID_LIDER = `${NUMERO_LIDER}@c.us`;
  const NUMERO_PASTOR = "5511999993333";
  const eventosAtendimento = [
    {
      id: "ev-atendimento-evento",
      summary: "Atendimento Pastoral - Discípulo Lucas",
      description: `Pastor: Pr. Daniel (5511999993333)`,
      location: "Gabinete Pastoral",
      calendarId: AGENDAS_INTERNAS.ATENDIMENTO,
      start: { dateTime: "2026-11-20T19:00:00-03:00" },
      end: { dateTime: "2026-11-20T21:00:00-03:00" },
      status: "confirmed",
    },
  ];

  const harness = criarHarness({
    usuarios: [
      { nome: "Líder Carlos", telefone: NUMERO_LIDER, cargos: ["lider"], departamentos: ["Rede de Jovens"] },
      { nome: "Pr. Daniel", telefone: NUMERO_PASTOR, cargos: ["pastor"] },
    ],
    calendarEvents: eventosAtendimento,
  });

  // Fluxo de agendamento de novo evento na igreja
  await harness.enviar(NUMERO_LIDER, "7"); // Área do líder
  await harness.enviar(NUMERO_LIDER, "1"); // Agenda
  await harness.enviar(NUMERO_LIDER, "1"); // Eventos
  await harness.enviar(NUMERO_LIDER, "1"); // Agendar novo evento
  await harness.enviar(NUMERO_LIDER, "Culto Jovem Especial");
  await harness.enviar(NUMERO_LIDER, "igreja");
  await harness.enviar(NUMERO_LIDER, "1"); // Rede de Jovens (único departamento do líder)
  await harness.enviar(NUMERO_LIDER, "11"); // Novembro
  await harness.enviar(NUMERO_LIDER, "1"); // Evento de 1 dia
  await harness.enviar(NUMERO_LIDER, "1"); // Já tenho uma data específica
  await harness.enviar(NUMERO_LIDER, "20"); // Dia 20
  await harness.enviar(NUMERO_LIDER, "19:00"); // Inicio
  const [resFinal] = await harness.enviar(NUMERO_LIDER, "21:00"); // Fim

  assert.match(resFinal, /Solicitação em Análise Pastoral/);

  // Secretaria não deve ter recebido ainda
  assert.equal(harness.gruposEnviados.find(m => m.to === harness.JID_GRUPO_SECRETARIA), undefined);

  // Pastor recebeu a consulta no privado
  const msgPastor = harness.gruposEnviados.find(m => m.to.includes(NUMERO_PASTOR) && m.texto.includes("CONSULTA PASTORAL"));
  assert.ok(msgPastor);
  assert.match(msgPastor.texto, /Culto Jovem Especial/);

  // Pastor autoriza no privado
  const [resPastor] = await harness.enviar(NUMERO_PASTOR, "autorizo");
  assert.match(resPastor, /registrada com sucesso/);

  // Agora sim secretaria recebe
  const msgSec = harness.gruposEnviados.find(m => m.to === harness.JID_GRUPO_SECRETARIA);
  assert.ok(msgSec);
  assert.match(msgSec.texto, /NOVO AGENDAMENTO SOLICITADO/);
  assert.match(msgSec.texto, /Autorização Pastoral/);
});


