const moment = require("moment-timezone");

const DIAS_SEMANA_PLURAL = ["Domingos", "Segundas-feiras", "Terças-feiras", "Quartas-feiras", "Quintas-feiras", "Sextas-feiras", "Sábados"];
const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function normalizarTextoComparacao(str = "") {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extrairFaixaHorarioTexto(texto = "") {
  if (!texto) return null;
  const match = texto.match(/(?:das?\s*)?(\d{1,2})(?::(\d{2})|h(?:(\d{2}))?)?\s*(?:às?|as?|ate|até|-)\s*(\d{1,2})(?::(\d{2})|h(?:(\d{2}))?)?/i);
  if (match) {
    const hIni = String(match[1]).padStart(2, "0");
    const mIni = String(match[2] || match[3] || "00").padStart(2, "0");
    const hFim = String(match[4]).padStart(2, "0");
    const mFim = String(match[5] || match[6] || "00").padStart(2, "0");
    return { inicio: `${hIni}:${mIni}`, fim: `${hFim}:${mFim}` };
  }
  const matchInicio = texto.match(/(?:a partir das?|às?|as?)\s*(\d{1,2})(?::(\d{2})|h(?:(\d{2}))?)/i);
  if (matchInicio) {
    const hIni = String(matchInicio[1]).padStart(2, "0");
    const mIni = String(matchInicio[2] || matchInicio[3] || "00").padStart(2, "0");
    return { inicio: `${hIni}:${mIni}`, fim: null };
  }
  return null;
}

function ehEventoPreparacaoLimpeza(ev = {}) {
  const summary = (ev.summary || "").trim();
  const description = (ev.description || "").trim();

  // Prefixo com colchetes: [Preparação/Decoração], [Preparação / Decoração], [Preparação], [Decoração], [Limpeza], [Montagem]
  if (/\[[^\]]*(?:preparaç[aã]o|decoraç[aã]o|limpeza|montagem)[^\]]*\]/i.test(summary)) {
    return true;
  }
  // Prefixo com hífen ou dois pontos: Preparação - ..., Montagem: ...
  if (/^(?:preparaç[aã]o(?:\/decoraç[aã]o)?|decoraç[aã]o|limpeza|montagem)\s*[-:]/i.test(summary)) {
    return true;
  }
  // Menção explícita de preparação/decoração de salão no título
  if (/\b(?:preparaç[aã]o\/decoraç[aã]o|preparaç[aã]o\s+e\s+decoraç[aã]o|limpeza\s+do\s+sal[ãa]o)\b/i.test(summary)) {
    return true;
  }
  // Descrição indicando preparação/limpeza de salão
  if (/montagem, preparação, decoração ou limpeza/i.test(description)) {
    return true;
  }
  return false;
}

function identificarInfoPreparacaoLimpeza(ev = {}) {
  const summary = (ev.summary || "").trim();
  const description = (ev.description || "").trim();

  const matchPrefixo =
    summary.match(/^\[[^\]]*(?:preparaç[aã]o|decoraç[aã]o|limpeza|montagem)[^\]]*\]\s*(.*)$/i) ||
    summary.match(/^(?:preparaç[aã]o(?:\/decoraç[aã]o)?|decoraç[aã]o|limpeza|montagem)\s*[-:]\s*(.*)$/i);

  let nomePrincipal = matchPrefixo ? matchPrefixo[1].trim() : "";

  const matchDesc = description.match(/Evento Principal:\s*([^\n\r]+)/i);
  if (matchDesc && matchDesc[1]) {
    nomePrincipal = matchDesc[1].trim();
  }

  const isPrep = Boolean(matchPrefixo || matchDesc || ehEventoPreparacaoLimpeza(ev));

  return { isPrep, nomePrincipal };
}

function formatarLinhaPreparacaoLimpeza(faixa, isVespera = false) {
  if (!faixa) return "";
  const prefixoVespera = isVespera ? "Véspera " : "";
  if (faixa.inicio && faixa.fim) {
    return `${prefixoVespera}${faixa.inicio} às ${faixa.fim} — horário para preparação e limpeza`;
  }
  if (faixa.inicio) {
    return `${prefixoVespera}A partir das ${faixa.inicio} — horário para preparação e limpeza`;
  }
  return "";
}

