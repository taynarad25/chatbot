const crypto = require("crypto");
const db = require("../db");

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

// Salva uma solicitação aguardando aprovação da secretaria e retorna um código
// curto pra identificar ela na mensagem do grupo — em vez de embutir os dados
// crus (base64 ilegível) na própria mensagem. Suporta várias solicitações
// pendentes ao mesmo tempo, cada uma com seu próprio código. O payload varia por
// fluxo (agendamento/alteração/cancelamento/pastoral), por isso fica como JSON
// numa coluna só, em vez de colunas fixas para cada campo possível.
// Propaga erros de gravação (sem capturar aqui) — quem chama já trata isso
// (ver bot/messageHandler.js) mostrando uma mensagem amigável ao solicitante.
function salvarPendente(dados) {
  let codigo;
  do {
    codigo = gerarCodigo();
  } while (db.prepare("SELECT 1 FROM pendentes WHERE codigo = ?").get(codigo));

  const criadoEm = new Date().toISOString();
  db.prepare("INSERT INTO pendentes (codigo, dados, criadoEm) VALUES (?, ?, ?)").run(codigo, JSON.stringify(dados), criadoEm);
  console.log(`[Pendentes] Solicitação registrada com o código ${codigo}.`);
  return codigo;
}

// Nunca lança erro: uma falha de leitura aqui deve terminar num "não encontrei
// essa solicitação" amigável (comportamento já esperado pelos vários pontos que
// chamam isso em bot/messageHandler.js sem try/catch local), não num alerta fatal.
function buscarPendente(codigo) {
  try {
    const row = db.prepare("SELECT dados, criadoEm FROM pendentes WHERE codigo = ?").get(codigo);
    if (!row) return null;
    return { ...JSON.parse(row.dados), criadoEm: row.criadoEm };
  } catch (err) {
    console.error("[ALERTA:persistencia] Erro ao buscar solicitação pendente:", err);
    return null;
  }
}

// Remove a solicitação depois que a secretaria já respondeu definitivamente
// (aprovou ou recusou) — evita acumular pendentes indefinidamente. Não remove em
// caso de erro na gravação do Google Calendar, pra secretaria poder responder de
// novo à mesma mensagem depois de resolvido o problema.
function removerPendente(codigo) {
  const info = db.prepare("DELETE FROM pendentes WHERE codigo = ?").run(codigo);
  if (info.changes > 0) console.log(`[Pendentes] Solicitação ${codigo} removida.`);
}

// Extrai o código de uma mensagem do bot (ex: "_Código: A3F9_").
function extrairCodigo(texto) {
  const match = (texto || "").match(/Código:\s*([A-Z0-9]{4,8})/);
  return match ? match[1] : null;
}

module.exports = { salvarPendente, buscarPendente, removerPendente, extrairCodigo };
