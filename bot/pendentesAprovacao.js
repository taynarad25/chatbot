const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Sobrescrevível via env var (usado pelos testes, para nunca ler/escrever no
// pendentes.json real de produção).
const PENDENTES_FILE = process.env.PENDENTES_FILE_PATH || path.join(__dirname, "..", "pendentes.json");

// Sem O/0, I/1/L — evita confusão visual na secretaria digitando/lendo o código.
const CARACTERES_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function gerarCodigo() {
  const bytes = crypto.randomBytes(4);
  let codigo = "";
  for (let i = 0; i < 4; i++) {
    codigo += CARACTERES_CODIGO[bytes[i] % CARACTERES_CODIGO.length];
  }
  return codigo;
}

function loadPendentes() {
  try {
    if (!fs.existsSync(PENDENTES_FILE)) return {};
    const data = fs.readFileSync(PENDENTES_FILE, "utf8");
    return data.trim() ? JSON.parse(data) : {};
  } catch (err) {
    console.error("[ALERTA:persistencia] Erro ao carregar solicitações pendentes (pendentes.json). Retornando vazio para evitar perda de dados.", err);
    return {};
  }
}

function salvar(pendentes) {
  fs.writeFileSync(PENDENTES_FILE, JSON.stringify(pendentes, null, 2), "utf8");
}

// Salva uma solicitação aguardando aprovação da secretaria e retorna um código
// curto pra identificar ela na mensagem do grupo — em vez de embutir os dados
// crus (base64 ilegível) na própria mensagem. Suporta várias solicitações
// pendentes ao mesmo tempo, cada uma com seu próprio código.
function salvarPendente(dados) {
  const pendentes = loadPendentes();

  let codigo;
  do {
    codigo = gerarCodigo();
  } while (pendentes[codigo]);

  pendentes[codigo] = { ...dados, criadoEm: new Date().toISOString() };
  salvar(pendentes);
  console.log(`[Pendentes] Solicitação registrada com o código ${codigo}.`);
  return codigo;
}

function buscarPendente(codigo) {
  const pendentes = loadPendentes();
  return pendentes[codigo] || null;
}

// Remove a solicitação depois que a secretaria já respondeu definitivamente
// (aprovou ou recusou) — evita acumular pendentes.json indefinidamente. Não
// remove em caso de erro na gravação do Google Calendar, pra secretaria poder
// responder de novo à mesma mensagem depois de resolvido o problema.
function removerPendente(codigo) {
  const pendentes = loadPendentes();
  if (!pendentes[codigo]) return;
  delete pendentes[codigo];
  salvar(pendentes);
  console.log(`[Pendentes] Solicitação ${codigo} removida.`);
}

// Extrai o código de uma mensagem do bot (ex: "_Código: A3F9_").
function extrairCodigo(texto) {
  const match = (texto || "").match(/Código:\s*([A-Z0-9]{4,8})/);
  return match ? match[1] : null;
}

module.exports = { salvarPendente, buscarPendente, removerPendente, extrairCodigo };
