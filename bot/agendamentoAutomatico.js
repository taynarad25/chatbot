const moment = require("moment-timezone");

// Monta o "resource" para a API do Google Calendar a partir dos dados da
// solicitação pendente. `ano` é calculado pelo chamador no momento da aprovação.
function montarResourceEvento(dados, ano) {
  const { evento, rede, local, dia, mes, horarioInicio, horarioFim, isDiaInteiro, solicitanteNome, solicitanteId, tipoDuracao, dataInicio, dataFim, horaInicio, horaFim, descricao } = dados;

  let desc = descricao || `Agendado via Bot - Solicitado pela Rede: ${rede}`;
  if (!descricao) {
    if (solicitanteNome) desc += `\n👤 Solicitante: ${solicitanteNome}`;
    if (solicitanteId) desc += `\n📞 Telefone: ${solicitanteId}`;
  }

  const resource = {
    summary: evento,
    description: desc,
    location: local || "Comunidade Cristã Curados",
  };

  // Formato consecutivo (vários dias seguidos com horário de início e fim)
  if (tipoDuracao === "consecutivo" || (dataInicio && dataFim)) {
    const dIniStr = dataInicio.includes("/") ? dataInicio : `${dataInicio}/${ano}`;
    const dFimStr = dataFim.includes("/") ? dataFim : `${dataFim}/${ano}`;
    const hIni = horaInicio || horarioInicio || "19:00";
    const hFim = horaFim || horarioFim || "21:00";

    const start = moment.tz(`${dIniStr} ${hIni}`, ["D/M/YYYY HH:mm", "DD/MM/YYYY HH:mm"], "America/Sao_Paulo");
    const end = moment.tz(`${dFimStr} ${hFim}`, ["D/M/YYYY HH:mm", "DD/MM/YYYY HH:mm"], "America/Sao_Paulo");

    resource.start = { dateTime: start.format(), timeZone: "America/Sao_Paulo" };
    resource.end = { dateTime: end.format(), timeZone: "America/Sao_Paulo" };
    return resource;
  }

  // Compatibilidade legada apenas para registros antigos/testes
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

// Monta lista de resources quando o evento possui múltiplos blocos espalhados (conferências)
function montarResourcesMultiplosBlocos(dados, ano) {
  const blocos = Array.isArray(dados.blocos || dados.horarios) ? (dados.blocos || dados.horarios) : [];
  return blocos.map((bloco, idx) => {
    const dataStr = bloco.data.includes("/") ? bloco.data : `${bloco.data}/${ano}`;
    const start = moment.tz(`${dataStr} ${bloco.inicio}`, ["D/M/YYYY HH:mm", "DD/MM/YYYY HH:mm"], "America/Sao_Paulo");
    const end = moment.tz(`${dataStr} ${bloco.fim}`, ["D/M/YYYY HH:mm", "DD/MM/YYYY HH:mm"], "America/Sao_Paulo");
    const rotulo = bloco.titulo || bloco.sessao || `Sessão ${idx + 1}`;

    return {
      summary: `${dados.evento} - ${rotulo}`,
      description: dados.descricao || `Sessão ${idx + 1} do evento ${dados.evento}\nSolicitado pela Rede: ${dados.rede}`,
      location: dados.local || "Comunidade Cristã Curados",
      start: { dateTime: start.format(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: end.format(), timeZone: "America/Sao_Paulo" }
    };
  });
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

module.exports = { montarResourceEvento, montarResourcesMultiplosBlocos, montarResourcePatchAlteracao };
