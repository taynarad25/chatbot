const test = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const { createMessageHandler } = require("../bot/messageHandler");
const { AGENDAS } = require("../bot/redes");
const {
  interpretarMesesRecorrencia,
  interpretarDiaSemana,
  gerarDatasRecorrentes,
} = require("../bot/recorrencia");
const {
  verificarInscricoesAbertasIntercessao,
  PRAZO_INSCRICOES_INTERCESSAO,
} = require("../web/treinamento_intercessao");
const {
  processarRespostaFormulario,
  iniciarFormularioEvento,
} = require("../bot/formularioEvento");

const NUMERO_LIDER = "5511999990001";
const JID_GRUPO_SECRETARIA = "111111111111111@g.us";
const JID_GRUPO_MULTIMIDIA = "222222222222222@g.us";

function criarContexto() {
  const etapas = {};
  const diretasEnviadas = [];
  const gruposEnviados = [];
  const multimidiasEnviados = [];
  const eventosGravados = [];

  const client = {
    sendMessage: async (to, content) => {
      const texto = typeof content === "string" ? content : (content?.caption || "");
      if (to === JID_GRUPO_MULTIMIDIA) {
        multimidiasEnviados.push({ to, texto });
      } else if (to.endsWith("@g.us")) {
        gruposEnviados.push({ to, texto });
      } else {
        diretasEnviadas.push({ to, texto });
      }
      return { id: { _serialized: `msg-${Date.now()}` } };
    },
    getChats: async () => [
      { id: { _serialized: JID_GRUPO_SECRETARIA }, name: "Mensagens Secretaria", isGroup: true },
      { id: { _serialized: JID_GRUPO_MULTIMIDIA }, name: "MULTIMÍDIAS", isGroup: true }
    ],
  };

  const calendar = {
    events: {
      insert: async ({ calendarId, resource }) => {
        eventosGravados.push({ calendarId, resource });
        return { data: { id: `event-${Date.now()}-${Math.random()}` } };
      },
      list: async () => ({ data: { items: [] } })
    }
  };

  const buscarEventos = async () => [];

  const handleMessage = createMessageHandler({
    client,
    calendar,
    agendasParaLer: AGENDAS,
    lideres: [NUMERO_LIDER],
    etapas,
    buscarEventos,
    listLideres: () => [{ nome: "Líder Teste", telefone: NUMERO_LIDER, departamento: "Evangelismo" }]
  });

  return { handleMessage, etapas, diretasEnviadas, gruposEnviados, multimidiasEnviados, eventosGravados, client };
}

async function enviar(handleMessage, numero, texto) {
  const respostas = [];
  const msg = {
    from: `${numero}@c.us`,
    fromMe: false,
    body: texto,
    hasQuotedMsg: false,
    reply: async (txt) => {
      respostas.push(txt);
      return { id: { _serialized: `resp-${Date.now()}` } };
    },
    getChat: async () => ({ isGroup: false }),
    getContact: async () => ({ pushname: "Líder Teste" }),
  };
  await handleMessage(msg);
  return respostas;
}

test("Recorrência: quando o líder digita 1 na frequência, o bot PERGUNTA o dia da semana (não assume domingo)", async () => {
  const { handleMessage } = criarContexto();

  // Entra em Novo Agendamento
  await enviar(handleMessage, NUMERO_LIDER, "7"); // Área do Líder
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agenda e Eventos
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Gestão de Eventos
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendar novo evento
  await enviar(handleMessage, NUMERO_LIDER, "Reunião Semanal de Oração"); // Nome
  await enviar(handleMessage, NUMERO_LIDER, "igreja"); // Local
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Departamento Evangelismo

  // Informa os meses
  const rMes = await enviar(handleMessage, NUMERO_LIDER, "11 e 1");
  assert.match(rMes[0], /Qual é a frequência de repetição do evento\?/i);

  // Usuário responde apenas "1" (opção 1 = Toda semana)
  const rFreq = await enviar(handleMessage, NUMERO_LIDER, "1");
  // O bot DEVE perguntar qual dia da semana (Domingo, Segunda-feira, etc.), e NÃO ir direto para exclusões de datas!
  assert.match(rFreq[0], /Em qual \*dia da semana\* o evento vai acontecer\?/i);
  assert.match(rFreq[0], /1 - Domingo/);
  assert.match(rFreq[0], /2 - Segunda-feira/);

  // Usuário escolhe Segunda-feira (opção 2)
  const rDia = await enviar(handleMessage, NUMERO_LIDER, "2");
  assert.match(rDia[0], /Datas encontradas para o evento/i);
  assert.match(rDia[0], /Segunda-feira/i);
  // Nas linhas das datas não deve ter Domingo
  assert.doesNotMatch(rDia[0], /Domingo,\s*\d/i);
});

