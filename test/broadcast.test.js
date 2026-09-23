const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db");
const {
  BROADCAST_CONFIG,
  formatarJidWhatsApp,
  mascararTelefone,
  buscarDestinatariosBroadcast,
  executarBroadcast,
} = require("../bot/broadcast");
const { createMessageHandler } = require("../bot/messageHandler");
const { atualizarCacheGrupo, NOME_GRUPO_SECRETARIA } = require("../bot/secretaria");

const JID_GRUPO_SECRETARIA = "111111111111111@g.us";

// Helper para limpar registros inseridos no banco e manter cache canônico
function restaurarEstadoBanco() {
  try {
    db.prepare("DELETE FROM lideres WHERE telefone IN ('5511999990001', '5511999990002', '5511999990003')").run();
    atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, JID_GRUPO_SECRETARIA);
  } catch (_) {}
}

test.beforeEach(() => {
  restaurarEstadoBanco();
});

test.afterEach(() => {
  restaurarEstadoBanco();
});

test("broadcast: formatarJidWhatsApp e mascararTelefone", () => {
  assert.equal(formatarJidWhatsApp("55 (11) 99999-0001"), "5511999990001@c.us");
  assert.equal(formatarJidWhatsApp("5511999990001@c.us"), "5511999990001@c.us");
  assert.equal(formatarJidWhatsApp(""), "");
  assert.equal(formatarJidWhatsApp(null), "");

  assert.equal(mascararTelefone("5511999990001@c.us"), "5511*****0001");
  assert.equal(mascararTelefone("1234"), "1234");
});

test("broadcast: buscarDestinatariosBroadcast em modo teste busca Gabriela Diniz na base de dados", () => {
  const agora = new Date().toISOString();
  db.prepare("INSERT INTO lideres (telefone, nome, cargos, createdAt) VALUES (?, ?, ?, ?)").run(
    "5511999990001",
    "Gabriela Diniz",
    '["lider"]',
    agora
  );
  db.prepare("INSERT INTO lideres (telefone, nome, cargos, createdAt) VALUES (?, ?, ?, ?)").run(
    "5511999990002",
    "Pastor Marcos",
    '["pastor"]',
    agora
  );

  const destinatarios = buscarDestinatariosBroadcast({ modoTeste: true });
  assert.equal(destinatarios.length, 1);
  assert.equal(destinatarios[0].nome, "Gabriela Diniz");
  assert.equal(destinatarios[0].telefone, "5511999990001");
});

test("broadcast: buscarDestinatariosBroadcast em modo teste com fallback por 'Gabriela'", () => {
  const agora = new Date().toISOString();
  db.prepare("INSERT INTO lideres (telefone, nome, cargos, createdAt) VALUES (?, ?, ?, ?)").run(
    "5511999990003",
    "Gabriela Silva",
    '["membro"]',
    agora
  );

  const destinatarios = buscarDestinatariosBroadcast({ modoTeste: true });
  assert.equal(destinatarios.length, 1);
  assert.equal(destinatarios[0].nome, "Gabriela Silva");
  assert.equal(destinatarios[0].telefone, "5511999990003");
});

test("broadcast: buscarDestinatariosBroadcast com listLideres injetado", () => {
  const listLideresMock = () => [
    { nome: "Outro Líder", telefone: "5511111111111" },
    { nome: "Gabriela Diniz", telefone: "5511999990001" },
  ];

  const destinatarios = buscarDestinatariosBroadcast({ modoTeste: true, listLideres: listLideresMock });
  assert.equal(destinatarios.length, 1);
  assert.equal(destinatarios[0].nome, "Gabriela Diniz");
  assert.equal(destinatarios[0].telefone, "5511999990001");
});

test("broadcast: buscarDestinatariosBroadcast em modo geral (modoTeste: false) retorna todos os membros", () => {
  const agora = new Date().toISOString();
  db.prepare("INSERT INTO lideres (telefone, nome, cargos, createdAt) VALUES (?, ?, ?, ?)").run(
    "5511999990001",
    "Gabriela Diniz",
    '["lider"]',
    agora
  );
  db.prepare("INSERT INTO lideres (telefone, nome, cargos, createdAt) VALUES (?, ?, ?, ?)").run(
    "5511999990002",
    "Pastor Marcos",
    '["pastor"]',
    agora
  );

  const destinatarios = buscarDestinatariosBroadcast({ modoTeste: false });
  assert.ok(destinatarios.length >= 2);
  assert.ok(destinatarios.some((d) => d.nome === "Gabriela Diniz" && d.telefone === "5511999990001"));
  assert.ok(destinatarios.some((d) => d.nome === "Pastor Marcos" && d.telefone === "5511999990002"));
});

