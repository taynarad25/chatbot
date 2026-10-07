const crypto = require('crypto');

let db;
try {
  db = require('../db');
} catch (err) {
  console.warn('[Saúde da Mulher] Não foi possível carregar db.js:', err.message);
}

const URL_WEBAPP_SAUDE_MULHER_PADRAO =
  process.env.SAUDE_MULHER_WEBAPP_URL ||
  'https://script.google.com/macros/s/AKfycbwdSkqBBsMYBVngZtzwfXSry3aJQSJZxSOejmXVizq_m0JKeuMih6J8_tiR4k_0fd68Pg/exec';

let metadataPlanilhaSaudeMulher = {
  spreadsheetId: process.env.SAUDE_MULHER_SPREADSHEET_ID || '',
  spreadsheetUrl: process.env.SAUDE_MULHER_SPREADSHEET_URL || '',
  pdfUrl: process.env.SAUDE_MULHER_PDF_URL || '',
};

function obterLinksPlanilhaSaudeMulher() {
  const ssId = metadataPlanilhaSaudeMulher.spreadsheetId;
  const pdfUrl = ssId
    ? `https://docs.google.com/spreadsheets/d/${ssId}/export?format=pdf&portrait=true&size=a4&gridlines=true`
    : metadataPlanilhaSaudeMulher.pdfUrl;
  const spreadsheetUrl = ssId
    ? `https://docs.google.com/spreadsheets/d/${ssId}/edit?usp=sharing`
    : metadataPlanilhaSaudeMulher.spreadsheetUrl;

  return {
    spreadsheetId: ssId,
    spreadsheetUrl,
    pdfUrl,
  };
}

function atualizarMetadataPlanilhaSaudeMulher({ spreadsheetId, spreadsheetUrl, pdfUrl } = {}) {
  if (spreadsheetId) metadataPlanilhaSaudeMulher.spreadsheetId = spreadsheetId;
  if (spreadsheetUrl) metadataPlanilhaSaudeMulher.spreadsheetUrl = spreadsheetUrl;
  if (pdfUrl) metadataPlanilhaSaudeMulher.pdfUrl = pdfUrl;
}

function normalizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

/**
 * Salva ou atualiza a inscrição e anamnese no banco SQLite.
 */
