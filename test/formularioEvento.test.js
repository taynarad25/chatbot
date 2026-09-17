const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizarDadosIniciais,
  iniciarFormularioEvento,
  processarRespostaFormulario,
  enviarWebhookGoogleDocs,
  precisaDeValorDoMinisterio,
  PERGUNTAS_FORMULARIO,
  ENDERECO_IGREJA,
  CONTATO_TESOURARIA,
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

async function simularPreenchimentoFormulario({
  dadosIniciais,
  solicitanteId = "5511999998888",
  obterResposta = (pergunta, i) => `Valor ${i}`,
  enviarWebhook,
}) {
  const etapas = {};
  const client = criarClienteFalso();
  const gruposNotificados = [];
  const notificarSecretaria = async (c, texto) => {
    gruposNotificados.push(texto);
  };

  await iniciarFormularioEvento({
    etapas,
    solicitanteId,
    dadosIniciais,
    client,
  });

  const perguntasIniciais = etapas[solicitanteId]?.perguntas ? [...etapas[solicitanteId].perguntas] : [];
  const totalPerguntas = perguntasIniciais.length;
  let ultimaMsg;

  for (let i = 0; i < totalPerguntas; i++) {
    const pergunta = etapas[solicitanteId].perguntas[etapas[solicitanteId].indicePergunta];
    const resposta = obterResposta(pergunta, i);
    ultimaMsg = criarMsgFalsa(resposta);

    await processarRespostaFormulario({
      msg: ultimaMsg,
      numero: solicitanteId,
      info: etapas[solicitanteId],
      client,
      notificarSecretaria,
      etapas,
      enviarWebhook,
    });

    if (i < totalPerguntas - 1) {
      assert.ok(etapas[solicitanteId], "deve manter o estado até a última pergunta");
    }
  }

  return { etapas, client, solicitanteId, gruposNotificados, ultimaMsg, perguntasIniciais };
}

test("precisaDeValorDoMinisterio: reconhece respostas afirmativas e negativas", () => {
  assert.equal(precisaDeValorDoMinisterio("sim"), true);
  assert.equal(precisaDeValorDoMinisterio("Sim, vamos precisar"), true);
  assert.equal(precisaDeValorDoMinisterio("S"), true);
  assert.equal(precisaDeValorDoMinisterio("precisa de verba"), true);
  assert.equal(precisaDeValorDoMinisterio("não"), false);
  assert.equal(precisaDeValorDoMinisterio("Nao"), false);
  assert.equal(precisaDeValorDoMinisterio("Não precisa"), false);
  assert.equal(precisaDeValorDoMinisterio(""), false);
});

test("normalizarDadosIniciais: extrai e formata campos de evento e normaliza local igreja", () => {
  const dadosEvento = {
    rede: "Rede de Jovens",
    evento: "Vigília Jovem",
    local: "Igreja",
    dia: 15,
    mes: 11,
    ano: 2026,
    horarioInicio: "22:00",
    horarioFim: "04:00",
  };
  const normalizado = normalizarDadosIniciais(dadosEvento);
  assert.equal(normalizado.departamento, "Rede de Jovens");
  assert.equal(normalizado.evento, "Vigília Jovem");
  assert.equal(normalizado.local, ENDERECO_IGREJA);
  assert.equal(normalizado.data, "15/11/2026");
  assert.equal(normalizado.horarioInicio, "22:00");
  assert.equal(normalizado.horarioFim, "04:00");
});

