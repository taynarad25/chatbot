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

test("Concorrência Pastoral: notifica pastores quando uso do salão coincide com atendimento pastoral", async () => {
  const NUMERO_MEMBRO = "5511988887777";
  const eventosAtendimento = [
    {
      id: "ev-atendimento-02",
      summary: "Atendimento Pastoral - Casal Silva",
      location: "Gabinete Pastoral",
      calendarId: AGENDAS_INTERNAS.ATENDIMENTO,
      start: { dateTime: "2026-11-10T14:00:00-03:00" },
      end: { dateTime: "2026-11-10T16:00:00-03:00" },
      status: "confirmed",
    },
  ];

  const harness = criarHarness({
    usuarios: [{ nome: "Mariana Costa", telefone: NUMERO_MEMBRO, cargos: ["membro"] }],
    calendarEvents: eventosAtendimento,
  });

  // 1. Solicita uso do salão
  await harness.enviar(NUMERO_MEMBRO, "5");
  await harness.enviar(NUMERO_MEMBRO, "10/11/2026");
  await harness.enviar(NUMERO_MEMBRO, "14:00");
  await harness.enviar(NUMERO_MEMBRO, "16:00");
  await harness.enviar(NUMERO_MEMBRO, "Confraternização de Casais");
  const [resFinal] = await harness.enviar(NUMERO_MEMBRO, "SIM");

  assert.match(resFinal, /Solicitação de Uso do Salão Enviada!/);

  // Verifica se o aviso foi enviado aos pastores no grupo pastoral
  const msgPas = harness.gruposEnviados.find(m => m.texto.includes("CONCORRÊNCIA COM ATENDIMENTO PASTORAL"));
  assert.ok(msgPas, "Pastores devem ser notificados sobre concorrência no uso do salão");
  assert.match(msgPas.texto, /Atendimento Pastoral - Casal Silva/);
  assert.match(msgPas.texto, /Gabinete Pastoral/);
  assert.match(msgPas.texto, /Confraternização de Casais/);
  assert.match(msgPas.texto, /autorizam marcar este\(a\) uso do salão no salão da igreja/i);
});

test("Concorrência Pastoral: notifica pastores quando reunião na igreja coincide com atendimento pastoral", async () => {
  const NUMERO_LIDER = "5511977776666";
  const JID_LIDER = `${NUMERO_LIDER}@c.us`;
  const eventosAtendimento = [
    {
      id: "ev-atendimento-reuniao",
      summary: "Atendimento Pastoral - Discípulo Pedro",
      location: "Gabinete Pastoral",
      calendarId: AGENDAS_INTERNAS.ATENDIMENTO,
      start: { dateTime: "2026-11-12T19:30:00-03:00" },
      end: { dateTime: "2026-11-12T21:00:00-03:00" },
      status: "confirmed",
    },
  ];

  const harness = criarHarness({
    usuarios: [{ nome: "Líder Pedro", telefone: NUMERO_LIDER, cargos: ["lider"], departamentos: ["Rede de Homens"] }],
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
  assert.match(resFinal, /Solicitação de Reunião Enviada!/);

  // Verifica se o aviso foi enviado aos pastores
  const msgPas = harness.gruposEnviados.find(m => m.texto.includes("CONCORRÊNCIA COM ATENDIMENTO PASTORAL"));
  assert.ok(msgPas, "Pastores devem ser notificados sobre concorrência de reunião na igreja");
  assert.match(msgPas.texto, /Atendimento Pastoral - Discípulo Pedro/);
  assert.match(msgPas.texto, /Gabinete Pastoral/);
  assert.match(msgPas.texto, /autorizam marcar este\(a\) reunião no salão da igreja/i);
});

test("Grupo Pastoral: pastores autorizam uso do salão concorrente", async () => {
  const harness = criarHarness();

  const codigo = salvarPendente({
    tipo: "uso_salao",
    solicitanteId: "5511988884444",
    nomeSolicitante: "Membro Lucas",
    finalidade: "Aniversário infantil",
  });

  // Pastor responde "pode sim" citando o código no grupo de Atendimento Pastoral
  const [resAutorizado] = await harness.responderNoGrupoPastoral(
    "pode sim",
    `_Código: ${codigo}_`
  );

  assert.match(resAutorizado, /Resposta dos pastores registrada!/);
  assert.match(resAutorizado, /foi autorizado e a secretaria foi comunicada/);

  const avisoSec = harness.gruposEnviados.find(m => m.texto.includes("PASTORES AUTORIZARAM"));
  assert.ok(avisoSec, "Secretaria deve ser comunicada da autorização pastoral");
});
