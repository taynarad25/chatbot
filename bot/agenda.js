const moment = require("moment-timezone");

const DIAS_SEMANA_PLURAL = ["Domingos", "Segundas-feiras", "Terças-feiras", "Quartas-feiras", "Quintas-feiras", "Sextas-feiras", "Sábados"];
const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

// Agrupa eventos em itens numerados para exibição: 3+ ocorrências do mesmo
// nome/horário/dia da semana viram um único item "recorrente" (ex: "Todas as Quintas");
// o restante vira um item "único" por evento, preservando o comportamento já existente.
function agruparEventosAgenda(eventos) {
  const porChave = {};
  eventos.forEach(ev => {
    const startStr = ev.start.dateTime || ev.start.date;
    const d = moment.tz(startStr, "America/Sao_Paulo");
    const weekday = d.day();
    const summary = ev.summary || "Evento sem título";
    const horaFmt = ev.start.dateTime ? d.format("HH:mm") : "";
    const chave = `${summary}|${horaFmt}|${weekday}`;
    if (!porChave[chave]) porChave[chave] = { summary, horaFmt, weekday, eventos: [] };
    porChave[chave].eventos.push(ev);
  });

  const itens = [];
  Object.values(porChave).forEach(grupo => {
    grupo.eventos.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
    if (grupo.eventos.length >= 3) {
      itens.push({
        tipo: "recorrente",
        summary: grupo.summary,
        horaFmt: grupo.horaFmt,
        weekday: grupo.weekday,
        eventos: grupo.eventos,
        primeiraData: new Date(grupo.eventos[0].start.dateTime || grupo.eventos[0].start.date),
      });
    } else {
      grupo.eventos.forEach(ev => {
        const d = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo");
        itens.push({
          tipo: "unico",
          summary: grupo.summary,
          horaFmt: grupo.horaFmt,
          dataFmt: d.format("DD/MM"),
          eventos: [ev],
          primeiraData: d.toDate(),
        });
      });
    }
  });

  itens.sort((a, b) => a.primeiraData - b.primeiraData);
  return itens;
}

function montarMensagemAgenda(itens, tituloPeriodo) {
  let msgAgenda = `📋 *Agenda Comunidade Cristã Curados — ${tituloPeriodo}*\n\n`;

  itens.forEach((item, i) => {
    const numero = i + 1;
    const horaStr = item.horaFmt ? ` às ${item.horaFmt}` : "";
    if (item.tipo === "recorrente") {
      const prefixo = (item.weekday === 0 || item.weekday === 6) ? "Todos os" : "Todas as";
      msgAgenda += `${numero} - 🗓️ *${prefixo} ${DIAS_SEMANA_PLURAL[item.weekday]}*${horaStr} | ${item.summary}\n`;
    } else {
      msgAgenda += `${numero} - 📌 *${item.dataFmt}*${horaStr} | ${item.summary}\n`;
    }
  });

  msgAgenda += `\nQuer o endereço ou mais detalhes de algum evento? Digite o número dele.\nDigite *menu* para voltar ao menu principal.`;
  return msgAgenda;
}

// Monta o detalhe de um item da agenda. Para itens recorrentes, mostra a
// próxima ocorrência a partir de hoje (ou a última, se todas já passaram).
function montarDetalheEvento(item) {
  let evento;
  if (item.tipo === "unico") {
    evento = item.eventos[0];
  } else {
    const hoje = moment.tz("America/Sao_Paulo");
    evento = item.eventos.find(ev => {
      const d = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo");
      return d.isSameOrAfter(hoje, "day");
    }) || item.eventos[item.eventos.length - 1];
  }

  const d = moment.tz(evento.start.dateTime || evento.start.date, "America/Sao_Paulo");
  const dataFmt = `${d.format("DD/MM")} (${DIAS_SEMANA[d.day()]})`;

  let horarioFmt;
  if (evento.start.dateTime) {
    const dFim = moment.tz(evento.end.dateTime || evento.end.date, "America/Sao_Paulo");
    horarioFmt = `${d.format("HH:mm")} às ${dFim.format("HH:mm")}`;
  } else {
    horarioFmt = "Dia todo";
  }

  let detalhe = `📌 *${item.summary}*\n\n`;
  detalhe += `📆 *Data:* ${dataFmt}\n`;
  detalhe += `⏰ *Horário:* ${horarioFmt}\n`;
  if (evento.location) {
    detalhe += `📍 *Local:* ${evento.location}\n`;
  }
  if (evento.description) {
    let desc = evento.description.trim();
    if (desc.length > 500) desc = desc.slice(0, 500).trim() + "…";
    detalhe += `📝 *Descrição:* ${desc}\n`;
  }
  detalhe += `\nDigite outro número para ver mais detalhes, ou *menu* para voltar.`;
  return detalhe;
}

const ERRO_FORMATO_PERIODO = "❌ Não consegui entender as datas. Use o formato DD/MM a DD/MM (ex: 10/07 a 20/07).";

// Interpreta o texto livre "DD/MM a DD/MM" digitado para o período personalizado
// da consulta de agenda. Recebe "agora" como parâmetro (em vez de lê-lo internamente)
// para permitir testes determinísticos. Retorna { ok: true, inicio, fim } ou
// { ok: false, mensagem } com o motivo da rejeição.
function interpretarPeriodoPersonalizado(entrada, agora) {
  const match = (entrada || "").trim().match(/^(\d{1,2})\/(\d{1,2})\s*(?:a|até|ate|-)\s*(\d{1,2})\/(\d{1,2})$/i);
  if (!match) {
    return { ok: false, mensagem: ERRO_FORMATO_PERIODO };
  }

  const [diaIni, mesIni, diaFim, mesFim] = match.slice(1).map(Number);
  if (mesIni < 1 || mesIni > 12 || mesFim < 1 || mesFim > 12 || diaIni < 1 || diaIni > 31 || diaFim < 1 || diaFim > 31) {
    return { ok: false, mensagem: ERRO_FORMATO_PERIODO };
  }

  const ano = agora.year();
  const inicio = moment.tz(`${diaIni}/${mesIni}/${ano}`, "D/M/YYYY", "America/Sao_Paulo");
  // Se o mês final é numericamente menor que o inicial (ex: 28/12 a 05/01), o período
  // cruza o ano novo — a data final pertence ao ano seguinte.
  const anoFim = mesFim < mesIni ? ano + 1 : ano;
  const fim = moment.tz(`${diaFim}/${mesFim}/${anoFim}`, "D/M/YYYY", "America/Sao_Paulo");

  if (!inicio.isValid() || !fim.isValid()) {
    return { ok: false, mensagem: ERRO_FORMATO_PERIODO };
  }

  const hoje = agora.clone().startOf("day");
  if (inicio.isBefore(hoje, "day")) {
    return { ok: false, mensagem: "❌ A data inicial não pode estar no passado. Escolha uma data a partir de hoje." };
  }

  if (fim.isBefore(inicio, "day")) {
    return { ok: false, mensagem: "❌ A data final deve ser igual ou depois da data inicial. Digite novamente (ex: 10/07 a 20/07)." };
  }

  if (fim.diff(inicio, "days") > 90) {
    return { ok: false, mensagem: "❌ Esse período é muito longo (mais de 90 dias). Tente um intervalo menor." };
  }

  return { ok: true, inicio, fim };
}

module.exports = {
  DIAS_SEMANA_PLURAL,
  DIAS_SEMANA,
  agruparEventosAgenda,
  montarMensagemAgenda,
  montarDetalheEvento,
  interpretarPeriodoPersonalizado,
};
