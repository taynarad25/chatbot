// Script de migração única: importa os dados dos antigos arquivos JSON soltos
// (login.json, lideres.json, pendentes.json, grupo_ids.json, bot_state.json)
// para o banco SQLite (dados.db). Rode isso uma vez, depois de atualizar o
// código pra essa versão e antes de subir o bot com ela pela primeira vez.
//
// Uso: node migrar_para_sqlite.js
//
// Cada arquivo migrado com sucesso é renomeado para "<nome>.migrado" (não é
// apagado), pra rodar de novo sem risco de duplicar dados nem perder nada se
// algo der errado no meio do caminho. Arquivos que não existem são só
// ignorados (ex: pendentes.json, se não houver nada pendente no momento).

const fs = require("fs");
const path = require("path");
const db = require("./db");

const ROOT_DIR = __dirname;

function lerJson(nomeArquivo) {
  const caminho = path.join(ROOT_DIR, nomeArquivo);
  if (!fs.existsSync(caminho)) return null;
  if (fs.lstatSync(caminho).isDirectory()) {
    console.warn(`[Migração] '${nomeArquivo}' é um diretório (não um arquivo) — pulando.`);
    return null;
  }
  const conteudo = fs.readFileSync(caminho, "utf8");
  if (!conteudo.trim()) return null;
  try {
    return JSON.parse(conteudo);
  } catch (err) {
    console.error(`[Migração] Erro ao ler '${nomeArquivo}': ${err.message} — pulando.`);
    return null;
  }
}

function marcarComoMigrado(nomeArquivo) {
  const caminho = path.join(ROOT_DIR, nomeArquivo);
  if (!fs.existsSync(caminho)) return;
  fs.renameSync(caminho, `${caminho}.migrado`);
}

function migrarUsuarios() {
  const dados = lerJson("login.json");
  if (!dados) return console.log("[Migração] login.json não encontrado, nada a migrar.");

  // login.json antigo já teve os dois formatos ao longo do tempo (array e objeto).
  const usuarios = Array.isArray(dados)
    ? Object.fromEntries(dados.filter((u) => u.username).map((u) => [u.username.toLowerCase().trim(), u]))
    : dados;

  const insert = db.prepare(`
    INSERT INTO users (username, salt, hash, status, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO NOTHING
  `);
  let total = 0;
  for (const [username, u] of Object.entries(usuarios)) {
    insert.run(username, u.salt ?? null, u.hash ?? null, u.status || "active", u.role || "user", u.createdAt ?? null, u.updatedAt ?? null);
    total++;
  }
  console.log(`[Migração] ${total} usuário(s) migrado(s) de login.json.`);
  marcarComoMigrado("login.json");
}

function migrarLideres() {
  const dados = lerJson("lideres.json");
  if (!dados) return console.log("[Migração] lideres.json não encontrado, nada a migrar.");

  const insert = db.prepare(`
    INSERT INTO lideres (telefone, nome, createdAt, updatedAt) VALUES (?, ?, ?, ?)
    ON CONFLICT(telefone) DO NOTHING
  `);
  let total = 0;
  for (const [telefone, l] of Object.entries(dados)) {
    insert.run(telefone, l.nome || "", l.createdAt ?? null, l.updatedAt ?? null);
    total++;
  }
  console.log(`[Migração] ${total} líder(es) migrado(s) de lideres.json.`);
  marcarComoMigrado("lideres.json");
}

function migrarPendentes() {
  const dados = lerJson("pendentes.json");
  if (!dados) return console.log("[Migração] pendentes.json não encontrado, nada a migrar.");

  const insert = db.prepare(`
    INSERT INTO pendentes (codigo, dados, criadoEm) VALUES (?, ?, ?)
    ON CONFLICT(codigo) DO NOTHING
  `);
  let total = 0;
  for (const [codigo, valor] of Object.entries(dados)) {
    const { criadoEm, ...resto } = valor;
    insert.run(codigo, JSON.stringify(resto), criadoEm ?? null);
    total++;
  }
  console.log(`[Migração] ${total} solicitação(ões) pendente(s) migrada(s) de pendentes.json.`);
  marcarComoMigrado("pendentes.json");
}

function migrarGrupoIds() {
  const dados = lerJson("grupo_ids.json");
  if (!dados) return console.log("[Migração] grupo_ids.json não encontrado, nada a migrar.");

  const insert = db.prepare(`
    INSERT INTO grupo_ids (nome, jid) VALUES (?, ?)
    ON CONFLICT(nome) DO UPDATE SET jid = excluded.jid
  `);
  let total = 0;
  for (const [nome, jid] of Object.entries(dados)) {
    insert.run(nome.trim().toLowerCase(), jid);
    total++;
  }
  console.log(`[Migração] ${total} grupo(s) migrado(s) de grupo_ids.json.`);
  marcarComoMigrado("grupo_ids.json");
}

function migrarBotState() {
  const dados = lerJson("bot_state.json");
  if (!dados) return console.log("[Migração] bot_state.json não encontrado, nada a migrar.");

  db.prepare(`
    INSERT INTO bot_state (id, active) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET active = excluded.active
  `).run(dados.active ? 1 : 0);
  console.log("[Migração] Estado do bot migrado de bot_state.json.");
  marcarComoMigrado("bot_state.json");
}

migrarUsuarios();
migrarLideres();
migrarPendentes();
migrarGrupoIds();
migrarBotState();

console.log(`[Migração] Concluída. Banco em: ${process.env.DB_PATH || path.join(ROOT_DIR, "dados.db")}`);
