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
  let lista = "📅 *Datas Disponíveis:*\n\n";
  disponiveis.forEach((d, i) => {
    lista += `${i + 1} - ${d.getDate()}/${mes} (${DIAS_SEMANA_ABREV[d.getDay()]})\n`;
  });
  return lista + "\nDigite o número da opção desejada:";
}

module.exports = { calcularDisponibilidade, montarMensagemConflito, montarMensagemDatasDisponiveis };
