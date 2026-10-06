const crypto = require('crypto');

let db;
try {
  db = require('../db');
} catch (err) {
  console.warn('[Dia das Crianças] Não foi possível carregar db.js:', err.message);
}

const URL_WEBAPP_CRIANCAS_PADRAO =
  process.env.CRIANCAS_WEBAPP_URL ||
  'https://script.google.com/macros/s/AKfycbwVKUZxE7mzupcvdPjDck4tACDeUCvMFl2xH5XzzmxNVtb2HZhxtsK8wDjsr23jqmPLJA/exec';

let metadataPlanilhaCriancas = {
  spreadsheetId: process.env.CRIANCAS_SPREADSHEET_ID || '11-WWQL2485gSCcM5N4XnWX8sfIj-knQCBUi5koGG6F8',
  spreadsheetUrl: process.env.CRIANCAS_SPREADSHEET_URL || 'https://docs.google.com/spreadsheets/d/11-WWQL2485gSCcM5N4XnWX8sfIj-knQCBUi5koGG6F8/edit?usp=sharing',
  pdfUrl: 'https://docs.google.com/spreadsheets/d/11-WWQL2485gSCcM5N4XnWX8sfIj-knQCBUi5koGG6F8/export?format=pdf&portrait=true&size=a4&gridlines=true',
  formUrl: 'https://forms.gle/jb3ytK348u3keMi8A',
};

function obterLinksPlanilhaCriancas() {
  const ssId = metadataPlanilhaCriancas.spreadsheetId;
  const pdfUrl = ssId
    ? `https://docs.google.com/spreadsheets/d/${ssId}/export?format=pdf&portrait=true&size=a4&gridlines=true`
    : metadataPlanilhaCriancas.pdfUrl;
  const spreadsheetUrl = ssId
    ? `https://docs.google.com/spreadsheets/d/${ssId}/edit?usp=sharing`
    : metadataPlanilhaCriancas.spreadsheetUrl;

  return {
    spreadsheetId: ssId,
    spreadsheetUrl,
    pdfUrl,
    formUrl: metadataPlanilhaCriancas.formUrl,
  };
}

function atualizarMetadataPlanilhaCriancas({ spreadsheetId, spreadsheetUrl, pdfUrl, formUrl } = {}) {
  if (spreadsheetId) metadataPlanilhaCriancas.spreadsheetId = spreadsheetId;
  if (spreadsheetUrl) metadataPlanilhaCriancas.spreadsheetUrl = spreadsheetUrl;
  if (pdfUrl) metadataPlanilhaCriancas.pdfUrl = pdfUrl;
  if (formUrl) metadataPlanilhaCriancas.formUrl = formUrl;
}

function normalizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

/**
 * Salva ou atualiza a inscrição de criança no banco SQLite.
 */
function salvarInscricaoCriancas({
  id = null,
  nomeCrianca,
  nomeResponsavel = '',
  idade = '',
  telefone = '',
  alergiaAlimentos = '',
  alergiaMedicamentos = '',
  evento = 'Especial Dia das Crianças',
  dataEvento = '2026-10-17 14:00',
  whatsappConfirmacaoEnviado = 0,
  criadoEm = null,
} = {}) {
  if (!db) {
    throw new Error('Banco de dados não disponível');
  }

  const nomeCriancaLimpo = String(nomeCrianca || '').trim();
  if (!nomeCriancaLimpo) {
    throw new Error('Nome da criança é obrigatório');
  }

  const telNorm = String(telefone || '').trim();
  const respLimpo = String(nomeResponsavel || '').trim();
  const idadeLimpa = String(idade || '').trim();
  const dataCriacao = criadoEm || new Date().toISOString();

  // ID estável baseado em nome + responsável + telefone para evitar duplicidade de re-sincronização
  const inscricaoId =
    id ||
    crypto
      .createHash('md5')
      .update(`${nomeCriancaLimpo.toLowerCase()}|${respLimpo.toLowerCase()}|${normalizarTelefone(telNorm)}`)
      .digest('hex');

  const stmt = db.prepare(`
    INSERT INTO criancas_inscricoes (
      id, nomeCrianca, nomeResponsavel, idade, telefone, alergiaAlimentos, alergiaMedicamentos,
      evento, dataEvento, whatsappConfirmacaoEnviado, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      nomeCrianca = excluded.nomeCrianca,
      nomeResponsavel = excluded.nomeResponsavel,
      idade = excluded.idade,
      telefone = excluded.telefone,
      alergiaAlimentos = excluded.alergiaAlimentos,
      alergiaMedicamentos = excluded.alergiaMedicamentos,
      evento = excluded.evento,
      dataEvento = excluded.dataEvento,
      whatsappConfirmacaoEnviado = excluded.whatsappConfirmacaoEnviado
  `);

  stmt.run(
    inscricaoId,
    nomeCriancaLimpo,
    respLimpo,
    idadeLimpa,
    telNorm,
    String(alergiaAlimentos || '').trim(),
    String(alergiaMedicamentos || '').trim(),
    evento,
    dataEvento,
    whatsappConfirmacaoEnviado ? 1 : 0,
    dataCriacao
  );

  return buscarInscricaoCriancasPorId(inscricaoId);
}

