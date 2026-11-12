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
    let end = moment.tz(`${dia}/${mes}/${ano} ${horarioFim}`, "D/M/YYYY HH:mm", "America/Sao_Paulo");
    // Se o término for menor ou igual ao início (ex: 22h às 01h), o evento atravessa a meia-noite
    if (end.isSameOrBefore(start)) {
      end = end.add(1, "day");
    }
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
    let end = moment.tz(`${dataStr} ${bloco.fim}`, ["D/M/YYYY HH:mm", "DD/MM/YYYY HH:mm"], "America/Sao_Paulo");
    if (end.isSameOrBefore(start)) {
      end = end.add(1, "day");
    }
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
// Suporta requisições feitas via WhatsApp ou Painel de Gestão Web.
function montarResourcePatchAlteracao(dados) {
  if (!dados) return null;
  const campoRaw = String(dados.campo || "").toLowerCase().trim();
  let campo = campoRaw;
  if (campoRaw.includes("data")) campo = "data";
  else if (campoRaw.includes("horar") || campoRaw.includes("horár")) campo = "horario";
  else if (campoRaw.includes("local")) campo = "local";
  else if (campoRaw.includes("nome") || campoRaw.includes("titul") || campoRaw.includes("título")) campo = "nome";

  const novoNome = dados.novoNome || (campo === "nome" ? dados.novoValor : null);
  const novoLocal = dados.novoLocal || (campo === "local" ? dados.novoValor : null);

  if (campo === "nome" && novoNome) return { summary: String(novoNome).trim() };
  if (campo === "local" && novoLocal) return { location: String(novoLocal).trim() };
  if (campo !== "data" && campo !== "horario") return null;

  let novoDia = dados.novoDia;
  let novoMes = dados.novoMes;
  let novoAno = dados.novoAno;

  if (campo === "data" && (!novoDia || !novoMes) && dados.novoValor) {
    const match = String(dados.novoValor).trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
    if (match) {
      novoDia = parseInt(match[1], 10);
      novoMes = parseInt(match[2], 10);
      if (match[3]) novoAno = parseInt(match[3], 10);
    }
  }

  let novoHorarioInicio = dados.novoHorarioInicio;
  let novoHorarioFim = dados.novoHorarioFim;

  if (campo === "horario" && (!novoHorarioInicio || !novoHorarioFim) && dados.novoValor) {
    const partes = String(dados.novoValor).split(/às|-|a/i).map((s) => s.trim());
    if (partes.length >= 2) {
      novoHorarioInicio = partes[0];
      novoHorarioFim = partes[1];
    } else if (partes.length === 1 && partes[0]) {
      novoHorarioInicio = partes[0];
    }
  }

  const { isDiaInteiroOriginal, inicioOriginal, fimOriginal } = dados;

  if (isDiaInteiroOriginal) {
    // Evento de dia inteiro não tem horário pra mudar — só faz sentido mudar a data.
    if (campo !== "data" || !novoDia || !novoMes) return null;

    const ano = novoAno || (inicioOriginal ? moment.tz(inicioOriginal, "America/Sao_Paulo").year() : moment.tz("America/Sao_Paulo").year());
    const duracaoDias = inicioOriginal && fimOriginal ? Math.max(moment(fimOriginal).diff(moment(inicioOriginal), "days"), 1) : 1;
    const novoInicio = moment.tz(`${novoDia}/${novoMes}/${ano}`, "D/M/YYYY", "America/Sao_Paulo");

    return {
      start: { date: novoInicio.format("YYYY-MM-DD") },
      end: { date: novoInicio.clone().add(duracaoDias, "days").format("YYYY-MM-DD") },
    };
  }

  const duracaoMinutos = inicioOriginal && fimOriginal ? Math.max(moment(fimOriginal).diff(moment(inicioOriginal), "minutes"), 30) : 150;
  let novoInicio = inicioOriginal ? moment.tz(inicioOriginal, "America/Sao_Paulo") : moment.tz("America/Sao_Paulo");
  let novoFim;

  if (campo === "data") {
    if (!novoDia || !novoMes) return null;
    const ano = novoAno || novoInicio.year();
    novoInicio = novoInicio.clone().set({ date: novoDia, month: novoMes - 1, year: ano });
    novoFim = novoInicio.clone().add(duracaoMinutos, "minutes");
  } else {
    if (!novoHorarioInicio) return null;
    const [hInicio, mInicio] = novoHorarioInicio.split(":").map(Number);
    novoInicio = novoInicio.clone().set({ hour: hInicio, minute: mInicio, second: 0, millisecond: 0 });
    if (novoHorarioFim) {
      const [hFim, mFim] = novoHorarioFim.split(":").map(Number);
      novoFim = novoInicio.clone().set({ hour: hFim, minute: mFim, second: 0, millisecond: 0 });
      if (novoFim.isSameOrBefore(novoInicio)) {
        novoFim = novoFim.add(1, "day");
      }
    } else {
      novoFim = novoInicio.clone().add(duracaoMinutos, "minutes");
    }
  }

  return {
    start: { dateTime: novoInicio.format(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: novoFim.format(), timeZone: "America/Sao_Paulo" },
  };
}

module.exports = { montarResourceEvento, montarResourcesMultiplosBlocos, montarResourcePatchAlteracao };