test("iniciarFormularioEvento: evento com dados anteriores pula campos repetidos e inclui novos campos", async () => {
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

  // Campos pré-existentes devem ser pulados
  const idsPerguntas = etapas[solicitanteId].perguntas.map((p) => p.id);
  assert.ok(!idsPerguntas.includes("nome_evento"), "deveria pular nome_evento");
  assert.ok(!idsPerguntas.includes("data_solicitada"), "deveria pular data_solicitada");
  assert.ok(!idsPerguntas.includes("horario_inicio_termino"), "deveria pular horario_inicio_termino");
  assert.ok(!idsPerguntas.includes("local"), "deveria pular local");

  // Novos campos obrigatórios devem estar presentes
  assert.ok(idsPerguntas.includes("horario_total"), "deve conter horario_total");
  assert.ok(idsPerguntas.includes("valor_inscricao"), "deve conter valor_inscricao");
  assert.ok(idsPerguntas.includes("precisa_valor_ministerio"), "deve conter precisa_valor_ministerio");
  assert.ok(idsPerguntas.includes("prazo_imagem"), "deve conter prazo_imagem");
  assert.ok(idsPerguntas.includes("objetivo_espiritual"), "deve conter objetivo_espiritual");
  assert.ok(!idsPerguntas.includes("resultado_esperado"), "resultado_esperado foi unificado no objetivo_espiritual");

  // Total de perguntas filtradas: 24 - 4 = 20 perguntas
  assert.equal(etapas[solicitanteId].perguntas.length, 20);

  // Mensagem inicial destaca os dados já salvos
  assert.equal(client.mensagensEnviadas.length, 1);
  const msgIntro = client.mensagensEnviadas[0].content;
  assert.match(msgIntro, /Rede de Mulheres/);
  assert.match(msgIntro, /20\/10\/2026/);
  assert.match(msgIntro, /16:00 às 19:00/);
  assert.match(msgIntro, /Salão Nobre/);
  assert.match(msgIntro, /Chá de Mulheres/);
  assert.match(msgIntro, /1\/20/);
});

