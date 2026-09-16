const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizarDadosIniciais,
  iniciarFormularioEvento,
  processarRespostaFormulario,
  enviarWebhookGoogleDocs,
  PERGUNTAS_FORMULARIO,
} = require("../bot/formularioEvento");

function criarClienteFalso() {
  const mensagensEnviadas = [];
  return {
    mensagensEnviadas,
    async sendMessage(to, content, options) {
      mensagensEnviadas.push({ to, content, options });
    },
  };
}

function criarMsgFalsa(body) {
  const respostas = [];
  return {
    body,
    respostas,
    async reply(texto) {
      respostas.push(texto);
    },
  };
}

test("normalizarDadosIniciais: extrai e formata campos tanto de evento quanto de reunião", () => {
  const dadosEvento = {
    rede: "Rede de Jovens",
    evento: "Vigília Jovem",
    local: "Igreja Central",
    dia: 15,
    mes: 11,
    ano: 2026,
    horarioInicio: "22:00",
    horarioFim: "04:00",
  };
  const normalizado = normalizarDadosIniciais(dadosEvento);
  assert.equal(normalizado.departamento, "Rede de Jovens");
  assert.equal(normalizado.evento, "Vigília Jovem");
  assert.equal(normalizado.local, "Igreja Central");
  assert.equal(normalizado.data, "15/11/2026");
  assert.equal(normalizado.horarioInicio, "22:00");
  assert.equal(normalizado.horarioFim, "04:00");
});

test("iniciarFormularioEvento: evento com nome pula a pergunta de nome_evento e reaproveita dados", async () => {
  const etapas = {};
  const client = criarClienteFalso();
  const solicitanteId = "5511999998888";

  await iniciarFormularioEvento({
    etapas,
    solicitanteId,
    dadosIniciais: {
      rede: "Rede de Mulheres",
      evento: "Chá de Mulheres",
      local: "Salão Nobre",
      dia: 20,
      mes: 10,
      ano: 2026,
      horarioInicio: "16:00",
      horarioFim: "19:00",
    },
    client,
  });

  assert.ok(etapas[solicitanteId]);
  assert.equal(etapas[solicitanteId].fluxo, "formulario_evento");
  assert.equal(etapas[solicitanteId].dadosIniciais.departamento, "Rede de Mulheres");
  assert.equal(etapas[solicitanteId].dadosIniciais.evento, "Chá de Mulheres");

  // Perguntas não devem conter nome_evento pois já foi definido
  const idsPerguntas = etapas[solicitanteId].perguntas.map((p) => p.id);
  assert.ok(!idsPerguntas.includes("nome_evento"), "deveria ter pulado nome_evento");

  // Mensagem inicial deve destacar os dados já salvos
  assert.equal(client.mensagensEnviadas.length, 1);
  const msgIntro = client.mensagensEnviadas[0].content;
  assert.match(msgIntro, /Rede de Mulheres/);
  assert.match(msgIntro, /20\/10\/2026/);
  assert.match(msgIntro, /16:00 às 19:00/);
  assert.match(msgIntro, /Salão Nobre/);
  assert.match(msgIntro, /Nome do líder responsável/);
});

test("iniciarFormularioEvento: reunião inclui a pergunta de nome_evento", async () => {
  const etapas = {};
  const client = criarClienteFalso();
  const solicitanteId = "5511999998888";

  await iniciarFormularioEvento({
    etapas,
    solicitanteId,
    dadosIniciais: {
      departamento: "Diáconos",
      evento: "Reunião de Diáconos",
      local: "Na Igreja",
      dia: 5,
      mes: 12,
      ano: 2026,
      horarioInicio: "19:30",
      horarioFim: "21:00",
    },
    client,
  });

  const idsPerguntas = etapas[solicitanteId].perguntas.map((p) => p.id);
  assert.ok(idsPerguntas.includes("nome_evento"), "reunião genérica deve perguntar nome_evento");
});

