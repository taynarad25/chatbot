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

function marcarConfirmacaoWhatsAppEnviada(id) {
  if (!db) return false;
  const res = db.prepare('UPDATE a_mesa_inscricoes SET notificado_whatsapp = 1 WHERE id = ?').run(id);
  return res.changes > 0;
}

function montarMensagemConfirmacaoAMesa({ nome, telefone }) {
  const primeiroNome = String(nome || '').trim().split(' ')[0] || 'amada';
  return (
    `✨ *À Mesa — Com Gratidão e Propósito*\n` +
    `🌸 *Rede de Mulheres | Comunidade Cristã Curados*\n\n` +
    `Olá, *${primeiroNome}*! A paz do Senhor Jesus! 💛\n\n` +
    `Muito obrigada pela sua inscrição! Sua presença neste encontro especial foi confirmada com muito carinho.\n\n` +
    `🗓️ *Data:* Sábado, 12 de Dezembro de 2026\n` +
    `⏰ *Horário:* 16:00 (Início)\n` +
    `📍 *Local:* Templo Principal — R. Benedicto de Abreu Júnior, 40 (Jd. Nova Itapevi)\n` +
    `👤 *Inscrição:* Individual Confirmada\n\n` +
    `☕ *Momento de Comunhão:*\n` +
    `Teremos uma mesa deliciosa de comunhão e gratidão. Se você puder e desejar ofertar qualquer valor voluntário para os comes e bebes deste momento, por favor procure com carinho uma de nossas líderes da Rede de Mulheres: *Gisa* ou *Gláucia*.\n\n` +
    `Estamos muito felizes e na expectativa do que Deus fará nessa tarde. Nos vemos lá! ✨🙏`
  );
}

const URL_WEBAPP_A_MESA_PADRAO =
  process.env.A_MESA_WEBAPP_URL ||
  'https://script.google.com/macros/s/AKfycbya9QT6Om31dmLSe87Ju3iFE3bL1oIdeHYUoEKLDk5z3LX6M_hHd0NFoZSk6uZgLVfV/exec';

async function enviarInscricaoPlanilhaAMesa(dados, { url = URL_WEBAPP_A_MESA_PADRAO, fetchFn = global.fetch } = {}) {
  const webAppUrl = url || process.env.A_MESA_WEBAPP_URL || URL_WEBAPP_A_MESA_PADRAO;
  if (!webAppUrl) {
    return { ok: false, message: 'URL do Google Sheets não configurada.' };
  }

  const payload = {
    evento: 'À Mesa - Rede de Mulheres',
    nome: dados.nome || '',
    telefone: dados.telefone || '',
    tipo: 'Individual',
    data: moment.tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm'),
  };

  try {
    const res = await fetchFn(webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    return { ok: res.ok };
  } catch (err) {
    console.warn('[Evento À Mesa] Erro ao enviar para o Google Sheets:', err.message);
    return { ok: false, message: err.message };
  }
}

async function sincronizarInscricoesComNuvemAMesa({ url = URL_WEBAPP_A_MESA_PADRAO, fetchFn = global.fetch } = {}) {
  const webAppUrl = url || process.env.A_MESA_WEBAPP_URL || URL_WEBAPP_A_MESA_PADRAO;
  if (!webAppUrl) {
    return { ok: false, message: 'URL da planilha não configurada.' };
  }

  try {
    const res = await fetchFn(webAppUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Google Apps Script respondeu com status ${res.status}`);
    }

    const data = await res.json();
    const rows = Array.isArray(data.inscritas) ? data.inscritas : (Array.isArray(data) ? data : []);
    let importadas = 0;

    for (const r of rows) {
      const nome = r.nome || r['Nome Completo'] || '';
      const tel = r.telefone || r['Telefone / WhatsApp'] || '';
      if (nome && tel) {
        try {
          const resultado = salvarInscricaoAMesa({ nome, telefone: String(tel) });
          if (!resultado.jaInscrita) importadas++;
        } catch (_) {}
      }
    }

    return { ok: true, totalPlanilha: rows.length, importadas };
  } catch (err) {
    console.warn('[Evento À Mesa] Erro ao sincronizar com Google Sheets:', err.message);
    return { ok: false, message: err.message };
  }
}

function exportarCsvInscricoesAMesa() {
  const inscricoes = listarInscricoesAMesa();
  const BOM = '\uFEFF';
  const cabecalho = ['ID', 'Nome Completo', 'Telefone', 'Tipo de Inscrição', 'Data da Inscrição', 'Status'].join(';');
  const linhas = inscricoes.map(i => {
    return [
      i.id,
      `"${(i.nome || '').replace(/"/g, '""')}"`,
      `"${i.telefoneFormatado || i.telefone || ''}"`,
      `"${i.tipo || 'Individual'}"`,
      `"${i.dataInscricaoFormatada || i.data_inscricao || ''}"`,
      `"${i.status || 'confirmada'}"`
    ].join(';');
  });

  return BOM + [cabecalho, ...linhas].join('\r\n');
}

function gerarResumoTextoAMesa() {
  const inscritas = listarInscricoesAMesa();
  const stats = obterEstatisticasAMesa();

  let msg = `✨ *Inscrições — À Mesa: Com Gratidão e Propósito*\n`;
  msg += `🌸 *Rede de Mulheres | Comunidade Cristã Curados*\n`;
  msg += `🗓️ *Data:* 12/12/2026 às 16:00 • Templo Principal\n\n`;
  msg += `📊 *Total de Mulheres Inscritas:* ${stats.totalInscritas}\n\n`;

  if (inscritas.length === 0) {
    msg += `_Nenhuma inscrição registrada até o momento._\n`;
  } else {
    msg += `📋 *Lista de Participantes:*\n`;
    inscritas.forEach((ins, idx) => {
      msg += `${idx + 1}. *${ins.nome}* — ${ins.telefoneFormatado}\n`;
    });
  }

  msg += `\n💡 _Lembrete de Comunhão: quem puder ofertar voluntariamente para comes e bebes deve procurar Gisa ou Gláucia._`;
  return msg;
}

module.exports = {
  DATA_EVENTO_A_MESA,
  URL_WEBAPP_A_MESA_PADRAO,
  isEventoExpirado,
  salvarInscricaoAMesa,
  listarInscricoesAMesa,
  obterEstatisticasAMesa,
  excluirInscricaoAMesa,
  enviarInscricaoPlanilhaAMesa,
  sincronizarInscricoesComNuvemAMesa,
  exportarCsvInscricoesAMesa,
  gerarResumoTextoAMesa,
  marcarConfirmacaoWhatsAppEnviada,
  montarMensagemConfirmacaoAMesa,
};