function unificarEventosPreparacaoLimpeza(eventos = [], opcoes = {}) {
  if (!Array.isArray(eventos) || eventos.length === 0) return eventos;

  const preps = [];
  const principais = [];

  eventos.forEach(ev => {
    const info = identificarInfoPreparacaoLimpeza(ev);
    if (info.isPrep) {
      preps.push({ ev, nomePrincipal: info.nomePrincipal });
    } else {
      principais.push(ev);
    }
  });

  if (preps.length === 0) {
    principais.forEach(ev => {
      if (!ev.horarioPreparacaoLimpeza && ev.description) {
        const faixa = extrairFaixaHorarioTexto(ev.description);
        if (faixa && /montagem|preparaç|decoraç|limpeza|horário total/i.test(ev.description)) {
          ev.horarioPreparacaoLimpeza = formatarLinhaPreparacaoLimpeza(faixa);
        }
      }
    });
    return eventos;
  }

  const prepsNaoVinculados = [];

  preps.forEach(({ ev: evPrep, nomePrincipal }) => {
    const normNome = normalizarTextoComparacao(nomePrincipal);
    const datePrep = moment.tz(evPrep.start?.dateTime || evPrep.start?.date, "America/Sao_Paulo");

    // 1. Tenta correspondência exata por nome
    let alvo = principais.find(p => {
      const normP = normalizarTextoComparacao(p.summary);
      const matchNome = (normNome && (normP === normNome || normP.includes(normNome) || normNome.includes(normP)));
      if (!matchNome) return false;
      const dateP = moment.tz(p.start?.dateTime || p.start?.date, "America/Sao_Paulo");
      const diffDias = Math.abs(dateP.diff(datePrep, "days", true));
      return diffDias <= 1.5;
    });

    // 2. Se não encontrou por nome, vincula ao evento oficial no mesmo dia
    if (!alvo) {
      alvo = principais.find(p => {
        const dateP = moment.tz(p.start?.dateTime || p.start?.date, "America/Sao_Paulo");
        const diffDias = Math.abs(dateP.diff(datePrep, "days", true));
        if (diffDias > 1.2) return false;
        // Se houver mesmo calendário ou se for do mesmo tema
        if (evPrep.calendarId && p.calendarId && evPrep.calendarId === p.calendarId) return true;
        const normP = normalizarTextoComparacao(p.summary);
        if (normNome && (normP.includes("mulher") && normNome.includes("mulher"))) return true;
        // Se for o único evento oficial no mesmo dia, associa a ele
        const oficiaisNoDia = principais.filter(cand => {
          const dCand = moment.tz(cand.start?.dateTime || cand.start?.date, "America/Sao_Paulo");
          return Math.abs(dCand.diff(datePrep, "days", true)) <= 0.8;
        });
        return oficiaisNoDia.length === 1;
      });
    }

    if (alvo) {
      const dateP = moment.tz(alvo.start?.dateTime || alvo.start?.date, "America/Sao_Paulo");
      const isVespera = datePrep.isBefore(dateP, "day");

      let faixa = extrairFaixaHorarioTexto(evPrep.description);
      if (!faixa && evPrep.start?.dateTime) {
        const hIni = datePrep.format("HH:mm");
        const hFim = evPrep.end?.dateTime ? moment.tz(evPrep.end.dateTime, "America/Sao_Paulo").format("HH:mm") : null;
        faixa = { inicio: hIni, fim: hFim };
      }

      if (faixa) {
        if (!alvo._faixasPrep) alvo._faixasPrep = [];
        alvo._faixasPrep.push({ faixa, isVespera });
      }
    } else {
      prepsNaoVinculados.push(evPrep);
    }
  });

  principais.forEach(p => {
    if (p._faixasPrep && p._faixasPrep.length > 0) {
      const faixasMesmoDia = p._faixasPrep.filter(f => !f.isVespera);
      if (faixasMesmoDia.length > 0) {
        const inis = faixasMesmoDia.map(f => f.faixa.inicio).filter(Boolean).sort();
        const fims = faixasMesmoDia.map(f => f.faixa.fim).filter(Boolean).sort();
        const menorIni = inis[0];
        const maiorFim = fims[fims.length - 1];
        p.horarioPreparacaoLimpeza = formatarLinhaPreparacaoLimpeza({ inicio: menorIni, fim: maiorFim }, false);
      } else {
        const fVesp = p._faixasPrep[0];
        p.horarioPreparacaoLimpeza = formatarLinhaPreparacaoLimpeza(fVesp.faixa, fVesp.isVespera);
      }
    } else if (!p.horarioPreparacaoLimpeza && p.description) {
      const faixa = extrairFaixaHorarioTexto(p.description);
      if (faixa && /montagem|preparaç|decoraç|limpeza|horário total/i.test(p.description)) {
        p.horarioPreparacaoLimpeza = formatarLinhaPreparacaoLimpeza(faixa);
      }
    }
  });

  // Em agendas públicas abertas para todos, blocos de preparação/decoração avulsos NUNCA devem aparecer
  const incluirNaoVinculados = Boolean(opcoes && opcoes.incluirNaoVinculados);
  if (incluirNaoVinculados) {
    return [...principais, ...prepsNaoVinculados];
  }
  return principais;
}

