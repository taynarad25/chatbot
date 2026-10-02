const crypto = require('crypto');

let db;
try {
  db = require('../db');
} catch (err) {
  console.warn('[Culto Mulheres] Não foi possível carregar db.js:', err.message);
}

const URL_WEBAPP_MULHERES_PADRAO =
  process.env.MULHERES_WEBAPP_URL ||
  'https://script.google.com/macros/s/AKfycbzGYDJzHufmbaOP39WH_ouv_EyrM9vnAkjjOC06fBJ5XJAop1ZcWo92mnJIevDPc19UcQ/exec';

let metadataPlanilhaMulheres = {
  spreadsheetId: process.env.MULHERES_SPREADSHEET_ID || '12OfRGFDbMYxUdxJ9WJJ7LlsfdqRbWOvI8n13cULIMd4',
  spreadsheetUrl: process.env.MULHERES_SPREADSHEET_URL || 'https://docs.google.com/spreadsheets/d/12OfRGFDbMYxUdxJ9WJJ7LlsfdqRbWOvI8n13cULIMd4/edit?usp=sharing',
  pdfUrl: 'https://docs.google.com/spreadsheets/d/12OfRGFDbMYxUdxJ9WJJ7LlsfdqRbWOvI8n13cULIMd4/export?format=pdf&portrait=true&size=a4&gridlines=true',
};

function obterLinksPlanilhaMulheres() {
  const ssId = metadataPlanilhaMulheres.spreadsheetId;

  const pdfUrl = ssId
    ? `https://docs.google.com/spreadsheets/d/${ssId}/export?format=pdf&portrait=true&size=a4&gridlines=true`
    : metadataPlanilhaMulheres.pdfUrl;

  const spreadsheetUrl = ssId
    ? `https://docs.google.com/spreadsheets/d/${ssId}/edit?usp=sharing`
    : metadataPlanilhaMulheres.spreadsheetUrl;

  return {
    spreadsheetId: ssId,
    spreadsheetUrl,
    pdfUrl,
  };
}

function atualizarMetadataPlanilhaMulheres({ spreadsheetId, spreadsheetUrl, pdfUrl } = {}) {
  if (spreadsheetId) metadataPlanilhaMulheres.spreadsheetId = spreadsheetId;
  if (spreadsheetUrl) metadataPlanilhaMulheres.spreadsheetUrl = spreadsheetUrl;
  if (pdfUrl) metadataPlanilhaMulheres.pdfUrl = pdfUrl;
}

function normalizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Envia uma inscrição para o Web App do Google Apps Script.
 * Lida com redirecionamentos 302 comuns no Google Apps Script.
 */
async function enviarInscricaoPlanilhaMulheres({
  nome,
  email,
  telefone,
  url = URL_WEBAPP_MULHERES_PADRAO,
  fetchFn = global.fetch,
} = {}) {
  const nomeLimpo = String(nome || '').trim();
  const emailLimpo = normalizarEmail(email);
  const telefoneLimpo = normalizarTelefone(telefone);

  if (!emailLimpo) {
    return { ok: false, ja_inscrito: false, message: 'E-mail é obrigatório.' };
  }

  const payload = {
    nome: nomeLimpo,
    email: emailLimpo,
    telefone: telefoneLimpo || String(telefone || '').trim(),
  };

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'manual',
    });

    let dados = null;

    // Se o Google Apps Script retornar redirect 302/301/303/307
    if (res.status >= 300 && res.status < 400 && res.headers && typeof res.headers.get === 'function') {
      const location = res.headers.get('location');
      if (location) {
        const redirected = await fetchFn(location, { method: 'GET' });
        const text = await redirected.text();
        try {
          dados = JSON.parse(text);
        } catch {
          dados = { raw: text };
        }
      }
    }

    if (!dados) {
      const text = await res.text();
      try {
        dados = JSON.parse(text);
      } catch {
        dados = { raw: text };
      }
    }

    const jaInscrito = Boolean(
      dados && (dados.ja_inscrito === true || dados.ja_inscrito === 'true' || dados.jaInscrito === true)
    );
    const status = dados?.status || (jaInscrito ? 'duplicate' : 'success');
    const message = dados?.message || (jaInscrito ? 'Este e-mail já está cadastrado!' : 'Inscrição realizada com sucesso!');

    return {
      ok: true,
      status,
      ja_inscrito: jaInscrito,
      message,
      dados,
    };
  } catch (err) {
    console.error('[Culto Mulheres] Erro ao enviar inscrição para o Web App da planilha:', err);
    return {
      ok: false,
      ja_inscrito: false,
      message: `Erro na comunicação com a planilha: ${err.message}`,
    };
  }
}

