const moment = require("moment-timezone");

const DIAS_SEMANA_MAP = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  seg: 1,
  "segunda-feira": 1,
  terca: 2,
  terça: 2,
  ter: 2,
  "terca-feira": 2,
  "terça-feira": 2,
  quarta: 3,
  qua: 3,
  "quarta-feira": 3,
  quinta: 4,
  qui: 4,
  "quinta-feira": 4,
  sexta: 5,
  sex: 5,
  "sexta-feira": 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
  sáb: 6,
};

const NOMES_DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const MESES_MAP = {
  janeiro: 1,
  jan: 1,
  fevereiro: 2,
  fev: 2,
  marco: 3,
  março: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  maio: 5,
  mai: 5,
  junho: 6,
  jun: 6,
  julho: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setembro: 9,
  set: 9,
  outubro: 10,
  out: 10,
  novembro: 11,
  nov: 11,
  dezembro: 12,
  dez: 12,
};

const NOMES_MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/**
 * Interpreta uma entrada de texto de meses, como:
 * - "11 e 1" -> [{ mes: 11, ano: 2026 }, { mes: 1, ano: 2027 }]
 * - "novembro e janeiro"
 * - "11 a 1" ou "novembro a janeiro" (intervalo incluindo dez e jan)
 * - "11" ou "novembro"
 * - "11, 12, 1"
 */
function interpretarMesesRecorrencia(texto = "", dataRefMom = null) {
  const agora = dataRefMom || moment.tz("America/Sao_Paulo");
  const anoAtual = agora.year();
  const mesAtual = agora.month() + 1;

  const raw = String(texto || "").toLowerCase().trim();
  if (!raw) return [];

  // Verifica se é padrão intervalo "X a Y" ou "X até Y"
  const matchIntervalo = raw.match(/^([a-z0-9çã]+)\s+(?:a|at[eé])\s+([a-z0-9çã]+)$/i);
  if (matchIntervalo) {
    const mIni = parseMesToken(matchIntervalo[1]);
    const mFim = parseMesToken(matchIntervalo[2]);
    if (mIni && mFim) {
      const lista = [];
      let m = mIni;
      while (true) {
        const ano = m < mesAtual ? anoAtual + 1 : anoAtual;
        lista.push({ mes: m, ano });
        if (m === mFim) break;
        m = m === 12 ? 1 : m + 1;
        if (lista.length > 24) break; // Trava de segurança
      }
      return lista;
    }
  }

  // Divide por vírgulas, "e", "ou", barras ou espaços
  const tokens = raw
    .replace(/\s+e\s+/g, ",")
    .replace(/\s+ou\s+/g, ",")
    .replace(/[\/\-]/g, ",")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const mesesInfo = [];
  const vistos = new Set();

  for (const t of tokens) {
    const numMes = parseMesToken(t);
    if (numMes) {
      const ano = numMes < mesAtual ? anoAtual + 1 : anoAtual;
      const chave = `${numMes}-${ano}`;
      if (!vistos.has(chave)) {
        vistos.add(chave);
        mesesInfo.push({ mes: numMes, ano });
      }
    }
  }

  // Ordena cronologicamente
  mesesInfo.sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  return mesesInfo;
}

function parseMesToken(token) {
  const t = String(token || "").toLowerCase().trim();
  const num = parseInt(t, 10);
  if (!isNaN(num) && num >= 1 && num <= 12) return num;
  return MESES_MAP[t] || null;
}

/**
 * Converte dia da semana em objeto { diaSemana: 0..6, nome: string }
 * Reconhece números (1=Domingo..7=Sábado) e expressões ("todo domingo", "todas as sextas", "domingo", etc.)
 */
function interpretarDiaSemana(token) {
  let t = String(token || "").toLowerCase().trim();
  if (!t) return null;

  // Se for apenas número
  const num = parseInt(t, 10);
  if (!isNaN(num) && /^\d+$/.test(t)) {
    let diaIdx = null;
    if (num === 1) diaIdx = 0; // 1 = Domingo
    else if (num === 2) diaIdx = 1; // 2 = Segunda-feira
    else if (num === 3) diaIdx = 2; // 3 = Terça-feira
    else if (num === 4) diaIdx = 3; // 4 = Quarta-feira
    else if (num === 5) diaIdx = 4; // 5 = Quinta-feira
    else if (num === 6) diaIdx = 5; // 6 = Sexta-feira
    else if (num === 7) diaIdx = 6; // 7 = Sábado
    if (diaIdx !== null) {
      return { diaSemana: diaIdx, nome: NOMES_DIAS_SEMANA[diaIdx] };
    }
  }

  // Remove termos comuns como "todo", "toda", "todos os", "todas as", "aos", "às", "nas", "nos"
  t = t.replace(/\b(tod[oa]s?\s*(?:[oa]s)?|aos?|[aà]s?|nas?|nos?|de)\b/gi, " ").trim();

  // Busca correspondência nas chaves do mapa
  for (const [chave, val] of Object.entries(DIAS_SEMANA_MAP)) {
    const regex = new RegExp(`\\b${chave}s?\\b`, "i");
    if (regex.test(t)) {
      return { diaSemana: val, nome: NOMES_DIAS_SEMANA[val] };
    }
  }

  return null;
}