function extrairNomeBaseEvento(summary = "") {
  return String(summary || "")
    .replace(/\s*[-–—:]\s*(?:Sess[ãa]o|Dia|Parte|M[óo]dulo|Etapa)\s*\d+[a-z]?\s*$/i, "")
    .replace(/\s*\((?:Sess[ãa]o|Dia|Parte|M[óo]dulo|Etapa)\s*\d+[a-z]?\)\s*$/i, "")
    .trim();
}

function formatarResumoDatas(eventos = []) {
  if (!Array.isArray(eventos) || eventos.length === 0) return "";
  const datas = eventos.map(ev => {
    const d = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo");
    return d.format("DD/MM");
  });
  const datasUnicas = [...new Set(datas)];
  if (datasUnicas.length === 1) return datasUnicas[0];
  if (datasUnicas.length === 2) return `${datasUnicas[0]} e ${datasUnicas[1]}`;
  if (datasUnicas.length <= 4) return `${datasUnicas.slice(0, -1).join(", ")} e ${datasUnicas[datasUnicas.length - 1]}`;
  return `${datasUnicas[0]} a ${datasUnicas[datasUnicas.length - 1]} (${datasUnicas.length} datas)`;
}

function agruparEventosPorNomeBase(eventos = []) {
  const grupos = {};

  eventos.forEach(ev => {
    const rawSum = ev.summary || "Evento sem título";
    const nomeBase = extrairNomeBaseEvento(rawSum);
    const chave = `${nomeBase.toLowerCase()}|${ev.calendarId || ""}`;

    if (!grupos[chave]) {
      grupos[chave] = {
        nomeBase,
        calendarId: ev.calendarId,
        location: ev.location,
        description: ev.description,
        eventos: [],
      };
    }
    grupos[chave].eventos.push(ev);
  });

  return Object.values(grupos).map(g => {
    g.eventos.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
    const resumoDatas = formatarResumoDatas(g.eventos);
    const ehMultiplo = g.eventos.length > 1;
    const primeiroEv = g.eventos[0];

    return {
      nomeBase: g.nomeBase,
      summary: g.nomeBase,
      resumoDatas,
      ehMultiplo,
      totalSessoes: g.eventos.length,
      eventos: g.eventos,
      id: primeiroEv.id,
      start: primeiroEv.start,
      end: primeiroEv.end,
      location: g.location || primeiroEv.location,
      description: g.description || primeiroEv.description,
      calendarId: g.calendarId || primeiroEv.calendarId,
    };
  }).sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
}

