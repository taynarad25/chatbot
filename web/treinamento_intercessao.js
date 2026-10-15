const crypto = require('crypto');

let db;
try {
  db = require('../db');
} catch (err) {
  console.warn('[Treinamento Intercessão] Não foi possível carregar db.js:', err.message);
}

const URL_WEBAPP_INTERCESSAO_PADRAO =
  process.env.INTERCESSAO_WEBAPP_URL ||
  'https://script.google.com/macros/s/AKfycbyQk1-oLONEbLfqfdDgW3xJETF7kKZTW1lP2NpaR_vFwwK2koBaudYuODD04IT0wg65Iw/exec';

function normalizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

/**
 * Salva ou atualiza a inscrição no banco SQLite.
 */
function salvarInscricaoIntercessao({
  id = null,
  nome,
  telefone,
  email = '',
  experienciaIntercessao = 'Não',
  experienciaDetalhes = '',
  evento = 'Treinamento de Intercessão',
  dataEvento = '2026-11-15 16:00',
  whatsappConfirmacaoEnviado = 0,
  criadoEm = null,
} = {}) {
  if (!db) {
    throw new Error('Banco de dados não disponível');
  }

  const nomeLimpo = String(nome || '').trim();
  if (!nomeLimpo) {
    throw new Error('Nome é obrigatório');
  }

  const telNorm = String(telefone || '').trim();
  if (!telNorm) {
    throw new Error('Telefone é obrigatório');
  }

  const emailLimpo = String(email || '').trim().toLowerCase();
  const dataCriacao = criadoEm || new Date().toISOString();

  // ID único baseado em nome e telefone normalizado
  const inscricaoId =
    id ||
    crypto
      .createHash('md5')
      .update(`${nomeLimpo.toLowerCase()}|${normalizarTelefone(telNorm)}`)
      .digest('hex');

  const stmt = db.prepare(`
    INSERT INTO intercessao_inscricoes (
      id, nome, telefone, email, experienciaIntercessao, experienciaDetalhes,
      evento, dataEvento, whatsappConfirmacaoEnviado, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      nome = excluded.nome,
      telefone = excluded.telefone,
      email = excluded.email,
      experienciaIntercessao = excluded.experienciaIntercessao,
      experienciaDetalhes = excluded.experienciaDetalhes,
      evento = excluded.evento,
      dataEvento = excluded.dataEvento
  `);

  stmt.run(
    inscricaoId,
    nomeLimpo,
    telNorm,
    emailLimpo,
    experienciaIntercessao || 'Não',
    experienciaDetalhes || '',
    evento,
    dataEvento,
    whatsappConfirmacaoEnviado ? 1 : 0,
    dataCriacao
  );

  return obterInscricaoIntercessaoPorId(inscricaoId);
}

function obterInscricaoIntercessaoPorId(id) {
  if (!db) return null;
  const row = db.prepare('SELECT * FROM intercessao_inscricoes WHERE id = ?').get(String(id));
  return row || null;
}

function listarInscricoesIntercessao() {
  if (!db) return [];
  return db.prepare('SELECT * FROM intercessao_inscricoes ORDER BY criadoEm DESC').all();
}

function obterEstatisticasIntercessao() {
  const inscricoes = listarInscricoesIntercessao();
  const total = inscricoes.length;
  const comExperiencia = inscricoes.filter(
    (i) => i.experienciaIntercessao && /^sim/i.test(i.experienciaIntercessao)
  ).length;
  const semExperiencia = total - comExperiencia;
  const whatsappConfirmado = inscricoes.filter((i) => i.whatsappConfirmacaoEnviado === 1).length;

  return {
    total,
    comExperiencia,
    semExperiencia,
    whatsappConfirmado,
    whatsappPendente: total - whatsappConfirmado,
  };
}

function excluirInscricaoIntercessao(id) {
  if (!db) return false;
  const res = db.prepare('DELETE FROM intercessao_inscricoes WHERE id = ?').run(String(id));
  return res.changes > 0;
}

function marcarConfirmacaoIntercessaoEnviada(id) {
  if (!db) return false;
  const res = db.prepare('UPDATE intercessao_inscricoes SET whatsappConfirmacaoEnviado = 1 WHERE id = ?').run(String(id));
  return res.changes > 0;
}

/**
 * Envia a inscrição para o Web App do Google Apps Script
 */
async function enviarInscricaoPlanilhaIntercessao(
  dados,
  { url = URL_WEBAPP_INTERCESSAO_PADRAO, fetchFn = global.fetch } = {}
) {
  const webAppUrl = url || process.env.INTERCESSAO_WEBAPP_URL || URL_WEBAPP_INTERCESSAO_PADRAO;
  if (!webAppUrl) {
    return { ok: false, message: 'URL do Google Apps Script de Intercessão não configurada.' };
  }

  const payload = {
    nome: dados.nome || '',
    telefone: dados.telefone || '',
    email: dados.email || '',
    experienciaIntercessao: dados.experienciaIntercessao || 'Não',
    experienciaDetalhes: dados.experienciaDetalhes || '',
  };

  try {
    const response = await fetchFn(webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { ok: response.ok, raw: text };
    }

    return {
      ok: Boolean(json.ok || json.status === 'success' || response.ok),
      data: json,
    };
  } catch (err) {
    console.warn('[Treinamento Intercessão] Erro ao sincronizar com Google Apps Script:', err.message);
    return { ok: false, message: err.message };
  }
}

