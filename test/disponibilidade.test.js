process.env.TZ = "America/Sao_Paulo";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const {
  verificarConflitoCultoDomingo,
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

// "Hoje" fixo, anterior a todas as datas usadas nos testes abaixo — evita que os
// testes comecem a falhar sozinhos no futuro por causa da regra de "não pode
// agendar em data passada" (que compara contra o relógio real por padrão).
const AGORA_FIXO = moment.tz("01/07/2026", "D/M/YYYY", "America/Sao_Paulo");

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
    horarioInicio: "14:00",
    horarioFim: "15:00",
    rede: "Rede de Casais",
    agora: AGORA_FIXO,
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

test("calcularDisponibilidade: dias antes de 'hoje' não entram na lista de disponíveis", () => {
  // "Hoje" no meio do mês: dias 1 a 9 já passaram, dia 10 em diante ainda vale.
  const agora = moment.tz("10/07/2026", "D/M/YYYY", "America/Sao_Paulo");
  const { disponiveis } = calcularDisponibilidade(baseParams({ agora }));
  assert.equal(disponiveis.length, 22); // 31 - 9 dias já passados
  disponiveis.forEach((d) => assert.ok(d.getDate() >= 10));
});

test("calcularDisponibilidade: o próprio dia de hoje ainda conta como disponível", () => {
  const agora = moment.tz("10/07/2026", "D/M/YYYY", "America/Sao_Paulo");
  const { disponiveis } = calcularDisponibilidade(baseParams({ agora, diaSemanaFiltro: 5 })); // 5 = sexta, 10/07 é sexta
  assert.ok(disponiveis.some((d) => d.getDate() === 10));
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
  // 10/07/2026 é sexta-feira (diaSemanaFiltro: 5)
  const eventos = [eventoHorario({ data: "2026-07-10", horaInicio: "10:00", horaFim: "11:00", summary: "Reunião qualquer" })];
  const { disponiveis, conflito } = calcularDisponibilidade(baseParams({ eventos, isDiaInteiro: true, diaSemanaFiltro: 5 }));

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

test("calcularDisponibilidade: sábados do mês estão disponíveis para qualquer rede (sem reserva para Ruach)", () => {
  const { disponiveis } = calcularDisponibilidade(baseParams({ diaSemanaFiltro: 6, rede: "Rede de Casais" }));
  // sábados de julho/2026: 4, 11, 18, 25 — todos disponíveis para qualquer rede
  assert.deepEqual(disponiveis.map((d) => d.getDate()), [4, 11, 18, 25]);
});

test("calcularDisponibilidade: com só 1 sábado disponível, qualquer rede pode agendá-lo", () => {
  // Bloqueia os 3 primeiros sábados via conflito de dia inteiro, sobrando só o dia 25
  const eventosConflito = [4, 11, 18].map((dia) =>
    eventoHorario({ data: `2026-07-${String(dia).padStart(2, "0")}`, horaInicio: "00:00", horaFim: "23:59", summary: "Ocupado" })
  );
  const { disponiveis } = calcularDisponibilidade(
    baseParams({ eventos: eventosConflito, diaSemanaFiltro: 6, isDiaInteiro: true, rede: "Rede de Casais" })
  );
  assert.deepEqual(disponiveis.map((d) => d.getDate()), [25]);
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
    agora: AGORA_FIXO,
    ...overrides,
  };
}

test("verificarDataEspecifica: dia livre sem eventos fica disponível", () => {
  const resultado = verificarDataEspecifica(baseParamsData());
  assert.equal(resultado.disponivel, true);
  assert.equal(resultado.dataFormatada, "10/07");
});

test("verificarDataEspecifica: dia antes de 'hoje' é recusado como data passada", () => {
  const agora = moment.tz("15/07/2026", "D/M/YYYY", "America/Sao_Paulo");
  const resultado = verificarDataEspecifica(baseParamsData({ agora, dia: 10 }));
  assert.equal(resultado.disponivel, false);
  assert.equal(resultado.motivo, "data_passada");
  assert.equal(resultado.dataFormatada, "10/07");
});

test("verificarDataEspecifica: o próprio dia de hoje não é considerado passado", () => {
  const agora = moment.tz("10/07/2026", "D/M/YYYY", "America/Sao_Paulo");
  const resultado = verificarDataEspecifica(baseParamsData({ agora, dia: 10 }));
  assert.notEqual(resultado.motivo, "data_passada");
});

test("montarMensagemDataEspecificaBloqueada: mensagem clara para data passada", () => {
  const mensagem = montarMensagemDataEspecificaBloqueada({ motivo: "data_passada", dataFormatada: "10/07" });
  assert.match(mensagem, /10\/07 já passou/);
  assert.match(mensagem, /a partir de hoje/);
});

test("verificarDataEspecifica: 'Sábado LIVRE' do Evangelismo bloqueia o dia", () => {
  const eventos = [eventoDiaTodo({ dataInicio: "2026-07-04", dataFimExclusiva: "2026-07-05", summary: "Sábado LIVRE", calendarId: EVANGELISMO_ID })];
  const resultado = verificarDataEspecifica(baseParamsData({ eventos, dia: 4 }));
  assert.equal(resultado.disponivel, false);
  assert.equal(resultado.motivo, "sabado_livre");
});

test("verificarDataEspecifica: último sábado do mês está disponível para qualquer rede (sem reserva para Ruach)", () => {
  // sábados de julho/2026: 4, 11, 18, 25 — o dia 25 está livre para qualquer rede
  const resultado = verificarDataEspecifica(baseParamsData({ dia: 25, rede: "Rede de Casais" }));
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

// ============================================================================
// TESTES DE BLOQUEIO DOS CULTOS AOS DOMINGOS E SANTA CEIA
// ============================================================================

test("verificarConflitoCultoDomingo: dias de semana (segunda a sábado) não têm conflito", () => {
  // 04/07/2026 é sábado, 06/07/2026 é segunda-feira
  const sab = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 4, horarioInicio: "19:00", horarioFim: "21:00" });
  assert.equal(sab.conflito, false);

  const seg = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 6, isDiaInteiro: true });
  assert.equal(seg.conflito, false);
});

test("verificarConflitoCultoDomingo: 1º domingo do mês (Santa Ceia) bloqueia eventos de DIA TODO e eventos até as 13h", () => {
  // 05/07/2026 é o 1º domingo de julho de 2026 (dia 5 <= 7)
  const diaTodo = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 5, isDiaInteiro: true });
  assert.equal(diaTodo.conflito, true);
  assert.equal(diaTodo.subtipo, "ceia");
  assert.match(diaTodo.mensagem, /Santa Ceia.*08h30.*13h/);

  const manha = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 5, horarioInicio: "09:00", horarioFim: "11:00" });
  assert.equal(manha.conflito, true);
  assert.equal(manha.subtipo, "ceia");
  assert.match(manha.mensagem, /Santa Ceia.*08h30.*13h/);

  const cruzando13h = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 5, horarioInicio: "12:00", horarioFim: "14:00" });
  assert.equal(cruzando13h.conflito, true);
  assert.equal(cruzando13h.subtipo, "ceia");
});