/**
 * Salva a inscrição no banco de dados local SQLite.
 */
function salvarInscricaoMulheres({
  id = null,
  nome,
  email,
  telefone,
  evento = 'Culto de Mulheres: O Vaso e o Oleiro',
  dataEvento = '2026-10-24 15:00',
  whatsappConfirmacaoEnviado = 0,
  criadoEm = null,
} = {}) {
  if (!db) {
    throw new Error('Banco de dados não disponível');
  }

  const inscricaoId = id || crypto.randomUUID();
  const emailNorm = normalizarEmail(email);
  const dataCriacao = criadoEm || new Date().toISOString();
  const telNorm = String(telefone || '').trim();

  const stmt = db.prepare(`
    INSERT INTO mulheres_inscricoes (
      id, nome, email, telefone, evento, dataEvento, whatsappConfirmacaoEnviado, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      nome = excluded.nome,
      telefone = excluded.telefone,
      evento = excluded.evento,
      dataEvento = excluded.dataEvento,
      whatsappConfirmacaoEnviado = excluded.whatsappConfirmacaoEnviado
  `);

  stmt.run(
    inscricaoId,
    String(nome || '').trim(),
    emailNorm,
    telNorm,
    evento,
    dataEvento,
    whatsappConfirmacaoEnviado ? 1 : 0,
    dataCriacao
  );

  return buscarInscricaoMulheresPorEmail(emailNorm);
}

function buscarInscricaoMulheresPorEmail(email) {
  if (!db) return null;
  const emailNorm = normalizarEmail(email);
  const row = db.prepare('SELECT * FROM mulheres_inscricoes WHERE email = ?').get(emailNorm);
  if (!row) return null;
  return {
    ...row,
    whatsappConfirmacaoEnviado: Boolean(row.whatsappConfirmacaoEnviado),
  };
}

function buscarInscricaoMulheresPorTelefone(telefone) {
  if (!db) return null;
  const telNorm = normalizarTelefone(telefone);
  const rows = db.prepare('SELECT * FROM mulheres_inscricoes').all();
  const row = rows.find((r) => normalizarTelefone(r.telefone).includes(telNorm) || telNorm.includes(normalizarTelefone(r.telefone)));
  if (!row) return null;
  return {
    ...row,
    whatsappConfirmacaoEnviado: Boolean(row.whatsappConfirmacaoEnviado),
  };
}

function listarInscricoesMulheres() {
  if (!db) return [];
  const rows = db.prepare('SELECT * FROM mulheres_inscricoes ORDER BY criadoEm DESC').all();
  return rows.map((r) => ({
    ...r,
    whatsappConfirmacaoEnviado: Boolean(r.whatsappConfirmacaoEnviado),
  }));
}

function obterEstatisticasMulheres() {
  if (!db) {
    return {
      total: 0,
      whatsappConfirmados: 0,
      pendentesConfirmacao: 0,
    };
  }

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM mulheres_inscricoes').get();
  const { confirmados } = db.prepare('SELECT COUNT(*) AS confirmados FROM mulheres_inscricoes WHERE whatsappConfirmacaoEnviado = 1').get();

  return {
    total: Number(total) || 0,
    whatsappConfirmados: Number(confirmados) || 0,
    pendentesConfirmacao: Math.max(0, (Number(total) || 0) - (Number(confirmados) || 0)),
  };
}

