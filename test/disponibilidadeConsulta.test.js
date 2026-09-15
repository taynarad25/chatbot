const { test } = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const {
  consultarDisponibilidadeMesDiaSemana,
  formatarRelatorioDisponibilidade,
} = require("../bot/disponibilidade");

const EVANGELISMO_CALENDAR_ID = "694d1388f8f961bdbefed402fab5d498b44e0a489ec5fbcb3a40a5d1c3eda011@group.calendar.google.com";

function evento({ data, hora, horaFim, summary, diaTodo = false, calendarId = "outra_agenda@group.calendar.google.com" }) {
  if (diaTodo) {
    return {
      summary,
      calendarId,
      start: { date: data },
      end: { date: data },
    };
  }
  return {
    summary,
    calendarId,
    start: { dateTime: moment.tz(`${data} ${hora}`, "YYYY-MM-DD HH:mm", "America/Sao_Paulo").format() },
    end: { dateTime: moment.tz(`${data} ${horaFim}`, "YYYY-MM-DD HH:mm", "America/Sao_Paulo").format() },
  };
}

test("consultarDisponibilidadeMesDiaSemana: dia sem nenhum evento fica com status 'livre'", () => {
  const agora = moment.tz("2026-10-01 08:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  const dias = consultarDisponibilidadeMesDiaSemana({
    eventos: [],
    evangelismoCalendarId: EVANGELISMO_CALENDAR_ID,
    ano: 2026,
    mes: 10,
    diaSemanaFiltro: 2, // Terça-feira
    agora,
  });

  // Outubro de 2026: terças-feiras são 06/10, 13/10, 20/10, 27/10
  assert.equal(dias.length, 4);
  assert.equal(dias[0].dataFormatada, "06/10");
  assert.equal(dias[0].status, "livre");
  assert.deepEqual(dias[0].janelasLivres, [{ inicio: "07:00", fim: "22:00" }]);
});

test("consultarDisponibilidadeMesDiaSemana: dia com evento parcial calcula intervalos livres com buffer", () => {
  const agora = moment.tz("2026-10-01 08:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  // Evento das 19:30 às 21:00 em 06/10 (com buffer de 1h antes/depois, ocupa 18:30 às 22:00)
  const ev = evento({ data: "2026-10-06", hora: "19:30", horaFim: "21:00", summary: "Culto Departamento Secreto" });

  const dias = consultarDisponibilidadeMesDiaSemana({
    eventos: [ev],
    evangelismoCalendarId: EVANGELISMO_CALENDAR_ID,
    ano: 2026,
    mes: 10,
    diaSemanaFiltro: 2,
    agora,
  });

  assert.equal(dias[0].dataFormatada, "06/10");
  assert.equal(dias[0].status, "parcial");
  assert.deepEqual(dias[0].janelasLivres, [{ inicio: "07:00", fim: "18:30" }]);
});

test("consultarDisponibilidadeMesDiaSemana: dia com evento de dia inteiro fica indisponível", () => {
  const agora = moment.tz("2026-10-01 08:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  const ev = evento({ data: "2026-10-13", diaTodo: true, summary: "Congresso Confidencial" });

  const dias = consultarDisponibilidadeMesDiaSemana({
    eventos: [ev],
    evangelismoCalendarId: EVANGELISMO_CALENDAR_ID,
    ano: 2026,
    mes: 10,
    diaSemanaFiltro: 2,
    agora,
  });

  const dia13 = dias.find((d) => d.dataFormatada === "13/10");
  assert.ok(dia13);
  assert.equal(dia13.status, "indisponivel");
  assert.equal(dia13.janelasLivres.length, 0);
});

test("consultarDisponibilidadeMesDiaSemana: Sábado LIVRE do Evangelismo torna o sábado indisponível", () => {
  const agora = moment.tz("2026-10-01 08:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  const evSabadoLivre = evento({
    data: "2026-10-10",
    hora: "08:00",
    horaFim: "18:00",
    summary: "Sábado LIVRE",
    calendarId: EVANGELISMO_CALENDAR_ID,
  });

  const dias = consultarDisponibilidadeMesDiaSemana({
    eventos: [evSabadoLivre],
    evangelismoCalendarId: EVANGELISMO_CALENDAR_ID,
    ano: 2026,
    mes: 10,
    diaSemanaFiltro: 6, // Sábado
    agora,
  });

  const dia10 = dias.find((d) => d.dataFormatada === "10/10");
  assert.ok(dia10);
  assert.equal(dia10.status, "indisponivel");
});

test("consultarDisponibilidadeMesDiaSemana: não inclui datas no passado quando consultado o mês atual", () => {
  // Agora é 15/10/2026. As terças 06/10 e 13/10 já passaram!
  const agora = moment.tz("2026-10-15 14:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");

  const dias = consultarDisponibilidadeMesDiaSemana({
    eventos: [],
    evangelismoCalendarId: EVANGELISMO_CALENDAR_ID,
    ano: 2026,
    mes: 10,
    diaSemanaFiltro: 2, // Terça-feira
    agora,
  });

  // Apenas as terças futuras (20/10 e 27/10) devem aparecer
  assert.equal(dias.length, 2);
  assert.equal(dias[0].dataFormatada, "20/10");
  assert.equal(dias[1].dataFormatada, "27/10");
});

test("REGRA DE PRIVACIDADE RIGOROSA: formatarRelatorioDisponibilidade NUNCA vaza nomes ou detalhes de eventos", () => {
  const agora = moment.tz("2026-10-01 08:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  const ev1 = evento({ data: "2026-10-06", hora: "19:00", horaFim: "21:00", summary: "Culto Secreto de Jovens" });
  const ev2 = evento({ data: "2026-10-13", diaTodo: true, summary: "Reunião Confidencial da Diretoria" });

  const dias = consultarDisponibilidadeMesDiaSemana({
    eventos: [ev1, ev2],
    evangelismoCalendarId: EVANGELISMO_CALENDAR_ID,
    ano: 2026,
    mes: 10,
    diaSemanaFiltro: 2,
    agora,
  });

  const relatorio = formatarRelatorioDisponibilidade({
    dias,
    mesNome: "Outubro",
    diaSemanaTexto: "Terças-feiras",
  });

  // Valida que o relatório contém datas e horários
  assert.match(relatorio, /06\/10/);
  assert.match(relatorio, /13\/10/);
  assert.match(relatorio, /20\/10/);
  assert.match(relatorio, /27\/10/);
  assert.match(relatorio, /07:00 às 18:00/);

  // REGRA DE PRIVACIDADE: NENHUM termo dos eventos existentes pode estar presente na mensagem!
  assert.doesNotMatch(relatorio, /Culto Secreto/i);
  assert.doesNotMatch(relatorio, /Jovens/i);
  assert.doesNotMatch(relatorio, /Confidencial/i);
  assert.doesNotMatch(relatorio, /Diretoria/i);
  assert.doesNotMatch(relatorio, /Reunião/i);
});
