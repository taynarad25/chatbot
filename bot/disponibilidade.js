const moment = require("moment-timezone");

const DIAS_SEMANA_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Calcula as datas disponíveis num mês para um novo evento de agendamento.
 * Não faz nenhuma chamada de rede — `eventos` já deve vir buscado via buscarEventos().
 *
 * Regras aplicadas, nesta ordem:
 * 1. Um dia marcado como "Sábado LIVRE" na agenda do Evangelismo bloqueia esse dia
 *    para qualquer outro agendamento.
 * 2. Se o novo evento é de dia inteiro, qualquer evento existente no dia o bloqueia.
 * 3. Se o novo evento tem horário, verifica sobreposição com buffer de 1h antes/depois
 *    de cada evento existente no dia; um evento existente de dia inteiro sempre bloqueia.
 * 4. Exceção da Rede Ruach: entre os sábados disponíveis, o último fica reservado para
 *    a Ruach — outras redes não podem escolhê-lo (a lista de disponíveis perde o último
 *    item, ou fica vazia se só havia um).
 *
 * @returns {{ disponiveis: Date[], conflito: object|null }} conflito guarda apenas o
 *   primeiro conflito encontrado (na ordem cronológica), para a mensagem de erro.
 */
function calcularDisponibilidade({
  eventos,
  evangelismoCalendarId,
  ano,
  mes, // 1-12
  diaSemanaFiltro, // 0-6 ou "TODOS"
  isDiaInteiro,
  horarioInicio, // "HH:MM", ignorado se isDiaInteiro
  horarioFim, // "HH:MM", ignorado se isDiaInteiro
  rede,
}) {
  let firstConflictDetails = null;

  const isSabadoLivreEvangelismo = (ev) =>
    ev.calendarId === evangelismoCalendarId && ev.summary && ev.summary.toLowerCase().includes("sábado livre");

  const sabadosLivresEvangelismo = eventos
    .filter(isSabadoLivreEvangelismo)
    .map((ev) => moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo").startOf("day").format("YYYY-MM-DD"));

  let diasPossiveis = [];
  let dataCursor = new Date(ano, mes - 1, 1);
  while (dataCursor.getMonth() === mes - 1) {
    if (diaSemanaFiltro === "TODOS" || dataCursor.getDay() === diaSemanaFiltro) {
      diasPossiveis.push(new Date(dataCursor));
    }
    dataCursor.setDate(dataCursor.getDate() + 1);
  }

  let disponiveis = diasPossiveis.filter((dataMsg) => {
    const dTarget = moment(dataMsg).tz("America/Sao_Paulo").startOf("day");
    const dTargetFormatted = dTarget.format("YYYY-MM-DD");

    if (sabadosLivresEvangelismo.includes(dTargetFormatted)) {
      if (!firstConflictDetails) {
        firstConflictDetails = { type: "sabado_livre", date: dTargetFormatted };
      }
      return false;
    }

    const eventosNoDia = eventos.filter((ev) => {
      if (isSabadoLivreEvangelismo(ev)) return false;

      const evStart = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo").startOf("day");
      let evEnd = moment.tz(ev.end.dateTime || ev.end.date, "America/Sao_Paulo");

      if (ev.start.date && !ev.start.dateTime) {
        // Evento de dia inteiro: o Google define o fim como o dia seguinte, exclusivo
        evEnd = moment.tz(ev.end.date, "America/Sao_Paulo").subtract(1, "day").endOf("day");
      } else {
        evEnd.endOf("day");
      }

      return dTarget.isBetween(evStart, evEnd, "day", "[]");
    });

    if (isDiaInteiro) {
      if (eventosNoDia.length > 0 && !firstConflictDetails) {
        const conflictingEv = eventosNoDia[0];
        firstConflictDetails = {
          type: "day_long_conflict",
          date: dTargetFormatted,
          summary: conflictingEv.summary || "Evento sem título",
          start: conflictingEv.start.dateTime || conflictingEv.start.date,
          end: conflictingEv.end.dateTime || conflictingEv.end.date,
        };
      }
      return eventosNoDia.length === 0;
    }

    const [hInicioNovo, mInicioNovo] = horarioInicio.split(":").map(Number);
    const [hFimNovo, mFimNovo] = horarioFim.split(":").map(Number);

    const newEventStartMoment = moment(dataMsg).set({ hour: hInicioNovo, minute: mInicioNovo, second: 0, millisecond: 0 });
    const newEventEndMoment = moment(dataMsg).set({ hour: hFimNovo, minute: mFimNovo, second: 0, millisecond: 0 });

    const bufferDuration = moment.duration(60, "minutes");

    for (const ev of eventosNoDia) {
      if (ev.start.date && !ev.start.dateTime) {
        // Evento existente de dia inteiro conflita com qualquer novo evento com horário
        return false;
      }

      const existingEventStart = moment.tz(ev.start.dateTime, "America/Sao_Paulo");
      const existingEventEnd = moment.tz(ev.end.dateTime, "America/Sao_Paulo");

      const bufferedExistingEventStart = existingEventStart.clone().subtract(bufferDuration);
      const bufferedExistingEventEnd = existingEventEnd.clone().add(bufferDuration);

      if (newEventStartMoment.isBefore(bufferedExistingEventEnd) && newEventEndMoment.isAfter(bufferedExistingEventStart)) {
        if (!firstConflictDetails) {
          firstConflictDetails = {
            type: "time_conflict",
            date: dTargetFormatted,
            summary: ev.summary || "Evento sem título",
            start: ev.start.dateTime,
            end: ev.end.dateTime,
          };
        }
        return false;
      }
    }
    return true;
  });

  if (diaSemanaFiltro === 6 && !rede.toLowerCase().includes("ruach")) {
    if (disponiveis.length > 1) {
      disponiveis.pop();
    } else {
      disponiveis = [];
    }
  }

  return { disponiveis, conflito: firstConflictDetails };
}

function montarMensagemConflito(conflito) {
  if (!conflito) {
    return "❌ Não há datas disponíveis para essas condições neste mês.";
  }
  if (conflito.type === "sabado_livre") {
    return `❌ Não há datas disponíveis para agendamento no dia ${moment(conflito.date).format("DD/MM")}. Este sábado está reservado como "Sábado LIVRE" do Evangelismo. Por favor, escolha outra data ou mês.`;
  }
  if (conflito.type === "day_long_conflict") {
    return `❌ Não há datas disponíveis para o seu evento de *DIA TODO* no dia ${moment(conflito.date).format("DD/MM")}. Já existe o evento "*${conflito.summary}*" agendado para este dia. Por favor, escolha outra data ou mês.`;
  }
  if (conflito.type === "time_conflict") {
    const conflictingEventStart = moment.tz(conflito.start, "America/Sao_Paulo").format("HH:mm");
    const conflictingEventEnd = moment.tz(conflito.end, "America/Sao_Paulo").format("HH:mm");
    return `❌ Não há datas disponíveis para o seu evento com o horário solicitado no dia ${moment(conflito.date).format("DD/MM")}.
Encontramos um conflito com o evento "*${conflito.summary}*" que ocorre das *${conflictingEventStart}* às *${conflictingEventEnd}*.
Por favor, tente agendar seu evento em outro horário ou data.`;
  }
  return "❌ Não há datas disponíveis para essas condições neste mês.";
}

function montarMensagemDatasDisponiveis(disponiveis, mes) {
  const mesFmt = String(mes).padStart(2, "0");
  let lista = "📅 *Datas Disponíveis:*\n\n";
  disponiveis.forEach((d, i) => {
    const diaFmt = String(d.getDate()).padStart(2, "0");
    lista += `${i + 1} - ${diaFmt}/${mesFmt} (${DIAS_SEMANA_ABREV[d.getDay()]})\n`;
  });
  return lista + "\nDigite o número da opção desejada:";
}

// Verifica se UMA data específica (não o mês inteiro) está disponível, e — se
// isDiaInteiro/horarioInicio/horarioFim não forem informados — só checa se o
// dia como um todo está bloqueado (Sábado LIVRE, exceção Ruach, evento de dia
// inteiro já existente), retornando os eventos do dia pra quem chamou poder
// sugerir horários livres. Reaproveita a mesma regra de "último sábado
// reservado pra Ruach" de calcularDisponibilidade, sem duplicar a lógica.
function verificarDataEspecifica({ eventos, evangelismoCalendarId, ano, mes, dia, rede, isDiaInteiro, horarioInicio, horarioFim }) {
  const dTarget = moment.tz(`${dia}/${mes}/${ano}`, "D/M/YYYY", "America/Sao_Paulo").startOf("day");
  const dTargetFormatted = dTarget.format("YYYY-MM-DD");
  const dataFormatada = dTarget.format("DD/MM");

  const isSabadoLivreEvangelismo = (ev) =>
    ev.calendarId === evangelismoCalendarId && ev.summary && ev.summary.toLowerCase().includes("sábado livre");

  const ehSabadoLivre = eventos.some((ev) =>
    isSabadoLivreEvangelismo(ev) &&
    moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo").startOf("day").format("YYYY-MM-DD") === dTargetFormatted
  );
  if (ehSabadoLivre) {
    return { disponivel: false, motivo: "sabado_livre", dataFormatada };
  }

  if (dTarget.day() === 6 && !rede.toLowerCase().includes("ruach")) {
    const { disponiveis: sabadosDoMes } = calcularDisponibilidade({
      eventos, evangelismoCalendarId, ano, mes, diaSemanaFiltro: 6, isDiaInteiro: true, rede,
    });
    const aindaDisponivel = sabadosDoMes.some((d) => moment(d).format("YYYY-MM-DD") === dTargetFormatted);
    if (!aindaDisponivel) {
      return { disponivel: false, motivo: "ruach_reservado", dataFormatada };
    }
  }

  const eventosNoDia = eventos.filter((ev) => {
    if (isSabadoLivreEvangelismo(ev)) return false;

    const evStart = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo").startOf("day");
    let evEnd = moment.tz(ev.end.dateTime || ev.end.date, "America/Sao_Paulo");

    if (ev.start.date && !ev.start.dateTime) {
      evEnd = moment.tz(ev.end.date, "America/Sao_Paulo").subtract(1, "day").endOf("day");
    } else {
      evEnd.endOf("day");
    }

    return dTarget.isBetween(evStart, evEnd, "day", "[]");
  });

  const existeEventoDiaInteiro = eventosNoDia.find((ev) => ev.start.date && !ev.start.dateTime);

  if (isDiaInteiro) {
    if (eventosNoDia.length > 0) {
      return { disponivel: false, motivo: "dia_ocupado", conflito: eventosNoDia[0], dataFormatada };
    }
    return { disponivel: true, dataFormatada };
  }

  if (existeEventoDiaInteiro) {
    return { disponivel: false, motivo: "dia_ocupado", conflito: existeEventoDiaInteiro, dataFormatada };
  }

  if (horarioInicio && horarioFim) {
    const [hInicio, mInicio] = horarioInicio.split(":").map(Number);
    const [hFim, mFim] = horarioFim.split(":").map(Number);
    const novoInicio = dTarget.clone().set({ hour: hInicio, minute: mInicio });
    const novoFim = dTarget.clone().set({ hour: hFim, minute: mFim });
    const buffer = moment.duration(60, "minutes");

    for (const ev of eventosNoDia) {
      const evInicio = moment.tz(ev.start.dateTime, "America/Sao_Paulo").subtract(buffer);
      const evFim = moment.tz(ev.end.dateTime, "America/Sao_Paulo").add(buffer);
      if (novoInicio.isBefore(evFim) && novoFim.isAfter(evInicio)) {
        return { disponivel: false, motivo: "horario_conflito", conflito: ev, dataFormatada };
      }
    }
  }

  return { disponivel: true, dataFormatada, eventosNoDia };
}

// Calcula as janelas de horário livres num dia específico, considerando 1h de
// buffer antes/depois de cada evento já marcado, dentro de uma janela "comercial"
// (7h-22h por padrão) — só pra dar uma sugestão útil, não é uma regra rígida.
function calcularJanelasLivres({ eventosNoDia, ano, mes, dia, inicioDiaHH = 7, fimDiaHH = 22 }) {
  const diaBase = moment.tz(`${dia}/${mes}/${ano}`, "D/M/YYYY", "America/Sao_Paulo").startOf("day");
  const limiteInicio = diaBase.clone().set({ hour: inicioDiaHH, minute: 0 });
  const limiteFim = diaBase.clone().set({ hour: fimDiaHH, minute: 0 });
  const buffer = moment.duration(60, "minutes");

  const ocupados = (eventosNoDia || [])
    .filter((ev) => ev.start.dateTime)
    .map((ev) => ({
      inicio: moment.tz(ev.start.dateTime, "America/Sao_Paulo").clone().subtract(buffer),
      fim: moment.tz(ev.end.dateTime, "America/Sao_Paulo").clone().add(buffer),
    }))
    .sort((a, b) => a.inicio - b.inicio);

  const mesclados = [];
  for (const bloco of ocupados) {
    const ultimo = mesclados[mesclados.length - 1];
    if (ultimo && bloco.inicio.isSameOrBefore(ultimo.fim)) {
      if (bloco.fim.isAfter(ultimo.fim)) ultimo.fim = bloco.fim;
    } else {
      mesclados.push({ inicio: bloco.inicio, fim: bloco.fim });
    }
  }

  const livres = [];
  let cursor = limiteInicio.clone();
  for (const bloco of mesclados) {
    const inicioBloco = moment.max(bloco.inicio, limiteInicio);
    if (inicioBloco.isAfter(cursor)) {
      livres.push({ inicio: cursor.format("HH:mm"), fim: inicioBloco.format("HH:mm") });
    }
    const fimBloco = moment.min(bloco.fim, limiteFim);
    if (fimBloco.isAfter(cursor)) cursor = fimBloco.clone();
  }
  if (cursor.isBefore(limiteFim)) {
    livres.push({ inicio: cursor.format("HH:mm"), fim: limiteFim.format("HH:mm") });
  }

  return livres.filter((janela) => {
    const [hInicio, mInicio] = janela.inicio.split(":").map(Number);
    const [hFim, mFim] = janela.fim.split(":").map(Number);
    return (hFim * 60 + mFim) - (hInicio * 60 + mInicio) >= 30;
  });
}

function montarMensagemDataEspecificaBloqueada(resultado) {
  const { motivo, conflito, dataFormatada } = resultado;

  if (motivo === "sabado_livre") {
    return `❌ O dia ${dataFormatada} está reservado como "Sábado LIVRE" do Evangelismo. Escolha outro dia, ou digite *menu* para recomeçar.`;
  }
  if (motivo === "ruach_reservado") {
    return `❌ O dia ${dataFormatada} é o último sábado disponível do mês, reservado para a Rede Ruach. Escolha outro dia, ou digite *menu* para recomeçar.`;
  }
  if (motivo === "dia_ocupado") {
    return `❌ O dia ${dataFormatada} já tem o evento "*${conflito.summary || "Evento sem título"}*" ocupando o dia (parcial ou integralmente). Escolha outro dia, ou digite *menu* para recomeçar.`;
  }
  if (motivo === "horario_conflito") {
    const inicio = moment.tz(conflito.start.dateTime, "America/Sao_Paulo").format("HH:mm");
    const fim = moment.tz(conflito.end.dateTime, "America/Sao_Paulo").format("HH:mm");
    return `❌ Esse horário conflita com o evento "*${conflito.summary || "Evento sem título"}*", das *${inicio}* às *${fim}*, no dia ${dataFormatada} (considerando 1h de intervalo antes/depois). Escolha outro horário, ou digite *menu* para recomeçar.`;
  }
  return `❌ O dia ${dataFormatada} não está disponível. Escolha outro dia, ou digite *menu* para recomeçar.`;
}

module.exports = {
  calcularDisponibilidade,
  montarMensagemConflito,
  montarMensagemDatasDisponiveis,
  verificarDataEspecifica,
  calcularJanelasLivres,
  montarMensagemDataEspecificaBloqueada,
};