// Agrupa eventos em itens numerados para exibição:
// 1. Eventos com múltiplas sessões/dias do mesmo evento viram um único item unificado.
// 2. Cultos e reuniões semanais regulares (3+ ocorrências idênticas) viram um único item recorrente.
// 3. Demais eventos viram itens únicos por data.
function agruparEventosAgenda(eventosRaw = [], opcoes = {}) {
  const eventos = unificarEventosPreparacaoLimpeza(eventosRaw, opcoes);

  // 1. Primeiro separa eventos que são sessões/dias de um evento maior
  const gruposMultiplos = {};
  const eventosRestantes = [];

  eventos.forEach(ev => {
    const rawSum = ev.summary || "Evento sem título";
    const nomeBase = extrairNomeBaseEvento(rawSum);
    const temSufixoSessao = /(?:Sess[ãa]o|Dia|Parte|M[óo]dulo|Etapa)\s*\d+/i.test(rawSum);

    if (temSufixoSessao) {
      const chave = `${nomeBase.toLowerCase()}|${ev.calendarId || ""}`;
      if (!gruposMultiplos[chave]) {
        gruposMultiplos[chave] = { nomeBase, eventos: [] };
      }
      gruposMultiplos[chave].eventos.push(ev);
    } else {
      eventosRestantes.push(ev);
    }
  });

  // Também agrupa se houver eventos restantes com o mesmo nome base no mesmo calendário (ex: conferência em 2 dias)
  const contagemNomeBase = {};
  eventosRestantes.forEach(ev => {
    const n = extrairNomeBaseEvento(ev.summary || "").toLowerCase();
    contagemNomeBase[n] = (contagemNomeBase[n] || 0) + 1;
  });

  const eventosFinais = [];
  eventosRestantes.forEach(ev => {
    const n = extrairNomeBaseEvento(ev.summary || "").toLowerCase();
    const ehCursoOuTreinamento = /treinamento|curso|semin[áa]rio|workshop|congresso|confer[êe]ncia|retiro|acampamento/i.test(ev.summary || "");
    if (contagemNomeBase[n] > 1 && (ehCursoOuTreinamento || contagemNomeBase[n] < 3)) {
      const chave = `${n}|${ev.calendarId || ""}`;
      if (!gruposMultiplos[chave]) {
        gruposMultiplos[chave] = { nomeBase: extrairNomeBaseEvento(ev.summary || ""), eventos: [] };
      }
      gruposMultiplos[chave].eventos.push(ev);
    } else {
      eventosFinais.push(ev);
    }
  });

  const itens = [];

  // Adiciona os eventos múltiplos unificados
  Object.values(gruposMultiplos).forEach(g => {
    g.eventos.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
    const primeiro = g.eventos[0];
    const dIni = moment.tz(primeiro.start.dateTime || primeiro.start.date, "America/Sao_Paulo");
    const horaFmt = primeiro.start.dateTime ? dIni.format("HH:mm") : "";
    const prepLimpeza = g.eventos.find(e => e.horarioPreparacaoLimpeza)?.horarioPreparacaoLimpeza || null;

    itens.push({
      tipo: "multiplo",
      summary: g.nomeBase,
      nomeBase: g.nomeBase,
      horaFmt,
      dataFmt: formatarResumoDatas(g.eventos),
      eventos: g.eventos,
      primeiraData: dIni.toDate(),
      horarioPreparacaoLimpeza: prepLimpeza,
    });
  });

  // Processa os eventos restantes (recorrentes vs únicos)
  const porChave = {};
  eventosFinais.forEach(ev => {
    const startStr = ev.start.dateTime || ev.start.date;
    const d = moment.tz(startStr, "America/Sao_Paulo");
    const weekday = d.day();
    const summary = ev.summary || "Evento sem título";
    const horaFmt = ev.start.dateTime ? d.format("HH:mm") : "";
    const chave = `${summary}|${horaFmt}|${weekday}`;
    if (!porChave[chave]) porChave[chave] = { summary, horaFmt, weekday, eventos: [] };
    porChave[chave].eventos.push(ev);
  });

  Object.values(porChave).forEach(grupo => {
    grupo.eventos.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
    const prepLimpeza = grupo.eventos.find(e => e.horarioPreparacaoLimpeza)?.horarioPreparacaoLimpeza || null;

    if (grupo.eventos.length >= 3) {
      itens.push({
        tipo: "recorrente",
        summary: grupo.summary,
        horaFmt: grupo.horaFmt,
        weekday: grupo.weekday,
        eventos: grupo.eventos,
        primeiraData: new Date(grupo.eventos[0].start.dateTime || grupo.eventos[0].start.date),
        horarioPreparacaoLimpeza: prepLimpeza,
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
          horarioPreparacaoLimpeza: ev.horarioPreparacaoLimpeza || prepLimpeza,
        });
      });
    }
  });

  itens.sort((a, b) => a.primeiraData - b.primeiraData);
  return itens;
}