/**
 * Sincroniza todas as inscrições da planilha com o banco SQLite local
 */
async function sincronizarInscricoesComNuvemIntercessao({
  url = URL_WEBAPP_INTERCESSAO_PADRAO,
  fetchFn = global.fetch,
} = {}) {
  const webAppUrl = url || process.env.INTERCESSAO_WEBAPP_URL || URL_WEBAPP_INTERCESSAO_PADRAO;
  if (!webAppUrl) {
    return { ok: false, message: 'URL da planilha não configurada.' };
  }

  try {
    const response = await fetchFn(webAppUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script respondeu com status ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.inscricoes)) {
      return { ok: false, message: 'Formato inválido retornado pelo Google Apps Script.' };
    }

    let adicionados = 0;
    for (const item of data.inscricoes) {
      if (!item.nome) continue;
      salvarInscricaoIntercessao({
        nome: item.nome,
        telefone: item.telefone,
        email: item.email || '',
        experienciaIntercessao: item.experienciaIntercessao || 'Não',
        experienciaDetalhes: item.experienciaDetalhes || '',
        criadoEm: item.criadoEm || null,
      });
      adicionados++;
    }

    return { ok: true, total: adicionados };
  } catch (err) {
    console.warn('[Treinamento Intercessão] Erro na sincronização:', err.message);
    return { ok: false, message: err.message };
  }
}

function montarMensagemConfirmacaoIntercessao(dados) {
  const nome = dados.nome || 'Irmão(ã)';
  return (
    `🙏 *Inscrição Confirmada — Treinamento de Intercessão!*\n\n` +
    `Olá, *${nome}*! Sua inscrição para o Treinamento de Intercessão da *Comunidade Cristã Curados* foi confirmada com sucesso!\n\n` +
    `🗓️ *Início:* Domingo, 15 de Novembro de 2026\n` +
    `⏰ *Horário:* Todos os Domingos às 16:00\n` +
    `📍 *Local:* Comunidade Cristã Curados — Templo Principal\n` +
    `📖 _"e serás chamado reparador de brechas e restaurador de veredas"_ (Isaías 58:12)\n\n` +
    `Estamos muito felizes em ter você conosco nesse tempo de edificação e oração! Nos vemos lá!`
  );
}

function renderIntercessaoPdfHtml() {
  const inscricoes = listarInscricoesIntercessao();
  const stats = obterEstatisticasIntercessao();

  const linhas = inscricoes
    .map(
      (item, idx) => `
    <tr>
      <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
      <td style="font-weight: 600;">${item.nome}</td>
      <td>${item.telefone}</td>
      <td>${item.email || '-'}</td>
      <td style="text-align: center;">${item.experienciaIntercessao || 'Não'}</td>
      <td>${item.experienciaDetalhes || '-'}</td>
      <td style="text-align: center; font-size: 0.8rem; color: #64748b;">${item.criadoEm || '-'}</td>
    </tr>
  `
    )
    .join('');

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <title>Lista de Inscritos — Treinamento de Intercessão</title>
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 24px; color: #1e293b; }
      .header { border-bottom: 3px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px; }
      h1 { margin: 0 0 6px 0; font-size: 20px; color: #1e1b4b; }
      p { margin: 2px 0; font-size: 13px; color: #475569; }
      .stats { display: flex; gap: 15px; margin: 15px 0 20px 0; }
      .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; flex: 1; text-align: center; }
      .stat-val { font-size: 20px; font-weight: 800; color: #4f46e5; }
      .stat-lbl { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #4f46e5; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
      td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
      tr:nth-child(even) { background: #fdfdfd; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>🙏 Treinamento de Intercessão — Lista de Inscritos</h1>
      <p><strong>Comunidade Cristã Curados</strong> • Início: 15/11/2026 às 16:00 (Todos os Domingos)</p>
      <p><em>"e serás chamado reparador de brechas e restaurador de veredas"</em></p>
    </div>
    <div class="stats">
      <div class="stat-box">
        <div class="stat-val">${stats.total}</div>
        <div class="stat-lbl">Total Inscritos</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${stats.comExperiencia}</div>
        <div class="stat-lbl">Já Participou / Fez Curso</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${stats.semExperiencia}</div>
        <div class="stat-lbl">Primeira Vez</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 40px; text-align: center;">Nº</th>
          <th>Nome</th>
          <th style="width: 120px;">Telefone</th>
          <th>E-mail</th>
          <th style="width: 100px; text-align: center;">Já participou?</th>
          <th>Detalhes</th>
          <th style="width: 110px; text-align: center;">Data</th>
        </tr>
      </thead>
      <tbody>
        ${linhas || '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">Nenhum inscrito até o momento.</td></tr>'}
      </tbody>
    </table>
  </body>
  </html>
  `;
}

module.exports = {
  salvarInscricaoIntercessao,
  obterInscricaoIntercessaoPorId,
  listarInscricoesIntercessao,
  obterEstatisticasIntercessao,
  excluirInscricaoIntercessao,
  marcarConfirmacaoIntercessaoEnviada,
  enviarInscricaoPlanilhaIntercessao,
  sincronizarInscricoesComNuvemIntercessao,
  montarMensagemConfirmacaoIntercessao,
  renderIntercessaoPdfHtml,
};
