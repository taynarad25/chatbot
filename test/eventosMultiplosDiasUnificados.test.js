const { test } = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const {
  extrairNomeBaseEvento,
  formatarResumoDatas,
  agruparEventosPorNomeBase,
  agruparEventosAgenda,
  montarMensagemAgenda,
  montarDetalheEvento,
} = require("../bot/agenda");
const { createMessageHandler } = require("../bot/messageHandler");
const { buscarPendente } = require("../bot/pendentesAprovacao");

test("extrairNomeBaseEvento: remove sufixos de sessões, dias e partes", () => {
  assert.equal(extrairNomeBaseEvento("Treinamento de Intercessão - Sessão 1"), "Treinamento de Intercessão");
  assert.equal(extrairNomeBaseEvento("Treinamento de Intercessão - Sessão 2"), "Treinamento de Intercessão");
  assert.equal(extrairNomeBaseEvento("Treinamento de Intercessão - Sessão 3"), "Treinamento de Intercessão");
  assert.equal(extrairNomeBaseEvento("Seminário de Vida no Espírito (Sessão 1)"), "Seminário de Vida no Espírito");
  assert.equal(extrairNomeBaseEvento("Conferência de Mulheres - Dia 1"), "Conferência de Mulheres");
  assert.equal(extrairNomeBaseEvento("Workshop de Líderes - Módulo 2"), "Workshop de Líderes");
  assert.equal(extrairNomeBaseEvento("Culto de Celebração"), "Culto de Celebração");
});

test("formatarResumoDatas: formata datas únicas e compostas com clareza", () => {
  const criarEv = (data) => ({ start: { dateTime: `${data}T19:30:00-03:00` } });

  assert.equal(formatarResumoDatas([criarEv("2026-11-15")]), "15/11");
  assert.equal(formatarResumoDatas([criarEv("2026-11-15"), criarEv("2026-11-22")]), "15/11 e 22/11");
  assert.equal(
    formatarResumoDatas([criarEv("2026-11-15"), criarEv("2026-11-22"), criarEv("2026-11-29")]),
    "15/11, 22/11 e 29/11"
  );
});

