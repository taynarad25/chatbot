const moment = require("moment-timezone");
const db = require("../db");

const DIAS_SEMANA_NOMES = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado"
];

const MESES_NOMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function formatarDataExtenso(dataStr) {
  // dataStr pode vir como DD/MM, DD/MM/YYYY ou YYYY-MM-DD
  const m = moment.tz(dataStr, ["D/M/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "D/M"], "America/Sao_Paulo");
  if (!m.isValid()) return dataStr;
  const diaSemana = DIAS_SEMANA_NOMES[m.day()];
  const dia = m.date();
  const mes = MESES_NOMES[m.month()];
  const ano = m.year();
  return `${diaSemana}, ${String(dia).padStart(2, "0")} de ${mes} de ${ano}`;
}

function formatarDataCurta(dataStr) {
  const m = moment.tz(dataStr, ["D/M/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "D/M"], "America/Sao_Paulo");
  if (!m.isValid()) return dataStr;
  const diaSemana = DIAS_SEMANA_NOMES[m.day()];
  return `${diaSemana} (${m.format("DD/MM")})`;
}

/**
 * Gera automaticamente uma descrição rica, acolhedora e organizada para o evento.
 */
function gerarDescricaoEvento({
  evento,
  tipoDuracao = "unico",
  horarios,
  departamento = "Comunidade Cristã Curados",
  local = "Comunidade Cristã Curados",
  tema = "",
  preletor = "",
  louvor = "",
  publico = "",
  observacoes = ""
}) {
  const nomeLimpo = (evento || "Evento Especial").trim();
  const localLimpo = (local || "Comunidade Cristã Curados").trim();
  const deptoLimpo = (departamento || "Igreja").trim();

  let blocoCronograma = "";

  if (tipoDuracao === "unico") {
    // 1 Dia: horarios pode ser objeto { data, inicio, fim } ou array com 1 item
    const h = Array.isArray(horarios) ? horarios[0] : horarios;
    const dataExtenso = formatarDataExtenso(h?.data || "");
    blocoCronograma = 
      `🗓️ *Data:* ${dataExtenso}\n` +
      `⏰ *Horário:* das ${h?.inicio || "19:00"} às ${h?.fim || "21:00"}`;
  } else if (tipoDuracao === "consecutivo") {
    // Vários dias seguidos
    const h = Array.isArray(horarios) ? horarios[0] : horarios;
    const dataInicioExt = formatarDataExtenso(h?.dataInicio || h?.data);
    const dataFimExt = formatarDataExtenso(h?.dataFim || h?.dataTermino || h?.data);
    const horaIni = h?.horaInicio || h?.inicio || "19:00";
    const horaFim = h?.horaFim || h?.fim || "21:00";

    blocoCronograma = 
      `🗓️ *Período:* Evento de dias consecutivos\n` +
      `🚀 *Início:* ${dataInicioExt} às ${horaIni}\n` +
      `🏁 *Término:* ${dataFimExt} às ${horaFim}`;
  } else if (tipoDuracao === "multiplo") {
    // Múltiplos blocos espalhados
    const blocos = Array.isArray(horarios) ? horarios : [horarios];
    const listaBlocos = blocos.map((b, idx) => {
      const dataFormatada = formatarDataCurta(b.data);
      const rotulo = b.titulo || b.sessao ? ` (${b.titulo || b.sessao})` : "";
      return `  • *${idx + 1}ª Sessão:* ${dataFormatada} das ${b.inicio} às ${b.fim}${rotulo}`;
    }).join("\n");

    blocoCronograma = 
      `📋 *Programação por Sessão (Múltiplos Dias):*\n${listaBlocos}`;
  }

  const blocoTema = tema ? `\n📖 *Tema Central:* ${tema}` : "";
  const blocoPreletor = preletor ? `\n🎤 *Preletor(a):* ${preletor}` : "";
  const blocoLouvor = louvor ? `\n🎵 *Louvor:* ${louvor}` : "";
  const blocoPublico = publico ? `\n🎯 *Público-alvo:* ${publico}` : "";
  const blocoObs = observacoes ? `\n💡 *Observações:* ${observacoes}` : "";

  const descricao = 
`✨ *${nomeLimpo.toUpperCase()}* ✨${blocoTema}

${blocoCronograma}
📍 *Local:* ${localLimpo}
🏢 *Ministério Responsável:* ${deptoLimpo}${blocoPreletor}${blocoLouvor}${blocoPublico}${blocoObs}

⏰ *Orientação Geral:* Chegue com antecedência para garantir seu lugar.
_Comunidade Cristã Curados_`;

  return descricao.trim();
}

/**
 * Salva ou atualiza a descrição do evento no banco de dados SQLite.
 */
function salvarDescricaoEvento({
  evento,
  departamento = "",
  local = "",
  tipoDuracao = "unico",
  horarios,
  descricao
}) {
  const agora = new Date().toISOString();
  const horariosJson = typeof horarios === "string" ? horarios : JSON.stringify(horarios || []);

  const existente = db.prepare("SELECT id FROM descricoes_eventos WHERE LOWER(TRIM(evento)) = LOWER(TRIM(?))").get(evento);

  if (existente) {
    db.prepare(`
      UPDATE descricoes_eventos 
      SET departamento = ?, local = ?, tipoDuracao = ?, horariosJson = ?, descricao = ?, atualizadoEm = ?
      WHERE id = ?
    `).run(departamento, local, tipoDuracao, horariosJson, descricao, agora, existente.id);
    return existente.id;
  }

  const res = db.prepare(`
    INSERT INTO descricoes_eventos (evento, departamento, local, tipoDuracao, horariosJson, descricao, criadoEm, atualizadoEm)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(evento.trim(), departamento, local, tipoDuracao, horariosJson, descricao, agora, agora);

  return res.lastInsertRowid;
}

/**
 * Busca a descrição do evento por nome exato ou termo similar no SQLite.
 */
function buscarDescricaoEvento(termo) {
  if (!termo || typeof termo !== "string") return null;
  const termoLimpo = termo.trim().toLowerCase();

  // 1. Busca exata
  let row = db.prepare("SELECT * FROM descricoes_eventos WHERE LOWER(TRIM(evento)) = ? ORDER BY id DESC LIMIT 1").get(termoLimpo);
  if (row) return formatarRegistroDescricao(row);

  // 2. Busca por substring/like
  row = db.prepare("SELECT * FROM descricoes_eventos WHERE LOWER(evento) LIKE ? ORDER BY id DESC LIMIT 1").get(`%${termoLimpo}%`);
  if (row) return formatarRegistroDescricao(row);

  // 3. Fallback: busca palavras-chave
  const palavras = termoLimpo.split(/\s+/).filter(p => p.length >= 4);
  for (const pal of palavras) {
    row = db.prepare("SELECT * FROM descricoes_eventos WHERE LOWER(evento) LIKE ? ORDER BY id DESC LIMIT 1").get(`%${pal}%`);
    if (row) return formatarRegistroDescricao(row);
  }

  return null;
}

function formatarRegistroDescricao(row) {
  let horarios = [];
  try {
    horarios = JSON.parse(row.horariosJson);
  } catch (e) {
    horarios = [];
  }
  return {
    id: row.id,
    evento: row.evento,
    departamento: row.departamento,
    local: row.local,
    tipoDuracao: row.tipoDuracao,
    horarios,
    descricao: row.descricao,
    criadoEm: row.criadoEm,
    atualizadoEm: row.atualizadoEm
  };
}

/**
 * Lista todas as descrições de eventos cadastradas.
 */
function listarDescricoesEventos() {
  const rows = db.prepare("SELECT * FROM descricoes_eventos ORDER BY id DESC").all();
  return rows.map(formatarRegistroDescricao);
}

module.exports = {
  gerarDescricaoEvento,
  salvarDescricaoEvento,
  buscarDescricaoEvento,
  listarDescricoesEventos,
  formatarDataExtenso,
  formatarDataCurta
};