function buscarInscricaoCriancasPorId(id) {
  if (!db) return null;
  const row = db.prepare('SELECT * FROM criancas_inscricoes WHERE id = ?').get(String(id));
  if (!row) return null;
  return {
    ...row,
    whatsappConfirmacaoEnviado: Boolean(row.whatsappConfirmacaoEnviado),
  };
}

function listarInscricoesCriancas() {
  if (!db) return [];
  const rows = db.prepare('SELECT * FROM criancas_inscricoes ORDER BY criadoEm DESC').all();
  return rows.map((r) => ({
    ...r,
    whatsappConfirmacaoEnviado: Boolean(r.whatsappConfirmacaoEnviado),
  }));
}

function obterEstatisticasCriancas() {
  if (!db) {
    return {
      total: 0,
      whatsappConfirmados: 0,
      pendentesConfirmacao: 0,
    };
  }

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM criancas_inscricoes').get();
  const { confirmados } = db
    .prepare('SELECT COUNT(*) AS confirmados FROM criancas_inscricoes WHERE whatsappConfirmacaoEnviado = 1')
    .get();

  return {
    total: Number(total) || 0,
    whatsappConfirmados: Number(confirmados) || 0,
    pendentesConfirmacao: Math.max(0, (Number(total) || 0) - (Number(confirmados) || 0)),
  };
}

function excluirInscricaoCriancas(id) {
  if (!db || !id) return false;
  const termo = String(id).trim();
  const res = db.prepare('DELETE FROM criancas_inscricoes WHERE id = ?').run(termo);
  return res.changes > 0;
}

function marcarConfirmacaoCriancasEnviada(id) {
  if (!db || !id) return false;
  const termo = String(id).trim();
  const res = db.prepare('UPDATE criancas_inscricoes SET whatsappConfirmacaoEnviado = 1 WHERE id = ?').run(termo);
  return res.changes > 0;
}

/**
 * Puxa as inscrições do Web App do Google Apps Script publicado na planilha de Dia das Crianças.
 */