const URL_THE_CHOSEN = "";

function isEventoTheChosen(itemOuEv = {}) {
  return false;
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

  msgAgenda += `\nQuer o endereço ou mais detalhes de algum evento? Digite o número dele.\n`;
  msgAgenda += `Para consultar outro mês, digite o *nome do mês* (ex: Novembro, Dezembro) ou o número correspondente.\n`;
  msgAgenda += `Digite *menu* para voltar ao menu principal.`;
  return msgAgenda;
}

const SECOES_AGENDA = [
  { key: "IGREJA", titulo: "⛪ *Eventos e Cultos da Igreja*" },
  { key: "USO_SALAO", titulo: "🏛️ *Uso do Salão*" },
  { key: "REUNIOES", titulo: "🤝 *Reuniões*" },
  { key: "ATENDIMENTOS", titulo: "🙏 *Atendimentos Pastorais*" },
  { key: "ENSAIOS", titulo: "🎵 *Ensaios*" },
  { key: "LIMPEZA", titulo: "🧹 *Limpeza*" },
  { key: "EXTERNOS", titulo: "🌐 *Eventos Externos*" },
];

function classificarSecaoEvento(item, agendasInternas = {}) {
  const ev = item.eventos && item.eventos[0];
  const calId = ev ? ev.calendarId : "";
  const summaryLower = (item.summary || "").toLowerCase();

  if (calId === agendasInternas.USO_SALAO || summaryLower.includes("uso do salão") || summaryLower.includes("uso do salao")) {
    return "USO_SALAO";
  }
  if (calId === agendasInternas.ATENDIMENTO || summaryLower.includes("atendimento pastoral")) {
    return "ATENDIMENTOS";
  }
  if (calId === agendasInternas.REUNIOES || summaryLower.startsWith("reunião") || summaryLower.startsWith("reuniao")) {
    return "REUNIOES";
  }
  if (calId === agendasInternas.ENSAIOS || summaryLower.includes("ensaio") || summaryLower.includes("epifania")) {
    return "ENSAIOS";
  }
  if (calId === agendasInternas.LIMPEZA || summaryLower.includes("limpeza")) {
    return "LIMPEZA";
  }
  if (calId === "18e7b84e62b7f4155bb98458b8c750099b937bed118a572d51d9a21b87aaaa3e@group.calendar.google.com" || summaryLower.includes("externo")) {
    return "EXTERNOS";
  }
  return "IGREJA";
}

