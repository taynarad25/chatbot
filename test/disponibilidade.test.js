process.env.TZ = "America/Sao_Paulo";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  calcularDisponibilidade,
  montarMensagemConflito,
  montarMensagemDatasDisponiveis,
  verificarDataEspecifica,
  calcularJanelasLivres,
  montarMensagemDataEspecificaBloqueada,
} = require("../bot/disponibilidade");

const EVANGELISMO_ID = "evangelismo-cal-id";
const ANO = 2026;
const MES = 7; // julho/2026: sábados em 4, 11, 18 e 25; quintas em 2, 9, 16, 23, 30

function eventoHorario({ data, horaInicio, horaFim, summary, calendarId = "outro-calendario" }) {
  return {
    summary,
    calendarId,
    start: { dateTime: `${data}T${horaInicio}:00-03:00` },
    end: { dateTime: `${data}T${horaFim}:00-03:00` },
  };
}

function eventoDiaTodo({ dataInicio, dataFimExclusiva, summary, calendarId = "outro-calendario" }) {
  return {
    summary,
    calendarId,
    start: { date: dataInicio },
    end: { date: dataFimExclusiva },
  };
}

function baseParams(overrides = {}) {
  return {
    eventos: [],
    evangelismoCalendarId: EVANGELISMO_ID,
    ano: ANO,
    mes: MES,
    diaSemanaFiltro: "TODOS",
    isDiaInteiro: false,
    horarioInicio: "19:00",
    horarioFim: "20:00",
    rede: "Rede de Casais",
    ...overrides,
  };
}

test("calcularDisponibilidade: sem eventos, todos os dias do mês ficam disponíveis", () => {
  const { disponiveis, conflito } = calcularDisponibilidade(baseParams());
  assert.equal(disponiveis.length, 31); // julho tem 31 dias
  assert.equal(conflito, null);
});

test("calcularDisponibilidade: filtra só o dia da semana pedido (ex: só quintas)", () => {
  const { disponiveis } = calcularDisponibilidade(baseParams({ diaSemanaFiltro: 4 })); // 4 = quinta
  assert.equal(disponiveis.length, 5); // 2, 9, 16, 23, 30 de julho/2026
  disponiveis.forEach((d) => assert.equal(d.getDay(), 4));
});

test("calcularDisponibilidade: 'Sábado LIVRE' do Evangelismo bloqueia aquele sábado", () => {
  const eventos = [
    eventoDiaTodo({ dataInicio: "2026-07-04", dataFimExclusiva: "2026-07-05", summary: "Sábado LIVRE", calendarId: EVANGELISMO_ID }),
  ];
  const { disponiveis, conflito } = calcularDisponibilidade(baseParams({ eventos, diaSemanaFiltro: 6, rede: "Rede Ruach" }));

  assert.ok(!disponiveis.some((d) => d.getDate() === 4), "dia 4 (sábado livre) não deveria estar disponível");
  assert.equal(conflito.type, "sabado_livre");
  assert.equal(conflito.date, "2026-07-04");
});

test("calcularDisponibilidade: novo evento de dia inteiro é bloqueado por qualquer evento existente no dia", () => {
  const eventos = [eventoHorario({ data: "2026-07-10", horaInicio: "10:00", horaFim: "11:00", summary: "Reunião qualquer" })];
  const { disponiveis, conflito } = calcularDisponibilidade(baseParams({ eventos, isDiaInteiro: true }));

  assert.ok(!disponiveis.some((d) => d.getDate() === 10));
  assert.equal(conflito.type, "day_long_conflict");
  assert.equal(conflito.date, "2026-07-10");
  assert.equal(conflito.summary, "Reunião qualquer");
});

test("calcularDisponibilidade: evento existente de dia inteiro bloqueia novo evento com horário nesse dia", () => {
  // Google define o fim como o dia seguinte (exclusivo): isso cobre só o dia 10
  const eventos = [eventoDiaTodo({ dataInicio: "2026-07-10", dataFimExclusiva: "2026-07-11", summary: "Retiro" })];
  const { disponiveis } = calcularDisponibilidade(baseParams({ eventos, horarioInicio: "19:00", horarioFim: "20:00" }));

  assert.ok(!disponiveis.some((d) => d.getDate() === 10), "dia 10 deveria estar bloqueado pelo evento de dia inteiro");
  assert.ok(disponiveis.some((d) => d.getDate() === 11), "dia 11 não é coberto pelo evento (fim exclusivo) e deveria estar livre");
});

