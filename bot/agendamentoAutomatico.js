const moment = require("moment-timezone");

// Antes, o fluxo "marcar evento" (aprovação automática pelo grupo Mensagens
// Secretaria) reconstruía os dados do agendamento fazendo regex na formatação
// visual da mensagem que o próprio bot tinha enviado antes (emoji + negrito por
// campo) — qualquer mudança de texto/formatação quebrava o parsing silenciosamente.
//
// Aqui os dados estruturados viajam num blob separado, machine-readable, numa
// linha própria da mensagem — a formatação visível para humanos pode mudar
// livremente sem nunca afetar o parsing.
const MARCADOR_DADOS = "DADOS:";

function codificarDadosAgendamento(dados) {
  return `${MARCADOR_DADOS}${Buffer.from(JSON.stringify(dados)).toString("base64")}`;
}

function decodificarDadosAgendamento(texto) {
  const match = (texto || "").match(/DADOS:([A-Za-z0-9+/=]+)/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// Monta o "resource" para a API do Google Calendar a partir dos dados decodificados.
// `ano` é calculado pelo chamador no momento da aprovação (não fica salvo no blob),
// preservando o comportamento já existente antes desta extração.
function montarResourceEvento(dados, ano) {
  const { evento, rede, local, dia, mes, horarioInicio, horarioFim, isDiaInteiro } = dados;

  const resource = {
    summary: evento,
    description: `Agendado via Bot - Solicitado pela Rede: ${rede}`,
    location: local || "Comunidade Cristã Curados",
  };

  if (isDiaInteiro) {
    const start = moment.tz(`${dia}/${mes}/${ano}`, "D/M/YYYY", "America/Sao_Paulo");
    const end = start.clone().add(1, "day");
    resource.start = { date: start.format("YYYY-MM-DD") };
    resource.end = { date: end.format("YYYY-MM-DD") };
  } else {
    const start = moment.tz(`${dia}/${mes}/${ano} ${horarioInicio}`, "D/M/YYYY HH:mm", "America/Sao_Paulo");
    const end = moment.tz(`${dia}/${mes}/${ano} ${horarioFim}`, "D/M/YYYY HH:mm", "America/Sao_Paulo");
    resource.start = { dateTime: start.format(), timeZone: "America/Sao_Paulo" };
    resource.end = { dateTime: end.format(), timeZone: "America/Sao_Paulo" };
  }

  return resource;
}

module.exports = { codificarDadosAgendamento, decodificarDadosAgendamento, montarResourceEvento };
