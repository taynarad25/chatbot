const { test } = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const { agruparEventosAgenda, montarMensagemAgenda, montarMensagemAgendaCompletaPorSecoes, montarDetalheEvento, interpretarPeriodoPersonalizado, isEventoFuturo, URL_THE_CHOSEN, isEventoTheChosen } = require("../bot/agenda");
const { AGENDAS_INTERNAS } = require("../bot/redes");

function evento({ data, hora, horaFim, summary, location, description, diaTodo = false }) {
  if (diaTodo) {
    return { summary, location, description, start: { date: data }, end: { date: data } };
  }
  const start = moment.tz(`${data} ${hora}`, "YYYY-MM-DD HH:mm", "America/Sao_Paulo").format();
  const end = moment.tz(`${data} ${horaFim}`, "YYYY-MM-DD HH:mm", "America/Sao_Paulo").format();
  return { summary, location, description, start: { dateTime: start }, end: { dateTime: end } };
}

test("agruparEventosAgenda: 3+ ocorrências do mesmo nome/horário/dia da semana viram um item recorrente", () => {
  const eventos = [
    evento({ data: "2026-07-02", hora: "19:30", horaFim: "21:00", summary: "Reunião de Intercessão" }),
    evento({ data: "2026-07-09", hora: "19:30", horaFim: "21:00", summary: "Reunião de Intercessão" }),
    evento({ data: "2026-07-16", hora: "19:30", horaFim: "21:00", summary: "Reunião de Intercessão" }),
  ];

  const itens = agruparEventosAgenda(eventos);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].tipo, "recorrente");
  assert.equal(itens[0].eventos.length, 3);
});

test("agruparEventosAgenda: menos de 3 ocorrências viram itens únicos separados", () => {
  const eventos = [
    evento({ data: "2026-07-05", hora: "18:00", horaFim: "20:00", summary: "Culto de Celebração" }),
    evento({ data: "2026-07-12", hora: "08:30", horaFim: "09:30", summary: "Santa Ceia" }),
  ];

  const itens = agruparEventosAgenda(eventos);
  assert.equal(itens.length, 2);
  assert.ok(itens.every(i => i.tipo === "unico"));
});

test("agruparEventosAgenda: ordena os itens cronologicamente", () => {
  const eventos = [
    evento({ data: "2026-07-20", hora: "15:00", horaFim: "17:00", summary: "Encontro Rede de Mulheres" }),
    evento({ data: "2026-07-05", hora: "18:00", horaFim: "20:00", summary: "Culto de Celebração" }),
  ];

  const itens = agruparEventosAgenda(eventos);
  assert.equal(itens[0].summary, "Culto de Celebração");
  assert.equal(itens[1].summary, "Encontro Rede de Mulheres");
});

test("montarMensagemAgenda: numera os itens e usa 'Todas as' para dia de semana, 'Todos os' para fim de semana", () => {
  const recorrenteQuinta = agruparEventosAgenda([
    evento({ data: "2026-07-02", hora: "19:30", horaFim: "21:00", summary: "Intercessão" }),
    evento({ data: "2026-07-09", hora: "19:30", horaFim: "21:00", summary: "Intercessão" }),
    evento({ data: "2026-07-16", hora: "19:30", horaFim: "21:00", summary: "Intercessão" }),
  ]);
  const msgQuinta = montarMensagemAgenda(recorrenteQuinta, "Julho");
  assert.match(msgQuinta, /1 - 🗓️ \*Todas as Quintas-feiras\* às 19:30 \| Intercessão/);

  const recorrenteSabado = agruparEventosAgenda([
    evento({ data: "2026-07-04", hora: "15:00", horaFim: "17:00", summary: "Encontro" }),
    evento({ data: "2026-07-11", hora: "15:00", horaFim: "17:00", summary: "Encontro" }),
    evento({ data: "2026-07-18", hora: "15:00", horaFim: "17:00", summary: "Encontro" }),
  ]);
  const msgSabado = montarMensagemAgenda(recorrenteSabado, "Julho");
  assert.match(msgSabado, /1 - 🗓️ \*Todos os Sábados\* às 15:00 \| Encontro/);
});