/**
 * Gera todas as datas recorrentes para um determinado dia da semana nos meses informados.
 */
function gerarDatasRecorrentes({
  diaSemana,
  mesesInfo = [],
  quinzenal = false,
  dataInicioQuinzenal = null,
}) {
  const datas = [];

  for (const mInfo of mesesInfo) {
    const totalDiasMes = moment.tz([mInfo.ano, mInfo.mes - 1], "America/Sao_Paulo").daysInMonth();
    let contadorDiaSemanaNoMes = 0;

    for (let d = 1; d <= totalDiasMes; d++) {
      const dataMom = moment.tz(
        `${d}/${mInfo.mes}/${mInfo.ano}`,
        "D/M/YYYY",
        "America/Sao_Paulo"
      );
      if (dataMom.day() === diaSemana) {
        contadorDiaSemanaNoMes++;
        let rotuloOrdem = "";
        if (contadorDiaSemanaNoMes === 1) rotuloOrdem = "1º do mês";
        else if (contadorDiaSemanaNoMes === 2) rotuloOrdem = "2º do mês";
        else if (contadorDiaSemanaNoMes === 3) rotuloOrdem = "3º do mês";
        else if (contadorDiaSemanaNoMes === 4) rotuloOrdem = "4º do mês";
        else if (contadorDiaSemanaNoMes === 5) rotuloOrdem = "5º do mês";

        const diaSemanaNome = NOMES_DIAS_SEMANA[diaSemana];
        const dataFmt = dataMom.format("DD/MM/YYYY");
        const dataFmtCurta = dataMom.format("DD/MM");

        datas.push({
          data: dataFmt,
          dataMom,
          dataFmt,
          dataFmtCurta,
          diaSemanaNome,
          ordemNoMes: contadorDiaSemanaNoMes,
          rotuloOrdem,
          dia: d,
          mes: mInfo.mes,
          ano: mInfo.ano,
          texto: `${diaSemanaNome}, ${dataFmtCurta}/${mInfo.ano}${rotuloOrdem ? ` (${rotuloOrdem})` : ""}`,
        });
      }
    }
  }

  // Se for quinzenal, filtra de 14 em 14 dias
  if (quinzenal && datas.length > 0) {
    const filtradasQuinzenal = [];
    const inicio = dataInicioQuinzenal
      ? moment.tz(dataInicioQuinzenal, "DD/MM/YYYY", "America/Sao_Paulo")
      : datas[0].dataMom;

    for (const item of datas) {
      const diffDias = Math.round(item.dataMom.diff(inicio, "days"));
      if (diffDias >= 0 && diffDias % 14 === 0) {
        filtradasQuinzenal.push(item);
      }
    }
    return filtradasQuinzenal;
  }

  return datas;
}

/**
 * Remove datas selecionadas pelo usuário por índice (ex: "1, 6" ou "1 e 6")
 * ou por texto (ex: "1º domingo" ou "primeiro domingo")
 */
function removerDatasRecorrentes(listaDatas = [], entradaRemocao = "") {
  const raw = String(entradaRemocao || "").toLowerCase().trim();
  const resPadrao = [...listaDatas];
  resPadrao.removidas = [];
  resPadrao.listaAtualizada = resPadrao;
  if (!raw) return resPadrao;

  const indicesParaRemover = new Set();

  // Verifica se o usuário pediu para remover primeiro(s) domingo(s) ou primeiro dia
  if (/primeiro|1[ºo]/i.test(raw) && /domingo|dia|s[aá]bado|sexta/i.test(raw)) {
    listaDatas.forEach((d, idx) => {
      if (d.ordemNoMes === 1) {
        indicesParaRemover.add(idx);
      }
    });
  }

  // Extrai números digitados (ex: "1, 6", "1 e 6", "1 6")
  const numeros = raw.match(/\b\d+\b/g);
  if (numeros) {
    numeros.forEach((numStr) => {
      const n = parseInt(numStr, 10) - 1; // 1-indexado para o usuário
      if (n >= 0 && n < listaDatas.length) {
        indicesParaRemover.add(n);
      }
    });
  }

  const listaAtualizada = [];
  const removidas = [];

  listaDatas.forEach((item, idx) => {
    if (indicesParaRemover.has(idx)) {
      removidas.push(item);
    } else {
      listaAtualizada.push(item);
    }
  });

  listaAtualizada.removidas = removidas;
  listaAtualizada.listaAtualizada = listaAtualizada;
  return listaAtualizada;
}

/**
 * Formata a lista interativa de datas numeradas para apresentação ao usuário
 */
function formatarListaDatasInterativa(listaDatas = []) {
  if (!Array.isArray(listaDatas) || listaDatas.length === 0) {
    return "(Nenhuma data selecionada)";
  }

  return listaDatas
    .map((item, i) => `${i + 1} - ${item.texto}`)
    .join("\n");
}

module.exports = {
  DIAS_SEMANA_MAP,
  NOMES_DIAS_SEMANA,
  MESES_MAP,
  NOMES_MESES,
  interpretarMesesRecorrencia,
  interpretarDiaSemana,
  gerarDatasRecorrentes,
  removerDatasRecorrentes,
  formatarListaDatasInterativa,
};
