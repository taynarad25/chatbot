const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { google } = require('googleapis');

const ROOT_DIR = path.join(__dirname, '..');

let customSheetsClient = null;
let customSpreadsheetId = null;

let cachedSheetsClient = null;
let lastUsedCredentialsPath = null;
let lastCredentialsWarnTime = 0;

// Cache em memória para o total de ingressos preenchidos na planilha,
// evitando esgotar a cota da API do Google Sheets a cada requisição de status.
let cacheTotalIngressos = null;
let cacheExpiracao = 0;
const CACHE_TTL_MS = 10000; // 10 segundos
const CACHE_ERROR_TTL_MS = 30000; // 30 segundos de backoff em caso de erro para não sobrecarregar API

function isRealFile(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isRealDir(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function inspectDirectoryForJson(dirPath) {
  try {
    if (!isRealDir(dirPath)) return null;
    const priorityNames = ['credentials.json', 'credenciais-google.json'];
    for (const name of priorityNames) {
      const full = path.join(dirPath, name);
      if (isRealFile(full)) return full;
    }
    const entries = fs.readdirSync(dirPath);
    for (const file of entries) {
      if (file.endsWith('.json')) {
        const full = path.join(dirPath, file);
        if (isRealFile(full)) return full;
      }
    }
  } catch {}
  return null;
}

function resolveCandidatePath(cand) {
  if (!cand || typeof cand !== 'string') return null;
  const resolved = path.isAbsolute(cand) ? cand : path.resolve(ROOT_DIR, cand);
  if (isRealFile(resolved)) {
    return resolved;
  }
  if (isRealDir(resolved)) {
    console.warn(`[Google Sheets] Aviso: O caminho de credenciais '${resolved}' é um diretório e não um arquivo JSON.`);
    const nested = inspectDirectoryForJson(resolved);
    if (nested) {
      console.log(`[Google Sheets] Arquivo de credenciais detectado dentro da pasta: '${nested}'`);
      return nested;
    }
  }
  return null;
}

function getCredentialsPath() {
  // 1. Variável de ambiente explícita
  if (process.env.GOOGLE_SHEETS_CREDENTIALS_PATH) {
    const candidate = resolveCandidatePath(process.env.GOOGLE_SHEETS_CREDENTIALS_PATH);
    if (candidate) return candidate;
  }

  // 2. Padrões na raiz do projeto (apenas arquivos reais, nunca diretórios)
  const defaultCredentials = path.join(ROOT_DIR, 'credentials.json');
  const defaultValid = resolveCandidatePath(defaultCredentials);
  if (defaultValid) return defaultValid;

  const legacyCredentials = path.join(ROOT_DIR, 'credenciais-google.json');
  const legacyValid = resolveCandidatePath(legacyCredentials);
  if (legacyValid) return legacyValid;

  // 3. GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const gApp = resolveCandidatePath(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (gApp) return gApp;
  }

  return null;
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
  if (!keyFile) {
    const agora = Date.now();
    if (agora - lastCredentialsWarnTime > 60000) {
      console.warn('[Google Sheets] Nenhum arquivo de credenciais válido (.json) encontrado. Verifique se o caminho aponta para um arquivo ou se foi montado como pasta pelo Docker.');
      lastCredentialsWarnTime = agora;
    }
    return null;
  }

  // Reutiliza cliente em cache se o caminho de credenciais não tiver mudado
  if (cachedSheetsClient && lastUsedCredentialsPath === keyFile) {
    return cachedSheetsClient;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    cachedSheetsClient = google.sheets({ version: 'v4', auth });
    lastUsedCredentialsPath = keyFile;
    return cachedSheetsClient;
  } catch (err) {
    console.error('[Google Sheets] Erro ao inicializar cliente autenticado:', err.message);
    cachedSheetsClient = null;
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

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyALepWcOCGBl53BIMqOpSqpiRE035aNyjKDv50A4r42JSYw62ZBcqf6zY76ZxRoC4/exec';

function getAppsScriptUrl() {
  if (process.env.APPS_SCRIPT_URL !== undefined) {
    return process.env.APPS_SCRIPT_URL;
  }
  return DEFAULT_APPS_SCRIPT_URL;
}

let apiDisabledWarningLogged = false;

/**
 * Solicita a exclusão de uma inscrição na planilha via Google Apps Script (Web App).
 */
async function excluirDoGoogleAppsScript(inscricao) {
  const url = getAppsScriptUrl();
  if (!url) return { ok: false, error: 'URL do Apps Script não configurada' };

  const item = typeof inscricao === 'string' ? { codigo: inscricao } : inscricao;
  const codigo = String(item.codigo || '').trim();
  const titular = item.titular || (Array.isArray(item.participantes) && item.participantes[0]) || item.nome || '';
  const quantidade = Number(item.quantidade) || 1;
  const telefone = item.telefone ? String(item.telefone) : '';
  const email = item.email || '';

  const payload = {
    action: 'excluir',
    codigo,
    nome: titular,
    telefone,
    email,
    quantidade
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    console.log(`[Google Apps Script] Exclusão da inscrição ${codigo} (${titular}) enviada para a planilha via Apps Script (Status: ${res.status}).`);
    return { ok: true, status: res.status };
  } catch (asErr) {
    console.error(`[Google Apps Script] Erro ao enviar exclusão de ${codigo} para o Web App:`, asErr.message);
    return { ok: false, error: asErr.message };
  }
}

/**
 * Busca todas as inscrições cadastradas na planilha via Google Apps Script Web App (doGet).
 */
async function puxarInscricoesDoGoogleAppsScript() {
  const url = getAppsScriptUrl();
  if (!url) return { ok: false, error: 'URL do Apps Script não configurada.', inscricoes: [] };

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow',
    });

    if (!res.ok) {
      console.warn(`[Google Apps Script] Falha ao consultar inscrições (HTTP ${res.status}).`);
      return { ok: false, error: `HTTP ${res.status}`, inscricoes: [] };
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn('[Google Apps Script] Resposta do doGet não é JSON válido (verifique se doGet foi publicado no Apps Script).');
      return { ok: false, error: 'Resposta não é JSON', inscricoes: [] };
    }

    const lista = Array.isArray(data) ? data : (Array.isArray(data.inscricoes) ? data.inscricoes : []);
    console.log(`[Google Apps Script] ${lista.length} inscrições carregadas com sucesso da planilha via doGet.`);
    return { ok: true, inscricoes: lista };
  } catch (err) {
    console.error('[Google Apps Script] Erro de rede ao buscar inscrições da planilha:', err.message);
    return { ok: false, error: err.message, inscricoes: [] };
  }
}