test("processarRespostaFormulario: fluxo conversacional completo dispara Webhook e notifica líder e secretaria", async () => {
  const etapas = {};
  const client = criarClienteFalso();
  const solicitanteId = "5511999998888";
  const gruposNotificados = [];
  const notificarSecretaria = async (c, texto) => {
    gruposNotificados.push(texto);
  };

  await iniciarFormularioEvento({
    etapas,
    solicitanteId,
    dadosIniciais: {
      rede: "Rede de Homens",
      evento: "Café dos Homens",
      local: "Templo",
      dataFormatada: "10/11/2026",
      horarioInicio: "08:00",
      horarioFim: "11:00",
    },
    client,
  });

  const totalPerguntas = etapas[solicitanteId].perguntas.length;
  let payloadRecebido = null;
  const mockEnviarWebhook = async (payload) => {
    payloadRecebido = payload;
    return {
      status: "success",
      url: "https://docs.google.com/document/d/teste-doc-123/edit",
    };
  };

  // Responde cada pergunta sequencialmente
  for (let i = 0; i < totalPerguntas; i++) {
    const pergunta = etapas[solicitanteId].perguntas[etapas[solicitanteId].indicePergunta];
    const msg = criarMsgFalsa(`Resposta para ${pergunta.id}`);

    await processarRespostaFormulario({
      msg,
      numero: solicitanteId,
      info: etapas[solicitanteId],
      client,
      notificarSecretaria,
      etapas,
      enviarWebhook: mockEnviarWebhook,
    });

    if (i < totalPerguntas - 1) {
      assert.ok(etapas[solicitanteId], "deve manter o estado até a última pergunta");
    }
  }

  // Após responder a última:
  assert.equal(etapas[solicitanteId], undefined, "deve limpar o estado da etapa");
  assert.ok(payloadRecebido, "webhook deve ter sido disparado");

  // Verifica reaproveitamento dos dados anteriores no payload
  assert.equal(payloadRecebido.departamento, "Rede de Homens");
  assert.equal(payloadRecebido.nome_evento, "Café dos Homens");
  assert.equal(payloadRecebido.data, "10/11/2026");
  assert.equal(payloadRecebido.horario_inicio, "08:00");
  assert.equal(payloadRecebido.horario_termino, "11:00");
  assert.equal(payloadRecebido.local, "Templo");

  // Verifica respostas preenchidas
  assert.equal(payloadRecebido.nome_lider, "Resposta para nome_lider");
  assert.equal(payloadRecebido.publico, "Resposta para publico");
  assert.equal(payloadRecebido.objetivo_espiritual, "Resposta para objetivo_espiritual");
  assert.equal(payloadRecebido.resultado_esperado, "Resposta para resultado_esperado");

  // Verifica notificação ao grupo da secretaria com o link do Google Docs
  assert.equal(gruposNotificados.length, 1);
  assert.match(gruposNotificados[0], /FORMULÁRIO DE EVENTO PREENCHIDO/);
  assert.match(gruposNotificados[0], /https:\/\/docs\.google\.com\/document\/d\/teste-doc-123\/edit/);
  assert.match(gruposNotificados[0], /Café dos Homens/);
});

test("processarRespostaFormulario: em caso de falha no webhook avisa líder e secretaria sem perder dados", async () => {
  const etapas = {};
  const client = criarClienteFalso();
  const solicitanteId = "5511999998888";
  const gruposNotificados = [];
  const notificarSecretaria = async (c, texto) => {
    gruposNotificados.push(texto);
  };

  await iniciarFormularioEvento({
    etapas,
    solicitanteId,
    dadosIniciais: {
      rede: "Rede Kids",
      evento: "EBF",
      local: "Igreja",
      dataFormatada: "12/10/2026",
      horarioInicio: "14:00",
      horarioFim: "17:00",
    },
    client,
  });

  const totalPerguntas = etapas[solicitanteId].perguntas.length;
  const mockWebhookFalho = async () => {
    throw new Error("Timeout na conexão");
  };

  let ultimaMsg;
  for (let i = 0; i < totalPerguntas; i++) {
    ultimaMsg = criarMsgFalsa(`Valor ${i}`);
    await processarRespostaFormulario({
      msg: ultimaMsg,
      numero: solicitanteId,
      info: etapas[solicitanteId],
      client,
      notificarSecretaria,
      etapas,
      enviarWebhook: mockWebhookFalho,
    });
  }

  assert.equal(etapas[solicitanteId], undefined);
  assert.match(ultimaMsg.respostas[1], /instabilidade momentânea ao gerar o Google Docs/);
  assert.equal(gruposNotificados.length, 1);
  assert.match(gruposNotificados[0], /FALHA NO GOOGLE DOCS/);
});

test("enviarWebhookGoogleDocs: faz requisição POST e faz parse do retorno json", async () => {
  let urlChamada = "";
  let opcoesChamadas = null;
  const mockFetch = async (url, opts) => {
    urlChamada = url;
    opcoesChamadas = opts;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: "success",
        url: "https://docs.google.com/document/d/exemplo/edit",
      }),
    };
  };

  const payload = { nome_evento: "Culto Especial" };
  const res = await enviarWebhookGoogleDocs(payload, { fetchFn: mockFetch });

  assert.match(urlChamada, /script\.google\.com\/macros\/s\//);
  assert.equal(opcoesChamadas.method, "POST");
  assert.equal(JSON.parse(opcoesChamadas.body).nome_evento, "Culto Especial");
  assert.equal(res.url, "https://docs.google.com/document/d/exemplo/edit");
});