test("Recorrência Contínua: interpretarMesesRecorrencia e geração de datas para o ano todo", () => {
  const agoraMom = moment.tz("2026-10-22", "YYYY-MM-DD", "America/Sao_Paulo");
  const mesesContinuo = interpretarMesesRecorrencia("contínuo", agoraMom);
  assert.equal(mesesContinuo.length, 12);
  assert.equal(mesesContinuo.isContinuo, true);

  // Gera todas as segundas-feiras (dia 1) para os 12 meses
  const datas = gerarDatasRecorrentes({
    diaSemana: 1, // Segunda-feira
    mesesInfo: mesesContinuo,
    dataMinimaMom: agoraMom,
  });

  // O ano a partir do final de outubro tem ~49 a 52 segundas-feiras
  assert.ok(datas.length >= 48 && datas.length <= 53, `Esperado ~49-52 segundas, obtido ${datas.length}`);
  assert.equal(datas[0].diaSemanaNome, "Segunda-feira");
});

test("Formulário de Evento: se a arte já foi feita pela equipe de mídia, NÃO envia para o grupo MULTIMÍDIAS", async () => {
  const etapas = {};
  const solicitanteId = "5511999990001";
  const multimidiasNotificados = [];
  const secretariasNotificadas = [];

  const client = {
    sendMessage: async (to, content) => {
      return { id: { _serialized: `msg-${Date.now()}` } };
    }
  };

  const notificarSecretaria = async (c, txt) => {
    secretariasNotificadas.push(txt);
  };
  const notificarMultimidia = async (c, txt) => {
    multimidiasNotificados.push(txt);
  };

  const webhookMock = async () => ({ url: "https://docs.google.com/document/d/teste-sem-midia" });

  await iniciarFormularioEvento({
    etapas,
    solicitanteId,
    dadosIniciais: {
      departamento: "Evangelismo",
      evento: "Culto Especial de Gratidão",
      data: "10/11/2026",
      horarioInicio: "19:00",
      horarioFim: "21:00",
      local: "Igreja",
    },
    client,
  });

  let loopCount = 0;
  while (etapas[solicitanteId] && loopCount < 40) {
    const info = etapas[solicitanteId];
    const pergunta = info.perguntas[info.indicePergunta];
    if (!pergunta) break;

    let resposta = "Não";
    if (pergunta.id === "nome_lider") resposta = "Líder Gabriel";
    if (pergunta.id === "midia_ja_feita") resposta = "Sim, a arte já foi feita previamente pela equipe";

    const msgFalsa = {
      body: resposta,
      reply: async () => {},
    };

    await processarRespostaFormulario({
      msg: msgFalsa,
      numero: solicitanteId,
      info,
      client,
      notificarSecretaria,
      notificarMultimidia,
      etapas,
      enviarWebhook: webhookMock,
    });
    loopCount++;
  }

  // A secretaria deve ter sido notificada com o Google Docs
  assert.equal(secretariasNotificadas.length, 1);
  // Como a arte já foi feita pela mídia, o grupo MULTIMÍDIAS NÃO DEVE SER NOTIFICADO!
  assert.equal(
    multimidiasNotificados.length,
    0,
    "Grupo MULTIMÍDIAS não deveria receber notificação quando a arte já foi feita!"
  );
});

test("Treinamento de Intercessão: prazo limite de inscrições é até 05 de Novembro de 2026", () => {
  assert.equal(PRAZO_INSCRICOES_INTERCESSAO, "2026-11-05T23:59:59.999-03:00");
  assert.equal(typeof verificarInscricoesAbertasIntercessao, "function");
});