async function puxarInscricoesDoGoogleAppsScript(url = URL_WEBAPP_CRIANCAS_PADRAO, fetchFn = global.fetch) {
  if (!url) return { ok: false, error: 'URL do Apps Script não configurada.', inscricoes: [] };

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
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
        atualizarMetadataPlanilhaCriancas({
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

    const normalizadas = lista
      .map((item, idx) => {
        const nomeCrianca = String(
          item.nomeCrianca ||
            item['Nome completo da criança:'] ||
            item['Nome da criança:'] ||
            item.crianca ||
            item.nome ||
            ''
        ).trim();

        if (!nomeCrianca) return null;

        const nomeResponsavel = String(
          item.nomeResponsavel ||
            item['Nome da mãe ou responsável:'] ||
            item.responsavel ||
            item.mae ||
            ''
        ).trim();

        const idade = String(
          item.idade ||
            item['Idade da criança:'] ||
            item.Idade ||
            ''
        ).trim();

        const telefone = normalizarTelefone(
          item.telefone ||
            item['Número para contato:'] ||
            item.contato ||
            item.whatsapp ||
            item.Telefone
        );

        const alergiaAlimentos = String(
          item.alergiaAlimentos ||
            item['A criança tem alguma alergia ou restrição alimentar? Se sim, qual?'] ||
            item.alergia_alimentar ||
            item.alergiaAlimentar ||
            ''
        ).trim();

        const alergiaMedicamentos = String(
          item.alergiaMedicamentos ||
            item['A criança tem alguma alergia à medicamentos? Se sim, qual?'] ||
            item.alergia_medicamentos ||
            item.alergiaMedicamentos ||
            ''
        ).trim();

        const criadoEm =
          item.criadoEm ||
          item.timestamp ||
          item['Carimbo de data/hora'] ||
          item.dataHora ||
          new Date().toISOString();

        const stableId =
          item.id ||
          crypto
            .createHash('md5')
            .update(`${nomeCrianca.toLowerCase()}|${nomeResponsavel.toLowerCase()}|${telefone || idx}`)
            .digest('hex');

        return {
          id: stableId,
          nomeCrianca,
          nomeResponsavel,
          idade,
          telefone,
          alergiaAlimentos,
          alergiaMedicamentos,
          evento: 'Especial Dia das Crianças',
          dataEvento: '2026-10-17 14:00',
          whatsappConfirmacaoEnviado: Boolean(item.whatsappConfirmacaoEnviado || item.confirmado || item.zap),
          criadoEm,
        };
      })
      .filter(Boolean);

    return {
      ok: true,
      total: normalizadas.length,
      inscricoes: normalizadas,
    };
  } catch (err) {
    console.error('[Dia das Crianças] Erro ao consultar Web App da planilha:', err);
    return { ok: false, error: err.message, inscricoes: [] };
  }
}

let sincronizacaoCriancasEmAndamento = null;

async function sincronizarInscricoesComNuvem(url = URL_WEBAPP_CRIANCAS_PADRAO, fetchFn = global.fetch) {
  if (sincronizacaoCriancasEmAndamento) {
    return sincronizacaoCriancasEmAndamento;
  }

  sincronizacaoCriancasEmAndamento = (async () => {
    try {
      const res = await puxarInscricoesDoGoogleAppsScript(url, fetchFn);
      if (!res.ok) {
        return {
          ok: false,
          error: res.error,
          total: listarInscricoesCriancas().length,
          stats: obterEstatisticasCriancas(),
        };
      }

      let salvas = 0;
      for (const item of res.inscricoes) {
        try {
          salvarInscricaoCriancas(item);
          salvas++;
        } catch (itemErr) {
          console.warn('[Dia das Crianças] Falha ao salvar item da planilha:', itemErr.message);
        }
      }

      const stats = obterEstatisticasCriancas();
      return {
        ok: true,
        total: stats.total,
        novasSalvas: salvas,
        stats,
      };
    } finally {
      sincronizacaoCriancasEmAndamento = null;
    }
  })();

  return sincronizacaoCriancasEmAndamento;
}

/**
 * Renderiza o modelo oficial de impressão / PDF da lista de presença do Dia das Crianças.
 */
function renderCriancasPdfHtml() {
  const lista = listarInscricoesCriancas();
  const stats = obterEstatisticasCriancas();

  const linhasTabela = lista
    .map((item, idx) => {
      const telFormatado = item.telefone
        ? item.telefone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')
        : '-';

      const dataFormatada = item.criadoEm
        ? new Date(item.criadoEm).toLocaleDateString('pt-BR')
        : '-';

      const alergiasList = [];
      if (item.alergiaAlimentos && !/n[aã]o|nenhum/i.test(item.alergiaAlimentos)) {
        alergiasList.push(`Alim: ${item.alergiaAlimentos}`);
      }
      if (item.alergiaMedicamentos && !/n[aã]o|nenhum/i.test(item.alergiaMedicamentos)) {
        alergiasList.push(`Med: ${item.alergiaMedicamentos}`);
      }
      const alergiasStr = alergiasList.length > 0 ? alergiasList.join(' | ') : 'Nenhuma declarada';
      const alertaStyle = alergiasList.length > 0 ? 'color: #b91c1c; font-weight: 700;' : 'color: #555;';

      return `
        <tr>
          <td style="text-align: center; width: 40px;">[ &nbsp; ]</td>
          <td style="text-align: center; width: 35px; font-weight: bold;">${idx + 1}</td>
          <td><strong>${item.nomeCrianca}</strong></td>
          <td style="text-align: center;">${item.idade || '-'}</td>
          <td>${item.nomeResponsavel || '-'}</td>
          <td>${telFormatado}</td>
          <td style="${alertaStyle}">${alergiasStr}</td>
          <td style="text-align: center; font-size: 7.5pt;">${dataFormatada}</td>
          <td style="width: 110px;"></td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <title>Lista de Presença • Especial Dia das Crianças</title>
    <style>
      @page { size: A4 landscape; margin: 1cm; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; margin: 0; padding: 15px; font-size: 9pt; }
      .no-print {
        background: #1e1b4b; color: #fff; padding: 12px 18px; border-radius: 8px; margin-bottom: 20px;
        display: flex; align-items: center; justify-content: space-between;
      }
      .no-print button {
        background: #0284c7; color: #fff; border: none; padding: 8px 16px; border-radius: 6px;
        font-weight: bold; font-size: 13px; cursor: pointer; transition: 0.2s;
      }
      .no-print button:hover { background: #0369a1; }
      @media print {
        .no-print { display: none !important; }
        body { padding: 0; }
      }
      .header { border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 14px; }
      .header h1 { margin: 0 0 4px; font-size: 1.25rem; letter-spacing: 1px; text-transform: uppercase; color: #222; }
      .header h2 { margin: 0 0 4px; font-size: 1.05rem; color: #0284c7; font-weight: 700; }
      .header-meta { font-size: 0.82rem; color: #555; }
      .summary-cards { display: flex; gap: 12px; margin-bottom: 14px; }
      .summary-box { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 6px 10px; text-align: center; background: #f8fafc; }
      .summary-box .val { font-size: 1.25rem; font-weight: bold; margin-bottom: 2px; color: #0284c7; }
      .summary-box .lbl { font-size: 0.72rem; text-transform: uppercase; color: #666; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 8pt; }
      th, td { border: 1px solid #ddd; padding: 5px 6px; text-align: left; vertical-align: middle; }
      th { background-color: #e0f2fe; font-weight: bold; text-transform: uppercase; font-size: 7.2pt; letter-spacing: 0.4px; color: #0369a1; }
      tr:nth-child(even) { background-color: #f8fafc; }
      .footer-note { margin-top: 18px; font-size: 7.5pt; color: #777; text-align: center; border-top: 1px solid #eee; padding-top: 6px; }
    </style>
  </head>
  <body>
    <div class="no-print">
      <div>
        <strong>📄 Visualização de Impressão / PDF • Especial Dia das Crianças</strong>
        <p style="margin: 3px 0 0; font-size: 11px; opacity: 0.85;">Clique no botão ou pressione Ctrl+P para salvar como PDF ou imprimir a folha de presença.</p>
      </div>
      <button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
    </div>

    <div class="header">
      <h1>Comunidade Cristã Curados • Secretaria</h1>
      <h2>Lista Oficial de Portaria & Presença • Especial Dia das Crianças</h2>
      <div class="header-meta">
        <strong>Data do Evento:</strong> Sábado, 17/10/2026 às 14:00 &nbsp;|&nbsp; 
        <strong>Local:</strong> R. Benedicto de Abreu Júnior, 40 - Jd. Nova Itapevi &nbsp;|&nbsp;
        <strong>Gerado em:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>

    <div class="summary-cards">
      <div class="summary-box">
        <div class="val">${stats.total}</div>
        <div class="lbl">Total de Crianças Inscritas</div>
      </div>
      <div class="summary-box">
        <div class="val" style="color: #16a34a;">${stats.whatsappConfirmados}</div>
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
          <th>Nome Completo da Criança</th>
          <th style="text-align: center;">Idade</th>
          <th>Mãe / Responsável</th>
          <th>Telefone / Contato</th>
          <th>Alergias / Restrições Médicas</th>
          <th style="text-align: center;">Inscrito Em</th>
          <th>Assinatura / Visto do Responsável</th>
        </tr>
      </thead>
      <tbody>
        ${linhasTabela || '<tr><td colspan="9" style="text-align: center; padding: 20px; color: #777;">Nenhuma inscrição realizada até o momento.</td></tr>'}
      </tbody>
    </table>

    <div class="footer-note">
      Comunidade Cristã Curados • Ministério Infantil • Relatório Gerado Automaticamente pela Secretaria
    </div>
  </body>
  </html>`;
}

module.exports = {
  URL_WEBAPP_CRIANCAS_PADRAO,
  metadataPlanilhaCriancas,
  obterLinksPlanilhaCriancas,
  atualizarMetadataPlanilhaCriancas,
  salvarInscricaoCriancas,
  buscarInscricaoCriancasPorId,
  listarInscricoesCriancas,
  obterEstatisticasCriancas,
  excluirInscricaoCriancas,
  marcarConfirmacaoCriancasEnviada,
  puxarInscricoesDoGoogleAppsScript,
  sincronizarInscricoesComNuvem,
  renderCriancasPdfHtml,
  normalizarTelefone,
};