test("calcularDisponibilidade: evento existente multi-dia bloqueia todos os dias cobertos (fim exclusivo do Google)", () => {
  // start=10, end=13 (exclusivo) cobre 10, 11 e 12 — não cobre o 13
  const eventos = [eventoDiaTodo({ dataInicio: "2026-07-10", dataFimExclusiva: "2026-07-13", summary: "Acampamento" })];
  const { disponiveis } = calcularDisponibilidade(baseParams({ eventos }));

  assert.ok(!disponiveis.some((d) => d.getDate() === 10));
  assert.ok(!disponiveis.some((d) => d.getDate() === 11));
  assert.ok(!disponiveis.some((d) => d.getDate() === 12));
  assert.ok(disponiveis.some((d) => d.getDate() === 13));
});

test("calcularDisponibilidade: conflito de horário dentro do buffer de 1h é bloqueado", () => {
  const eventos = [eventoHorario({ data: "2026-07-10", horaInicio: "19:00", horaFim: "20:00", summary: "Culto" })];
  // novo evento começa 20:30 (30min depois do fim do existente) — dentro do buffer de 1h
  const { disponiveis, conflito } = calcularDisponibilidade(
    baseParams({ eventos, horarioInicio: "20:30", horarioFim: "21:30" })
  );

  assert.ok(!disponiveis.some((d) => d.getDate() === 10));
  assert.equal(conflito.type, "time_conflict");
  assert.equal(conflito.summary, "Culto");
});

test("calcularDisponibilidade: evento fora do buffer de 1h não conflita", () => {
  const eventos = [eventoHorario({ data: "2026-07-10", horaInicio: "19:00", horaFim: "20:00", summary: "Culto" })];
  // novo evento começa 21:05 (1h05 depois do fim do existente) — fora do buffer de 1h
  const { disponiveis } = calcularDisponibilidade(
    baseParams({ eventos, horarioInicio: "21:05", horarioFim: "22:00" })
  );

  assert.ok(disponiveis.some((d) => d.getDate() === 10), "dia 10 deveria estar disponível, fora do buffer");
});

test("calcularDisponibilidade: evento exatamente na borda do buffer (1h de intervalo) não conflita", () => {
  const eventos = [eventoHorario({ data: "2026-07-10", horaInicio: "19:00", horaFim: "20:00", summary: "Culto" })];
  // buffer do existente vai até 21:00; novo evento começa exatamente às 21:00 (não é 'before', é igual)
  const { disponiveis } = calcularDisponibilidade(
    baseParams({ eventos, horarioInicio: "21:00", horarioFim: "22:00" })
  );

  assert.ok(disponiveis.some((d) => d.getDate() === 10), "início exatamente no limite do buffer não deveria conflitar");
});

test("calcularDisponibilidade: evento em outro dia não afeta a disponibilidade do dia consultado", () => {
  const eventos = [eventoHorario({ data: "2026-07-15", horaInicio: "19:00", horaFim: "20:00", summary: "Culto" })];
  const { disponiveis } = calcularDisponibilidade(baseParams({ eventos, horarioInicio: "19:00", horarioFim: "20:00" }));

  assert.ok(disponiveis.some((d) => d.getDate() === 10));
});

test("calcularDisponibilidade: exceção Rede Ruach reserva o último sábado disponível para outras redes", () => {
  const { disponiveis } = calcularDisponibilidade(baseParams({ diaSemanaFiltro: 6, rede: "Rede de Casais" }));
  // sábados de julho/2026: 4, 11, 18, 25 — o último (25) deve ser removido para quem não é Ruach
  assert.deepEqual(disponiveis.map((d) => d.getDate()), [4, 11, 18]);
});

