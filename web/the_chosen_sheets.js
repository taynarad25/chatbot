const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { google } = require('googleapis');

const ROOT_DIR = path.join(__dirname, '..');

let customSheetsClient = null;
let customSpreadsheetId = null;

// Cache em memória para o total de ingressos preenchidos na planilha,
// evitando esgotar a cota da API do Google Sheets a cada requisição de status.
let cacheTotalIngressos = null;
let cacheExpiracao = 0;
const CACHE_TTL_MS = 10000; // 10 segundos

function getCredentialsPath() {
  const envPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  const defaultCredentials = path.join(ROOT_DIR, 'credentials.json');
  if (fs.existsSync(defaultCredentials)) {
    return defaultCredentials;
  }
  const legacyCredentials = path.join(ROOT_DIR, 'credenciais-google.json');
  if (fs.existsSync(legacyCredentials)) {
    return legacyCredentials;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  return defaultCredentials;
}

function getSpreadsheetId() {
  if (customSpreadsheetId) return customSpreadsheetId;
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1eFQTr1uMTtr1RMaU1KXtxtTpzVlUdGvQOFRtK0quHIM';
}

function getTabName() {
  return process.env.GOOGLE_SHEETS_TAB_NAME || 'Inscrições';
}

function getSheetsClient() {
  if (customSheetsClient) {
    return customSheetsClient;
  }
  if (process.env.THE_CHOSEN_DATA_PATH || process.env.NODE_ENV === 'test') {
    return null;
  }
  const keyFile = getCredentialsPath();
  if (!fs.existsSync(keyFile)) {
    console.warn(`[Google Sheets] Arquivo de credenciais não encontrado em '${keyFile}'.`);
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth });
  } catch (err) {
    console.error('[Google Sheets] Erro ao inicializar cliente autenticado:', err.message);
    return null;
  }
}

const CABECALHOS_PADRAO = [
  'Nome Completo',
  'Telefone',
  'E-mail',
  'Quantidade de Ingressos',
  'Data/Hora',
  'Código',
  'Participantes'
];

async function garantirCabecalhoPlanilha(sheets, spreadsheetId, tabName) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A1:G1`,
    });
    const rows = res.data.values;
    if (!rows || rows.length === 0 || !rows[0] || rows[0].length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1:G1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [CABECALHOS_PADRAO] },
      });
      console.log(`[Google Sheets] Cabeçalho adicionado à aba '${tabName}'.`);
    }
  } catch (err) {
    // Se a aba com esse nome não existir, tenta ler o nome da primeira aba disponível
    if (err.message && err.message.includes('Unable to parse range')) {
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const firstSheet = meta.data.sheets?.[0]?.properties?.title;
        if (firstSheet && firstSheet !== tabName) {
          console.log(`[Google Sheets] Aba '${tabName}' não encontrada, usando primeira aba: '${firstSheet}'`);
          return firstSheet;
        }
      } catch (eMeta) {
        console.warn('[Google Sheets] Aviso ao inspecionar abas da planilha:', eMeta.message);
      }
    }
    console.warn('[Google Sheets] Aviso ao validar cabeçalho da planilha:', err.message);
  }
  return tabName;
}

/**
 * Consulta a planilha diretamente para calcular o total de ingressos preenchidos.
 */
async function obterTotalIngressosPlanilha(forceRefresh = false) {
  const agora = Date.now();
  if (!forceRefresh && cacheTotalIngressos !== null && agora < cacheExpiracao) {
    return cacheTotalIngressos;
  }

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const tabName = getTabName();

  if (!sheets || !spreadsheetId) {
    return null;
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:G`,
    });

    const rows = res.data.values || [];
    if (rows.length === 0) {
      cacheTotalIngressos = 0;
      cacheExpiracao = agora + CACHE_TTL_MS;
      return 0;
    }

    let total = 0;
    let colQtd = 3; // Padrão: coluna D (índice 3: Quantidade de Ingressos)

    // Detecta se a primeira linha é cabeçalho
    let startIdx = 0;
    const primeiraLinha = rows[0] || [];
    const headerQtdIdx = primeiraLinha.findIndex(h => /quantidade|ingresso|qtd/i.test(String(h || '')));
    if (headerQtdIdx !== -1) {
      colQtd = headerQtdIdx;
      startIdx = 1;
    } else if (primeiraLinha.some(h => /nome|email|telefone/i.test(String(h || '')))) {
      startIdx = 1;
    }

    for (let i = startIdx; i < rows.length; i++) {
      const linha = rows[i];
      if (!linha || linha.length === 0) continue;
      const valor = parseInt(linha[colQtd], 10);
      total += (!isNaN(valor) && valor > 0) ? valor : 1;
    }

    cacheTotalIngressos = total;
    cacheExpiracao = agora + CACHE_TTL_MS;
    return total;
  } catch (err) {
    console.error('[Google Sheets] Erro ao consultar linhas da planilha:', err.message);
    return null;
  }
}

