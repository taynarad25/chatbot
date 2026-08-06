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
`);

module.exports = db;