function unificarItensAgendaPreparacao(itens = []) {
  if (!Array.isArray(itens) || itens.length === 0) return itens;
  const preps = [];
  const principais = [];

  itens.forEach(it => {
    const sum = it.summary || "";
    const ev = it.eventos && it.eventos[0];
    const desc = ev?.description || "";
    const info = identificarInfoPreparacaoLimpeza({ summary: sum, description: desc });
    if (info.isPrep) {
      preps.push({ item: it, nomePrincipal: info.nomePrincipal });
    } else {
      principais.push(it);
    }
  });

  if (preps.length === 0) return itens;

  const prepsNaoVinculados = [];

  preps.forEach(({ item: itPrep, nomePrincipal }) => {
    const normNome = normalizarTextoComparacao(nomePrincipal);
    const evPrep = itPrep.eventos && itPrep.eventos[0];
    const datePrep = itPrep.primeiraData ? moment.tz(itPrep.primeiraData, "America/Sao_Paulo") : null;

    let alvo = principais.find(p => {
      const normP = normalizarTextoComparacao(p.summary);
      const matchNome = (normNome && (normP === normNome || normP.includes(normNome) || normNome.includes(normP)));
      if (!matchNome) return false;
      if (!datePrep) return true;
      const dateP = p.primeiraData ? moment.tz(p.primeiraData, "America/Sao_Paulo") : null;
      if (!dateP) return true;
      return Math.abs(dateP.diff(datePrep, "days", true)) <= 1.5;
    });

    if (alvo) {
      if (!alvo.horarioPreparacaoLimpeza) {
        let faixa = extrairFaixaHorarioTexto(evPrep?.description);
        if (!faixa && evPrep?.start?.dateTime) {
          const hIni = moment.tz(evPrep.start.dateTime, "America/Sao_Paulo").format("HH:mm");
          const hFim = evPrep.end?.dateTime ? moment.tz(evPrep.end.dateTime, "America/Sao_Paulo").format("HH:mm") : null;
          faixa = { inicio: hIni, fim: hFim };
        } else if (!faixa && itPrep.horaFmt) {
          faixa = { inicio: itPrep.horaFmt, fim: null };
        }
        if (faixa) {
          alvo.horarioPreparacaoLimpeza = formatarLinhaPreparacaoLimpeza(faixa);
        }
      }
    } else {
      prepsNaoVinculados.push(itPrep);
    }
  });

  return [...principais, ...prepsNaoVinculados];
}

function montarMensagemAgendaCompletaPorSecoes(itensRaw, tituloPeriodo, agendasInternas = {}, opcoes = {}) {
  let msgAgenda = `📋 *Agenda Completa — ${tituloPeriodo}*\n`;
  let agInternas = agendasInternas;
  let opts = opcoes;
  if (agendasInternas && (agendasInternas.isPastor !== undefined || agendasInternas.agendasInternas !== undefined)) {
    opts = agendasInternas;
    agInternas = agendasInternas.agendasInternas || {};
  }
  const isPastor = Boolean(opts && opts.isPastor);

  const itensPorSecao = {};
  SECOES_AGENDA.forEach(s => {
    itensPorSecao[s.key] = [];
  });

  const itens = unificarItensAgendaPreparacao(itensRaw);

  itens.forEach((item, i) => {
    const numero = i + 1;
    const secaoKey = classificarSecaoEvento(item, agInternas);
    if (!itensPorSecao[secaoKey]) {
      itensPorSecao[secaoKey] = [];
    }
    itensPorSecao[secaoKey].push({ item, numero, secaoKey });
  });

  SECOES_AGENDA.forEach(secao => {
    const lista = itensPorSecao[secao.key];
    if (lista && lista.length > 0) {
      msgAgenda += `\n${secao.titulo}\n`;
      lista.forEach(({ item, numero, secaoKey }) => {
        const horaStr = item.horaFmt ? ` às ${item.horaFmt}` : "";
        let tituloExibicao = item.summary;
        if (secaoKey === "ATENDIMENTOS" && !isPastor) {
          tituloExibicao = "Atendimento Pastoral";
        }

        if (item.tipo === "recorrente") {
          const prefixo = (item.weekday === 0 || item.weekday === 6) ? "Todos os" : "Todas as";
          msgAgenda += `${numero} - 🗓️ *${prefixo} ${DIAS_SEMANA_PLURAL[item.weekday]}*${horaStr} | ${tituloExibicao}\n`;
        } else {
          msgAgenda += `${numero} - 📌 *${item.dataFmt}*${horaStr} | ${tituloExibicao}\n`;
        }
        if (item.horarioPreparacaoLimpeza) {
          msgAgenda += `   ⏰ ${item.horarioPreparacaoLimpeza}\n`;
        }
      });
    }
  });

  msgAgenda += `\nQuer o endereço ou mais detalhes de algum evento? Digite o número dele.\nDigite *menu* para voltar ao menu principal.`;
  return msgAgenda;
}