test("calcularDisponibilidade: exceção Rede Ruach não se aplica para a própria Rede Ruach", () => {
  const { disponiveis } = calcularDisponibilidade(baseParams({ diaSemanaFiltro: 6, rede: "Rede Ruach" }));
  assert.deepEqual(disponiveis.map((d) => d.getDate()), [4, 11, 18, 25]);
});

test("calcularDisponibilidade: com só 1 sábado disponível, rede que não é Ruach fica sem opções", () => {
  // Bloqueia os 3 primeiros sábados via conflito de dia inteiro, sobrando só o dia 25
  const eventosConflito = [4, 11, 18].map((dia) =>
    eventoHorario({ data: `2026-07-${String(dia).padStart(2, "0")}`, horaInicio: "00:00", horaFim: "23:59", summary: "Ocupado" })
  );
  const { disponiveis } = calcularDisponibilidade(
    baseParams({ eventos: eventosConflito, diaSemanaFiltro: 6, isDiaInteiro: true, rede: "Rede de Casais" })
  );
  assert.deepEqual(disponiveis, [], "único sábado livre (25) deveria ser reservado para a Ruach, sem sobra para outras redes");
});

test("calcularDisponibilidade: exceção Rede Ruach não afeta dias que não são sábado", () => {
  const { disponiveis } = calcularDisponibilidade(baseParams({ diaSemanaFiltro: 4, rede: "Rede de Casais" })); // quinta
  assert.equal(disponiveis.length, 5); // nenhuma quinta é removida
});

test("calcularDisponibilidade: conflito registrado é sempre o primeiro em ordem cronológica", () => {
  const eventos = [
    eventoHorario({ data: "2026-07-20", horaInicio: "19:00", horaFim: "20:00", summary: "Evento do dia 20" }),
    eventoHorario({ data: "2026-07-05", horaInicio: "19:00", horaFim: "20:00", summary: "Evento do dia 05" }),
  ];
  const { conflito } = calcularDisponibilidade(
    baseParams({ eventos, horarioInicio: "19:30", horarioFim: "20:30" })
  );
  assert.equal(conflito.date, "2026-07-05", "o conflito relatado deve ser o do dia cronologicamente mais cedo, não o primeiro do array");
});

test("montarMensagemConflito: mensagem padrão quando não há conflito registrado", () => {
  const msg = montarMensagemConflito(null);
  assert.match(msg, /Não há datas disponíveis para essas condições neste mês/);
});

test("montarMensagemConflito: mensagem específica para sábado livre", () => {
  const msg = montarMensagemConflito({ type: "sabado_livre", date: "2026-07-04" });
  assert.match(msg, /04\/07/);
  assert.match(msg, /Sábado LIVRE.*Evangelismo/);
});

test("montarMensagemConflito: mensagem específica para conflito de dia inteiro", () => {
  const msg = montarMensagemConflito({ type: "day_long_conflict", date: "2026-07-10", summary: "Retiro" });
  assert.match(msg, /DIA TODO/);
  assert.match(msg, /Retiro/);
  assert.match(msg, /10\/07/);
});

test("montarMensagemConflito: mensagem específica para conflito de horário mostra o intervalo do evento existente", () => {
  const msg = montarMensagemConflito({
    type: "time_conflict",
    date: "2026-07-10",
    summary: "Culto",
    start: "2026-07-10T19:00:00-03:00",
    end: "2026-07-10T20:00:00-03:00",
  });
  assert.match(msg, /Culto/);
  assert.match(msg, /19:00/);
  assert.match(msg, /20:00/);
});

test("montarMensagemDatasDisponiveis: lista numerada com dia da semana abreviado, dia e mês com 2 dígitos", () => {
  const disponiveis = [new Date(2026, 6, 4), new Date(2026, 6, 11)]; // sábados
  const msg = montarMensagemDatasDisponiveis(disponiveis, 7);
  assert.match(msg, /1 - 04\/07 \(Sáb\)/);
  assert.match(msg, /2 - 11\/07 \(Sáb\)/);
  assert.match(msg, /Digite o número da opção desejada/);
});

// ---------------------------------------------------------------------------
// verificarDataEspecifica / calcularJanelasLivres / montarMensagemDataEspecificaBloqueada
// ---------------------------------------------------------------------------