test("E2E: aprovação de evento inicia o formulário, líder responde tudo, webhook gera Docs e envia links", async () => {
  const { createMessageHandler } = require("../bot/messageHandler");
  const etapas = {};
  const gruposEnviados = [];
  const diretasEnviadas = [];
  const eventosGravados = [];

  const NUMERO_LIDER = "5511999999999@c.us";
  const JID_GRUPO_SECRETARIA = "111111111111111@g.us";

  const client = {
    sendMessage: async (to, content) => {
      if (to === JID_GRUPO_SECRETARIA) {
        gruposEnviados.push(typeof content === "string" ? content : content?.caption || "");
      } else {
        diretasEnviadas.push({ to, texto: typeof content === "string" ? content : content?.caption || "" });
      }
    },
    getChats: async () => [{ id: { _serialized: JID_GRUPO_SECRETARIA }, isGroup: true, name: "Mensagens Secretaria" }],
  };

  const calendar = {
    events: {
      insert: async ({ calendarId, resource }) => {
        eventosGravados.push({ calendarId, resource });
        return { data: {} };
      },
    },
  };

  let payloadWebhookRecebido = null;
  const mockWebhook = async (payload) => {
    payloadWebhookRecebido = payload;
    return {
      status: "success",
      url: "https://docs.google.com/document/d/doc-gerado-sucesso/edit",
    };
  };

  const handleMessage = createMessageHandler({
    client,
    calendar,
    agendasParaLer: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11", "c12"],
    lideres: ["5511999999999"],
    etapas,
    buscarEventos: async () => [],
    listLideres: () => [{ nome: "Líder João", telefone: "5511999999999" }],
    enviarWebhook: mockWebhook,
  });

  async function enviarPrivado(texto) {
    const respostas = [];
    const msg = {
      from: NUMERO_LIDER,
      fromMe: false,
      body: texto,
      reply: async (t) => { respostas.push(t); return t; },
      getContact: async () => ({ id: { _serialized: NUMERO_LIDER }, pushname: "João" }),
      respostas,
    };
    await handleMessage(msg);
    return respostas;
  }

  // 1. Líder solicita agendamento de evento
  await enviarPrivado("6");
  await enviarPrivado("1");
  await enviarPrivado("1"); // novo agendamento
  await enviarPrivado("Conferência Atos 2"); // nome
  await enviarPrivado("igreja"); // local
  await enviarPrivado("7"); // departamento (Rede de Casais)
  await enviarPrivado("12"); // mês (Dezembro)
  await enviarPrivado("1"); // data específica
  await enviarPrivado("20"); // dia 20
  await enviarPrivado("19:00"); // inicio
  const rFim = await enviarPrivado("22:00"); // fim

  assert.match(rFim[0], /Solicitação de Agendamento/);
  assert.equal(gruposEnviados.length, 1);
  const msgGrupo = gruposEnviados[0];
  assert.match(msgGrupo, /NOVO AGENDAMENTO SOLICITADO/);

  // 2. Secretaria aprova no grupo
  const msgAprovacao = {
    from: JID_GRUPO_SECRETARIA,
    fromMe: false,
    hasQuotedMsg: true,
    body: "marcar evento",
    reply: async (t) => t,
    getChat: async () => ({ name: "Mensagens Secretaria", isGroup: true }),
    getQuotedMessage: async () => ({ fromMe: true, body: msgGrupo }),
    respostas: [],
  };
  await handleMessage(msgAprovacao);

  assert.equal(eventosGravados.length, 1);
  assert.equal(diretasEnviadas.length, 2);
  assert.match(diretasEnviadas[0].texto, /Agendamento Confirmado e Gravado/);
  assert.match(diretasEnviadas[1].texto, /FORMULÁRIO INTERNO DO EVENTO/);
  assert.match(diretasEnviadas[1].texto, /Conferência Atos 2/);
  assert.match(diretasEnviadas[1].texto, /1\/18/); // Nome do evento já foi preenchido, logo restam 18

  // 3. Líder responde o formulário conversacional
  assert.ok(etapas[NUMERO_LIDER]);
  assert.equal(etapas[NUMERO_LIDER].fluxo, "formulario_evento");

  const respostasParaEnviar = [
    "Pr. João Silva", // nome_lider
    "Casais e Famílias", // publico
    "Gratuito", // valor
    "A Família no Altar", // tema
    "Josué 24:15", // versiculo
    "Bordeaux e Dourado", // paleta
    "Elegante", // estilo
    "Diácono Carlos", // responsavel_geral
    "Pr. Convidado Marcos", // convidado
    "Banda da Igreja", // louvor
    "Flores e iluminação cênica", // decoracao
    "Jantar após o evento", // alimentacao
    "Recepção: 4 pessoas, Limpeza: 3 pessoas", // equipe
    "Som, 2 microfones sem fio, projetor", // materiais
    "19h Louvor, 20h Ministração, 21h30 Jantar", // cronograma
    "Chegar com 1h de antecedência", // observacoes
    "Edificação das famílias", // objetivo_espiritual
    "20 casais restaurados", // resultado_esperado
  ];

  for (let i = 0; i < respostasParaEnviar.length; i++) {
    const resp = await enviarPrivado(respostasParaEnviar[i]);
    if (i < respostasParaEnviar.length - 1) {
      assert.match(resp[0], new RegExp(`\\[${i + 2}\\/18\\]`));
    } else {
      // Última resposta
      assert.match(resp[0], /Gerando o documento oficial no Google Docs/);
      assert.match(resp[1], /Formulário do Evento Concluído com Sucesso/);
      assert.match(resp[1], /https:\/\/docs\.google\.com\/document\/d\/doc-gerado-sucesso\/edit/);
    }
  }

  // 4. Valida se o Webhook recebeu o payload completo
  assert.deepEqual(payloadWebhookRecebido, {
    nome_lider: "Pr. João Silva",
    nome_evento: "Conferência Atos 2",
    departamento: "Rede de Homens",
    data: "20/12/2026",
    horario_inicio: "19:00",
    horario_termino: "22:00",
    local: "Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi",
    publico: "Casais e Famílias",
    valor: "Gratuito",
    tema: "A Família no Altar",
    versiculo: "Josué 24:15",
    paleta: "Bordeaux e Dourado",
    estilo: "Elegante",
    responsavel_geral: "Diácono Carlos",
    convidado: "Pr. Convidado Marcos",
    louvor: "Banda da Igreja",
    decoracao: "Flores e iluminação cênica",
    alimentacao: "Jantar após o evento",
    equipe: "Recepção: 4 pessoas, Limpeza: 3 pessoas",
    materiais: "Som, 2 microfones sem fio, projetor",
    cronograma: "19h Louvor, 20h Ministração, 21h30 Jantar",
    observacoes: "Chegar com 1h de antecedência",
    objetivo_espiritual: "Edificação das famílias",
    resultado_esperado: "20 casais restaurados",
  });

  // 5. Valida notificação do grupo com o link
  const ultimaMsgGrupo = gruposEnviados[gruposEnviados.length - 1];
  assert.match(ultimaMsgGrupo, /FORMULÁRIO DE EVENTO PREENCHIDO/);
  assert.match(ultimaMsgGrupo, /Conferência Atos 2/);
  assert.match(ultimaMsgGrupo, /https:\/\/docs\.google\.com\/document\/d\/doc-gerado-sucesso\/edit/);

  // 6. Sessão foi encerrada
  assert.equal(etapas[NUMERO_LIDER], undefined);
});

test("E2E: digitar 'menu' durante o formulário cancela e volta ao menu", async () => {
  const { createMessageHandler } = require("../bot/messageHandler");
  const etapas = {};
  const NUMERO_LIDER = "5511999999999@c.us";

  const client = { sendMessage: async () => {} };
  const handleMessage = createMessageHandler({
    client,
    calendar: { events: {} },
    agendasParaLer: [],
    lideres: ["5511999999999"],
    etapas,
    buscarEventos: async () => [],
    listLideres: () => [],
  });

  etapas[NUMERO_LIDER] = {
    fluxo: "formulario_evento",
    dadosIniciais: {},
    perguntas: [{ id: "nome_lider", pergunta: "Nome?" }],
    indicePergunta: 0,
    respostas: {},
  };

  const respostas = [];
  const msg = {
    from: NUMERO_LIDER,
    fromMe: false,
    body: "menu",
    reply: async (t) => { respostas.push(t); return t; },
    getContact: async () => ({ id: { _serialized: NUMERO_LIDER }, pushname: "João" }),
    respostas,
  };

  await handleMessage(msg);

  assert.equal(etapas[NUMERO_LIDER], undefined);
  assert.match(respostas[0], /Área do Líder/);
});