/**
 * Adiciona uma inscrição com sucesso como uma nova linha na planilha do Google Sheets.
 */
async function adicionarInscricaoPlanilha(inscricao) {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  let tabName = getTabName();

  if (!sheets) {
    if (process.env.THE_CHOSEN_DATA_PATH || process.env.NODE_ENV === 'test') {
      return { ok: true, mocked: true };
    }
    throw new Error('Cliente do Google Sheets não disponível (verifique credentials.json).');
  }
  if (!spreadsheetId) {
    throw new Error('ID da planilha do Google Sheets não configurado (GOOGLE_SHEETS_SPREADSHEET_ID).');
  }

  // Garante que o cabeçalho exista
  tabName = await garantirCabecalhoPlanilha(sheets, spreadsheetId, tabName);

  const titular = inscricao.titular || (inscricao.participantes && inscricao.participantes[0]) || '';
  const telefone = inscricao.telefone ? String(inscricao.telefone).replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : '';
  const email = inscricao.email || '';
  const quantidade = Number(inscricao.quantidade) || 1;
  const dataHora = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
  const codigo = inscricao.codigo || '';
  const participantes = Array.isArray(inscricao.participantes)
    ? inscricao.participantes.join(', ')
    : String(inscricao.participantes || '');

  const rowValues = [
    titular,
    telefone,
    email,
    quantidade,
    dataHora,
    codigo,
    participantes
  ];

  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:G`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowValues],
      },
    });

    // Atualiza imediatamente o cache de ingressos preenchidos
    if (cacheTotalIngressos !== null) {
      cacheTotalIngressos += quantidade;
      cacheExpiracao = Date.now() + CACHE_TTL_MS;
    } else {
      cacheTotalIngressos = quantidade;
      cacheExpiracao = Date.now() + CACHE_TTL_MS;
    }

    console.log(`[Google Sheets] Inscrição ${codigo} (${titular}, ${quantidade} ingressos) salva com sucesso na planilha.`);
    return { ok: true, updatedRange: res.data.updates?.updatedRange };
  } catch (err) {
    console.error(`[Google Sheets] Falha ao adicionar linha na planilha para ${codigo}:`, err.message);
    throw err;
  }
}

function setSheetsClientForTest(client) {
  customSheetsClient = client;
}

function setSpreadsheetIdForTest(id) {
  customSpreadsheetId = id;
}

function limparCacheParaTestes() {
  cacheTotalIngressos = null;
  cacheExpiracao = 0;
  customSheetsClient = null;
  customSpreadsheetId = null;
}

module.exports = {
  getCredentialsPath,
  getSpreadsheetId,
  getTabName,
  getSheetsClient,
  obterTotalIngressosPlanilha,
  adicionarInscricaoPlanilha,
  setSheetsClientForTest,
  setSpreadsheetIdForTest,
  limparCacheParaTestes,
  CABECALHOS_PADRAO
};