test("broadcast: executarBroadcast envia mídia com caption e texto simples respeitando modo teste e delay", async () => {
  const mensagensEnviadas = [];
  const clientMock = {
    sendMessage: async (to, content, options) => {
      mensagensEnviadas.push({ to, content, options });
    },
  };

  const fakeMedia = { data: "base64data", mimetype: "image/jpeg", filename: "culto.jpg" };
  const resultado = await executarBroadcast({
    client: clientMock,
    media: fakeMedia,
    texto: "Culto Especial neste Domingo às 18h!",
    delayMs: 10,
    destinatarios: [
      { nome: "Gabriela Diniz", telefone: "5511999990001" },
    ],
  });

  assert.equal(resultado.enviados, 1);
  assert.equal(resultado.falhas, 0);
  assert.equal(mensagensEnviadas.length, 1);
  assert.equal(mensagensEnviadas[0].to, "5511999990001@c.us");
  assert.equal(mensagensEnviadas[0].options?.caption, "Culto Especial neste Domingo às 18h!");
});

test("broadcast: executarBroadcast rejeita @lid retornado por getNumberId e envia para @c.us canônico", async () => {
  const mensagensEnviadas = [];
  const clientMock = {
    getNumberId: async () => ({ _serialized: "98947540508698@lid" }),
    sendMessage: async (to, content, options) => {
      mensagensEnviadas.push({ to, content, options });
    },
  };

  const resultado = await executarBroadcast({
    client: clientMock,
    texto: "Aviso importante de teste",
    destinatarios: [
      { nome: "Gabriela Diniz", telefone: "5511942685501" },
    ],
  });

  assert.equal(resultado.enviados, 1);
  assert.equal(mensagensEnviadas.length, 1);
  assert.equal(mensagensEnviadas[0].to, "5511942685501@c.us");
  assert.notEqual(mensagensEnviadas[0].to, "98947540508698@lid");
});

test("broadcast: executarBroadcast aplica delay entre múltiplos destinatários no modo geral", async () => {
  const timestamps = [];
  const clientMock = {
    sendMessage: async () => {
      timestamps.push(Date.now());
    },
  };

  const destinatarios = [
    { nome: "Destinatário 1", telefone: "5511999990001" },
    { nome: "Destinatário 2", telefone: "5511999990002" },
  ];

  const resultado = await executarBroadcast({
    client: clientMock,
    texto: "Aviso geral",
    delayMs: 80,
    destinatarios,
  });

  assert.equal(resultado.enviados, 2);
  assert.equal(timestamps.length, 2);
  const diferenca = timestamps[1] - timestamps[0];
  assert.ok(diferenca >= 70, `Deveria ter aguardado o delay entre envios (esperado >= 70ms, obtido: ${diferenca}ms)`);
});

test("broadcast integrado: mensagem com imagem e legenda no grupo 'Mensagens Secretaria' é transmitida para Gabriela Diniz", async () => {
  atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, JID_GRUPO_SECRETARIA);

  const diretasEnviadas = [];
  const clientMock = {
    sendMessage: async (to, content, options) => {
      diretasEnviadas.push({ to, content, options });
    },
  };

  const mockMedia = { data: "imagemBase64", mimetype: "image/png", filename: "banner.png" };
  let reacaoChamada = null;

  const msgMock = {
    from: JID_GRUPO_SECRETARIA,
    body: "Confira a programação do fim de semana!",
    caption: "Confira a programação do fim de semana!",
    hasMedia: true,
    hasQuotedMsg: false,
    fromMe: false,
    downloadMedia: async () => mockMedia,
    react: async (emoji) => {
      reacaoChamada = emoji;
    },
  };

  const listLideresMock = () => [
    { nome: "Gabriela Diniz", telefone: "5511999990001", cargos: ["lider"] },
    { nome: "Pastor Carlos", telefone: "5511999990002", cargos: ["pastor"] },
  ];

  const handleMessage = createMessageHandler({
    client: clientMock,
    calendar: { events: {} },
    agendasParaLer: [],
    lideres: ["5511999990001"],
    etapas: {},
    buscarEventos: async () => [],
    listLideres: listLideresMock,
  });

  const res = await handleMessage(msgMock);

  assert.ok(res, "handleMessage deveria retornar o resultado do broadcast");
  assert.equal(res.enviados, 1);
  assert.equal(diretasEnviadas.length, 1);
  assert.equal(diretasEnviadas[0].to, "5511999990001@c.us");
  assert.equal(diretasEnviadas[0].options?.caption, "Confira a programação do fim de semana!");
  assert.equal(reacaoChamada, "📢", "Deveria ter reagido com o emoji de megafone no grupo");
});