function obterLinkInscricaoEvento(evento = {}, item = {}) {
  const sum = (evento.summary || item.summary || "").trim();
  const desc = (evento.description || "").trim();

  // Se o evento já encerrou (data de término no passado), não há inscrições abertas
  const startRaw = evento.start?.dateTime || evento.start?.date;
  if (startRaw) {
    const agora = moment.tz("America/Sao_Paulo");
    const fimRaw = evento.end?.dateTime || evento.end?.date || startRaw;
    const mFim = moment.tz(fimRaw, "America/Sao_Paulo");
    if (mFim.isBefore(agora)) {
      return "";
    }
  }

  // Evento The Chosen (18/10/2026) já foi realizado e encerrado
  if (/the chosen/i.test(sum)) {
    return "";
  }

  // 1. Link explícito na descrição do evento (Google Calendar)
  const matchInscricao = desc.match(/(?:inscriç[aã]o|inscrições|link de inscrição|inscreva-se)[\s:]+(https?:\/\/[^\s\n\r]+)/i);
  if (matchInscricao) {
    return matchInscricao[1].trim();
  }

  // 2. Link http(s) na descrição caso contenha palavras de inscrição
  if (/inscriç|inscreva/i.test(desc)) {
    const matchHttp = desc.match(/https?:\/\/[^\s\n\r]+/i);
    if (matchHttp) {
      return matchHttp[0].trim();
    }
  }

  // 3. Consulta banco de dados SQLite (gerenciador de eventos)
  try {
    const db = require("../db");
    const termo = sum.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (termo.length >= 3) {
      const rows = db.prepare("SELECT slug, titulo, url_formulario, status, dataEvento FROM eventos WHERE status != 'cancelado'").all();
      for (const r of rows) {
        const titClean = (r.titulo || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (titClean && (titClean.includes(termo) || termo.includes(titClean))) {
          if (r.url_formulario && /^https?:\/\//i.test(r.url_formulario)) {
            return r.url_formulario;
          }
          if (r.slug) {
            return `https://www.comunidadecristacurados.com.br/evento/${r.slug}`;
          }
        }
      }
    }
  } catch {}

  // 4. Mapeamento das páginas oficiais dos ministérios e eventos futuros do site
  const sumNorm = sum.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/pilates|saude da mulher/i.test(sumNorm)) {
    return "https://www.comunidadecristacurados.com.br/saude-mulher";
  }
  if (/culto de mulheres|vaso e o oleiro|mesa posta/i.test(sumNorm)) {
    return "https://www.comunidadecristacurados.com.br/mulheres";
  }
  if (/intercessao|treinamento de intercessao/i.test(sumNorm)) {
    return "https://www.comunidadecristacurados.com.br/intercessao";
  }

  return "";
}