test("iniciarFormularioEvento: se dadosIniciais for de reunião, NUNCA inicia o formulário", async () => {
  const etapas = {};
  const client = criarClienteFalso();
  const solicitanteId = "5511999998888";

  await iniciarFormularioEvento({
    etapas,
    solicitanteId,
    dadosIniciais: {
      tipo: "reuniao",
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

  assert.equal(etapas[solicitanteId], undefined, "reunião simples NUNCA deve iniciar o formulário de evento");
  assert.equal(client.mensagensEnviadas.length, 0, "nenhuma mensagem deve ser enviada para reunião");
});

test("processarRespostaFormulario: fluxo completo com resposta SIM para ministério notifica tesouraria (+55 11 99111-7612)", async () => {
  let payloadRecebido = null;
  const mockEnviarWebhook = async (payload) => {
    payloadRecebido = payload;
    return {
      status: "success",
      url: "https://docs.google.com/document/d/teste-doc-123/edit",
    };
  };

  const { etapas, client, solicitanteId, gruposNotificados, ultimaMsg } = await simularPreenchimentoFormulario({
    dadosIniciais: {
      rede: "Rede de Homens",
      evento: "Café dos Homens",
      local: "Templo",
      dataFormatada: "10/11/2026",
      horarioInicio: "08:00",
      horarioFim: "11:00",
    },
    obterResposta: (pergunta) => {
      if (pergunta.id === "precisa_valor_ministerio") {
        return "Sim, precisaremos de apoio";
      }
      return `Resposta para ${pergunta.id}`;
    },
    enviarWebhook: mockEnviarWebhook,
  });

  // Após responder a última:
  assert.equal(etapas[solicitanteId], undefined, "deve limpar o estado da etapa");
  assert.ok(payloadRecebido, "webhook deve ter sido disparado");

  // Verifica dados anteriores no payload
  assert.equal(payloadRecebido.departamento, "Rede de Homens");
  assert.equal(payloadRecebido.nome_evento, "Café dos Homens");
  assert.equal(payloadRecebido.data, "10/11/2026");
  assert.equal(payloadRecebido.horario_inicio, "08:00");
  assert.equal(payloadRecebido.horario_termino, "11:00");
  assert.equal(payloadRecebido.local, ENDERECO_IGREJA);

  // Verifica novos campos no payload
  assert.equal(payloadRecebido.nome_lider, "Resposta para nome_lider");
  assert.equal(payloadRecebido.horario_total, "Resposta para horario_total");
  assert.equal(payloadRecebido.valor_inscricao, "Resposta para valor_inscricao");
  assert.equal(payloadRecebido.precisa_valor_ministerio, "Sim, precisaremos de apoio");
  assert.equal(payloadRecebido.contato_tesouraria, CONTATO_TESOURARIA);
  assert.equal(payloadRecebido.prazo_imagem, "Resposta para prazo_imagem");
  assert.equal(payloadRecebido.objetivo_espiritual, "Resposta para objetivo_espiritual");

  // Confirmação para o líder deve conter o contato da tesouraria
  assert.match(ultimaMsg.respostas[1], new RegExp(`\\+55 11 99111-7612`));
  assert.match(ultimaMsg.respostas[1], /https:\/\/docs\.google\.com\/document\/d\/teste-doc-123\/edit/);

  // Notificação para o grupo da secretaria também deve conter o contato da tesouraria
  assert.equal(gruposNotificados.length, 1);
  assert.match(gruposNotificados[0], /FORMULÁRIO DE EVENTO PREENCHIDO/);
  assert.match(gruposNotificados[0], new RegExp(`\\+55 11 99111-7612`));
  assert.match(gruposNotificados[0], /https:\/\/docs\.google\.com\/document\/d\/teste-doc-123\/edit/);
  assert.match(gruposNotificados[0], /Café dos Homens/);
  assert.match(gruposNotificados[0], /08:00 às 11:00/);
  assert.match(gruposNotificados[0], /Rua Benedicto de Abreu Júnior, 40/);
  assert.match(gruposNotificados[0], /Resposta para tema/);
  assert.match(gruposNotificados[0], /Resposta para versiculo/);
  assert.match(gruposNotificados[0], /Resposta para paleta/);
  assert.match(gruposNotificados[0], /Resposta para estilo/);
  assert.match(gruposNotificados[0], /Resposta para prazo_imagem/);

  // Notificação direta enviada para o número da tesouraria
  const msgTesouraria = client.mensagensEnviadas.find((m) => m.to && m.to.includes("5511991117612"));
  assert.ok(msgTesouraria, "deve notificar o número da tesouraria diretamente");
  assert.match(msgTesouraria.content, /AVISO DE EVENTO - DEMANDA DA TESOURARIA/);
  assert.match(msgTesouraria.content, /Café dos Homens/);
});

test("processarRespostaFormulario: quando precisa_valor_ministerio for NÃO, não inclui aviso da tesouraria", async () => {
  const { gruposNotificados, ultimaMsg } = await simularPreenchimentoFormulario({
    dadosIniciais: {
      rede: "Rede Kids",
      evento: "EBF",
      local: "Igreja",
      dataFormatada: "12/10/2026",
      horarioInicio: "14:00",
      horarioFim: "17:00",
    },
    obterResposta: (pergunta, i) => {
      if (pergunta.id === "precisa_valor_ministerio") {
        return "Não, já temos os recursos";
      }
      return `Valor ${i}`;
    },
    enviarWebhook: async () => ({ status: "success", url: "https://docs.google.com/doc-ebf" }),
  });

  // Não deve conter aviso da tesouraria
  assert.doesNotMatch(ultimaMsg.respostas[1], new RegExp(`\\+55 11 99111-7612`));
  assert.doesNotMatch(gruposNotificados[0], new RegExp(`\\+55 11 99111-7612`));
});

test("processarRespostaFormulario: se pergunta de local for feita e líder responder igreja, preenche endereço fixo", async () => {
  let payloadRecebido = null;
  const { perguntasIniciais } = await simularPreenchimentoFormulario({
    dadosIniciais: {
      rede: "Jovens",
      evento: "Luau",
      dataFormatada: "15/11/2026",
      horarioInicio: "19:00",
      horarioFim: "22:00",
    },
    obterResposta: (p) => (p.id === "local" ? "igreja" : "Teste"),
    enviarWebhook: async (payload) => {
      payloadRecebido = payload;
      return { status: "success", url: "https://docs.google.com/test" };
    },
  });

  // A lista de perguntas deve incluir 'local'
  const ids = perguntasIniciais.map((p) => p.id);
  assert.ok(ids.includes("local"));
  assert.equal(payloadRecebido.local, ENDERECO_IGREJA);
});

test("processarRespostaFormulario: em caso de falha no webhook avisa líder e secretaria sem perder dados", async () => {
  const { etapas, solicitanteId, gruposNotificados, ultimaMsg } = await simularPreenchimentoFormulario({
    dadosIniciais: {
      rede: "Rede Kids",
      evento: "EBF",
      local: "Igreja",
      dataFormatada: "12/10/2026",
      horarioInicio: "14:00",
      horarioFim: "17:00",
    },
    obterResposta: (pergunta, i) => `Valor ${i}`,
    enviarWebhook: async () => {
      throw new Error("Timeout na conexão");
    },
  });

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

test("E2E: aprovação de evento inicia o formulário, líder responde tudo, webhook gera Docs e envia links com aviso da tesouraria", async () => {
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
  await enviarPrivado("7"); // departamento (Rede de Homens)
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
  assert.match(diretasEnviadas[1].texto, /1\/20/); // 24 perguntas menos as 4 puladas (nome, data, horario, local) = 20

  // 3. Líder responde o formulário conversacional
  assert.ok(etapas[NUMERO_LIDER]);
  assert.equal(etapas[NUMERO_LIDER].fluxo, "formulario_evento");

  const respostasParaEnviar = [
    "Pr. João Silva", // nome_lider
    "17h às 23h", // horario_total
    "Casais e Famílias", // publico
    "Gratuito", // valor_inscricao
    "Sim, precisaremos de recursos", // precisa_valor_ministerio
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
    "10/12/2026", // prazo_imagem
    "19h Louvor, 20h Ministração, 21h30 Jantar", // cronograma
    "Chegar com 1h de antecedência", // observacoes
    "Edificação das famílias e muitas vidas transformadas", // objetivo_espiritual
  ];

  for (let i = 0; i < respostasParaEnviar.length; i++) {
    const resp = await enviarPrivado(respostasParaEnviar[i]);
    if (i < respostasParaEnviar.length - 1) {
      assert.match(resp[0], new RegExp(`\\[${i + 2}\\/20\\]`));
    } else {
      // Última resposta
      assert.match(resp[0], /Gerando o documento oficial no Google Docs/);
      assert.match(resp[1], /Formulário do Evento Concluído com Sucesso/);
      assert.match(resp[1], /https:\/\/docs\.google\.com\/document\/d\/doc-gerado-sucesso\/edit/);
      assert.match(resp[1], new RegExp(`\\+55 11 99111-7612`)); // Aviso da tesouraria no líder
    }
  }

  // 4. Valida se o Webhook recebeu o payload completo
  assert.deepEqual(payloadWebhookRecebido, {
    nome_lider: "Pr. João Silva",
    departamento: "Rede de Homens",
    nome_evento: "Conferência Atos 2",
    data: "20/12/2026",
    data_solicitada: "20/12/2026",
    horario_inicio: "19:00",
    horario_termino: "22:00",
    horario_inicio_termino: "19:00 às 22:00",
    horario_total: "17h às 23h",
    local: ENDERECO_IGREJA,
    valor_inscricao: "Gratuito",
    valor: "Gratuito",
    precisa_valor_ministerio: "Sim, precisaremos de recursos",
    contato_tesouraria: CONTATO_TESOURARIA,
    aviso_tesouraria: `Entrar em contato com a tesouraria: ${CONTATO_TESOURARIA}`,
    resultado_esperado: "Edificação das famílias e muitas vidas transformadas",
    publico: "Casais e Famílias",
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
    prazo_imagem: "10/12/2026",
    cronograma: "19h Louvor, 20h Ministração, 21h30 Jantar",
    observacoes: "Chegar com 1h de antecedência",
    objetivo_espiritual: "Edificação das famílias e muitas vidas transformadas",
  });

  // 5. Valida notificação do grupo com o link e aviso da tesouraria
  const ultimaMsgGrupo = gruposEnviados[gruposEnviados.length - 1];
  assert.match(ultimaMsgGrupo, /FORMULÁRIO DE EVENTO PREENCHIDO/);
  assert.match(ultimaMsgGrupo, /Conferência Atos 2/);
  assert.match(ultimaMsgGrupo, /https:\/\/docs\.google\.com\/document\/d\/doc-gerado-sucesso\/edit/);
  assert.match(ultimaMsgGrupo, new RegExp(`\\+55 11 99111-7612`));

  // 5.1 Valida se mensagem direta para a tesouraria também foi enviada
  const msgTesourariaDireta = diretasEnviadas.find((m) => m.to && m.to.includes("5511991117612"));
  assert.ok(msgTesourariaDireta, "deve enviar notificação direta para a tesouraria");
  assert.match(msgTesourariaDireta.texto, /AVISO DE EVENTO - DEMANDA DA TESOURARIA/);

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