/**
 * Envia uma inscrição para o Google Sheets via Google Apps Script (Web App).
 */
async function enviarParaGoogleAppsScript(inscricao) {
  const url = getAppsScriptUrl();
  if (!url) return { ok: false, error: 'URL do Apps Script não configurada' };

  const titular = inscricao.titular || (Array.isArray(inscricao.participantes) && inscricao.participantes[0]) || inscricao.nome || '';
  const dataHora = inscricao.dataHora || moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
  const payload = {
    dataHora,
    codigo: inscricao.codigo || '',
    nome: titular,
    telefone: inscricao.telefone ? String(inscricao.telefone) : '',
    email: inscricao.email || '',
    quantidade: Number(inscricao.quantidade) || 1,
    situacao: inscricao.situacao || 'Confirmado'
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    console.log(`[Google Apps Script] Inscrição ${payload.codigo} (${payload.nome}) sincronizada com sucesso na planilha via Apps Script (Status: ${res.status}).`);
    return { ok: true, status: res.status };
  } catch (err) {
    console.error(`[Google Apps Script] Erro ao sincronizar inscrição ${payload.codigo} com a planilha:`, err.message);
    return { ok: false, error: err.message };
  }
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
    cacheExpiracao = agora + CACHE_ERROR_TTL_MS;
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
    if (err.message && (err.message.includes('disabled') || err.message.includes('has not been used'))) {
      if (!apiDisabledWarningLogged) {
        console.warn('[Google Sheets] Google Sheets API v4 desativada no GCP. As contagens de vagas serão gerenciadas pelo banco local SQLite e novas inscrições sincronizadas via Google Apps Script.');
        apiDisabledWarningLogged = true;
      }
    } else {
      console.error('[Google Sheets] Erro ao consultar linhas da planilha:', err.message);
    }
    cacheExpiracao = agora + CACHE_ERROR_TTL_MS;
    return null;
  }
}

/**
 * Adiciona uma inscrição com sucesso como uma nova linha na planilha do Google Sheets.
 */