test("broadcast integrado: mensagem somente texto no grupo 'Mensagens Secretaria' é transmitida para Gabriela Diniz", async () => {
  atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, JID_GRUPO_SECRETARIA);

  const diretasEnviadas = [];
  const clientMock = {
    sendMessage: async (to, content) => {
      diretasEnviadas.push({ to, content });
    },
  };

  const msgMock = {
    from: JID_GRUPO_SECRETARIA,
    body: "Atenção: Reunião geral hoje às 20h no salão nobre.",
    hasMedia: false,
    hasQuotedMsg: false,
    fromMe: false,
  };

  const listLideresMock = () => [
    { nome: "Gabriela Diniz", telefone: "5511999990001" },
  ];

  const handleMessage = createMessageHandler({
    client: clientMock,
    calendar: { events: {} },
    agendasParaLer: [],
    lideres: ["5511999990001"],
    etapas: {},
    buscarEventos: async () => [],
    listLideres: listLideresMock,
  });

  const res = await handleMessage(msgMock);
  assert.ok(res);
  assert.equal(res.enviados, 1);
  assert.equal(diretasEnviadas.length, 1);
  assert.equal(diretasEnviadas[0].to, "5511999990001@c.us");
  assert.equal(diretasEnviadas[0].content, "Atenção: Reunião geral hoje às 20h no salão nobre.");
});

test("broadcast integrado: mensagens de outros grupos NÃO acionam o broadcast", async () => {
  const JID_OUTRO_GRUPO = "120363888888888888@g.us";
  const diretasEnviadas = [];
  const clientMock = {
    sendMessage: async (to, content) => {
      diretasEnviadas.push({ to, content });
    },
  };

  const msgMock = {
    from: JID_OUTRO_GRUPO,
    body: "Mensagem qualquer em outro grupo da igreja",
    hasMedia: false,
    hasQuotedMsg: false,
    fromMe: false,
  };

  const listLideresMock = () => [
    { nome: "Gabriela Diniz", telefone: "5511999990001" },
  ];

  const handleMessage = createMessageHandler({
    client: clientMock,
    calendar: { events: {} },
    agendasParaLer: [],
    lideres: [],
    etapas: {},
    buscarEventos: async () => [],
    listLideres: listLideresMock,
  });

  const res = await handleMessage(msgMock);
  assert.equal(res, undefined, "Mensagem de outro grupo deve ser ignorada em silêncio");
  assert.equal(diretasEnviadas.length, 0);
});

test("broadcast integrado: resposta de aprovação com citação no grupo continua no fluxo de aprovação e NÃO dispara broadcast", async () => {
  atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, JID_GRUPO_SECRETARIA);

  const diretasEnviadas = [];
  const clientMock = {
    sendMessage: async (to, content) => {
      diretasEnviadas.push({ to, content });
    },
  };

  // Simula resposta com citação de mensagem do bot (aprovação)
  const msgMock = {
    from: JID_GRUPO_SECRETARIA,
    body: "marcar evento",
    hasMedia: false,
    hasQuotedMsg: true,
    fromMe: false,
    getQuotedMessage: async () => ({
      body: "Código: EVT-99999\nSolicitante: João",
    }),
    reply: async () => {},
  };

  const listLideresMock = () => [
    { nome: "Gabriela Diniz", telefone: "5511999990001" },
  ];

  const handleMessage = createMessageHandler({
    client: clientMock,
    calendar: { events: {} },
    agendasParaLer: [],
    lideres: [],
    etapas: {},
    buscarEventos: async () => [],
    listLideres: listLideresMock,
  });

  const res = await handleMessage(msgMock);
  // O retorno de aprovação não é o objeto de broadcast { total, enviados... }
  assert.ok(!res || res.modoTeste === undefined, "Não deveria disparar broadcast para resposta de aprovação");
  assert.equal(diretasEnviadas.length, 0, "Nenhuma mensagem direta de broadcast deve ter sido enviada");
});