function excluirInscricaoMulheres(idOuEmail) {
  if (!db || !idOuEmail) return false;
  const termo = String(idOuEmail).trim();
  const res = db.prepare('DELETE FROM mulheres_inscricoes WHERE id = ? OR email = ?').run(termo, normalizarEmail(termo));
  return res.changes > 0;
}

function marcarConfirmacaoMulheresEnviada(idOuEmail) {
  if (!db || !idOuEmail) return false;
  const termo = String(idOuEmail).trim();
  const res = db.prepare('UPDATE mulheres_inscricoes SET whatsappConfirmacaoEnviado = 1 WHERE id = ? OR email = ?').run(termo, normalizarEmail(termo));
  return res.changes > 0;
}

/**
 * Monta mensagem curta de confirmação no WhatsApp
 */
function montarMensagemConfirmacaoMulheres({ nome } = {}) {
  const primeiroNome = String(nome || '').trim().split(' ')[0] || 'irmã';
  return (
    `🌸 *Inscrição Confirmada - Culto de Mulheres*\n\n` +
    `Olá, *${primeiroNome}*! Sua inscrição para o *Culto de Mulheres: O Vaso e o Oleiro* foi confirmada com sucesso! ✨\n\n` +
    `📅 *Data:* Sábado, 24/10/2026\n` +
    `⏰ *Horário:* 15:00\n` +
    `📍 *Local:* R. Benedicto de Abreu Júnior, 40 - Jd. Nova Itapevi (Comunidade Cristã Curados)\n\n` +
    `Esperamos por você no dia! Será um momento precioso na presença de Deus! 🙏❤️`
  );
}

/**
 * Renderiza página HTML para visualização e exportação em PDF da lista de presença.
 */