async function adicionarInscricaoPlanilha(inscricao) {
  const codigo = inscricao.codigo || '';
  const titular = inscricao.titular || (Array.isArray(inscricao.participantes) && inscricao.participantes[0]) || inscricao.nome || '';
  const quantidade = Number(inscricao.quantidade) || 1;

  // 1. Envio prioritário e direto via Google Apps Script (Web App)
  let appsScriptResult = null;
  const urlAppsScript = getAppsScriptUrl();
  if (urlAppsScript) {
    try {
      appsScriptResult = await enviarParaGoogleAppsScript(inscricao);
    } catch (asErr) {
      console.error('[Google Apps Script] Falha ao enviar inscrição para o Web App:', asErr.message);
    }
  }

  // Atualiza cache de ingressos se sincronizado com sucesso
  if (appsScriptResult && appsScriptResult.ok) {
    if (cacheTotalIngressos !== null) {
      cacheTotalIngressos += quantidade;
      cacheExpiracao = Date.now() + CACHE_TTL_MS;
    } else {
      cacheTotalIngressos = quantidade;
      cacheExpiracao = Date.now() + CACHE_TTL_MS;
    }
  }

  // 2. Tenta também via Google Sheets API v4 (se configurado ou em testes)
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  let tabName = getTabName();

  if (!sheets) {
    if (process.env.THE_CHOSEN_DATA_PATH || process.env.NODE_ENV === 'test') {
      return { ok: true, mocked: true };
    }
    if (appsScriptResult && appsScriptResult.ok) {
      return { ok: true, appsScript: true };
    }
    console.warn(`[Google Sheets] Inscrição ${codigo} (${titular}) mantida no banco local: credenciais v4 não disponíveis.`);
    return { ok: appsScriptResult?.ok || false, error: 'Cliente Sheets API não disponível.' };
  }

  if (!spreadsheetId) {
    if (appsScriptResult && appsScriptResult.ok) {
      return { ok: true, appsScript: true };
    }
    console.warn(`[Google Sheets] Inscrição ${codigo} mantida no banco local: ID da planilha não configurado.`);
    return { ok: appsScriptResult?.ok || false, error: 'ID da planilha não configurado.' };
  }

  // Garante que o cabeçalho exista de forma tolerante a falhas
  try {
    tabName = await garantirCabecalhoPlanilha(sheets, spreadsheetId, tabName);
  } catch (hdrErr) {
    console.warn('[Google Sheets] Aviso ao validar cabeçalho antes de adicionar linha:', hdrErr.message);
  }

  const telefone = inscricao.telefone ? String(inscricao.telefone).replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : '';
  const email = inscricao.email || '';
  const dataHora = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
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

    if (cacheTotalIngressos !== null) {
      cacheTotalIngressos += quantidade;
      cacheExpiracao = Date.now() + CACHE_TTL_MS;
    } else {
      cacheTotalIngressos = quantidade;
      cacheExpiracao = Date.now() + CACHE_TTL_MS;
    }

    console.log(`[Google Sheets] Inscrição ${codigo} (${titular}, ${quantidade} ingressos) salva com sucesso na planilha via API v4.`);
    return { ok: true, updatedRange: res.data.updates?.updatedRange, appsScript: appsScriptResult?.ok || false };
  } catch (err) {
    if (err.message && (err.message.includes('disabled') || err.message.includes('has not been used'))) {
      if (!apiDisabledWarningLogged) {
        console.warn('[Google Sheets] Google Sheets API v4 desativada no GCP. Inscrições sendo enviadas pelo Google Apps Script Web App.');
        apiDisabledWarningLogged = true;
      }
    } else {
      console.error(`[Google Sheets] Falha ao adicionar linha na planilha para ${codigo}:`, err.message);
    }

    if (appsScriptResult && appsScriptResult.ok) {
      return { ok: true, appsScript: true };
    }
    return { ok: false, error: err.message };
  }
}

/**
 * Exclui uma inscrição da planilha do Google Sheets (via Apps Script e/ou Sheets API v4).
 */