function baseParamsData(overrides = {}) {
  return {
    eventos: [],
    evangelismoCalendarId: EVANGELISMO_ID,
    ano: ANO,
    mes: MES,
    dia: 10, // 10/07/2026 é uma sexta-feira
    rede: "Rede de Casais",
    ...overrides,
  };
}

test("verificarDataEspecifica: dia livre sem eventos fica disponível", () => {
  const resultado = verificarDataEspecifica(baseParamsData());
  assert.equal(resultado.disponivel, true);
  assert.equal(resultado.dataFormatada, "10/07");
});

test("verificarDataEspecifica: 'Sábado LIVRE' do Evangelismo bloqueia o dia", () => {
  const eventos = [eventoDiaTodo({ dataInicio: "2026-07-04", dataFimExclusiva: "2026-07-05", summary: "Sábado LIVRE", calendarId: EVANGELISMO_ID })];
  const resultado = verificarDataEspecifica(baseParamsData({ eventos, dia: 4 }));
  assert.equal(resultado.disponivel, false);
  assert.equal(resultado.motivo, "sabado_livre");
});

test("verificarDataEspecifica: exceção Ruach bloqueia o último sábado disponível do mês para outras redes", () => {
  // sábados de julho/2026: 4, 11, 18, 25 — o último (25) é reservado para a Ruach
  const resultado = verificarDataEspecifica(baseParamsData({ dia: 25, rede: "Rede de Casais" }));
  assert.equal(resultado.disponivel, false);
  assert.equal(resultado.motivo, "ruach_reservado");
});

test("verificarDataEspecifica: exceção Ruach não bloqueia a própria Rede Ruach", () => {
  const resultado = verificarDataEspecifica(baseParamsData({ dia: 25, rede: "Rede Ruach" }));
  assert.equal(resultado.disponivel, true);
});

test("verificarDataEspecifica: sábado que não é o último do mês não é afetado pela exceção Ruach", () => {
  const resultado = verificarDataEspecifica(baseParamsData({ dia: 18, rede: "Rede de Casais" }));
  assert.equal(resultado.disponivel, true);
});

test("verificarDataEspecifica: evento de dia inteiro já existente bloqueia o dia mesmo sem pedir dia inteiro", () => {
  const eventos = [eventoDiaTodo({ dataInicio: "2026-07-10", dataFimExclusiva: "2026-07-11", summary: "Retiro" })];
  const resultado = verificarDataEspecifica(baseParamsData({ eventos }));
  assert.equal(resultado.disponivel, false);
  assert.equal(resultado.motivo, "dia_ocupado");
  assert.equal(resultado.conflito.summary, "Retiro");
});

test("verificarDataEspecifica: pedir dia inteiro é bloqueado por qualquer evento existente no dia", () => {
  const eventos = [eventoHorario({ data: "2026-07-10", horaInicio: "10:00", horaFim: "11:00", summary: "Reunião" })];
  const resultado = verificarDataEspecifica(baseParamsData({ eventos, isDiaInteiro: true }));
  assert.equal(resultado.disponivel, false);
  assert.equal(resultado.motivo, "dia_ocupado");
});

test("verificarDataEspecifica: sem horarioInicio/horarioFim, só verifica o dia como um todo (retorna eventosNoDia)", () => {
  const eventos = [eventoHorario({ data: "2026-07-10", horaInicio: "09:00", horaFim: "10:00", summary: "Culto A" })];
  const resultado = verificarDataEspecifica(baseParamsData({ eventos }));
  assert.equal(resultado.disponivel, true);
  assert.equal(resultado.eventosNoDia.length, 1);
});

test("verificarDataEspecifica: horário pedido dentro do buffer de 1h de um evento existente conflita", () => {
  const eventos = [eventoHorario({ data: "2026-07-10", horaInicio: "19:00", horaFim: "20:00", summary: "Culto" })];
  const resultado = verificarDataEspecifica(baseParamsData({ eventos, horarioInicio: "20:30", horarioFim: "21:30" }));
  assert.equal(resultado.disponivel, false);
  assert.equal(resultado.motivo, "horario_conflito");
  assert.equal(resultado.conflito.summary, "Culto");
});

