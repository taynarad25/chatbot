const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db");

const {
  obterPeriodoSemana,
  verificarEnvioRemoto,
  registrarEnvioRemoto,
  URL_PLANILHA_LOGS_PADRAO,
} = require("../bot/logsEnvioSheet");

const {
  processarEnvioAgendaSecretarias,
  processarLembretesEventos,
  registrarLembreteAguardandoResposta,
  buscarLembreteAguardandoResposta,
  removerLembreteAguardandoResposta,
  montarMensagemLembrete,
} = require("../bot/lembretes");

const { createMessageHandler } = require("../bot/messageHandler");
const { addLider, removeLider } = require("../web/lideres");

test("logsEnvioSheet: obterPeriodoSemana calcula semana ISO corretamente", () => {
  const data1 = new Date("2026-09-29T12:00:00.000Z");
  assert.equal(obterPeriodoSemana(data1), "2026-W40");

  const data2 = new Date("2026-10-05T10:00:00.000Z");
  assert.equal(obterPeriodoSemana(data2), "2026-W41");
});

test("logsEnvioSheet: verificarEnvioRemoto e registrarEnvioRemoto com mock fetch", async () => {
  const requisicoes = [];

  const fakeFetch = async (url, options) => {
    requisicoes.push({ url, options, body: JSON.parse(options.body) });
    const payload = JSON.parse(options.body);

    if (payload.action === "verificar_envio") {
      if (payload.tipo === "ja_enviado") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ enviado: true }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ enviado: false }),
      };
    }

    if (payload.action === "registrar_envio") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "success", sucesso: true }),
      };
    }

    return { ok: false, status: 500, text: async () => "error" };
  };

  // 1. Testa verificação quando já foi enviado
  const resJaEnviado = await verificarEnvioRemoto({
    tipo: "ja_enviado",
    periodo: "2026-W40",
    fetchFn: fakeFetch,
  });
  assert.equal(resJaEnviado, true);

  // 2. Testa verificação quando ainda não foi enviado
  const resNaoEnviado = await verificarEnvioRemoto({
    tipo: "novo_envio",
    periodo: "2026-W40",
    fetchFn: fakeFetch,
  });
  assert.equal(resNaoEnviado, false);

  // 3. Testa registro de envio
  const resReg = await registrarEnvioRemoto({
    tipo: "agenda_quinzenal",
    periodo: "2026-W40",
    detalhes: { totalEnviados: 2 },
    fetchFn: fakeFetch,
  });
  assert.equal(resReg, true);

  assert.equal(requisicoes.length, 3);
  assert.equal(requisicoes[0].body.action, "verificar_envio");
  assert.equal(requisicoes[2].body.action, "registrar_envio");
  assert.equal(requisicoes[2].body.totalEnviados, 2);
});

test("processarEnvioAgendaSecretarias: cancela envio se a planilha indicar enviado: true", async () => {
  const mensagensEnviadas = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagensEnviadas.push({ to, txt });
    },
  };

  const dataSegunda = new Date("2026-09-28T10:00:00.000Z"); // Segunda-feira
  const periodo = obterPeriodoSemana(dataSegunda);

  const fakeFetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    if (payload.action === "verificar_envio") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ enviado: true, periodo: payload.periodo }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };

  const resultado = await processarEnvioAgendaSecretarias({
    client: fakeClient,
    buscarEventos: async () => [
      { summary: "Culto Especial", start: { dateTime: "2026-09-29T19:30:00-03:00" } },
    ],
    dataBase: dataSegunda,
    destinatarios: [{ nome: "Isabelly Lacerda", telefone: "5511970498716" }],
    fetchFn: fakeFetch,
  });

  assert.equal(resultado.pulado, true);
  assert.equal(resultado.motivo, "Ja enviado (planilha)");
  assert.equal(mensagensEnviadas.length, 0, "Nenhuma mensagem deve ser enviada se já constar na planilha");
});

test("processarEnvioAgendaSecretarias: envia e registra na planilha se enviado: false", async () => {
  const mensagensEnviadas = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagensEnviadas.push({ to, txt });
    },
  };

  const dataSegunda = new Date("2026-10-12T10:00:00.000Z"); // Outra segunda-feira
  const chamadasPlanilha = [];

  const fakeFetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    chamadasPlanilha.push(payload);
    if (payload.action === "verificar_envio") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ enviado: false }),
      };
    }
    if (payload.action === "registrar_envio") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "success", sucesso: true }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  const resultado = await processarEnvioAgendaSecretarias({
    client: fakeClient,
    buscarEventos: async () => [
      { summary: "Culto de Celebração", start: { dateTime: "2026-10-13T19:30:00-03:00" } },
    ],
    dataBase: dataSegunda,
    destinatarios: [{ nome: "Isabelly Lacerda", telefone: "5511970498716" }],
    fetchFn: fakeFetch,
  });

  assert.equal(resultado.enviados, 1);
  assert.equal(mensagensEnviadas.length, 1);

  // Verifica se chamou verificar_envio e depois registrar_envio
  assert.ok(chamadasPlanilha.some((c) => c.action === "verificar_envio" && c.tipo === "agenda_quinzenal"));
  assert.ok(chamadasPlanilha.some((c) => c.action === "registrar_envio" && c.tipo === "agenda_quinzenal"));
});

