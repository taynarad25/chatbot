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
  detalhe += `📆 Data: ${dataFmt}\n`;
  detalhe += `⏰ Horário: ${horarioFmt}\n`;
  if (evento.location) {
    detalhe += `📍 Local: ${evento.location}\n`;
  }
  if (evento.description) {
    let desc = evento.description.trim();
    if (desc.length > 500) desc = desc.slice(0, 500).trim() + "…";
    detalhe += `📝 Descrição: ${desc}\n`;
  }
  detalhe += `\nDigite outro número para ver mais detalhes, ou *menu* para voltar.`;
  return detalhe;
}

module.exports = {
  DIAS_SEMANA_PLURAL,
  DIAS_SEMANA,
  agruparEventosAgenda,
  montarMensagemAgenda,
  montarDetalheEvento,
};