function renderMulheresPdfHtml() {
  const inscricoes = listarInscricoesMulheres();
  const stats = obterEstatisticasMulheres();

  const linhasTabela = inscricoes
    .map((item, idx) => {
      const telFormatado = item.telefone
        ? item.telefone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')
        : '-';
      const criadoEmData = item.criadoEm
        ? new Date(item.criadoEm).toLocaleDateString('pt-BR')
        : '-';

      return `
      <tr>
        <td style="text-align: center; width: 36px;">
          <div style="width: 16px; height: 16px; border: 2px solid #555; margin: 0 auto; border-radius: 3px;"></div>
        </td>
        <td style="text-align: center; font-weight: bold; width: 40px; font-size: 0.85rem;">${idx + 1}</td>
        <td><strong>${item.nome || '-'}</strong></td>
        <td style="font-size: 0.82rem; color: #333;">${item.email || '-'}</td>
        <td style="font-size: 0.85rem;">${telFormatado}</td>
        <td style="font-size: 0.82rem; text-align: center;">${criadoEmData}</td>
        <td style="border-bottom: 1px solid #aaa; width: 140px;"></td>
      </tr>
    `;
    })
    .join('');

  return `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Lista de Presença - Culto de Mulheres: O Vaso e o Oleiro</title>
    <style>
      @page { size: A4; margin: 1.2cm; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; margin: 0; padding: 20px; font-size: 10pt; }
      .no-print {
        background: #2a1b18; color: #fff; padding: 14px 20px; border-radius: 8px; margin-bottom: 24px;
        display: flex; align-items: center; justify-content: space-between;
      }
      .no-print button {
        background: #e27d60; color: #fff; border: none; padding: 10px 20px; border-radius: 6px;
        font-weight: bold; font-size: 14px; cursor: pointer; transition: 0.2s;
      }
      .no-print button:hover { background: #c6694e; }
      @media print {
        .no-print { display: none !important; }
        body { padding: 0; }
      }
      .header { border-bottom: 2px solid #b05c48; padding-bottom: 12px; margin-bottom: 18px; }
      .header h1 { margin: 0 0 4px; font-size: 1.35rem; letter-spacing: 1px; text-transform: uppercase; color: #222; }
      .header h2 { margin: 0 0 6px; font-size: 1.15rem; color: #b05c48; font-weight: 700; }
      .header-meta { font-size: 0.88rem; color: #555; }
      .summary-cards { display: flex; gap: 15px; margin-bottom: 18px; }
      .summary-box { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 8px 12px; text-align: center; background: #faf8f7; }
      .summary-box .val { font-size: 1.35rem; font-weight: bold; margin-bottom: 2px; color: #b05c48; }
      .summary-box .lbl { font-size: 0.75rem; text-transform: uppercase; color: #666; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 8.5pt; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: middle; }
      th { background-color: #f7ebe8; font-weight: bold; text-transform: uppercase; font-size: 7.8pt; letter-spacing: 0.5px; color: #444; }
      tr:nth-child(even) { background-color: #fdfaf9; }
      .footer-note { margin-top: 24px; font-size: 8pt; color: #777; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
    </style>
  </head>
  <body>
    <div class="no-print">
      <div>
        <strong>📄 Visualização de Impressão / PDF • Culto de Mulheres</strong>
        <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.85;">Clique no botão ao lado ou pressione Ctrl+P para salvar como PDF ou imprimir a folha de presença.</p>
      </div>
      <button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
    </div>

    <div class="header">
      <h1>Comunidade Cristã Curados • Secretaria</h1>
      <h2>Lista Oficial de Portaria & Presença • Culto de Mulheres: O Vaso e o Oleiro</h2>
      <div class="header-meta">
        <strong>Data do Evento:</strong> Sábado, 24/10/2026 às 15:00 &nbsp;|&nbsp; 
        <strong>Local:</strong> R. Benedicto de Abreu Júnior, 40 - Jd. Nova Itapevi &nbsp;|&nbsp;
        <strong>Gerado em:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>

    <div class="summary-cards">
      <div class="summary-box">
        <div class="val">${stats.total}</div>
        <div class="lbl">Total de Inscritas</div>
      </div>
      <div class="summary-box">
        <div class="val" style="color: #22c55e;">${stats.whatsappConfirmados}</div>
        <div class="lbl">Confirmação WhatsApp Enviada</div>
      </div>
      <div class="summary-box">
        <div class="val" style="color: #64748b;">${stats.pendentesConfirmacao}</div>
        <div class="lbl">Pendentes de WhatsApp</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: center;">Presença</th>
          <th style="text-align: center;">Nº</th>
          <th>Nome Completo</th>
          <th>E-mail</th>
          <th>WhatsApp / Contato</th>
          <th style="text-align: center;">Inscrita Em</th>
          <th>Assinatura / Visto</th>
        </tr>
      </thead>
      <tbody>
        ${linhasTabela || '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #777;">Nenhuma inscrição realizada até o momento.</td></tr>'}
      </tbody>
    </table>

    <div class="footer-note">
      Comunidade Cristã Curados • Rede de Mulheres • Relatório Gerado Automaticamente pela Secretaria
    </div>
  </body>
  </html>`;
}

let sincronizacaoMulheresEmAndamento = null;

async function puxarInscricoesDoGoogleAppsScript(url = URL_WEBAPP_MULHERES_PADRAO, fetchFn = global.fetch) {
  if (!url) return { ok: false, error: 'URL do Apps Script não configurada.', inscricoes: [] };

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, inscricoes: [] };
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Resposta não é JSON válido', inscricoes: [] };
    }

    if (data && typeof data === 'object') {
      if (data.spreadsheetId || data.spreadsheetUrl || data.pdfUrl) {
        atualizarMetadataPlanilhaMulheres({
          spreadsheetId: data.spreadsheetId,
          spreadsheetUrl: data.spreadsheetUrl,
          pdfUrl: data.pdfUrl,
        });
      }
    }

    let lista = [];
    if (Array.isArray(data)) {
      lista = data;
    } else if (Array.isArray(data.inscricoes)) {
      lista = data.inscricoes;
    } else if (Array.isArray(data.dados)) {
      lista = data.dados;
    } else if (data.status === 'active' || data.message) {
      return { ok: true, active: true, message: data.message, inscricoes: [] };
    }

    const normalizadas = lista.map(item => {
      const nome = String(item.nome || item.Nome || item.titular || '').trim();
      const email = normalizarEmail(item.email || item.Email || item['E-mail']);
      const telefone = normalizarTelefone(item.telefone || item.Telefone || item.whatsapp || item.WhatsApp);
      const dataEvento = item.dataEvento || item.data || '2026-10-24 15:00';
      const criadoEm = item.criadoEm || item.dataHora || item.timestamp || item.CarimboDeDataHora || new Date().toISOString();
      return {
        id: item.id || crypto.randomUUID(),
        nome,
        email,
        telefone,
        evento: 'Culto de Mulheres: O Vaso e o Oleiro',
        dataEvento,
        whatsappConfirmacaoEnviado: Boolean(item.whatsappConfirmacaoEnviado || item.confirmado || item.zap),
        criadoEm
      };
    }).filter(i => i.email || i.nome);

    return { ok: true, inscricoes: normalizadas };
  } catch (err) {
    console.error('[Culto Mulheres] Erro de rede ao buscar inscrições da planilha:', err.message);
    return { ok: false, error: err.message, inscricoes: [] };
  }
}

