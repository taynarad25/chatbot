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
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");

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
    departamento TEXT NOT NULL DEFAULT '',
    dataNascimento TEXT NOT NULL DEFAULT '',
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
    dataMaximaDivulgacao TEXT,
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

  CREATE TABLE IF NOT EXISTS agendamentos_pastorais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eventoId TEXT,
    pastorTelefone TEXT NOT NULL,
    pastorNome TEXT,
    discipulo TEXT,
    dataHora TEXT,
    criadoEm TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agendamentos_pastorais_ev ON agendamentos_pastorais(eventoId);
  CREATE INDEX IF NOT EXISTS idx_agendamentos_pastorais_disc ON agendamentos_pastorais(discipulo);

  CREATE TABLE IF NOT EXISTS descricoes_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evento TEXT NOT NULL,
    departamento TEXT,
    local TEXT,
    tipoDuracao TEXT NOT NULL,
    horariosJson TEXT NOT NULL,
    descricao TEXT NOT NULL,
    criadoEm TEXT NOT NULL,
    atualizadoEm TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rotinas_executadas (
    nome TEXT PRIMARY KEY,
    ultimaData TEXT NOT NULL,
    executadoEm TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS the_chosen_inscricoes (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    quantidade INTEGER NOT NULL,
    participantes TEXT NOT NULL,
    titular TEXT NOT NULL,
    telefone TEXT NOT NULL,
    email TEXT NOT NULL,
    evento TEXT NOT NULL,
    dataEvento TEXT NOT NULL,
    statusConfirmacao TEXT NOT NULL DEFAULT 'pendente',
    confirmadoEm TEXT,
    lembrete3DiasEnviado INTEGER NOT NULL DEFAULT 0,
    dataLembrete3Dias TEXT,
    lembreteDiaEventoEnviado INTEGER NOT NULL DEFAULT 0,
    dataLembreteDiaEvento TEXT,
    whatsappConfirmacaoEnviado INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mulheres_inscricoes (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    telefone TEXT NOT NULL,
    evento TEXT NOT NULL DEFAULT 'Culto de Mulheres: O Vaso e o Oleiro',
    dataEvento TEXT NOT NULL DEFAULT '2026-10-24 15:00',
    whatsappConfirmacaoEnviado INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mulheres_email ON mulheres_inscricoes(email);
  CREATE INDEX IF NOT EXISTS idx_mulheres_telefone ON mulheres_inscricoes(telefone);

  CREATE TABLE IF NOT EXISTS criancas_inscricoes (
    id TEXT PRIMARY KEY,
    nomeCrianca TEXT NOT NULL,
    nomeResponsavel TEXT,
    idade TEXT,
    telefone TEXT,
    alergiaAlimentos TEXT,
    alergiaMedicamentos TEXT,
    evento TEXT NOT NULL DEFAULT 'Especial Dia das Crianças',
    dataEvento TEXT NOT NULL DEFAULT '2026-10-17 14:00',
    whatsappConfirmacaoEnviado INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_criancas_telefone ON criancas_inscricoes(telefone);
  CREATE INDEX IF NOT EXISTS idx_criancas_nome ON criancas_inscricoes(nomeCrianca);

  CREATE TABLE IF NOT EXISTS saude_mulher_inscricoes (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    idade TEXT,
    telefone TEXT NOT NULL,
    condicoesSaude TEXT,
    tratamentoMedicamento TEXT,
    cirurgia TEXT,
    cirurgiaDetalhes TEXT,
    lesaoDor TEXT,
    lesaoDorDetalhes TEXT,
    limitacao TEXT,
    limitacaoDetalhes TEXT,
    gravida TEXT,
    atividadeFisica TEXT,
    atividadeFisicaDetalhes TEXT,
    outrasInformacoes TEXT,
    evento TEXT NOT NULL DEFAULT 'Saúde da Mulher — Pilates',
    dataEvento TEXT NOT NULL DEFAULT '2026-10-31 15:00',
    whatsappConfirmacaoEnviado INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_saude_mulher_telefone ON saude_mulher_inscricoes(telefone);
  CREATE INDEX IF NOT EXISTS idx_saude_mulher_nome ON saude_mulher_inscricoes(nome);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lembretes_aguardando_resposta (
    telefone TEXT PRIMARY KEY,
    eventoId TEXT NOT NULL,
    eventoNome TEXT NOT NULL,
    tipoLembrete TEXT NOT NULL,
    dataEvento TEXT,
    horarioEvento TEXT,
    departamento TEXT,
    docUrl TEXT,
    destinatarioNome TEXT,
    criadoEm TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_descricoes_evento ON descricoes_eventos(evento);
  CREATE INDEX IF NOT EXISTS idx_tc_telefone ON the_chosen_inscricoes(telefone);
  CREATE INDEX IF NOT EXISTS idx_tc_codigo ON the_chosen_inscricoes(codigo);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expiresAt);
  CREATE INDEX IF NOT EXISTS idx_lembretes_espera_tel ON lembretes_aguardando_resposta(telefone);
`);

try {
  const cols = db.prepare("PRAGMA table_info(lideres)").all();
  if (!cols.some((c) => c.name === "cargos")) {
    db.exec("ALTER TABLE lideres ADD COLUMN cargos TEXT NOT NULL DEFAULT '[\"lider\"]'");
  }
  if (!cols.some((c) => c.name === "departamento")) {
    db.exec("ALTER TABLE lideres ADD COLUMN departamento TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.some((c) => c.name === "dataNascimento")) {
    db.exec("ALTER TABLE lideres ADD COLUMN dataNascimento TEXT NOT NULL DEFAULT ''");
  }

  const feCols = db.prepare("PRAGMA table_info(formularios_eventos)").all();
  if (!feCols.some((c) => c.name === "dataMaximaDivulgacao")) {
    db.exec("ALTER TABLE formularios_eventos ADD COLUMN dataMaximaDivulgacao TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_formularios_divulgacao ON formularios_eventos(dataMaximaDivulgacao)");

  const tcCols = db.prepare("PRAGMA table_info(the_chosen_inscricoes)").all();
  if (!tcCols.some((c) => c.name === "dataLembrete3Dias")) {
    db.exec("ALTER TABLE the_chosen_inscricoes ADD COLUMN dataLembrete3Dias TEXT");
  }
  if (!tcCols.some((c) => c.name === "dataLembreteDiaEvento")) {
    db.exec("ALTER TABLE the_chosen_inscricoes ADD COLUMN dataLembreteDiaEvento TEXT");
  }
} catch {
  // Tabela ainda sendo criada ou erro ignorável
}

module.exports = db;