function salvarInscricaoSaudeMulher({
  id = null,
  nome,
  idade = '',
  telefone,
  condicoesSaude = '',
  tratamentoMedicamento = '',
  cirurgia = 'Não',
  cirurgiaDetalhes = '',
  lesaoDor = 'Não',
  lesaoDorDetalhes = '',
  limitacao = 'Não',
  limitacaoDetalhes = '',
  gravida = 'Não',
  atividadeFisica = 'Não',
  atividadeFisicaDetalhes = '',
  outrasInformacoes = '',
  evento = 'Saúde da Mulher — Pilates',
  dataEvento = '2026-10-31 15:00',
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

  const dataCriacao = criadoEm || new Date().toISOString();

  // ID único baseado em nome e telefone normalizado
  const inscricaoId =
    id ||
    crypto
      .createHash('md5')
      .update(`${nomeLimpo.toLowerCase()}|${normalizarTelefone(telNorm)}`)
      .digest('hex');

  const stmt = db.prepare(`
    INSERT INTO saude_mulher_inscricoes (
      id, nome, idade, telefone, condicoesSaude, tratamentoMedicamento,
      cirurgia, cirurgiaDetalhes, lesaoDor, lesaoDorDetalhes,
      limitacao, limitacaoDetalhes, gravida, atividadeFisica,
      atividadeFisicaDetalhes, outrasInformacoes, evento, dataEvento,
      whatsappConfirmacaoEnviado, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      nome = excluded.nome,
      idade = excluded.idade,
      telefone = excluded.telefone,
      condicoesSaude = excluded.condicoesSaude,
      tratamentoMedicamento = excluded.tratamentoMedicamento,
      cirurgia = excluded.cirurgia,
      cirurgiaDetalhes = excluded.cirurgiaDetalhes,
      lesaoDor = excluded.lesaoDor,
      lesaoDorDetalhes = excluded.lesaoDorDetalhes,
      limitacao = excluded.limitacao,
      limitacaoDetalhes = excluded.limitacaoDetalhes,
      gravida = excluded.gravida,
      atividadeFisica = excluded.atividadeFisica,
      atividadeFisicaDetalhes = excluded.atividadeFisicaDetalhes,
      outrasInformacoes = excluded.outrasInformacoes,
      evento = excluded.evento,
      dataEvento = excluded.dataEvento,
      whatsappConfirmacaoEnviado = excluded.whatsappConfirmacaoEnviado
  `);

  stmt.run(
    inscricaoId,
    nomeLimpo,
    String(idade || '').trim(),
    telNorm,
    Array.isArray(condicoesSaude) ? condicoesSaude.join(', ') : String(condicoesSaude || '').trim(),
    String(tratamentoMedicamento || '').trim(),
    String(cirurgia || 'Não').trim(),
    String(cirurgiaDetalhes || '').trim(),
    String(lesaoDor || 'Não').trim(),
    String(lesaoDorDetalhes || '').trim(),
    String(limitacao || 'Não').trim(),
    String(limitacaoDetalhes || '').trim(),
    String(gravida || 'Não').trim(),
    String(atividadeFisica || 'Não').trim(),
    String(atividadeFisicaDetalhes || '').trim(),
    String(outrasInformacoes || '').trim(),
    evento,
    dataEvento,
    whatsappConfirmacaoEnviado ? 1 : 0,
    dataCriacao
  );

  return buscarInscricaoSaudeMulherPorId(inscricaoId);
}

function buscarInscricaoSaudeMulherPorId(id) {
  if (!db) return null;
  const row = db.prepare('SELECT * FROM saude_mulher_inscricoes WHERE id = ?').get(String(id));
  if (!row) return null;
  return {
    ...row,
    whatsappConfirmacaoEnviado: Boolean(row.whatsappConfirmacaoEnviado),
  };
}

function buscarInscricaoSaudeMulherPorTelefone(telefone) {
  if (!db) return null;
  const telNorm = normalizarTelefone(telefone);
  const rows = db.prepare('SELECT * FROM saude_mulher_inscricoes').all();
  const encontrada = rows.find(r => normalizarTelefone(r.telefone) === telNorm);
  if (!encontrada) return null;
  return {
    ...encontrada,
    whatsappConfirmacaoEnviado: Boolean(encontrada.whatsappConfirmacaoEnviado),
  };
}

function listarInscricoesSaudeMulher() {
  if (!db) return [];
  const rows = db.prepare('SELECT * FROM saude_mulher_inscricoes ORDER BY criadoEm DESC').all();
  return rows.map(r => ({
    ...r,
    whatsappConfirmacaoEnviado: Boolean(r.whatsappConfirmacaoEnviado),
  }));
}

function obterEstatisticasSaudeMulher() {
  const lista = listarInscricoesSaudeMulher();
  const total = lista.length;
  const whatsappConfirmados = lista.filter(i => i.whatsappConfirmacaoEnviado).length;
  const pendentesConfirmacao = total - whatsappConfirmados;
  const comCondicaoSaude = lista.filter(i => i.condicoesSaude && i.condicoesSaude.trim() !== '' && i.condicoesSaude.toLowerCase() !== 'nenhuma').length;
  const comCirurgia = lista.filter(i => i.cirurgia === 'Sim' || (i.cirurgiaDetalhes && i.cirurgiaDetalhes.trim() !== '')).length;
  const comLesaoDor = lista.filter(i => i.lesaoDor === 'Sim' || (i.lesaoDorDetalhes && i.lesaoDorDetalhes.trim() !== '')).length;
  const gestantes = lista.filter(i => i.gravida === 'Sim').length;
  const praticamAtividade = lista.filter(i => i.atividadeFisica === 'Sim').length;

  return {
    total,
    whatsappConfirmados,
    pendentesConfirmacao,
    comCondicaoSaude,
    comCirurgia,
    comLesaoDor,
    gestantes,
    praticamAtividade,
  };
}

function excluirInscricaoSaudeMulher(id) {
  if (!db) return false;
  const res = db.prepare('DELETE FROM saude_mulher_inscricoes WHERE id = ?').run(String(id));
  return res.changes > 0;
}

function marcarConfirmacaoSaudeMulherEnviada(id) {
  if (!db) return false;
  const res = db.prepare('UPDATE saude_mulher_inscricoes SET whatsappConfirmacaoEnviado = 1 WHERE id = ?').run(String(id));
  return res.changes > 0;
}

/**
 * Envia uma inscrição para o Web App do Google Apps Script (se configurado).
 */
async function enviarInscricaoPlanilhaSaudeMulher(dados, { url = URL_WEBAPP_SAUDE_MULHER_PADRAO, fetchFn = global.fetch } = {}) {
  const webAppUrl = url || process.env.SAUDE_MULHER_WEBAPP_URL;
  if (!webAppUrl) {
    return {
      ok: true,
      salvoLocalmente: true,
      message: 'Inscrição salva localmente (URL do Apps Script não configurada).',
    };
  }

  try {
    const res = await fetchFn(webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
      redirect: 'manual',
    });

    let retorno = null;
    if (res.status >= 300 && res.status < 400 && res.headers && typeof res.headers.get === 'function') {
      const location = res.headers.get('location');
      if (location) {
        const redirected = await fetchFn(location, { method: 'GET' });
        const text = await redirected.text();
        try { retorno = JSON.parse(text); } catch { retorno = { raw: text }; }
      }
    }

    if (!retorno) {
      const text = await res.text();
      try { retorno = JSON.parse(text); } catch { retorno = { raw: text }; }
    }

    return {
      ok: true,
      status: retorno?.status || 'success',
      message: retorno?.message || 'Salvo com sucesso na planilha!',
      dados: retorno,
    };
  } catch (err) {
    console.error('[Saúde da Mulher] Erro ao sincronizar com Google Apps Script:', err.message);
    return {
      ok: false,
      message: `Erro ao enviar para a planilha: ${err.message}`,
    };
  }
}