// Monta o detalhe de um item da agenda. Para itens recorrentes, mostra a
// próxima ocorrência a partir de hoje (ou a última, se todas já passaram).
function montarDetalheEvento(item, opcoes = {}) {
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

  const isPastor = Boolean(opcoes && opcoes.isPastor);
  const secaoKey = classificarSecaoEvento(item, opcoes.agendasInternas || {});
  const isPastoral = secaoKey === "ATENDIMENTOS" || /atendimento pastoral/i.test(item.summary || "");
  const esconderNome = isPastoral && !isPastor;

  let tituloExibicao = item.summary;
  if (esconderNome) {
    tituloExibicao = "Atendimento Pastoral";
  }

  let detalhe = `📌 *${tituloExibicao}*\n\n`;

  // Se for evento de múltiplos dias/sessões, exibe a programação completa
  if (item.tipo === "multiplo" && item.eventos && item.eventos.length > 1) {
    detalhe += `📆 *Programação dos Dias / Sessões:*\n`;
    item.eventos.forEach((ev, idx) => {
      const dEv = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo");
      const dFmt = `${dEv.format("DD/MM")} (${DIAS_SEMANA[dEv.day()]})`;
      let hEv = "";
      if (ev.start.dateTime) {
        const dFim = moment.tz(ev.end.dateTime || ev.end.date, "America/Sao_Paulo");
        hEv = ` das ${dEv.format("HH:mm")} às ${dFim.format("HH:mm")}`;
      } else {
        hEv = " (Dia todo)";
      }
      const rotulo = ev.summary && ev.summary.includes("-") ? ev.summary.split("-").pop().trim() : `${idx + 1}ª Sessão`;
      detalhe += `  • *${rotulo}:* ${dFmt}${hEv}\n`;
    });
    detalhe += "\n";
  } else {
    detalhe += `📆 *Data:* ${dataFmt}\n`;
    detalhe += `⏰ *Horário:* ${horarioFmt}\n`;
  }
  if (item.horarioPreparacaoLimpeza) {
    detalhe += `🧹 *Preparação e Limpeza:* ${item.horarioPreparacaoLimpeza}\n`;
  }
  if (evento.location) {
    detalhe += `📍 *Local:* ${evento.location}\n`;
  }

  // Link de inscrição se o evento possuir
  const linkInscricao = obterLinkInscricaoEvento(evento, item);
  if (linkInscricao) {
    detalhe += `\n🔗 *Link de Inscrição:*\n${linkInscricao}\n`;
  }

  if (evento.description) {
    let desc = evento.description.trim();
    if (esconderNome) {
      desc = "Atendimento Pastoral reservado à equipe pastoral.";
    } else if (desc.length > 500) {
      desc = desc.slice(0, 500).trim() + "…";
    }
    detalhe += `\n📝 *Descrição:* ${desc}\n`;
  }

  detalhe += `\nDigite outro número para ver mais detalhes, o nome de outro mês, ou *menu* para voltar.`;
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

/**
 * Verifica estritamente se um evento é futuro (que ainda não aconteceu).
 * Eventos cujo início já ocorreu antes do momento atual retornam false.
 * Eventos de dia inteiro que já terminaram antes de hoje retornam false.
 *
 * @param {object} ev - Objeto do evento da API do Google Calendar
 * @param {moment.Moment} [agora] - Momento de referência (padrão: agora em São Paulo)
 * @returns {boolean} true se o evento é futuro (ainda não aconteceu)
 */
function isEventoFuturo(ev, agora = moment.tz("America/Sao_Paulo")) {
  if (!ev || !ev.start) return false;

  if (ev.start.dateTime) {
    const inicio = moment.tz(ev.start.dateTime, "America/Sao_Paulo");
    return inicio.isSameOrAfter(agora);
  }

  if (ev.start.date) {
    const hoje = agora.clone().startOf("day");
    const inicio = moment.tz(ev.start.date, "YYYY-MM-DD", "America/Sao_Paulo").startOf("day");
    let fim;
    if (ev.end && ev.end.date) {
      const fimMoment = moment.tz(ev.end.date, "YYYY-MM-DD", "America/Sao_Paulo");
      if (fimMoment.isAfter(inicio)) {
        fim = fimMoment.clone().subtract(1, "day").endOf("day");
      } else {
        fim = inicio.clone().endOf("day");
      }
    } else {
      fim = inicio.clone().endOf("day");
    }
    return fim.isSameOrAfter(hoje);
  }

  return false;
}

module.exports = {
  DIAS_SEMANA_PLURAL,
  DIAS_SEMANA,
  URL_THE_CHOSEN,
  isEventoTheChosen,
  agruparEventosAgenda,
  montarMensagemAgenda,
  montarMensagemAgendaCompletaPorSecoes,
  montarDetalheEvento,
  interpretarPeriodoPersonalizado,
  isEventoFuturo,
  extrairFaixaHorarioTexto,
  identificarInfoPreparacaoLimpeza,
  ehEventoPreparacaoLimpeza,
  unificarEventosPreparacaoLimpeza,
  unificarItensAgendaPreparacao,
  obterLinkInscricaoEvento,
  extrairNomeBaseEvento,
  formatarResumoDatas,
  agruparEventosPorNomeBase,
};

