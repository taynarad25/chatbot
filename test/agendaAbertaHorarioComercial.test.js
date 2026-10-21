const { test } = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const {
  agruparEventosAgenda,
  montarMensagemAgenda,
  montarDetalheEvento,
  ehEventoPreparacaoLimpeza,
  obterLinkInscricaoEvento,
} = require("../bot/agenda");
const { createMessageHandler } = require("../bot/messageHandler");
const { ehHorarioComercialEnvio } = require("../bot/lembretes");

test("ehEventoPreparacaoLimpeza: identifica variações de blocos de preparação, decoração e limpeza", () => {
  const casosPositivos = [
    { summary: "[Preparação/Decoração] Mesa posta" },
    { summary: "[Preparação / Decoração] Mesa posta" },
    { summary: "[Preparação] Culto de Mulheres" },
    { summary: "[Decoração] Congresso" },
    { summary: "[Limpeza] Culto de Jovens" },
    { summary: "[Montagem] Conferência" },
    { summary: "Preparação - Mesa posta" },
    { summary: "Decoração: Culto Especial" },
    { summary: "Limpeza do Salão" },
    { summary: "Culto", description: "Horário reservado para montagem, preparação, decoração ou limpeza do salão." },
  ];

  for (const c of casosPositivos) {
    assert.ok(
      ehEventoPreparacaoLimpeza(c),
      `deve reconhecer como preparação/limpeza: "${c.summary}"`
    );
  }

  const casosNegativos = [
    { summary: "Culto de Mulheres - O Vaso e o Oleiro" },
    { summary: "Pilates e palestra" },
    { summary: "Treinamento de Intercessão" },
    { summary: "Culto de Celebração" },
  ];

  for (const c of casosNegativos) {
    assert.ok(
      !ehEventoPreparacaoLimpeza(c),
      `NÃO deve reconhecer como preparação: "${c.summary}"`
    );
  }
});

test("Agenda aberta para todos: NUNCA exibe blocos de preparação e decoração na lista pública", () => {
  const evPrep = {
    summary: "[Preparação/Decoração] Mesa posta",
    start: { dateTime: "2026-10-24T13:00:00-03:00" },
    end: { dateTime: "2026-10-24T15:00:00-03:00" },
    calendarId: "cal-mulheres",
  };
  const evMulheres = {
    summary: "Culto de Mulheres - O Vaso e o Oleiro",
    start: { dateTime: "2026-10-24T15:00:00-03:00" },
    end: { dateTime: "2026-10-24T18:00:00-03:00" },
    calendarId: "cal-mulheres",
  };
  const evPilates = {
    summary: "Pilates e palestra",
    start: { dateTime: "2026-10-31T15:00:00-03:00" },
    end: { dateTime: "2026-10-31T17:00:00-03:00" },
    calendarId: "cal-saude",
  };

  // Na agenda aberta ao público, evPrep é omitido da numeração
  const itens = agruparEventosAgenda([evPrep, evMulheres, evPilates], { abertoAoPublico: true });

  assert.equal(itens.length, 2, "devem existir apenas 2 itens oficiais, sem bloco de preparação");
  assert.equal(itens[0].summary, "Culto de Mulheres - O Vaso e o Oleiro");
  assert.equal(itens[1].summary, "Pilates e palestra");

  const msgAgenda = montarMensagemAgenda(itens, "Outubro");
  assert.doesNotMatch(msgAgenda, /\[Preparação\/Decoração\]/);
  assert.doesNotMatch(msgAgenda, /Mesa posta/);
  assert.match(msgAgenda, /1 - 📌 \*24\/10\* às 15:00 \| Culto de Mulheres - O Vaso e o Oleiro/);
  assert.match(msgAgenda, /2 - 📌 \*31\/10\* às 15:00 \| Pilates e palestra/);

  // Instruções de rodapé com consulta de detalhes e próximos meses
  assert.match(msgAgenda, /Quer o endereço ou mais detalhes de algum evento\? Digite o número dele\./);
  assert.match(msgAgenda, /Para consultar outro mês, digite o \*nome do mês\*/);
});

test("Detalhes do evento: inclui link de inscrição oficial para eventos com inscrição", () => {
  const evMulheres = {
    summary: "Culto de Mulheres - O Vaso e o Oleiro",
    start: { dateTime: "2026-10-24T15:00:00-03:00" },
    end: { dateTime: "2026-10-24T18:00:00-03:00" },
    location: "Rua Benedicto de Abreu Júnior, 40",
    description: "Tema: O Vaso e o Oleiro. Entrada franca.",
  };

  const linkMulheres = obterLinkInscricaoEvento(evMulheres);
  assert.equal(linkMulheres, "https://www.comunidadecristacurados.com.br/mulheres");

  const detalheMulheres = montarDetalheEvento({ tipo: "unico", summary: evMulheres.summary, eventos: [evMulheres] });
  assert.match(detalheMulheres, /🔗 \*Link de Inscrição:\*/);
  assert.match(detalheMulheres, /https:\/\/www\.comunidadecristacurados\.com\.br\/mulheres/);

  const evPilates = {
    summary: "Pilates e palestra",
    start: { dateTime: "2026-10-31T15:00:00-03:00" },
    end: { dateTime: "2026-10-31T17:00:00-03:00" },
  };

  const linkPilates = obterLinkInscricaoEvento(evPilates);
  assert.equal(linkPilates, "https://www.comunidadecristacurados.com.br/saude-mulher");

  const detalhePilates = montarDetalheEvento({ tipo: "unico", summary: evPilates.summary, eventos: [evPilates] });
  assert.match(detalhePilates, /https:\/\/www\.comunidadecristacurados\.com\.br\/saude-mulher/);
});