test("agruparEventosPorNomeBase: agrupa múltiplas sessões em 1 só evento unificado para liderança", () => {
  const eventos = [
    {
      id: "ev-sessao-1",
      summary: "Treinamento de Intercessão - Sessão 1",
      start: { dateTime: "2026-11-15T19:30:00-03:00" },
      end: { dateTime: "2026-11-15T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Igreja",
    },
    {
      id: "ev-sessao-2",
      summary: "Treinamento de Intercessão - Sessão 2",
      start: { dateTime: "2026-11-22T19:30:00-03:00" },
      end: { dateTime: "2026-11-22T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Igreja",
    },
    {
      id: "ev-sessao-3",
      summary: "Treinamento de Intercessão - Sessão 3",
      start: { dateTime: "2026-11-29T19:30:00-03:00" },
      end: { dateTime: "2026-11-29T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Igreja",
    },
    {
      id: "ev-avulso",
      summary: "Vigília de Oração",
      start: { dateTime: "2026-11-20T23:00:00-03:00" },
      end: { dateTime: "2026-11-21T05:00:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Igreja",
    },
  ];

  const agrupados = agruparEventosPorNomeBase(eventos);
  assert.equal(agrupados.length, 2, "devem existir apenas 2 eventos unificados");

  const treinamento = agrupados.find((e) => e.nomeBase === "Treinamento de Intercessão");
  assert.ok(treinamento, "deve encontrar o Treinamento de Intercessão");
  assert.equal(treinamento.ehMultiplo, true);
  assert.equal(treinamento.totalSessoes, 3);
  assert.equal(treinamento.resumoDatas, "15/11, 22/11 e 29/11");
  assert.equal(treinamento.eventos.length, 3);

  const vigilia = agrupados.find((e) => e.nomeBase === "Vigília de Oração");
  assert.ok(vigilia);
  assert.equal(vigilia.ehMultiplo, false);
  assert.equal(vigilia.totalSessoes, 1);
});

test("Agenda pública: agrupa sessões em 1 só item e exibe programação completa ao ver detalhes", () => {
  const eventosSessoes = [
    {
      id: "s1",
      summary: "Treinamento de Intercessão - Sessão 1",
      start: { dateTime: "2026-11-15T19:30:00-03:00" },
      end: { dateTime: "2026-11-15T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Rua Benedicto de Abreu Júnior, 40",
      description: "Treinamento prático de intercessão e guerra espiritual.",
    },
    {
      id: "s2",
      summary: "Treinamento de Intercessão - Sessão 2",
      start: { dateTime: "2026-11-22T19:30:00-03:00" },
      end: { dateTime: "2026-11-22T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Rua Benedicto de Abreu Júnior, 40",
    },
    {
      id: "s3",
      summary: "Treinamento de Intercessão - Sessão 3",
      start: { dateTime: "2026-11-29T19:30:00-03:00" },
      end: { dateTime: "2026-11-29T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Rua Benedicto de Abreu Júnior, 40",
    },
  ];

  const itens = agruparEventosAgenda(eventosSessoes);
  assert.equal(itens.length, 1, "deve ser agrupado como apenas 1 evento");
  assert.equal(itens[0].tipo, "multiplo");
  assert.equal(itens[0].summary, "Treinamento de Intercessão");

  const msgLista = montarMensagemAgenda(itens, "Novembro");
  assert.match(msgLista, /1 - 📌 \*15\/11, 22\/11 e 29\/11\* às 19:30 \| Treinamento de Intercessão/);
  assert.doesNotMatch(msgLista, /Sessão 1/);
  assert.doesNotMatch(msgLista, /Sessão 2/);
  assert.doesNotMatch(msgLista, /Sessão 3/);

  // Ao solicitar detalhes do item:
  const detalhe = montarDetalheEvento(itens[0]);
  assert.match(detalhe, /📌 \*Treinamento de Intercessão\*/);
  assert.match(detalhe, /📆 \*Programação dos Dias \/ Sessões:\*/);
  assert.match(detalhe, /• \*Sessão 1:\* 15\/11/);
  assert.match(detalhe, /• \*Sessão 2:\* 22\/11/);
  assert.match(detalhe, /• \*Sessão 3:\* 29\/11/);
});

test("Fluxo de Alteração pelo Líder: lista como 1 só evento, exibe menu unificado e permite alterar sessão específica", async () => {
  const eventosBanco = [
    {
      id: "ev-inter-1",
      summary: "Treinamento de Intercessão - Sessão 1",
      start: { dateTime: "2026-11-15T19:30:00-03:00" },
      end: { dateTime: "2026-11-15T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Igreja",
    },
    {
      id: "ev-inter-2",
      summary: "Treinamento de Intercessão - Sessão 2",
      start: { dateTime: "2026-11-22T19:30:00-03:00" },
      end: { dateTime: "2026-11-22T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Igreja",
    },
    {
      id: "ev-inter-3",
      summary: "Treinamento de Intercessão - Sessão 3",
      start: { dateTime: "2026-11-29T19:30:00-03:00" },
      end: { dateTime: "2026-11-29T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Igreja",
    },
  ];

  const buscarEventosMock = async () => eventosBanco;
  const etapas = {};
  const handler = createMessageHandler({
    client: {},
    calendar: {},
    agendasParaLer: ["cal-principal", "cal-intercessao"],
    lideres: ["5511988880001"],
    etapas,
    buscarEventos: buscarEventosMock,
  });

  const respostas = [];
  const fakeMsg = (body) => ({
    body,
    from: "5511988880001@c.us",
    reply: async (txt) => {
      respostas.push(txt);
      return { id: "res-" + respostas.length };
    },
    getContact: async () => ({ id: { user: "5511988880001", _serialized: "5511988880001@c.us" }, pushname: "Líder Intercessão" }),
  });

  // 1. Líder entra no menu de eventos e seleciona '2' (Alterar evento)
  etapas["5511988880001@c.us"] = {
    fluxo: "agendamento",
    etapa: "evento_acao",
  };
  await handler(fakeMsg("2")); // 2 - Alterar evento existente

  // Escolhe departamento (1)
  respostas.length = 0;
  await handler(fakeMsg("1"));

  // Deve listar como 1 ÚNICO evento com 3 sessões!
  const listaAlterar = respostas[respostas.length - 1];
  assert.match(listaAlterar, /1 - 15\/11, 22\/11 e 29\/11: Treinamento de Intercessão \(3 sessões\)/);
  assert.doesNotMatch(listaAlterar, /2 - 22\/11: Treinamento de Intercessão/);
  assert.doesNotMatch(listaAlterar, /3 - 29\/11: Treinamento de Intercessão/);

  // 2. Líder seleciona a opção "1" (Treinamento de Intercessão)
  respostas.length = 0;
  await handler(fakeMsg("1"));
  const menuMultiplo = respostas[respostas.length - 1];
  assert.match(menuMultiplo, /Treinamento de Intercessão/);
  assert.match(menuMultiplo, /1 - Alterar data\/horário de uma sessão específica/);
  assert.match(menuMultiplo, /2 - Adicionar mais um dia\/sessão ao evento/);
  assert.match(menuMultiplo, /3 - Alterar dados gerais/);

  // 3. Líder escolhe "1" (Alterar sessão específica)
  respostas.length = 0;
  await handler(fakeMsg("1"));
  const listaSessoes = respostas[respostas.length - 1];
  assert.match(listaSessoes, /1 - 15\/11/);
  assert.match(listaSessoes, /2 - 22\/11/);
  assert.match(listaSessoes, /3 - 29\/11/);

  // 4. Escolhe a Sessão 2 (22/11)
  respostas.length = 0;
  await handler(fakeMsg("2"));
  const menuOQueSessao = respostas[respostas.length - 1];
  assert.match(menuOQueSessao, /Treinamento de Intercessão - Sessão 2/);
  assert.match(menuOQueSessao, /1 - Horário/);
  assert.match(menuOQueSessao, /2 - Data/);

  // 5. Escolhe "1" (Horário) e informa novo início e término
  respostas.length = 0;
  await handler(fakeMsg("1"));
  assert.match(respostas[0], /Qual o novo \*horário de início\*/);

  respostas.length = 0;
  await handler(fakeMsg("20:00"));
  assert.match(respostas[0], /horário de término/);

  respostas.length = 0;
  await handler(fakeMsg("22:00"));
  const msgFinal = respostas[0];
  assert.match(msgFinal, /Solicitação de Alteração/);
  assert.match(msgFinal, /Treinamento de Intercessão - Sessão 2/);
  assert.match(msgFinal, /Novo horário: 20:00 - 22:00/);
});

test("Fluxo de Adicionar Novo Dia ao Evento: cria pendência para aprovação da secretaria", async () => {
  const eventosBanco = [
    {
      id: "ev-inter-1",
      summary: "Treinamento de Intercessão - Sessão 1",
      start: { dateTime: "2026-11-15T19:30:00-03:00" },
      end: { dateTime: "2026-11-15T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Igreja",
    },
  ];

  const buscarEventosMock = async () => eventosBanco;
  const etapas = {};
  const handler = createMessageHandler({
    client: {},
    calendar: {},
    agendasParaLer: ["cal-principal", "cal-intercessao"],
    lideres: ["5511988880002"],
    etapas,
    buscarEventos: buscarEventosMock,
  });

  const respostas = [];
  const fakeMsg = (body) => ({
    body,
    from: "5511988880002@c.us",
    reply: async (txt) => {
      respostas.push(txt);
      return { id: "res-" + respostas.length };
    },
    getContact: async () => ({ id: { user: "5511988880002", _serialized: "5511988880002@c.us" }, pushname: "Líder 2" }),
  });

  // Simula estado ativo na escolha de o que alterar (opção 3: adicionar mais um dia/sessão)
  etapas["5511988880002@c.us"] = {
    fluxo: "agendamento",
    etapa: "alterar_o_que",
    departamento: "Intercessão",
    calendarIdBusca: "cal-intercessao",
    eventoParaAlterar: eventosBanco[0],
  };

  // Digita '3' para adicionar mais um dia
  await handler(fakeMsg("3"));
  assert.match(respostas[0], /Qual a \*data\* do novo dia\/sessão que deseja adicionar\?/);

  // Informa data
  respostas.length = 0;
  await handler(fakeMsg("06/12"));
  assert.match(respostas[0], /Qual o \*horário de início\*/);

  // Informa horário de início
  respostas.length = 0;
  await handler(fakeMsg("19:30"));
  assert.match(respostas[0], /horário de término/);

  // Informa horário de término
  respostas.length = 0;
  await handler(fakeMsg("21:30"));
  const msgSucesso = respostas[0];
  assert.match(msgSucesso, /➕ \*Solicitação de Novo Dia \/ Sessão Enviada!\*/);
  assert.match(msgSucesso, /Treinamento de Intercessão/);
  assert.match(msgSucesso, /06\/12 das 19:30 às 21:30 \(Sessão 2\)/);
});

test("Fluxo de Cancelamento pelo Líder: permite cancelar 1 sessão específica ou todas as sessões", async () => {
  const eventosBanco = [
    {
      id: "ev-inter-1",
      summary: "Treinamento de Intercessão - Sessão 1",
      start: { dateTime: "2026-11-15T19:30:00-03:00" },
      end: { dateTime: "2026-11-15T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Igreja",
    },
    {
      id: "ev-inter-2",
      summary: "Treinamento de Intercessão - Sessão 2",
      start: { dateTime: "2026-11-22T19:30:00-03:00" },
      end: { dateTime: "2026-11-22T21:30:00-03:00" },
      calendarId: "cal-intercessao",
      location: "Igreja",
    },
  ];

  const buscarEventosMock = async () => eventosBanco;
  const etapas = {};
  const handler = createMessageHandler({
    client: {},
    calendar: {},
    agendasParaLer: ["cal-principal", "cal-intercessao"],
    lideres: ["5511988880003"],
    etapas,
    buscarEventos: buscarEventosMock,
  });

  const respostas = [];
  const fakeMsg = (body) => ({
    body,
    from: "5511988880003@c.us",
    reply: async (txt) => {
      respostas.push(txt);
      return { id: "res-" + respostas.length };
    },
    getContact: async () => ({ id: { user: "5511988880003", _serialized: "5511988880003@c.us" }, pushname: "Líder 3" }),
  });

  // 1. Líder inicia cancelamento (opção 3 de eventos)
  etapas["5511988880003@c.us"] = {
    fluxo: "agendamento",
    etapa: "evento_acao",
  };
  await handler(fakeMsg("3")); // 3 - Cancelar evento
  respostas.length = 0;
  await handler(fakeMsg("1")); // Escolhe depto 1

  // Recebe lista com o evento unificado
  const listaCancelar = respostas[respostas.length - 1];
  assert.match(listaCancelar, /Treinamento de Intercessão \(2 sessões\)/);

  // Seleciona a opção 1
  respostas.length = 0;
  await handler(fakeMsg("1"));
  const menuEscolhaSessao = respostas[respostas.length - 1];
  assert.match(menuEscolhaSessao, /Qual sessão você deseja cancelar\?/);
  assert.match(menuEscolhaSessao, /1 - 15\/11/);
  assert.match(menuEscolhaSessao, /2 - 22\/11/);
  assert.match(menuEscolhaSessao, /3 - 🗑️ Cancelar o evento TODO \(todas as 2 sessões\)/);

  // Escolhe opção 3 (cancelar o evento todo)
  respostas.length = 0;
  await handler(fakeMsg("3"));
  assert.match(respostas[0], /cancelar \*TODAS AS 2 SESSÕES\* do evento \*Treinamento de Intercessão\*\?/);

  // Confirma com SIM
  respostas.length = 0;
  await handler(fakeMsg("SIM"));
  const msgConfirmacao = respostas[0];
  assert.match(msgConfirmacao, /Solicitação de Cancelamento Total/);
  assert.match(msgConfirmacao, /Treinamento de Intercessão \(todas as 2 sessões\)/);
});