/**
 * Sincroniza dados com o Google Apps Script se a planilha tiver doGet habilitado.
 */
async function sincronizarInscricoesComNuvemSaudeMulher({ url = URL_WEBAPP_SAUDE_MULHER_PADRAO, fetchFn = global.fetch } = {}) {
  const webAppUrl = url || process.env.SAUDE_MULHER_WEBAPP_URL;
  if (!webAppUrl) {
    return {
      ok: true,
      total: listarInscricoesSaudeMulher().length,
      message: 'Planilha não configurada. Exibindo dados locais do sistema.',
    };
  }

  try {
    const res = await fetchFn(`${webAppUrl}?action=list`, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Status HTTP ${res.status}`);
    }
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data.inscricoes || data.items || []);

    let importados = 0;
    for (const r of rows) {
      if (r.nome && r.telefone) {
        salvarInscricaoSaudeMulher({
          nome: r.nome,
          idade: r.idade || '',
          telefone: r.telefone,
          condicoesSaude: r.condicoesSaude || r.condicoes || '',
          tratamentoMedicamento: r.tratamentoMedicamento || r.medicamento || '',
          cirurgia: r.cirurgia || 'Não',
          cirurgiaDetalhes: r.cirurgiaDetalhes || '',
          lesaoDor: r.lesaoDor || 'Não',
          lesaoDorDetalhes: r.lesaoDorDetalhes || '',
          limitacao: r.limitacao || 'Não',
          limitacaoDetalhes: r.limitacaoDetalhes || '',
          gravida: r.gravida || 'Não',
          atividadeFisica: r.atividadeFisica || 'Não',
          atividadeFisicaDetalhes: r.atividadeFisicaDetalhes || '',
          outrasInformacoes: r.outrasInformacoes || r.observacoes || '',
          criadoEm: r.criadoEm || r.dataHora || null,
        });
        importados++;
      }
    }

    return {
      ok: true,
      total: listarInscricoesSaudeMulher().length,
      importados,
      message: `${importados} inscrições sincronizadas com sucesso!`,
    };
  } catch (err) {
    console.warn('[Saúde da Mulher] Falha na sincronização via GET com Apps Script:', err.message);
    return {
      ok: false,
      message: `Não foi possível sincronizar com o Web App: ${err.message}`,
    };
  }
}

/**
 * Mensagem amigável para envio de confirmação no WhatsApp
 */
function montarMensagemConfirmacaoSaudeMulher(inscricao) {
  const primeiroNome = String(inscricao.nome || 'Amada').trim().split(' ')[0];
  return (
    `🌸 *INSCRIÇÃO CONFIRMADA — SAÚDE DA MULHER & PILATES* 🌸\n\n` +
    `Olá, *${primeiroNome}*! Graça e paz!\n\n` +
    `Sua inscrição e ficha de anamnese foram recebidas com sucesso para o evento:\n\n` +
    `🎀 *Saúde da Mulher • Palestra + Aula de Pilates*\n` +
    `📅 *Sábado, 31 de Outubro de 2026*\n` +
    `⏰ *Horário:* 15:00\n` +
    `📍 *Local:* Comunidade Cristã Curados — Templo Principal\n` +
    `📌 *Endereço:* R. Benedicto de Abreu Júnior, 40 - Jd. Nova Itapevi\n\n` +
    `💡 *Dicas para a aula:* Venha com roupas confortáveis para se movimentar e traga sua garrafinha de água!\n\n` +
    `Nossa equipe e a instrutora de Pilates já estão preparando tudo com muito amor para acolher você. Te esperamos! 💕`
  );
}

/**
 * Gera relatório HTML formatado para impressão / visualização PDF de todas as alunas e anamneses
 */
function renderSaudeMulherPdfHtml() {
  const inscricoes = listarInscricoesSaudeMulher();
  const stats = obterEstatisticasSaudeMulher();

  const linhas = inscricoes.map((item, idx) => {
    const telFormatado = item.telefone ? item.telefone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : '-';
    const condicoes = item.condicoesSaude ? `<strong style="color: #be185d;">${item.condicoesSaude}</strong>` : '<span style="color: #6b7280;">Nenhuma</span>';
    const tratamento = item.tratamentoMedicamento ? `<br><small style="color: #374151;">Med: ${item.tratamentoMedicamento}</small>` : '';
    const cirurgias = item.cirurgia === 'Sim' || item.cirurgiaDetalhes
      ? `<span style="color: #b91c1c; font-weight: 600;">Sim</span>: ${item.cirurgiaDetalhes || '-'}`
      : '<span style="color: #6b7280;">Não</span>';
    const lesoes = item.lesaoDor === 'Sim' || item.lesaoDorDetalhes
      ? `<span style="color: #b91c1c; font-weight: 600;">Sim</span>: ${item.lesaoDorDetalhes || '-'}`
      : '<span style="color: #6b7280;">Não</span>';
    const limitacao = item.limitacao === 'Sim' || item.limitacaoDetalhes
      ? `<span style="color: #c2410c; font-weight: 600;">Sim</span>: ${item.limitacaoDetalhes || '-'}`
      : '<span style="color: #6b7280;">Não</span>';
    const gravida = item.gravida === 'Sim'
      ? '<span style="background: #fdf2f8; color: #db2777; font-weight: bold; padding: 2px 6px; border-radius: 4px;">🤰 Sim</span>'
      : '<span style="color: #6b7280;">Não</span>';
    const atividade = item.atividadeFisica === 'Sim'
      ? `<span style="color: #047857; font-weight: 600;">Sim</span>${item.atividadeFisicaDetalhes ? ` (${item.atividadeFisicaDetalhes})` : ''}`
      : '<span style="color: #6b7280;">Não</span>';

    return `
      <tr>
        <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
        <td><strong>${item.nome}</strong></td>
        <td style="text-align: center;">${item.idade || '-'}</td>
        <td>${telFormatado}</td>
        <td>${condicoes}${tratamento}</td>
        <td>${cirurgias}</td>
        <td>${lesoes}</td>
        <td>${limitacao}</td>
        <td style="text-align: center;">${gravida}</td>
        <td>${atividade}</td>
        <td>${item.outrasInformacoes || '<span style="color: #9ca3af;">-</span>'}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Anamnese — Saúde da Mulher (Pilates)</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 12px; font-size: 11px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f43f5e; padding-bottom: 10px; margin-bottom: 12px; }
    .header h1 { margin: 0; font-size: 18px; color: #881337; }
    .header p { margin: 3px 0 0; font-size: 11px; color: #4b5563; }
    .stats-bar { display: flex; gap: 15px; margin-bottom: 12px; font-size: 11px; background: #fff1f2; padding: 8px 12px; border-radius: 6px; border: 1px solid #fecdd3; }
    .stat-item strong { color: #be123c; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #be123c; color: #fff; padding: 7px 6px; text-align: left; font-weight: 600; border: 1px solid #9f1239; }
    td { padding: 6px 6px; border: 1px solid #e5e7eb; vertical-align: top; }
    tr:nth-child(even) { background-color: #fdf2f8; }
    .footer { margin-top: 15px; text-align: right; font-size: 9px; color: #6b7280; }
    @media print {
      .no-print { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 12px; display: flex; justify-content: flex-end; gap: 8px;">
    <button onclick="window.print()" style="background: #be123c; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <div class="header">
    <div>
      <h1>Comunidade Cristã Curados • Rede de Mulheres</h1>
      <p>Ficha de Inscrições & Anamnese: <strong>Saúde da Mulher — Palestra + Aula de Pilates</strong> (31/10/2026 às 15h)</p>
    </div>
    <div style="text-align: right; font-size: 10px; color: #4b5563;">
      Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat-item">Total de Alunas: <strong>${stats.total}</strong></div>
    <div class="stat-item">Com Condição de Saúde: <strong>${stats.comCondicaoSaude}</strong></div>
    <div class="stat-item">Com Histórico Cirúrgico: <strong>${stats.comCirurgia}</strong></div>
    <div class="stat-item">Com Dores/Lesões: <strong>${stats.comLesaoDor}</strong></div>
    <div class="stat-item">Gestantes: <strong>${stats.gestantes}</strong></div>
    <div class="stat-item">Já praticam atividade: <strong>${stats.praticamAtividade}</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 25px; text-align: center;">Nº</th>
        <th style="width: 120px;">Nome da Aluna</th>
        <th style="width: 35px; text-align: center;">Idade</th>
        <th style="width: 90px;">Telefone</th>
        <th>Condições / Medicamentos</th>
        <th>Cirurgias</th>
        <th>Lesões / Dores</th>
        <th>Limitações</th>
        <th style="width: 50px; text-align: center;">Gestante</th>
        <th>Ativ. Física</th>
        <th>Observações Adicionais</th>
      </tr>
    </thead>
    <tbody>
      ${linhas || '<tr><td colspan="11" style="text-align: center; padding: 15px;">Nenhuma aluna inscrita até o momento.</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    Comunidade Cristã Curados • Documento Confidencial da Secretaria & Instrutora de Pilates
  </div>
</body>
</html>`;
}

module.exports = {
  salvarInscricaoSaudeMulher,
  buscarInscricaoSaudeMulherPorId,
  buscarInscricaoSaudeMulherPorTelefone,
  listarInscricoesSaudeMulher,
  obterEstatisticasSaudeMulher,
  excluirInscricaoSaudeMulher,
  marcarConfirmacaoSaudeMulherEnviada,
  enviarInscricaoPlanilhaSaudeMulher,
  sincronizarInscricoesComNuvemSaudeMulher,
  montarMensagemConfirmacaoSaudeMulher,
  renderSaudeMulherPdfHtml,
  obterLinksPlanilhaSaudeMulher,
  atualizarMetadataPlanilhaSaudeMulher,
};