test("montarMensagemAgenda: item único usa 📌 com a data e inclui o rodapé de instrução", () => {
  const itens = agruparEventosAgenda([
    evento({ data: "2026-07-12", hora: "08:30", horaFim: "09:30", summary: "Santa Ceia" }),
  ]);
  const msg = montarMensagemAgenda(itens, "Julho");
  assert.match(msg, /1 - 📌 \*12\/07\* às 08:30 \| Santa Ceia/);
  assert.match(msg, /Digite o número dele/);
  assert.match(msg, /Digite \*menu\* para voltar ao menu principal\./);
});

test("montarDetalheEvento: item único mostra data, horário, local e descrição", () => {
  const itens = agruparEventosAgenda([
    evento({
      data: "2026-07-18", hora: "15:00", horaFim: "17:00",
      summary: "Encontro Rede de Mulheres",
      location: "Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi",
      description: "Traga uma amiga!",
    }),
  ]);
  const detalhe = montarDetalheEvento(itens[0]);
  assert.match(detalhe, /📌 \*Encontro Rede de Mulheres\*/);
  assert.match(detalhe, /📆 \*Data:\* 18\/07 \(Sábado\)/);
  assert.match(detalhe, /⏰ \*Horário:\* 15:00 às 17:00/);
  assert.match(detalhe, /📍 \*Local:\* Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi/);
  assert.match(detalhe, /📝 \*Descrição:\* Traga uma amiga!/);
});

test("montarDetalheEvento: omite as linhas de local e descrição quando ausentes no Google Agenda", () => {
  const itens = agruparEventosAgenda([
    evento({ data: "2026-07-18", hora: "15:00", horaFim: "17:00", summary: "Encontro" }),
  ]);
  const detalhe = montarDetalheEvento(itens[0]);
  assert.doesNotMatch(detalhe, /📍 \*Local:\*/);
  assert.doesNotMatch(detalhe, /📝 \*Descrição:\*/);
});

test("montarDetalheEvento: trunca descrições muito longas em 500 caracteres", () => {
  const descricaoLonga = "x".repeat(800);
  const itens = agruparEventosAgenda([
    evento({ data: "2026-07-18", hora: "15:00", horaFim: "17:00", summary: "Encontro", description: descricaoLonga }),
  ]);
  const detalhe = montarDetalheEvento(itens[0]);
  const linhaDescricao = detalhe.split("\n").find(l => l.startsWith("📝 *Descrição:*"));
  assert.ok(linhaDescricao.endsWith("…"));
  assert.equal(linhaDescricao.replace("📝 *Descrição:* ", "").length, 501); // 500 chars + reticências
});

test("montarDetalheEvento: evento de dia inteiro mostra 'Dia todo' como horário", () => {
  const itens = agruparEventosAgenda([
    evento({ data: "2026-07-18", summary: "Retiro", diaTodo: true }),
  ]);
  const detalhe = montarDetalheEvento(itens[0]);
  assert.match(detalhe, /⏰ \*Horário:\* Dia todo/);
});

test("montarDetalheEvento: item recorrente mostra a próxima ocorrência a partir de hoje", () => {
  // Offsets múltiplos de 7 dias garantem o mesmo dia da semana, condição para agrupar como recorrente
  const passada = moment.tz("America/Sao_Paulo").subtract(14, "day");
  const proxima = moment.tz("America/Sao_Paulo").add(7, "day");
  const futuraDistante = moment.tz("America/Sao_Paulo").add(14, "day");

  const eventos = [
    evento({ data: passada.format("YYYY-MM-DD"), hora: "19:30", horaFim: "21:00", summary: "Intercessão", location: "Local Passado" }),
    evento({ data: proxima.format("YYYY-MM-DD"), hora: "19:30", horaFim: "21:00", summary: "Intercessão", location: "Local Próximo" }),
    evento({ data: futuraDistante.format("YYYY-MM-DD"), hora: "19:30", horaFim: "21:00", summary: "Intercessão", location: "Local Futuro" }),
  ];

  const itens = agruparEventosAgenda(eventos);
  assert.equal(itens[0].tipo, "recorrente");
  const detalhe = montarDetalheEvento(itens[0]);
  assert.match(detalhe, /Local Próximo/);
});