async function excluirInscricaoPlanilha(inscricao) {
  if (!inscricao) return { ok: false, error: 'Inscrição não informada.' };

  const item = typeof inscricao === 'string' ? { codigo: inscricao } : inscricao;
  const codigo = String(item.codigo || '').trim();
  const titular = item.titular || (Array.isArray(item.participantes) && item.participantes[0]) || item.nome || '';
  const quantidade = Number(item.quantidade) || 1;
  const telefone = item.telefone ? String(item.telefone) : '';
  const email = item.email || '';

  let appsScriptResult = null;

  // 1. Notifica e exclui via Google Apps Script (Web App)
  const urlAppsScript = getAppsScriptUrl();
  if (urlAppsScript) {
    appsScriptResult = await excluirDoGoogleAppsScript(item);
  }

  // Atualiza cache decrementando vagas
  if (cacheTotalIngressos !== null && quantidade > 0) {
    cacheTotalIngressos = Math.max(0, cacheTotalIngressos - quantidade);
    cacheExpiracao = Date.now() + CACHE_TTL_MS;
  }

  // 2. Se cliente Google Sheets API v4 estiver disponível, localiza a linha e exclui
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const tabName = getTabName();

  if (!sheets || !spreadsheetId) {
    if (process.env.THE_CHOSEN_DATA_PATH || process.env.NODE_ENV === 'test') {
      return { ok: true, mocked: true, appsScript: !!appsScriptResult?.ok };
    }
    return { ok: appsScriptResult?.ok || true, appsScript: !!appsScriptResult?.ok };
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:G`,
    });

    const rows = res.data.values || [];
    let rowToDeleteIndex = -1;

    const codUpper = codigo.toUpperCase();
    const telLimpo = telefone.replace(/\D/g, '');
    const titLower = titular.toLowerCase().trim();

    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i] || [];
      const rowTexto = row.join(' ');
      const rowUpper = rowTexto.toUpperCase();

      // Checa por código
      if (codUpper && (rowUpper.includes(codUpper) || (row[5] && String(row[5]).toUpperCase().includes(codUpper)))) {
        rowToDeleteIndex = i;
        break;
      }
      // Checa por telefone
      const rowTelLimpo = rowTexto.replace(/\D/g, '');
      if (telLimpo.length >= 8 && rowTelLimpo.includes(telLimpo)) {
        rowToDeleteIndex = i;
        break;
      }
      // Checa por nome
      if (titLower && row[0] && String(row[0]).toLowerCase().trim() === titLower) {
        rowToDeleteIndex = i;
        break;
      }
    }

    if (rowToDeleteIndex !== -1) {
      let sheetId = 0;
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const foundSheet = meta.data.sheets?.find(s => s.properties?.title === tabName);
        if (foundSheet && typeof foundSheet.properties?.sheetId === 'number') {
          sheetId = foundSheet.properties.sheetId;
        }
      } catch (metaErr) {
        console.warn('[Google Sheets] Aviso ao buscar ID numérico da aba:', metaErr.message);
      }

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: rowToDeleteIndex,
                  endIndex: rowToDeleteIndex + 1,
                },
              },
            },
          ],
        },
      });

      console.log(`[Google Sheets] Inscrição ${codigo} (${titular}) removida da linha ${rowToDeleteIndex + 1} da planilha via API v4.`);
      return { ok: true, deletedRow: rowToDeleteIndex + 1, appsScript: !!appsScriptResult?.ok };
    }

    return { ok: true, notFoundInSheet: true, appsScript: !!appsScriptResult?.ok };
  } catch (err) {
    if (err.message && (err.message.includes('disabled') || err.message.includes('has not been used'))) {
      return { ok: appsScriptResult?.ok || true, appsScript: !!appsScriptResult?.ok };
    }
    console.error(`[Google Sheets] Falha ao excluir linha da planilha para ${codigo}:`, err.message);
    return { ok: appsScriptResult?.ok || false, error: err.message };
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
  cachedSheetsClient = null;
  lastUsedCredentialsPath = null;
  lastCredentialsWarnTime = 0;
  apiDisabledWarningLogged = false;
}

module.exports = {
  getCredentialsPath,
  getSpreadsheetId,
  getTabName,
  getSheetsClient,
  getAppsScriptUrl,
  enviarParaGoogleAppsScript,
  excluirDoGoogleAppsScript,
  puxarInscricoesDoGoogleAppsScript,
  obterTotalIngressosPlanilha,
  adicionarInscricaoPlanilha,
  excluirInscricaoPlanilha,
  setSheetsClientForTest,
  setSpreadsheetIdForTest,
  limparCacheParaTestes,
  CABECALHOS_PADRAO
};

