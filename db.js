const path = require("path");
const { DatabaseSync } = require("node:sqlite");

// Sobrescrevível via env var (usado pelos testes, para nunca ler/escrever no
// banco real de produção). Um único arquivo substitui os cinco arquivos JSON
// que existiam antes (login.json, lideres.json, pendentes.json, grupo_ids.json,
// bot_state.json) — cada um deles já se perdeu ou corrompeu ao menos uma vez em
// produção por causa do jeito como o Docker monta bind mounts de arquivo único
// (vira diretório vazio se o arquivo não existir no host no momento do "up").
// Um banco único, criado pelo próprio processo na primeira execução (CREATE
// TABLE IF NOT EXISTS), elimina essa classe inteira de problema: escrita
// atômica/transacional, e um só ponto de falha em vez de cinco.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "dados.db");

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    salt TEXT,
    hash TEXT,
    status TEXT NOT NULL,
    role TEXT NOT NULL,
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS lideres (
    telefone TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    cargos TEXT NOT NULL DEFAULT '["lider"]',
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS pendentes (
    codigo TEXT PRIMARY KEY,
    dados TEXT NOT NULL,
    criadoEm TEXT
  );

  CREATE TABLE IF NOT EXISTS grupo_ids (
    nome TEXT PRIMARY KEY,
    jid TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bot_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS formularios_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evento TEXT NOT NULL,
    departamento TEXT,
    data TEXT,
    solicitanteId TEXT,
    payload TEXT NOT NULL,
    docUrl TEXT,
    criadoEm TEXT,
    atualizadoEm TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_formularios_evento ON formularios_eventos(evento);

  CREATE TABLE IF NOT EXISTS lembretes_enviados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eventoId TEXT NOT NULL,
    tipo TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    enviadoEm TEXT NOT NULL,
    UNIQUE(eventoId, tipo)
  );

  CREATE INDEX IF NOT EXISTS idx_lembretes_evento ON lembretes_enviados(eventoId, tipo);
`);

try {
  const cols = db.prepare("PRAGMA table_info(lideres)").all();
  if (!cols.some((c) => c.name === "cargos")) {
    db.exec("ALTER TABLE lideres ADD COLUMN cargos TEXT NOT NULL DEFAULT '[\"lider\"]'");
  }
  if (!cols.some((c) => c.name === "departamento")) {
    db.exec("ALTER TABLE lideres ADD COLUMN departamento TEXT NOT NULL DEFAULT ''");
  }
} catch {
  // Tabela ainda sendo criada ou erro ignorável
}

module.exports = db;