test("Fluxo de navegação no bot: opção 3 mostra eventos do mês atual e permite trocar de mês ou ver detalhes", async () => {
  const mockEventosOutubro = [
    {
      summary: "Culto de Mulheres - O Vaso e o Oleiro",
      start: { dateTime: "2026-10-24T15:00:00-03:00" },
      end: { dateTime: "2026-10-24T18:00:00-03:00" },
      calendarId: "cal-mulheres",
      location: "Rua Benedicto de Abreu Júnior, 40",
    },
    {
      summary: "[Preparação/Decoração] Mesa posta",
      start: { dateTime: "2026-10-24T13:00:00-03:00" },
      end: { dateTime: "2026-10-24T15:00:00-03:00" },
      calendarId: "cal-mulheres",
    },
    {
      summary: "Pilates e palestra",
      start: { dateTime: "2026-10-31T15:00:00-03:00" },
      end: { dateTime: "2026-10-31T17:00:00-03:00" },
      calendarId: "cal-saude",
    },
  ];

  const mockEventosNovembro = [
    {
      summary: "Culto de Jovens - Destemidos",
      start: { dateTime: "2026-11-14T19:30:00-03:00" },
      end: { dateTime: "2026-11-14T21:30:00-03:00" },
      calendarId: "cal-jovens",
    },
  ];

  const buscarEventosMock = async (inicio, fim) => {
    if (fim.includes("-11-")) {
      return mockEventosNovembro;
    }
    if (fim.includes("-10-")) {
      return mockEventosOutubro;
    }
    return [];
  };

  const etapas = {};
  const handler = createMessageHandler({
    client: {},
    calendar: {},
    agendasParaLer: ["cal-principal", "cal-mulheres", "cal-saude", "cal-jovens"],
    lideres: [],
    etapas,
    buscarEventos: buscarEventosMock,
  });

  const respostas = [];
  const fakeMsg = (body) => ({
    body,
    from: "5511999990001@c.us",
    reply: async (txt) => {
      respostas.push(txt);
      return { id: "res-" + respostas.length };
    },
    getContact: async () => ({ id: { user: "5511999990001" }, pushname: "Visitante" }),
  });

  // 1. Usuário digita "3" no menu principal -> Carrega imediatamente o mês atual
  await handler(fakeMsg("3"));

  assert.ok(respostas.some(r => r.includes("Consultando eventos de")));
  const msgLista = respostas[respostas.length - 1];
  assert.match(msgLista, /Culto de Mulheres - O Vaso e o Oleiro/);
  assert.match(msgLista, /Pilates e palestra/);
  // Garante que a preparação NUNCA aparece na lista aberta
  assert.doesNotMatch(msgLista, /\[Preparação\/Decoração\]/);

  // 2. Usuário digita "1" para ver detalhes do evento 1 (Culto de Mulheres)
  respostas.length = 0;
  await handler(fakeMsg("1"));
  const msgDetalhe = respostas[0];
  assert.match(msgDetalhe, /📌 \*Culto de Mulheres - O Vaso e o Oleiro\*/);
  assert.match(msgDetalhe, /🔗 \*Link de Inscrição:\*/);
  assert.match(msgDetalhe, /https:\/\/www\.comunidadecristacurados\.com\.br\/mulheres/);

  // 3. Usuário digita "novembro" para consultar eventos do próximo mês
  respostas.length = 0;
  await handler(fakeMsg("novembro"));
  const msgNov = respostas[respostas.length - 1];
  assert.match(msgNov, /Destemidos/);
});

test("Horário Comercial: restringe mensagens automáticas estritamente ao período das 08:00 às 18:00", () => {
  // Teste com ignorarEnv = true para ignorar o bypass de NODE_ENV=test
  const horaNoite = new Date("2026-10-20T21:20:00-03:00");
  assert.equal(ehHorarioComercialEnvio(horaNoite, true), false, "21h20 deve ser bloqueado");

  const horaMadrugada = new Date("2026-10-20T03:00:00-03:00");
  assert.equal(ehHorarioComercialEnvio(horaMadrugada, true), false, "03h00 deve ser bloqueado");

  const horaAntesAbertura = new Date("2026-10-20T07:59:00-03:00");
  assert.equal(ehHorarioComercialEnvio(horaAntesAbertura, true), false, "07h59 deve ser bloqueado");

  const horaAbertura = new Date("2026-10-20T08:00:00-03:00");
  assert.equal(ehHorarioComercialEnvio(horaAbertura, true), true, "08h00 deve ser permitido");

  const horaComercialTarde = new Date("2026-10-20T14:30:00-03:00");
  assert.equal(ehHorarioComercialEnvio(horaComercialTarde, true), true, "14h30 deve ser permitido");

  const horaQuaseFechamento = new Date("2026-10-20T17:59:00-03:00");
  assert.equal(ehHorarioComercialEnvio(horaQuaseFechamento, true), true, "17h59 deve ser permitido");

  const horaFechamento = new Date("2026-10-20T18:00:00-03:00");
  assert.equal(ehHorarioComercialEnvio(horaFechamento, true), false, "18h00 deve ser bloqueado");

  const horaPosFechamento = new Date("2026-10-20T18:05:00-03:00");
  assert.equal(ehHorarioComercialEnvio(horaPosFechamento, true), false, "18h05 deve ser bloqueado");
});