test("montarDetalheEvento: item recorrente cujas ocorrências já passaram mostra a última disponível", () => {
  const ha21dias = moment.tz("America/Sao_Paulo").subtract(21, "day");
  const ha14dias = moment.tz("America/Sao_Paulo").subtract(14, "day");
  const ha7dias = moment.tz("America/Sao_Paulo").subtract(7, "day");

  const eventos = [
    evento({ data: ha21dias.format("YYYY-MM-DD"), hora: "19:30", horaFim: "21:00", summary: "Intercessão", location: "Mais antigo" }),
    evento({ data: ha14dias.format("YYYY-MM-DD"), hora: "19:30", horaFim: "21:00", summary: "Intercessão", location: "Meio" }),
    evento({ data: ha7dias.format("YYYY-MM-DD"), hora: "19:30", horaFim: "21:00", summary: "Intercessão", location: "Mais recente" }),
  ];

  const itens = agruparEventosAgenda(eventos);
  assert.equal(itens[0].tipo, "recorrente");
  const detalhe = montarDetalheEvento(itens[0]);
  assert.match(detalhe, /Mais recente/);
});

// "Hoje" fixo para tornar os testes de período determinísticos, independente da data real de execução
const HOJE_REF = moment.tz("2026-07-15", "YYYY-MM-DD", "America/Sao_Paulo");

test("interpretarPeriodoPersonalizado: aceita um período futuro válido", () => {
  const r = interpretarPeriodoPersonalizado("20/07 a 25/07", HOJE_REF);
  assert.equal(r.ok, true);
  assert.equal(r.inicio.format("DD/MM"), "20/07");
  assert.equal(r.fim.format("DD/MM"), "25/07");
});

test("interpretarPeriodoPersonalizado: aceita 'até' e '-' como separador, além de 'a'", () => {
  assert.equal(interpretarPeriodoPersonalizado("20/07 até 25/07", HOJE_REF).ok, true);
  assert.equal(interpretarPeriodoPersonalizado("20/07 - 25/07", HOJE_REF).ok, true);
});

test("interpretarPeriodoPersonalizado: aceita o dia de hoje como data inicial", () => {
  const r = interpretarPeriodoPersonalizado("15/07 a 20/07", HOJE_REF);
  assert.equal(r.ok, true);
});

test("interpretarPeriodoPersonalizado: rejeita data inicial no passado", () => {
  const r = interpretarPeriodoPersonalizado("10/07 a 20/07", HOJE_REF);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /não pode estar no passado/);
});

test("interpretarPeriodoPersonalizado: rejeita período inteiramente no passado", () => {
  const r = interpretarPeriodoPersonalizado("01/07 a 05/07", HOJE_REF);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /não pode estar no passado/);
});

test("interpretarPeriodoPersonalizado: rejeita texto em formato não reconhecido", () => {
  const r = interpretarPeriodoPersonalizado("qualquer coisa", HOJE_REF);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /Não consegui entender as datas/);
});

test("interpretarPeriodoPersonalizado: rejeita dia/mês fora do intervalo válido", () => {
  const r = interpretarPeriodoPersonalizado("35/13 a 40/13", HOJE_REF);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /Não consegui entender as datas/);
});

test("interpretarPeriodoPersonalizado: rejeita data final antes da inicial", () => {
  const r = interpretarPeriodoPersonalizado("25/07 a 20/07", HOJE_REF);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /data final deve ser igual ou depois/);
});

test("interpretarPeriodoPersonalizado: rejeita período maior que 90 dias", () => {
  const r = interpretarPeriodoPersonalizado("15/07 a 30/11", HOJE_REF);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /muito longo/);
});

test("interpretarPeriodoPersonalizado: período que cruza o ano novo (mês final menor que o inicial) é aceito", () => {
  const hojeDezembro = moment.tz("2026-12-20", "YYYY-MM-DD", "America/Sao_Paulo");
  const r = interpretarPeriodoPersonalizado("28/12 a 05/01", hojeDezembro);
  assert.equal(r.ok, true);
  assert.equal(r.inicio.format("DD/MM/YYYY"), "28/12/2026");
  assert.equal(r.fim.format("DD/MM/YYYY"), "05/01/2027");
  assert.ok(r.fim.isAfter(r.inicio));
});