test("verificarDataEspecifica: horário pedido fora do buffer de 1h não conflita", () => {
  const eventos = [eventoHorario({ data: "2026-07-10", horaInicio: "19:00", horaFim: "20:00", summary: "Culto" })];
  const resultado = verificarDataEspecifica(baseParamsData({ eventos, horarioInicio: "21:05", horarioFim: "22:00" }));
  assert.equal(resultado.disponivel, true);
});

test("calcularJanelasLivres: dia sem eventos fica livre o dia comercial inteiro (07h-22h)", () => {
  const janelas = calcularJanelasLivres({ eventosNoDia: [], ano: ANO, mes: MES, dia: 10 });
  assert.deepEqual(janelas, [{ inicio: "07:00", fim: "22:00" }]);
});

test("calcularJanelasLivres: eventos no meio do dia abrem janelas antes/depois, com buffer de 1h", () => {
  const eventos = [
    eventoHorario({ data: "2026-07-10", horaInicio: "09:00", horaFim: "11:00", summary: "Culto A" }),
    eventoHorario({ data: "2026-07-10", horaInicio: "18:00", horaFim: "20:00", summary: "Culto B" }),
  ];
  const janelas = calcularJanelasLivres({ eventosNoDia: eventos, ano: ANO, mes: MES, dia: 10 });
  assert.deepEqual(janelas, [
    { inicio: "07:00", fim: "08:00" },
    { inicio: "12:00", fim: "17:00" },
    { inicio: "21:00", fim: "22:00" },
  ]);
});

test("calcularJanelasLivres: eventos próximos o suficiente se mesclam num único bloco ocupado", () => {
  const eventos = [
    eventoHorario({ data: "2026-07-10", horaInicio: "09:00", horaFim: "10:00", summary: "Culto A" }),
    eventoHorario({ data: "2026-07-10", horaInicio: "10:30", horaFim: "11:00", summary: "Culto B" }), // dentro do buffer de A
  ];
  const janelas = calcularJanelasLivres({ eventosNoDia: eventos, ano: ANO, mes: MES, dia: 10 });
  // Bloco ocupado mesclado: 08:00 (buffer antes de A) até 12:00 (buffer depois de B)
  assert.deepEqual(janelas, [
    { inicio: "07:00", fim: "08:00" },
    { inicio: "12:00", fim: "22:00" },
  ]);
});

test("calcularJanelasLivres: janelas menores que 30 minutos são descartadas", () => {
  const eventos = [
    eventoHorario({ data: "2026-07-10", horaInicio: "08:15", horaFim: "09:00", summary: "Culto A" }), // buffer deixa 07:00-07:15 (15min)
  ];
  const janelas = calcularJanelasLivres({ eventosNoDia: eventos, ano: ANO, mes: MES, dia: 10 });
  assert.ok(!janelas.some((j) => j.inicio === "07:00" && j.fim === "07:15"), "janela de 15min não deveria aparecer");
});

test("montarMensagemDataEspecificaBloqueada: mensagens específicas por motivo", () => {
  assert.match(
    montarMensagemDataEspecificaBloqueada({ motivo: "sabado_livre", dataFormatada: "04/07" }),
    /04\/07.*Sábado LIVRE.*Evangelismo/s
  );
  assert.match(
    montarMensagemDataEspecificaBloqueada({ motivo: "ruach_reservado", dataFormatada: "25/07" }),
    /25\/07.*Rede Ruach/s
  );
  assert.match(
    montarMensagemDataEspecificaBloqueada({ motivo: "dia_ocupado", dataFormatada: "10/07", conflito: { summary: "Retiro" } }),
    /10\/07.*Retiro/s
  );
  assert.match(
    montarMensagemDataEspecificaBloqueada({
      motivo: "horario_conflito",
      dataFormatada: "10/07",
      conflito: { summary: "Culto", start: { dateTime: "2026-07-10T19:00:00-03:00" }, end: { dateTime: "2026-07-10T20:00:00-03:00" } },
    }),
    /Culto.*19:00.*20:00.*10\/07/s
  );
});
