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

// Monta o "resource" de patch para aplicar automaticamente uma alteração
// estruturada (horário, data, nome ou local) aprovada pela secretaria.
// `campo` indica qual dado foi alterado; os demais campos do evento não são
// tocados. Alterações em texto livre ("outro") não têm como ser aplicadas
// automaticamente, então retorna null nesse caso (o fluxo antigo, manual,
// continua valendo).
function montarResourcePatchAlteracao(dados) {
  const { campo } = dados;

  if (campo === "nome") return { summary: dados.novoNome };
  if (campo === "local") return { location: dados.novoLocal };
  if (campo !== "data" && campo !== "horario") return null;

  const { isDiaInteiroOriginal, inicioOriginal, fimOriginal } = dados;

  if (isDiaInteiroOriginal) {
    // Evento de dia inteiro não tem horário pra mudar — só faz sentido mudar a data.
    if (campo !== "data") return null;

    const ano = moment.tz(inicioOriginal, "America/Sao_Paulo").year();
    const duracaoDias = moment(fimOriginal).diff(moment(inicioOriginal), "days");
    const novoInicio = moment.tz(`${dados.novoDia}/${dados.novoMes}/${ano}`, "D/M/YYYY", "America/Sao_Paulo");

    return {
      start: { date: novoInicio.format("YYYY-MM-DD") },
      end: { date: novoInicio.clone().add(duracaoDias, "days").format("YYYY-MM-DD") },
    };
  }

  const duracaoMinutos = moment(fimOriginal).diff(moment(inicioOriginal), "minutes");
  let novoInicio = moment.tz(inicioOriginal, "America/Sao_Paulo");
  let novoFim;

  if (campo === "data") {
    novoInicio = novoInicio.clone().set({ date: dados.novoDia, month: dados.novoMes - 1 });
    novoFim = novoInicio.clone().add(duracaoMinutos, "minutes");
  } else {
    const [hInicio, mInicio] = dados.novoHorarioInicio.split(":").map(Number);
    const [hFim, mFim] = dados.novoHorarioFim.split(":").map(Number);
    novoInicio = novoInicio.clone().set({ hour: hInicio, minute: mInicio, second: 0, millisecond: 0 });
    novoFim = novoInicio.clone().set({ hour: hFim, minute: mFim, second: 0, millisecond: 0 });
  }

  return {
    start: { dateTime: novoInicio.format(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: novoFim.format(), timeZone: "America/Sao_Paulo" },
  };
}

module.exports = { codificarDadosAgendamento, decodificarDadosAgendamento, montarResourceEvento, montarResourcePatchAlteracao };