test("verificarConflitoCultoDomingo: 1º domingo do mês permite eventos a partir das 13h", () => {
  // 05/07/2026 das 13:00 às 15:00 ou 14:00 às 17:00
  const tarde = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 5, horarioInicio: "13:00", horarioFim: "15:00" });
  assert.equal(tarde.conflito, false);

  const noite = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 5, horarioInicio: "15:00", horarioFim: "18:00" });
  assert.equal(noite.conflito, false);
});

test("verificarConflitoCultoDomingo: demais domingos bloqueiam eventos de DIA TODO e eventos a partir das 16h", () => {
  // 12/07/2026 é o 2º domingo de julho de 2026 (dia 12 > 7)
  const diaTodo = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 12, isDiaInteiro: true });
  assert.equal(diaTodo.conflito, true);
  assert.equal(diaTodo.subtipo, "culto_domingo");
  assert.match(diaTodo.mensagem, /Culto de Celebração.*18h.*16h/);

  const noite = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 12, horarioInicio: "18:00", horarioFim: "20:00" });
  assert.equal(noite.conflito, true);
  assert.equal(noite.subtipo, "culto_domingo");

  const fimApos16h = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 12, horarioInicio: "15:00", horarioFim: "17:00" });
  assert.equal(fimApos16h.conflito, true);
  assert.equal(fimApos16h.subtipo, "culto_domingo");
});

test("verificarConflitoCultoDomingo: demais domingos permitem eventos terminando até as 16h", () => {
  // 12/07/2026 das 09:00 às 11:30 ou das 14:00 às 16:00
  const manha = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 12, horarioInicio: "09:00", horarioFim: "11:30" });
  assert.equal(manha.conflito, false);

  const tardeAte16h = verificarConflitoCultoDomingo({ ano: 2026, mes: 7, dia: 12, horarioInicio: "14:00", horarioFim: "16:00" });
  assert.equal(tardeAte16h.conflito, false);
});

test("calcularJanelasLivres: no 1º domingo a janela inicia às 13:00 e nos demais encerra às 16:00", () => {
  // 1º domingo (05/07/2026)
  const janelasCeia = calcularJanelasLivres({ eventosNoDia: [], ano: 2026, mes: 7, dia: 5 });
  assert.deepEqual(janelasCeia, [{ inicio: "13:00", fim: "22:00" }]);

  // 2º domingo (12/07/2026)
  const janelasCulto = calcularJanelasLivres({ eventosNoDia: [], ano: 2026, mes: 7, dia: 12 });
  assert.deepEqual(janelasCulto, [{ inicio: "07:00", fim: "16:00" }]);
});

test("verificarDataEspecifica: bloqueia cultos de domingo e retorna motivo culto_domingo", () => {
  // 1º domingo antes das 13h
  const resCeia = verificarDataEspecifica({
    eventos: [],
    evangelismoCalendarId: EVANGELISMO_ID,
    ano: 2026,
    mes: 7,
    dia: 5,
    horarioInicio: "10:00",
    horarioFim: "12:00",
    agora: AGORA_FIXO,
  });
  assert.equal(resCeia.disponivel, false);
  assert.equal(resCeia.motivo, "culto_domingo");
  assert.equal(resCeia.subtipo, "ceia");
  assert.match(montarMensagemDataEspecificaBloqueada(resCeia), /Santa Ceia.*13h/);

  // Demais domingos após as 16h
  const resCulto = verificarDataEspecifica({
    eventos: [],
    evangelismoCalendarId: EVANGELISMO_ID,
    ano: 2026,
    mes: 7,
    dia: 19,
    horarioInicio: "17:00",
    horarioFim: "19:00",
    agora: AGORA_FIXO,
  });
  assert.equal(resCulto.disponivel, false);
  assert.equal(resCulto.motivo, "culto_domingo");
  assert.equal(resCulto.subtipo, "culto_domingo");
  assert.match(montarMensagemDataEspecificaBloqueada(resCulto), /Culto de Celebração.*16h/);
});

