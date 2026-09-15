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
 *
 * @param {moment.Moment} [deps.agora] - momento de referência para "hoje" (dias antes disso
 *   nunca ficam disponíveis); parametrizável só para permitir testes determinísticos.
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
  agora = moment.tz("America/Sao_Paulo"),
}) {
  let firstConflictDetails = null;

  const isSabadoLivreEvangelismo = (ev) =>
    ev.calendarId === evangelismoCalendarId && ev.summary && ev.summary.toLowerCase().includes("sábado livre");

  const sabadosLivresEvangelismo = eventos
    .filter(isSabadoLivreEvangelismo)
    .map((ev) => moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo").startOf("day").format("YYYY-MM-DD"));

  const hojeSP = agora.clone().startOf("day");

  let diasPossiveis = [];
  let dataCursor = new Date(ano, mes - 1, 1);
  while (dataCursor.getMonth() === mes - 1) {
    const diaCorreto = diaSemanaFiltro === "TODOS" || dataCursor.getDay() === diaSemanaFiltro;
    const naoPassado = moment(dataCursor).tz("America/Sao_Paulo").startOf("day").isSameOrAfter(hojeSP);
    if (diaCorreto && naoPassado) {
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
// dia como um todo está bloqueado (Sábado LIVRE, evento de dia inteiro já
// existente), retornando os eventos do dia pra quem chamou poder sugerir horários livres.
function verificarDataEspecifica({ eventos, evangelismoCalendarId, ano, mes, dia, rede, isDiaInteiro, horarioInicio, horarioFim, agora = moment.tz("America/Sao_Paulo") }) {
  const dTarget = moment.tz(`${dia}/${mes}/${ano}`, "D/M/YYYY", "America/Sao_Paulo").startOf("day");
  const dTargetFormatted = dTarget.format("YYYY-MM-DD");
  const dataFormatada = dTarget.format("DD/MM");

  if (dTarget.isBefore(agora.clone().startOf("day"))) {
    return { disponivel: false, motivo: "data_passada", dataFormatada };
  }

  const isSabadoLivreEvangelismo = (ev) =>
    ev.calendarId === evangelismoCalendarId && ev.summary && ev.summary.toLowerCase().includes("sábado livre");

  const ehSabadoLivre = eventos.some((ev) =>
    isSabadoLivreEvangelismo(ev) &&
    moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo").startOf("day").format("YYYY-MM-DD") === dTargetFormatted
  );
  if (ehSabadoLivre) {
    return { disponivel: false, motivo: "sabado_livre", dataFormatada };
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

  if (motivo === "data_passada") {
    return `❌ O dia ${dataFormatada} já passou. Escolha uma data a partir de hoje, ou digite *menu* para recomeçar.`;
  }
  if (motivo === "sabado_livre") {
    return `❌ O dia ${dataFormatada} está reservado como "Sábado LIVRE" do Evangelismo. Escolha outro dia, ou digite *menu* para recomeçar.`;
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

const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

/**
 * Consulta a disponibilidade de datas num determinado mês e dia da semana (ou todos),
 * calculando para cada data apenas os horários livres/disponíveis.
 *
 * REGRA DE PRIVACIDADE RIGOROSA:
 * Não inclui nem retorna nome, assunto, descrição ou departamento de eventos existentes.
 * Retorna apenas o status da data e a lista de janelas de horários livres.
 *
 * @param {object} params
 * @param {Array} params.eventos - Lista de eventos buscados nas agendas
 * @param {string} [params.evangelismoCalendarId] - Calendar ID do evangelismo (Sábado LIVRE)
 * @param {number} params.ano - Ano de consulta (ex: 2026)
 * @param {number} params.mes - Mês de 1 a 12
 * @param {number|string} params.diaSemanaFiltro - 0-6 (0=Dom, 1=Seg... 6=Sáb) ou "TODOS"
 * @param {moment.Moment} [params.agora] - Momento atual (para não mostrar horários passados)
 * @returns {Array<{ dataFormatada: string, diaSemanaNome: string, status: "livre"|"parcial"|"indisponivel", janelasLivres: Array<{ inicio: string, fim: string }> }>}
 */
function consultarDisponibilidadeMesDiaSemana({
  eventos = [],
  evangelismoCalendarId,
  ano,
  mes,
  diaSemanaFiltro,
  agora = moment.tz("America/Sao_Paulo"),
}) {
  const hojeSP = agora.clone().startOf("day");
  const isSabadoLivreEvangelismo = (ev) =>
    ev.calendarId === evangelismoCalendarId && ev.summary && ev.summary.toLowerCase().includes("sábado livre");

  const sabadosLivres = new Set(
    eventos
      .filter(isSabadoLivreEvangelismo)
      .map((ev) => moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo").startOf("day").format("YYYY-MM-DD"))
  );

  const dias = [];
  const cursor = moment.tz([ano, mes - 1, 1], "America/Sao_Paulo");
  const fimMes = cursor.clone().endOf("month");

  while (cursor.isSameOrBefore(fimMes, "day")) {
    const diaSemana = cursor.day(); // 0 a 6
    const correspondeDia = diaSemanaFiltro === "TODOS" || diaSemana === diaSemanaFiltro;
    const ehFuturoOuHoje = cursor.isSameOrAfter(hojeSP, "day");

    if (correspondeDia && ehFuturoOuHoje) {
      const dataStr = cursor.format("YYYY-MM-DD");
      const diaNum = cursor.date();
      const dataFormatada = cursor.format("DD/MM");
      const diaSemanaNome = DIAS_SEMANA[diaSemana];

      // 1. Sábado LIVRE?
      if (sabadosLivres.has(dataStr)) {
        dias.push({
          dataFormatada,
          diaSemanaNome,
          status: "indisponivel",
          janelasLivres: [],
        });
        cursor.add(1, "day");
        continue;
      }

      // 2. Eventos no dia
      const eventosNoDia = eventos.filter((ev) => {
        if (isSabadoLivreEvangelismo(ev)) return false;
        if (ev.status === "cancelled") return false;

        const evStart = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo").startOf("day");
        let evEnd;
        if (ev.start.date && !ev.start.dateTime) {
          if (ev.end?.date && moment.tz(ev.end.date, "America/Sao_Paulo").isAfter(evStart)) {
            evEnd = moment.tz(ev.end.date, "America/Sao_Paulo").subtract(1, "day").endOf("day");
          } else {
            evEnd = evStart.clone().endOf("day");
          }
        } else {
          evEnd = moment.tz(ev.end?.dateTime || ev.end?.date || ev.start.dateTime || ev.start.date, "America/Sao_Paulo").endOf("day");
        }
        return cursor.isBetween(evStart, evEnd, "day", "[]");
      });

      // 3. Evento de dia inteiro existente?
      const temEventoDiaInteiro = eventosNoDia.some((ev) => ev.start.date && !ev.start.dateTime);
      if (temEventoDiaInteiro) {
        dias.push({
          dataFormatada,
          diaSemanaNome,
          status: "indisponivel",
          janelasLivres: [],
        });
        cursor.add(1, "day");
        continue;
      }

      // 4. Sem eventos no dia: totalmente livre
      if (eventosNoDia.length === 0) {
        const isHoje = cursor.isSame(hojeSP, "day");
        let inicioJanela = "07:00";
        if (isHoje) {
          const horaAgora = agora.hour();
          const minutoAgora = agora.minute();
          if (horaAgora >= 22) {
            dias.push({
              dataFormatada,
              diaSemanaNome,
              status: "indisponivel",
              janelasLivres: [],
            });
            cursor.add(1, "day");
            continue;
          }
          if (horaAgora > 7 || (horaAgora === 7 && minutoAgora > 0)) {
            const proxMin = minutoAgora === 0 ? "00" : minutoAgora <= 30 ? "30" : "00";
            const proxH = minutoAgora > 30 ? horaAgora + 1 : horaAgora;
            if (proxH >= 22) {
              dias.push({
                dataFormatada,
                diaSemanaNome,
                status: "indisponivel",
                janelasLivres: [],
              });
              cursor.add(1, "day");
              continue;
            }
            inicioJanela = `${String(proxH).padStart(2, "0")}:${proxMin}`;
          }
        }

        dias.push({
          dataFormatada,
          diaSemanaNome,
          status: "livre",
          janelasLivres: [{ inicio: inicioJanela, fim: "22:00" }],
        });
        cursor.add(1, "day");
        continue;
      }

      // 5. Dia com eventos: calcular janelas livres
      let janelas = calcularJanelasLivres({
        eventosNoDia,
        ano,
        mes,
        dia: diaNum,
        inicioDiaHH: 7,
        fimDiaHH: 22,
      });

      // Se for hoje, filtrar horários já decorridos
      if (cursor.isSame(hojeSP, "day")) {
        const agoraMom = agora.clone();
        janelas = janelas
          .map((j) => {
            const jInicio = cursor.clone().set({ hour: Number(j.inicio.split(":")[0]), minute: Number(j.inicio.split(":")[1]) });
            const jFim = cursor.clone().set({ hour: Number(j.fim.split(":")[0]), minute: Number(j.fim.split(":")[1]) });
            if (jFim.isSameOrBefore(agoraMom)) return null;
            if (jInicio.isBefore(agoraMom)) {
              const minAgora = agoraMom.minute();
              const proxMin = minAgora === 0 ? "00" : minAgora <= 30 ? "30" : "00";
              const proxH = minAgora > 30 ? agoraMom.hour() + 1 : agoraMom.hour();
              return { inicio: `${String(proxH).padStart(2, "0")}:${proxMin}`, fim: j.fim };
            }
            return j;
          })
          .filter((j) => {
            if (!j) return false;
            const [h1, m1] = j.inicio.split(":").map(Number);
            const [h2, m2] = j.fim.split(":").map(Number);
            return (h2 * 60 + m2) - (h1 * 60 + m1) >= 30;
          });
      }

      if (janelas.length === 0) {
        dias.push({
          dataFormatada,
          diaSemanaNome,
          status: "indisponivel",
          janelasLivres: [],
        });
      } else {
        dias.push({
          dataFormatada,
          diaSemanaNome,
          status: "parcial",
          janelasLivres: janelas,
        });
      }
    }
    cursor.add(1, "day");
  }

  return dias;
}

/**
 * Formata o relatório de disponibilidade respeitando a regra estrita de privacidade:
 * nunca exibe títulos, assuntos ou detalhes de eventos já agendados.
 */
function formatarRelatorioDisponibilidade({ dias, mesNome, diaSemanaTexto }) {
  if (!dias || dias.length === 0) {
    return `📅 Não foram encontradas datas futuras para ${diaSemanaTexto} em ${mesNome}.\n\nDigite *menu* para voltar ao menu principal.`;
  }

  let msg = `🗓️ *Consulta de Disponibilidade — ${diaSemanaTexto} (${mesNome})*\n\n`;

  dias.forEach((item) => {
    msg += `📌 *${item.dataFormatada} (${item.diaSemanaNome}):*\n`;
    if (item.status === "livre") {
      const j = item.janelasLivres[0];
      if (j && j.inicio === "07:00" && j.fim === "22:00") {
        msg += `• ✅ Dia totalmente livre (07:00 às 22:00)\n\n`;
      } else if (j) {
        msg += `• ✅ Livre das ${j.inicio} às ${j.fim}\n\n`;
      } else {
        msg += `• ✅ Dia totalmente livre\n\n`;
      }
    } else if (item.status === "parcial") {
      msg += `• 🕒 Horários disponíveis:\n`;
      item.janelasLivres.forEach((j) => {
        msg += `  - ${j.inicio} às ${j.fim}\n`;
      });
      msg += `\n`;
    } else {
      msg += `• ❌ Sem horários disponíveis\n\n`;
    }
  });

  msg += `_Lembre-se: os horários consideram 1h de intervalo de segurança entre eventos._\n\nDigite *menu* para voltar ao menu principal.`;
  return msg;
}

module.exports = {
  calcularDisponibilidade,
  montarMensagemConflito,
  montarMensagemDatasDisponiveis,
  verificarDataEspecifica,
  calcularJanelasLivres,
  montarMensagemDataEspecificaBloqueada,
  consultarDisponibilidadeMesDiaSemana,
  formatarRelatorioDisponibilidade,
};