test("interpretarPeriodoPersonalizado: mesmo mês com dia final menor não é tratado como virada de ano (continua erro de data invertida)", () => {
  const r = interpretarPeriodoPersonalizado("20/07 a 10/07", HOJE_REF);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /data final deve ser igual ou depois/);
});

test("interpretarPeriodoPersonalizado: período que cruza o ano novo ainda respeita o limite de 90 dias", () => {
  const hojeDezembro = moment.tz("2026-12-01", "YYYY-MM-DD", "America/Sao_Paulo");
  const r = interpretarPeriodoPersonalizado("01/12 a 15/04", hojeDezembro);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /muito longo/);
});

// ---------------------------------------------------------------------------
// isEventoFuturo — Filtro estrito de eventos futuros
// ---------------------------------------------------------------------------

test("isEventoFuturo: evento com horário no futuro retorna true", () => {
  const agora = moment.tz("2026-09-15 14:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  const ev = evento({ data: "2026-09-15", hora: "19:00", horaFim: "21:00", summary: "Culto Noite" });
  assert.equal(isEventoFuturo(ev, agora), true);
});

test("isEventoFuturo: evento com horário no passado retorna false", () => {
  const agora = moment.tz("2026-09-15 14:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  const ev = evento({ data: "2026-09-15", hora: "10:00", horaFim: "12:00", summary: "Culto Manhã" });
  assert.equal(isEventoFuturo(ev, agora), false);
});

test("isEventoFuturo: evento de dia anterior retorna false", () => {
  const agora = moment.tz("2026-09-15 14:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  const ev = evento({ data: "2026-09-14", hora: "20:00", horaFim: "22:00", summary: "Ontem" });
  assert.equal(isEventoFuturo(ev, agora), false);
});

test("isEventoFuturo: evento de dia posterior retorna true", () => {
  const agora = moment.tz("2026-09-15 14:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  const ev = evento({ data: "2026-09-16", hora: "09:00", horaFim: "11:00", summary: "Amanhã" });
  assert.equal(isEventoFuturo(ev, agora), true);
});

test("isEventoFuturo: evento de dia todo de hoje retorna true", () => {
  const agora = moment.tz("2026-09-15 14:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  const ev = evento({ data: "2026-09-15", diaTodo: true, summary: "Feriado" });
  assert.equal(isEventoFuturo(ev, agora), true);
});

test("isEventoFuturo: evento de dia todo de ontem retorna false", () => {
  const agora = moment.tz("2026-09-15 14:00", "YYYY-MM-DD HH:mm", "America/Sao_Paulo");
  const ev = evento({ data: "2026-09-14", diaTodo: true, summary: "Feriado Ontem" });
  assert.equal(isEventoFuturo(ev, agora), false);
});

test("isEventoFuturo: evento inválido ou nulo retorna false", () => {
  assert.equal(isEventoFuturo(null), false);
  assert.equal(isEventoFuturo({}), false);
});

test("Privacidade Pastoral: Direção (isPastor=false) vê apenas 'Atendimento Pastoral' sem nome do discípulo", () => {
  const evAtendimento = {
    calendarId: AGENDAS_INTERNAS.ATENDIMENTO,
    summary: "Atendimento Pastoral - Discípulo João da Silva",
    description: "Discípulo: João da Silva\nPastor: Roberto\nMotivo sensível",
    location: "Gabinete Pastoral",
    start: { dateTime: "2026-10-15T15:00:00-03:00" },
    end: { dateTime: "2026-10-15T16:00:00-03:00" },
  };

  const itens = agruparEventosAgenda([evAtendimento]);
  const msgAgenda = montarMensagemAgendaCompletaPorSecoes(itens, "Outubro", AGENDAS_INTERNAS, { isPastor: false });
  assert.match(msgAgenda, /Atendimento Pastoral/);
  assert.doesNotMatch(msgAgenda, /João da Silva/);

  // No detalhe do evento para Direção, oculta detalhes e nome
  const detalhe = montarDetalheEvento(itens[0], { isPastor: false, agendasInternas: AGENDAS_INTERNAS });
  assert.match(detalhe, /Atendimento Pastoral reservado à equipe pastoral/);
  assert.doesNotMatch(detalhe, /João da Silva/);
  assert.doesNotMatch(detalhe, /Motivo sensível/);
});

test("Privacidade Pastoral: Pastores (isPastor=true) visualizam nome do discípulo e detalhes completos", () => {
  const evAtendimento = {
    calendarId: AGENDAS_INTERNAS.ATENDIMENTO,
    summary: "Atendimento Pastoral - Discípulo João da Silva",
    description: "Discípulo: João da Silva\nPastor: Roberto\nMotivo sensível",
    location: "Gabinete Pastoral",
    start: { dateTime: "2026-10-15T15:00:00-03:00" },
    end: { dateTime: "2026-10-15T16:00:00-03:00" },
  };

  const itens = agruparEventosAgenda([evAtendimento]);
  const msgAgenda = montarMensagemAgendaCompletaPorSecoes(itens, "Outubro", AGENDAS_INTERNAS, { isPastor: true });
  assert.match(msgAgenda, /Atendimento Pastoral - Discípulo João da Silva/);

  // No detalhe do evento para Pastor, exibe o discípulo e descrição
  const detalhe = montarDetalheEvento(itens[0], { isPastor: true, agendasInternas: AGENDAS_INTERNAS });
  assert.match(detalhe, /João da Silva/);
  assert.match(detalhe, /Motivo sensível/);
});

test("Unificação Agenda Completa: horários de preparação/limpeza aparecem unificados sob o evento principal", () => {
  const evPrincipal = evento({
    data: "2026-09-20",
    hora: "18:00",
    horaFim: "21:00",
    summary: "Conferência Atos 2",
    location: "Salão Nobre",
  });
  const evPrepLimpeza = {
    summary: "[Preparação/Decoração] Conferência Atos 2",
    description: "Horários informados: 16:00 as 22:00\nEvento Principal: Conferência Atos 2",
    start: { dateTime: "2026-09-20T16:00:00-03:00" },
    end: { dateTime: "2026-09-20T22:00:00-03:00" },
  };

  const itens = agruparEventosAgenda([evPrincipal, evPrepLimpeza]);

  // Deve haver apenas 1 item (o evento de preparação foi unificado ao principal)
  assert.equal(itens.length, 1);
  assert.equal(itens[0].summary, "Conferência Atos 2");
  assert.match(itens[0].horarioPreparacaoLimpeza, /16:00 às 22:00 — horário para preparação e limpeza/);

  // Na agenda completa por seções, o horário de preparação aparece unificado com início e término
  const msgCompleta = montarMensagemAgendaCompletaPorSecoes(itens, "Setembro", AGENDAS_INTERNAS, { isPastor: false });
  assert.match(msgCompleta, /📌 \*20\/09\* às 18:00 \| Conferência Atos 2/);
  assert.match(msgCompleta, /⏰ 16:00 às 22:00 — horário para preparação e limpeza/);
  assert.doesNotMatch(msgCompleta, /\[Preparação\/Decoração\]/);

  // No detalhe do evento, a linha de preparação também está presente
  const detalhe = montarDetalheEvento(itens[0]);
  assert.match(detalhe, /🧹 \*Preparação e Limpeza:\* 16:00 às 22:00 — horário para preparação e limpeza/);
});

test("Unificação Agenda Completa: eventos múltiplos de pré-montagem e pós-limpeza unem início e término", () => {
  const evPrincipal = evento({
    data: "2026-10-10",
    hora: "19:00",
    horaFim: "21:30",
    summary: "Culto Especial de Celebração",
  });
  const evPre = {
    summary: "[Preparação] Culto Especial de Celebração",
    start: { dateTime: "2026-10-10T16:30:00-03:00" },
    end: { dateTime: "2026-10-10T19:00:00-03:00" },
  };
  const evPos = {
    summary: "[Limpeza] Culto Especial de Celebração",
    start: { dateTime: "2026-10-10T21:30:00-03:00" },
    end: { dateTime: "2026-10-10T23:00:00-03:00" },
  };

  const itens = agruparEventosAgenda([evPrincipal, evPre, evPos]);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].summary, "Culto Especial de Celebração");
  assert.match(itens[0].horarioPreparacaoLimpeza, /16:30 às 23:00 — horário para preparação e limpeza/);

  const msgCompleta = montarMensagemAgendaCompletaPorSecoes(itens, "Outubro", AGENDAS_INTERNAS);
  assert.match(msgCompleta, /⏰ 16:30 às 23:00 — horário para preparação e limpeza/);
  assert.doesNotMatch(msgCompleta, /\[Preparação\]/);
  assert.doesNotMatch(msgCompleta, /\[Limpeza\]/);
});

test("The Chosen na Agenda: montarMensagemAgenda inclui o link de inscrição quando o evento for The Chosen", () => {
  const evNormal = evento({ data: "2026-10-11", hora: "18:00", horaFim: "20:00", summary: "Culto de Celebração" });
  const evChosen = evento({ data: "2026-10-18", hora: "19:30", horaFim: "22:00", summary: "Pré-estreia The Chosen - Temporada 6 (Ep. 1)" });

  const itens = agruparEventosAgenda([evNormal, evChosen]);
  const msg = montarMensagemAgenda(itens, "Outubro");

  assert.match(msg, /1 - 📌 \*11\/10\* às 18:00 \| Culto de Celebração/);
  assert.match(msg, /2 - 📌 \*18\/10\* às 19:30 \| Pré-estreia The Chosen - Temporada 6 \(Ep\. 1\)/);
  assert.match(msg, /🎟️ \*Inscrição:\* https:\/\/www\.comunidadecristacurados\.com\.br\/the-chosen/);
});

test("The Chosen na Agenda Completa: montarMensagemAgendaCompletaPorSecoes inclui o link de inscrição", () => {
  const evChosen = evento({ data: "2026-10-18", hora: "19:30", horaFim: "22:00", summary: "Pré-estreia The Chosen" });
  const itens = agruparEventosAgenda([evChosen]);
  const msg = montarMensagemAgendaCompletaPorSecoes(itens, "Outubro", AGENDAS_INTERNAS);

  assert.match(msg, /1 - 📌 \*18\/10\* às 19:30 \| Pré-estreia The Chosen/);
  assert.match(msg, /🎟️ \*Inscrição:\* https:\/\/www\.comunidadecristacurados\.com\.br\/the-chosen/);
});

test("The Chosen nos Detalhes: montarDetalheEvento inclui o link de inscrição", () => {
  const evChosen = evento({
    data: "2026-10-18",
    hora: "19:30",
    horaFim: "22:00",
    summary: "Pré-estreia The Chosen - Temporada 6",
    location: "Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi",
    description: "Sessão especial de cinema com pipoca e suco gratuitos."
  });
  const itens = agruparEventosAgenda([evChosen]);
  const detalhe = montarDetalheEvento(itens[0]);

  assert.match(detalhe, /📌 \*Pré-estreia The Chosen - Temporada 6\*/);
  assert.match(detalhe, /🎟️ \*Inscrições:\* Garanta sua vaga acessando:/);
  assert.match(detalhe, /https:\/\/www\.comunidadecristacurados\.com\.br\/the-chosen/);
});

test("isEventoTheChosen: identifica corretamente eventos com variações do nome The Chosen", () => {
  assert.equal(isEventoTheChosen({ summary: "Pré-estreia The Chosen" }), true);
  assert.equal(isEventoTheChosen({ summary: "The-Chosen Ep 1" }), true);
  assert.equal(isEventoTheChosen({ summary: "Sessão Chosen" }), true);
  assert.equal(isEventoTheChosen({ eventos: [{ summary: "The Chosen Season 6" }] }), true);
  assert.equal(isEventoTheChosen({ summary: "Culto de Domingo" }), false);
  assert.equal(isEventoTheChosen(null), false);
});


