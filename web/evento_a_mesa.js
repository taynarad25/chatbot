const db = require('../db');
const moment = require('moment-timezone');
const { isEventoExpiradoData } = require('./limpeza_eventos');

// Cria tabela de inscrições para o evento À Mesa (Rede de Mulheres)
db.exec(`
  CREATE TABLE IF NOT EXISTS a_mesa_inscricoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'Individual',
    data_inscricao TEXT NOT NULL,
    enviado_planilha INTEGER NOT NULL DEFAULT 0,
    notificado_whatsapp INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'confirmada'
  );
  CREATE INDEX IF NOT EXISTS idx_a_mesa_telefone ON a_mesa_inscricoes(telefone);
`);

const DATA_EVENTO_A_MESA = '2026-12-12';

function isEventoExpirado() {
  return isEventoExpiradoData(DATA_EVENTO_A_MESA);
}

function normalizarTelefone(tel) {
  if (!tel) return '';
  return String(tel).replace(/\D/g, '');
}

function formatarTelefone(tel) {
  const digits = normalizarTelefone(tel);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return tel;
}

function salvarInscricaoAMesa({ nome, telefone }) {
  if (!nome || !nome.trim()) {
    throw new Error('Por favor, informe seu nome completo.');
  }
  if (!telefone || !telefone.trim()) {
    throw new Error('Por favor, informe seu número de telefone/WhatsApp.');
  }

  const telLimpo = normalizarTelefone(telefone);
  if (telLimpo.length < 10) {
    throw new Error('Número de telefone inválido. Informe o DDD + número (ex: 11 99999-9999).');
  }

  const nomeFormatado = nome.trim().replace(/\s+/g, ' ');
  const agoraSP = moment.tz('America/Sao_Paulo').format('YYYY-MM-DD HH:mm:ss');

  // Verifica se já existe inscrição com este telefone
  const existente = db.prepare(`
    SELECT * FROM a_mesa_inscricoes
    WHERE telefone = ? AND status != 'cancelada'
    LIMIT 1
  `).get(telLimpo);

  if (existente) {
    return {
      id: existente.id,
      nome: existente.nome,
      telefone: formatarTelefone(existente.telefone),
      jaInscrita: true,
      mensagem: 'Você já possui uma inscrição confirmada para o evento À Mesa!',
    };
  }

  const stmt = db.prepare(`
    INSERT INTO a_mesa_inscricoes (nome, telefone, tipo, data_inscricao, status)
    VALUES (?, ?, 'Individual', ?, 'confirmada')
  `);

  const res = stmt.run(nomeFormatado, telLimpo, agoraSP);

  return {
    id: res.lastInsertRowid,
    nome: nomeFormatado,
    telefone: formatarTelefone(telLimpo),
    jaInscrita: false,
    mensagem: 'Inscrição confirmada com sucesso!',
  };
}

function listarInscricoesAMesa() {
  const rows = db.prepare(`
    SELECT id, nome, telefone, tipo, data_inscricao, status
    FROM a_mesa_inscricoes
    WHERE status != 'cancelada'
    ORDER BY id ASC
  `).all();

  return rows.map(r => ({
    ...r,
    telefoneFormatado: formatarTelefone(r.telefone),
    dataInscricaoFormatada: moment.tz(r.data_inscricao, 'America/Sao_Paulo').format('DD/MM/YYYY HH:mm'),
  }));
}

function obterEstatisticasAMesa() {
  const total = db.prepare(`
    SELECT COUNT(*) as c FROM a_mesa_inscricoes WHERE status != 'cancelada'
  `).get().c;

  return {
    totalInscritas: total,
    dataEvento: '12/12/2026 às 16h',
    local: 'Templo Principal',
  };
}

function excluirInscricaoAMesa(id) {
  const res = db.prepare(`
    UPDATE a_mesa_inscricoes SET status = 'cancelada' WHERE id = ?
  `).run(id);
  return res.changes > 0;
}

module.exports = {
  DATA_EVENTO_A_MESA,
  isEventoExpirado,
  salvarInscricaoAMesa,
  listarInscricoesAMesa,
  obterEstatisticasAMesa,
  excluirInscricaoAMesa,
};