async function sincronizarInscricoesComNuvem(url = URL_WEBAPP_MULHERES_PADRAO, fetchFn = global.fetch) {
  if (sincronizacaoMulheresEmAndamento) {
    return sincronizacaoMulheresEmAndamento;
  }
  sincronizacaoMulheresEmAndamento = executarSincronizacaoMulheresComNuvem(url, fetchFn).finally(() => {
    sincronizacaoMulheresEmAndamento = null;
  });
  return sincronizacaoMulheresEmAndamento;
}

async function executarSincronizacaoMulheresComNuvem(url, fetchFn) {
  try {
    const res = await puxarInscricoesDoGoogleAppsScript(url, fetchFn);
    if (!res.ok) {
      return { ok: false, error: res.error || 'Falha ao buscar dados da planilha.', total: 0 };
    }

    if (Array.isArray(res.inscricoes) && res.inscricoes.length > 0) {
      for (const item of res.inscricoes) {
        if (item.email) {
          salvarInscricaoMulheres(item);
        }
      }
    }

    const inscricoesAtualizadas = listarInscricoesMulheres();
    const stats = obterEstatisticasMulheres();

    return {
      ok: true,
      total: inscricoesAtualizadas.length,
      inscricoes: inscricoesAtualizadas,
      stats,
      message: res.active && res.inscricoes.length === 0
        ? 'Planilha conectada e ativa via Web App.'
        : `${inscricoesAtualizadas.length} inscrição(ões) sincronizada(s).`
    };
  } catch (err) {
    console.error('[Culto Mulheres] Erro ao sincronizar inscrições com a nuvem:', err.message);
    return { ok: false, error: err.message, total: 0 };
  }
}

async function excluirInscricaoPlanilhaMulheres(inscricao, url = URL_WEBAPP_MULHERES_PADRAO, fetchFn = global.fetch) {
  const item = typeof inscricao === 'string' ? { email: inscricao } : (inscricao || {});
  const email = normalizarEmail(item.email);
  const nome = String(item.nome || '').trim();
  const telefone = normalizarTelefone(item.telefone);

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'excluir',
        email,
        nome,
        telefone
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(20000)
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.warn('[Culto Mulheres] Aviso ao enviar exclusão para a planilha:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  URL_WEBAPP_MULHERES_PADRAO,
  enviarInscricaoPlanilhaMulheres,
  salvarInscricaoMulheres,
  buscarInscricaoMulheresPorEmail,
  buscarInscricaoMulheresPorTelefone,
  listarInscricoesMulheres,
  obterEstatisticasMulheres,
  excluirInscricaoMulheres,
  marcarConfirmacaoMulheresEnviada,
  montarMensagemConfirmacaoMulheres,
  renderMulheresPdfHtml,
  puxarInscricoesDoGoogleAppsScript,
  sincronizarInscricoesComNuvem,
  excluirInscricaoPlanilhaMulheres,
  obterLinksPlanilhaMulheres,
  atualizarMetadataPlanilhaMulheres,
};