test("Lembretes de líderes: deixa o bot aberto para receber mensagens e processa confirmação", async () => {
  const TEL_LIDER = "5511988887777";
  const JID_LIDER = `${TEL_LIDER}@c.us`;

  addLider({
    nome: "Marcos Líder",
    telefone: TEL_LIDER,
    cargos: ["lider"],
    departamento: "Rede de Homens",
  });

  const etapas = {};
  const dataBase = new Date("2026-10-01T10:00:00.000Z");
  const idEv = "ev-teste-retiro-" + Date.now();
  const eventos = [
    {
      id: idEv,
      summary: "Retiro Homens de Honra 2026",
      start: { dateTime: "2026-10-06T08:00:00-03:00" },
      location: "Templo",
      calendarId: "cal-homens",
    },
  ];

  const fakeClient = {
    sendMessage: async (to, txt) => {},
  };

  // 1. Dispara lembretes faltando 5 dias (01/10 -> 06/10)
  await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventos,
    agendasParaLer: [],
    diasAntecedencia: 5,
    dataBase,
    notificarSecretariaFn: async () => {},
    etapas,
  });

  // O bot deve ter colocado o líder em estado de espera de resposta
  const etapaLider = etapas[JID_LIDER] || etapas[TEL_LIDER];
  assert.ok(etapaLider, "Líder deve estar em etapas após envio do lembrete");
  assert.equal(etapaLider.fluxo, "resposta_lembrete");
  assert.equal(etapaLider.eventoNome, "Retiro Homens de Honra 2026");

  // Também deve estar registrado no SQLite para persistência pós-restart
  const pendenteDb = buscarLembreteAguardandoResposta(TEL_LIDER);
  assert.ok(pendenteDb, "Deve estar salvo no banco lembretes_aguardando_resposta");
  assert.equal(pendenteDb.eventoNome, "Retiro Homens de Honra 2026");

  // 2. Líder responde confirmando: "Sim, tudo certo!"
  const respostasBot = [];
  const avisosSecretaria = [];

  const handleMessage = createMessageHandler({
    client: fakeClient,
    calendar: {},
    agendasParaLer: [],
    lideres: [TEL_LIDER],
    etapas,
    buscarEventos: async () => [],
    listLideres: () => [{ nome: "Marcos Líder", telefone: TEL_LIDER, cargos: ["lider"], departamento: "Rede de Homens" }],
  });

  await handleMessage({
    from: JID_LIDER,
    body: "Sim, tudo certo! Está confirmado.",
    id: { _serialized: "msg-conf-1" },
    getContact: async () => ({ id: { _serialized: JID_LIDER }, pushname: "Marcos" }),
    reply: async (txt) => {
      respostasBot.push(txt);
      return txt;
    },
  });

  assert.equal(respostasBot.length, 1);
  assert.match(respostasBot[0], /Evento Confirmado/i);
  assert.match(respostasBot[0], /Retiro Homens de Honra 2026/);

  // O estado deve ser removido após a resposta
  assert.equal(etapas[JID_LIDER], undefined);
  assert.equal(buscarLembreteAguardandoResposta(TEL_LIDER), null);

  removeLider(TEL_LIDER);
});

test("Lembretes de líderes: líder responde solicitando alterações e bot avisa secretaria", async () => {
  const TEL_LIDER = "5511977776666";
  const JID_LIDER = `${TEL_LIDER}@c.us`;

  addLider({
    nome: "Débora Louvor",
    telefone: TEL_LIDER,
    cargos: ["lider"],
    departamento: "Epifania",
  });

  const etapas = {};
  const dataBase = new Date("2026-10-01T10:00:00.000Z");
  const idEvDebora = "ev-teste-debora-" + Date.now();
  const eventos = [
    {
      id: idEvDebora,
      summary: "Noite de Louvor Epifania",
      start: { dateTime: "2026-10-06T19:30:00-03:00" },
      location: "Templo Sede",
      calendarId: "cal-louvor",
    },
  ];

  const fakeClient = {
    sendMessage: async (to, txt) => {},
  };

  await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventos,
    agendasParaLer: [],
    diasAntecedencia: 5,
    dataBase,
    notificarSecretariaFn: async () => {},
    etapas,
  });

  // Simula que o bot reiniciou (limpando etapas em memória), mas o SQLite persistiu
  delete etapas[JID_LIDER];
  delete etapas[TEL_LIDER];
  assert.ok(buscarLembreteAguardandoResposta(TEL_LIDER));

  const respostasBot = [];
  const handleMessage = createMessageHandler({
    client: fakeClient,
    calendar: {},
    agendasParaLer: [],
    lideres: [TEL_LIDER],
    etapas,
    buscarEventos: async () => [],
    listLideres: () => [{ nome: "Débora Louvor", telefone: TEL_LIDER, cargos: ["lider"], departamento: "Epifania" }],
  });

  // Líder envia observação/ajuste
  await handleMessage({
    from: JID_LIDER,
    body: "Olá, precisamos alterar o horário de início para as 20h e vamos precisar de 3 microfones sem fio adicionais.",
    id: { _serialized: "msg-ajuste-1" },
    getContact: async () => ({ id: { _serialized: JID_LIDER }, pushname: "Débora" }),
    reply: async (txt) => {
      respostasBot.push(txt);
      return txt;
    },
  });

  assert.equal(respostasBot.length, 1);
  assert.match(respostasBot[0], /Recebemos sua mensagem sobre o evento \*Noite de Louvor Epifania\*/);
  assert.match(respostasBot[0], /encaminhamos diretamente para a equipe da secretaria/);

  // Registro no SQLite deve ter sido limpo após o recebimento
  assert.equal(buscarLembreteAguardandoResposta(TEL_LIDER), null);

  removeLider(TEL_LIDER);
});
