/**
 * SISTEMA DE CONTROLE FINANCEIRO — COMUNIDADE CRISTÃ CURADOS
 * Rota: /controlefinanceiro
 *
 * Módulo independente com autenticação própria (usuários/sessões/2FA próprios),
 * permissões verificadas no servidor, auditoria de todas as operações e
 * persistência em SQLite (mesmo banco do sistema, tabelas com prefixo fin_).
 *
 * Valores monetários são SEMPRE armazenados em centavos (inteiros).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const pbkdf2 = promisify(crypto.pbkdf2);
const db = require("../db");
const { createRateLimiter } = require("./rateLimiter");

const COOKIE = "fin_session";
const SESSION_TTL = 1000 * 60 * 60 * 8; // 8h (sessão financeira mais curta)
const MAX_BODY = 8 * 1024 * 1024; // 8MB (comprovantes)
const MAX_ANEXO = 5 * 1024 * 1024;
const loginLimiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

// ───────────────────────── PERMISSÕES ─────────────────────────
const PAPEIS = {
  admin_financeiro: "Administrador Financeiro",
  tesouraria: "Tesouraria",
  lideranca: "Pastor / Liderança",
  lider_ministerio: "Líder de Ministério",
  auditoria: "Auditoria / Consulta",
};

const PERMS = {
  admin_financeiro: ["ver", "ver_contribuinte", "lancar", "corrigir", "contas", "categorias", "usuarios", "auditoria", "conferir", "fechar"],
  tesouraria: ["ver", "ver_contribuinte", "lancar", "conferir", "fechar"],
  lideranca: ["ver"],
  lider_ministerio: ["ver_ministerio"],
  auditoria: ["ver", "auditoria"],
};

function pode(user, perm) {
  if (!user) return false;
  const lista = PERMS[user.papel] || [];
  if (perm === "ver") return lista.includes("ver") || lista.includes("ver_ministerio");
  return lista.includes(perm);
}

// Usuários autorizados inicialmente (tesoureiros + Gabriela para testes)
const USUARIOS_INICIAIS = [
  { telefone: "5511951617993", nome: "Larissa Luana dos Santos", papel: "admin_financeiro" },
  { telefone: "5511946593056", nome: "Rafael Oliveira", papel: "admin_financeiro" },
  { telefone: "5511942685501", nome: "Gabriela Diniz", papel: "admin_financeiro" },
];

const MINISTERIOS = [
  "Geral", "Evangelismo", "Epifania (Música / Louvor)", "Intercessão", "Projeto Social Seeds", "Rede Ruach",
  "Rede de Casais", "Rede de Homens", "Rede de Mulheres", "Rede Kids", "Departamento de Artes",
  "Diaconia", "Relacionamentos", "Multimídia", "Secretaria", "Pastoral", "Missões", "Outros",
];

const CATEGORIAS_INICIAIS = {
  entrada: [
    "Dízimos", "Ofertas gerais", "Ofertas especiais", "Ofertas de Santa Ceia", "Ofertas missionárias",
    "Contribuições voluntárias", "Doações", "Campanhas", "Eventos", "Cantina", "Inscrições", "Vendas",
    "Reembolsos recebidos", "Outras receitas",
  ],
  saida: [
    ["Aluguel", "Estrutura", 1], ["Energia elétrica", "Estrutura", 1], ["Água", "Estrutura", 1],
    ["Internet", "Estrutura", 1], ["Telefone", "Estrutura", 1], ["Limpeza", "Estrutura", 0],
    ["Manutenção", "Estrutura", 0], ["Reformas", "Estrutura", 0], ["Equipamentos", "Estrutura", 0],
    ["Materiais de consumo", "Estrutura", 0],
    ...MINISTERIOS.filter(m => !["Geral", "Outros", "Secretaria", "Pastoral"].includes(m)).map(m => [`Ministério: ${m}`, "Ministérios", 0]),
    ["Prebenda / Sustento pastoral", "Pessoal", 1], ["Ajuda de custo", "Pessoal", 0],
    ["Ação social", "Social", 0], ["Missões", "Missões", 0], ["Tarifas bancárias", "Administrativo", 1],
    ["Impostos e taxas", "Administrativo", 0], ["Contabilidade", "Administrativo", 1],
    ["Material de escritório", "Administrativo", 0], ["Eventos", "Eventos", 0], ["Outras despesas", "Outros", 0],
  ],
};

const FORMAS = ["Dinheiro", "Pix", "Transferência bancária", "Cartão de débito", "Cartão de crédito", "Boleto", "Outros"];
const CONTATO_TESOURARIA = "+55 11 99111-7612";
const TEL_TESOURARIA_NUM = "5511991117612";

// ───────────────────────── BANCO ─────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS fin_usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefone TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    papel TEXT NOT NULL,
    ministerio TEXT,
    salt TEXT, hash TEXT,
    totp_secret TEXT, totp_ativo INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL, atualizado_em TEXT
  );
  CREATE TABLE IF NOT EXISTS fin_sessoes (
    id TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, etapa TEXT NOT NULL DEFAULT 'ok',
    criado_em INTEGER NOT NULL, expira_em INTEGER NOT NULL, ip TEXT
  );
  CREATE TABLE IF NOT EXISTS fin_contas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, tipo TEXT NOT NULL, instituicao TEXT, descricao TEXT,
    saldo_inicial INTEGER NOT NULL DEFAULT 0, data_saldo_inicial TEXT,
    reserva INTEGER NOT NULL DEFAULT 0, responsavel TEXT, observacoes TEXT,
    ativa INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fin_categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, tipo TEXT NOT NULL, grupo TEXT, fixa INTEGER NOT NULL DEFAULT 0,
    ativa INTEGER NOT NULL DEFAULT 1, UNIQUE(nome, tipo)
  );
  CREATE TABLE IF NOT EXISTS fin_lancamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,              -- entrada | saida | transferencia
    status TEXT NOT NULL,            -- efetivado | pendente | cancelado
    descricao TEXT NOT NULL,
    valor INTEGER NOT NULL,          -- centavos (> 0)
    data TEXT,                       -- data de efetivação (YYYY-MM-DD)
    vencimento TEXT,                 -- para pendentes
    competencia TEXT,
    categoria_id INTEGER, conta_id INTEGER, conta_destino_id INTEGER,
    forma TEXT, ministerio TEXT, evento TEXT, contribuinte TEXT, fornecedor TEXT, observacoes TEXT,
    ajuste INTEGER NOT NULL DEFAULT 0,
    grupo_recorrencia TEXT, parcela INTEGER, total_parcelas INTEGER, origem_id INTEGER,
    fechamento_id INTEGER, motivo_cancelamento TEXT, chave_dedup TEXT,
    criado_por TEXT, criado_em TEXT NOT NULL, atualizado_em TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_fin_lanc_data ON fin_lancamentos(data);
  CREATE INDEX IF NOT EXISTS idx_fin_lanc_status ON fin_lancamentos(status, tipo);
  CREATE INDEX IF NOT EXISTS idx_fin_lanc_dedup ON fin_lancamentos(chave_dedup);
  CREATE TABLE IF NOT EXISTS fin_anexos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, lancamento_id INTEGER NOT NULL,
    nome TEXT NOT NULL, mime TEXT NOT NULL, tamanho INTEGER NOT NULL, dados TEXT NOT NULL,
    enviado_por TEXT, criado_em TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fin_conferencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT, conta_id INTEGER NOT NULL, data TEXT NOT NULL,
    saldo_sistema INTEGER NOT NULL, valor_contado INTEGER NOT NULL, diferenca INTEGER NOT NULL,
    detalhes TEXT, responsavel TEXT, observacoes TEXT, criado_em TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fin_fechamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, culto TEXT NOT NULL,
    total INTEGER NOT NULL, detalhes TEXT, conferente1 TEXT, conferente2 TEXT, observacoes TEXT,
    criado_por TEXT, criado_em TEXT NOT NULL, UNIQUE(data, culto)
  );
  CREATE TABLE IF NOT EXISTS fin_auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT, acao TEXT NOT NULL, entidade TEXT,
    entidade_id INTEGER, detalhes TEXT, ip TEXT, criado_em TEXT NOT NULL
  );
`);

function agoraIso() { return new Date().toISOString(); }
function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function seed() {
  const now = agoraIso();
  const insU = db.prepare("INSERT OR IGNORE INTO fin_usuarios (telefone, nome, papel, criado_em) VALUES (?, ?, ?, ?)");
  for (const u of USUARIOS_INICIAIS) insU.run(u.telefone, u.nome, u.papel, now);

  const temCat = db.prepare("SELECT COUNT(*) c FROM fin_categorias").get().c;
  if (!temCat) {
    const ins = db.prepare("INSERT OR IGNORE INTO fin_categorias (nome, tipo, grupo, fixa) VALUES (?, ?, ?, ?)");
    for (const n of CATEGORIAS_INICIAIS.entrada) ins.run(n, "entrada", n.startsWith("Ofertas") || n === "Dízimos" ? "Dízimos e Ofertas" : "Receitas", 0);
    for (const [n, g, f] of CATEGORIAS_INICIAIS.saida) ins.run(n, "saida", g, f);
    ins.run("Ajuste de saldo", "entrada", "Ajustes", 0);
    ins.run("Ajuste de saldo", "saida", "Ajustes", 0);
  }
  const temConta = db.prepare("SELECT COUNT(*) c FROM fin_contas").get().c;
  if (!temConta) {
    db.prepare("INSERT INTO fin_contas (nome, tipo, saldo_inicial, data_saldo_inicial, criado_em) VALUES (?, ?, 0, ?, ?)")
      .run("Caixa físico da igreja", "caixa", hojeSP(), now);
  }
}
seed();

// ───────────────────────── UTILITÁRIOS ─────────────────────────
function auditar(user, acao, entidade, entidadeId, detalhes, ip) {
  try {
    db.prepare("INSERT INTO fin_auditoria (usuario, acao, entidade, entidade_id, detalhes, ip, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(user ? `${user.nome} (${user.telefone})` : "sistema", acao, entidade || null, entidadeId || null,
        detalhes ? JSON.stringify(detalhes) : null, ip || null, agoraIso());
  } catch (e) { console.error("[Financeiro] Falha ao auditar:", e.message); }
}

function centavos(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Math.round(v * 100);
  let s = String(v).trim().replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error("Valor inválido.");
  return Math.round(n * 100);
}

function dataValida(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function txt(s, max = 500) { return s === undefined || s === null ? null : String(s).trim().slice(0, max) || null; }
function normTel(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}

function addMeses(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const ult = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, ult));
  return dt.toISOString().slice(0, 10);
}

// ───────────────────────── SENHA / 2FA ─────────────────────────
async function hashSenha(senha, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = (await pbkdf2(senha, salt, 210000, 64, "sha512")).toString("hex");
  return { salt, hash };
}
async function conferirSenha(senha, salt, hash) {
  if (!salt || !hash) return false;
  const h = await pbkdf2(senha, salt, 210000, 64, "sha512");
  const b = Buffer.from(hash, "hex");
  return b.length === h.length && crypto.timingSafeEqual(b, h);
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf) {
  let bits = 0, val = 0, out = "";
  for (const byte of buf) {
    val = (val << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function base32Decode(s) {
  let bits = 0, val = 0; const out = [];
  for (const c of s.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(c); if (i < 0) continue;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret, passo = Math.floor(Date.now() / 30000)) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(passo));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}
function conferirTotp(secret, codigo) {
  const c = String(codigo || "").replace(/\D/g, "");
  if (c.length !== 6) return false;
  const p = Math.floor(Date.now() / 30000);
  return [p - 1, p, p + 1].some(x => totp(secret, x) === c);
}

// ───────────────────────── SESSÃO ─────────────────────────
function lerCookie(req) {
  const c = req.headers.cookie || "";
  for (const part of c.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return null;
}
function criarSessao(res, usuarioId, etapa, ip) {
  const id = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare("INSERT INTO fin_sessoes (id, usuario_id, etapa, criado_em, expira_em, ip) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, usuarioId, etapa, now, now + SESSION_TTL, ip || null);
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${id}; HttpOnly;${secure} Path=/controlefinanceiro; Max-Age=${SESSION_TTL / 1000}; SameSite=Strict`);
  return id;
}
function encerrarSessao(req, res) {
  const id = lerCookie(req);
  if (id) db.prepare("DELETE FROM fin_sessoes WHERE id = ?").run(id);
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/controlefinanceiro; Max-Age=0; SameSite=Strict`);
}
function obterSessao(req) {
  const id = lerCookie(req);
  if (!id) return null;
  const s = db.prepare("SELECT * FROM fin_sessoes WHERE id = ?").get(id);
  if (!s) return null;
  if (Date.now() > Number(s.expira_em)) { db.prepare("DELETE FROM fin_sessoes WHERE id = ?").run(id); return null; }
  const u = db.prepare("SELECT * FROM fin_usuarios WHERE id = ? AND ativo = 1").get(s.usuario_id);
  if (!u) return null;
  return { sessao: s, user: u };
}
function publicoUser(u) {
  return { id: u.id, nome: u.nome, telefone: u.telefone, papel: u.papel, papelNome: PAPEIS[u.papel], ministerio: u.ministerio, totp_ativo: !!u.totp_ativo, perms: PERMS[u.papel] || [] };
}

// ───────────────────────── SALDOS / CONSULTAS ─────────────────────────
function saldosContas() {
  const contas = db.prepare("SELECT * FROM fin_contas ORDER BY ativa DESC, nome").all();
  const ent = db.prepare("SELECT conta_id id, SUM(valor) v FROM fin_lancamentos WHERE status='efetivado' AND tipo='entrada' GROUP BY conta_id").all();
  const sai = db.prepare("SELECT conta_id id, SUM(valor) v FROM fin_lancamentos WHERE status='efetivado' AND tipo='saida' GROUP BY conta_id").all();
  const tOut = db.prepare("SELECT conta_id id, SUM(valor) v FROM fin_lancamentos WHERE status='efetivado' AND tipo='transferencia' GROUP BY conta_id").all();
  const tIn = db.prepare("SELECT conta_destino_id id, SUM(valor) v FROM fin_lancamentos WHERE status='efetivado' AND tipo='transferencia' GROUP BY conta_destino_id").all();
  const pRec = db.prepare("SELECT conta_id id, SUM(valor) v FROM fin_lancamentos WHERE status='pendente' AND tipo='entrada' GROUP BY conta_id").all();
  const pPag = db.prepare("SELECT conta_id id, SUM(valor) v FROM fin_lancamentos WHERE status='pendente' AND tipo='saida' GROUP BY conta_id").all();
  const m = arr => Object.fromEntries(arr.map(r => [r.id, r.v || 0]));
  const E = m(ent), S = m(sai), TO = m(tOut), TI = m(tIn), PR = m(pRec), PP = m(pPag);
  return contas.map(c => {
    const entradas = (E[c.id] || 0) + (TI[c.id] || 0);
    const saidas = (S[c.id] || 0) + (TO[c.id] || 0);
    const saldo = c.saldo_inicial + entradas - saidas;
    const valorReservado = c.reserva ? saldo : 0;
    return {
      ...c,
      total_entradas: entradas,
      total_saidas: saidas,
      saldo_atual: saldo,
      valor_reservado: valorReservado,
      saldo_disponivel: saldo - valorReservado,
      saldo_projetado: saldo + (PR[c.id] || 0) - (PP[c.id] || 0)
    };
  });
}

function saldoConta(contaId) {
  return (saldosContas().find(c => c.id === Number(contaId)) || {}).saldo_atual || 0;
}

function periodo(q) {
  const hoje = hojeSP();
  const [y, m] = hoje.split("-").map(Number);
  const p = q.periodo || "mes";
  if (p === "hoje") return [hoje, hoje];
  if (p === "semana") {
    const d = new Date(hoje + "T12:00:00Z"); const dow = d.getUTCDay();
    const ini = new Date(d); ini.setUTCDate(d.getUTCDate() - dow);
    const fim = new Date(ini); fim.setUTCDate(ini.getUTCDate() + 6);
    return [ini.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)];
  }
  if (p === "mes_anterior") {
    const ini = addMeses(`${y}-${String(m).padStart(2, "0")}-01`, -1);
    const fim = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    return [ini, fim];
  }
  if (p === "ano") return [`${y}-01-01`, `${y}-12-31`];
  if (p === "personalizado" && dataValida(q.inicio) && dataValida(q.fim)) return [q.inicio, q.fim];
  return [`${y}-${String(m).padStart(2, "0")}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)];
}

// Monta filtros SQL comuns (respeita restrição de ministério)
function filtrosSql(q, user, alias = "l") {
  const w = []; const p = [];
  if (q.conta_id) { w.push(`(${alias}.conta_id = ? OR ${alias}.conta_destino_id = ?)`); p.push(Number(q.conta_id), Number(q.conta_id)); }
  if (q.categoria_id) { w.push(`${alias}.categoria_id = ?`); p.push(Number(q.categoria_id)); }
  if (q.ministerio) { w.push(`${alias}.ministerio = ?`); p.push(String(q.ministerio)); }
  if (user.papel === "lider_ministerio") { w.push(`${alias}.ministerio = ?`); p.push(user.ministerio || "__nenhum__"); }
  return { w, p };
}

function dashboard(q, user) {
  const [ini, fim] = periodo(q);
  const hoje = hojeSP();
  const restrito = user.papel === "lider_ministerio";
  const f = filtrosSql(q, user);
  const W = (extra) => [...f.w, ...extra].length ? "WHERE " + [...f.w, ...extra].join(" AND ") : "";
  const soma = (extra, params) => db.prepare(`SELECT COALESCE(SUM(l.valor),0) v FROM fin_lancamentos l LEFT JOIN fin_categorias c ON c.id=l.categoria_id ${W(extra)}`).get(...f.p, ...params).v;

  const efet = ["l.status='efetivado'", "l.data BETWEEN ? AND ?"];
  const entradas = soma([...efet, "l.tipo='entrada'"], [ini, fim]);
  const saidas = soma([...efet, "l.tipo='saida'"], [ini, fim]);
  const dizimos = soma([...efet, "l.tipo='entrada'", "c.nome='Dízimos'"], [ini, fim]);
  const ofertas = soma([...efet, "l.tipo='entrada'", "c.nome LIKE 'Ofertas%'"], [ini, fim]);
  const fixas = soma([...efet, "l.tipo='saida'", "(c.fixa=1 OR l.grupo_recorrencia IS NOT NULL)"], [ini, fim]);

  const pend = (tipo, extra, params) => soma(["l.status='pendente'", `l.tipo='${tipo}'`, ...extra], params);
  const aPagar = pend("saida", [], []);
  const vencidas = pend("saida", ["l.vencimento < ?"], [hoje]);
  const d7 = new Date(hoje + "T12:00:00Z"); d7.setUTCDate(d7.getUTCDate() + 7);
  const d30 = new Date(hoje + "T12:00:00Z"); d30.setUTCDate(d30.getUTCDate() + 30);
  const venc7 = pend("saida", ["l.vencimento BETWEEN ? AND ?"], [hoje, d7.toISOString().slice(0, 10)]);
  const venc30 = pend("saida", ["l.vencimento BETWEEN ? AND ?"], [hoje, d30.toISOString().slice(0, 10)]);
  const aReceber = pend("entrada", [], []);
  const qtdVencidas = db.prepare(`SELECT COUNT(*) c FROM fin_lancamentos l ${W(["l.status='pendente'", "l.tipo='saida'", "l.vencimento < ?"])}`).get(...f.p, hoje).c;

  const contas = restrito ? [] : saldosContas().filter(c => c.ativa);
  const saldoTotal = contas.reduce((a, c) => a + c.saldo_atual, 0);
  const reservado = contas.filter(c => c.reserva).reduce((a, c) => a + c.saldo_atual, 0);
  const caixa = contas.filter(c => c.tipo === "caixa").reduce((a, c) => a + c.saldo_atual, 0);

  const porCat = (tipo) => db.prepare(`SELECT COALESCE(c.nome,'Sem categoria') nome, SUM(l.valor) v FROM fin_lancamentos l LEFT JOIN fin_categorias c ON c.id=l.categoria_id ${W([...efet, `l.tipo='${tipo}'`])} GROUP BY nome ORDER BY v DESC`).all(...f.p, ini, fim);

  // Evolução mensal (últimos 12 meses)
  const [hy, hm] = hoje.split("-").map(Number);
  const mensal = [];
  for (let i = 11; i >= 0; i--) {
    const mi = addMeses(`${hy}-${String(hm).padStart(2, "0")}-01`, -i);
    const [yy, mm] = mi.split("-").map(Number);
    const mf = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
    mensal.push({
      mes: mi.slice(0, 7),
      entradas: soma(["l.status='efetivado'", "l.data BETWEEN ? AND ?", "l.tipo='entrada'"], [mi, mf]),
      saidas: soma(["l.status='efetivado'", "l.data BETWEEN ? AND ?", "l.tipo='saida'"], [mi, mf]),
    });
  }
  // Evolução de saldo: saldo atual retroagindo pelos resultados mensais
  let acum = saldoTotal;
  for (let i = mensal.length - 1; i >= 0; i--) {
    mensal[i].saldo = acum;
    mensal[i].resultado = mensal[i].entradas - mensal[i].saidas;
    acum -= (mensal[i].entradas - mensal[i].saidas);
  }

  const recentes = listarLancamentos({ limite: 10 }, user);
  const entCat = porCat("entrada");
  const saiCat = porCat("saida");
  const entCatMap = Object.fromEntries(entCat.map(r => [r.nome, r.v]));
  const saiCatMap = Object.fromEntries(saiCat.map(r => [r.nome, r.v]));
  const disponivel = saldoTotal - reservado;

  return {
    periodo: { inicio: ini, fim },
    restrito,
    indicadores: {
      saldo_total: saldoTotal,
      caixa_fisico: caixa,
      dinheiro_caixa_fisico: caixa,
      saldo_contas_bancarias: contas.filter(c => c.tipo !== "caixa"),
      disponivel,
      total_disponivel: disponivel,
      reservado,
      total_reservado: reservado,
      entradas,
      entradas_mes: entradas,
      saidas,
      saidas_mes: saidas,
      resultado: entradas - saidas,
      resultado_mes: entradas - saidas,
      a_pagar: aPagar,
      contas_a_pagar: aPagar,
      vencidas,
      contas_vencidas: vencidas,
      qtd_vencidas: qtdVencidas,
      vencer_7: venc7,
      contas_vencer_7d: venc7,
      vencer_30: venc30,
      contas_vencer_30d: venc30,
      a_receber: aReceber,
      valores_a_receber: aReceber,
      dizimos,
      dizimos_mes: dizimos,
      ofertas,
      ofertas_mes: ofertas,
      outras_contribuicoes: entradas - dizimos - ofertas,
      despesas_fixas: fixas,
      despesas_fixas_mensais: fixas,
      despesas_variaveis: saidas - fixas,
      previsao: saldoTotal + aReceber - aPagar,
      previsao_saldo_futuro: saldoTotal + aReceber - aPagar,
    },
    graficos: {
      entradas_vs_saidas: { entradas, saidas },
      comprometido_vs_disponivel: { disponivel, reservado, comprometido: aPagar },
      entradas_por_categoria: entCatMap,
      despesas_por_categoria: saiCatMap,
      distribuicao_por_conta: contas.map(c => ({ nome: c.nome, valor: c.saldo_atual })),
      evolucao_mensal: mensal,
    },
    contas,
    categorias: db.prepare("SELECT * FROM fin_categorias ORDER BY tipo, grupo, nome").all(),
    ministerios: MINISTERIOS,
    entradas_categoria: entCat,
    saidas_categoria: saiCat,
    mensal,
    recentes,
    movimentacoes_recentes: recentes,
  };
}

function formatarCentavos(c) {
  return "R$ " + (Number(c || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function obterResumoPrestacaoContas({ solicitanteNome, solicitanteTel, canal = "web", ip = null, auditar = true }) {
  const agora = agoraIso();
  const hoje = hojeSP();
  const [ano, mes] = hoje.split("-").map(Number);
  const nomesMeses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const mesAtualNome = nomesMeses[mes - 1] || "Mês Atual";

  // Auditoria obrigatória de acesso/solicitação
  if (auditar) {
    try {
      db.prepare(`
        INSERT INTO fin_auditoria (usuario, acao, entidade, entidade_id, detalhes, ip, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `${solicitanteNome || "Pastor/Diretor"} (${solicitanteTel || "sem telefone"})`,
        "solicitacao_prestacao_contas",
        "prestacao_contas",
        null,
        JSON.stringify({
          canal,
          solicitante: solicitanteNome,
          telefone: solicitanteTel,
          horario: agora,
          data_solicitacao: hoje,
        }),
        ip || (canal === "whatsapp" ? "whatsapp_bot" : "web"),
        agora
      );
    } catch (errAud) {
      console.error("[Financeiro] Erro ao registrar auditoria de prestação de contas:", errAud);
    }
  }

  // Obter panorama consolidado do mês atual
  const dashMes = dashboard({ periodo: "mes" }, { papel: "admin_financeiro" });
  const ind = dashMes.indicadores;

  // Análise dos próximos meses (M+1 e M+2)
  const proximoMesData = addMeses(`${ano}-${String(mes).padStart(2, "0")}-01`, 1);
  const [proxAno, proxMes] = proximoMesData.split("-").map(Number);
  const proxMesNome = nomesMeses[proxMes - 1];
  const proxFim = new Date(Date.UTC(proxAno, proxMes, 0)).toISOString().slice(0, 10);

  const contasAPagarProxMes = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) total, COUNT(*) qtd
    FROM fin_lancamentos
    WHERE status = 'pendente' AND tipo = 'saida' AND vencimento BETWEEN ? AND ?
  `).get(proximoMesData, proxFim);

  const contasAReceberProxMes = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) total, COUNT(*) qtd
    FROM fin_lancamentos
    WHERE status = 'pendente' AND tipo = 'entrada' AND vencimento BETWEEN ? AND ?
  `).get(proximoMesData, proxFim);

  const dataHoraBr = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  const resultadoPositivo = ind.resultado_mes >= 0;

  // Montagem do texto executivo para WhatsApp e Leitura Rápida
  let txt = `📊 *PRESTAÇÃO DE CONTAS DA IGREJA*\n`;
  txt += `🏛️ *Comunidade Cristã Curados • ${mesAtualNome}/${ano}*\n`;
  txt += `👤 _Solicitante: ${solicitanteNome || "Liderança"}_\n\n`;

  txt += `━━━━━━━━━━━━━━━━━━━━\n`;
  txt += `💰 *SALDOS ATUAIS*\n`;
  txt += `• *Saldo Geral:* ${formatarCentavos(ind.saldo_total)}\n`;
  txt += `• *Disponível Livre:* ${formatarCentavos(ind.total_disponivel)}\n`;
  const infoExtraSaldos = [];
  if (ind.dinheiro_caixa_fisico > 0) infoExtraSaldos.push(`Caixa: ${formatarCentavos(ind.dinheiro_caixa_fisico)}`);
  const totBancos = (ind.saldo_contas_bancarias || []).reduce((s, c) => s + c.saldo_atual, 0);
  if (totBancos > 0) infoExtraSaldos.push(`Bancos: ${formatarCentavos(totBancos)}`);
  if (ind.total_reservado > 0) infoExtraSaldos.push(`Reservado: ${formatarCentavos(ind.total_reservado)}`);
  if (infoExtraSaldos.length) {
    txt += `  _(${infoExtraSaldos.join(" | ")})_\n`;
  }
  txt += `\n`;

  txt += `━━━━━━━━━━━━━━━━━━━━\n`;
  txt += `📈 *MOVIMENTO DO MÊS*\n`;
  txt += `• 📥 Entradas: *${formatarCentavos(ind.entradas_mes)}*\n`;
  txt += `  _(Dízimos: ${formatarCentavos(ind.dizimos_mes)} | Ofertas: ${formatarCentavos(ind.ofertas_mes)})_\n`;
  txt += `• 📤 Saídas: *${formatarCentavos(ind.saidas_mes)}*\n`;
  txt += `  _(Fixas: ${formatarCentavos(ind.despesas_fixas_mensais)} | Deptos: ${formatarCentavos(ind.despesas_variaveis)})_\n`;
  txt += `• ⚖️ Resultado: *${formatarCentavos(ind.resultado_mes)}* (${resultadoPositivo ? "Superávit ✅" : "Déficit ⚠️"})\n\n`;

  txt += `━━━━━━━━━━━━━━━━━━━━\n`;
  txt += `⚠️ *COMPROMISSOS & CONTAS*\n`;
  if (ind.contas_vencidas > 0) {
    txt += `• Contas Vencidas: *🚨 ${formatarCentavos(ind.contas_vencidas)}* (${ind.qtd_vencidas} conta(s) pendente(s))\n`;
  } else {
    txt += `• Contas Vencidas: *R$ 0,00* ✅ (Em dia)\n`;
  }
  txt += `• A vencer (próx. 30 dias): *${formatarCentavos(ind.contas_vencer_30d)}*\n`;
  txt += `• 🔮 Saldo Projetado: *${formatarCentavos(ind.previsao_saldo_futuro)}*\n\n`;

  txt += `━━━━━━━━━━━━━━━━━━━━\n`;
  txt += `🔗 _Comprovantes e extrato completo no site:_\n`;
  txt += `comunidadecristacurados.com.br/controlefinanceiro\n`;
  txt += `📞 _Tesouraria: +55 11 99111-7612_`;

  return {
    ok: true,
    dataHora: dataHoraBr,
    mesAtualNome,
    ano,
    solicitanteNome,
    solicitanteTel,
    canal,
    indicadores: ind,
    proximoMes: {
      mesNome: proxMesNome,
      ano: proxAno,
      contasAPagar: contasAPagarProxMes.total,
      qtdContasAPagar: contasAPagarProxMes.qtd,
      contasAReceber: contasAReceberProxMes.total,
    },
    textoWhatsApp: txt,
  };
}

function listarLancamentos(q, user) {
  const f = filtrosSql(q, user);
  const w = [...f.w]; const p = [...f.p];
  if (q.status) { w.push("l.status = ?"); p.push(q.status); } else if (!q.incluir_cancelados) { w.push("l.status != 'cancelado'"); }
  if (q.tipo) { w.push("l.tipo = ?"); p.push(q.tipo); }
  if (q.periodo) {
    const [ini, fim] = periodo(q);
    w.push("COALESCE(l.data, l.vencimento) BETWEEN ? AND ?"); p.push(ini, fim);
  }
  if (q.busca) { w.push("(l.descricao LIKE ? OR l.observacoes LIKE ? OR l.fornecedor LIKE ?)"); const b = `%${String(q.busca).slice(0, 80)}%`; p.push(b, b, b); }
  if (q.sem_fechamento) { w.push("l.fechamento_id IS NULL"); }
  if (dataValida(q.data_exata)) { w.push("l.data = ?"); p.push(q.data_exata); }
  const ordem = q.status === "pendente" ? "l.vencimento ASC, l.id ASC" : "COALESCE(l.data, l.vencimento) DESC, l.id DESC";
  const lim = Math.min(Number(q.limite) || 500, 2000);
  const rows = db.prepare(`
    SELECT l.*, c.nome categoria, co.nome conta, cd.nome conta_destino,
      (SELECT COUNT(*) FROM fin_anexos a WHERE a.lancamento_id = l.id) anexos
    FROM fin_lancamentos l
    LEFT JOIN fin_categorias c ON c.id = l.categoria_id
    LEFT JOIN fin_contas co ON co.id = l.conta_id
    LEFT JOIN fin_contas cd ON cd.id = l.conta_destino_id
    ${w.length ? "WHERE " + w.join(" AND ") : ""}
    ORDER BY ${ordem} LIMIT ${lim}`).all(...p);
  const verContrib = pode(user, "ver_contribuinte");
  return rows.map(r => {
    const contrib = verContrib ? r.contribuinte : (r.contribuinte ? "•••• (restrito)" : null);
    return {
      ...r,
      contribuinte: contrib,
      contribuinte_nome: contrib,
      categoria_nome: r.categoria,
      conta_nome: r.conta,
      conta_destino_nome: r.conta_destino,
      data_movimento: r.data,
      data_vencimento: r.vencimento,
      forma_pagamento: r.forma,
      parcela_num: r.parcela,
      parcela_total: r.total_parcelas,
      qtd_anexos: r.anexos,
    };
  });
}

// ───────────────────────── OPERAÇÕES ─────────────────────────
function validarConta(id, obrig = true) {
  if (!id) { if (obrig) throw new Error("Selecione a conta financeira."); return null; }
  const c = db.prepare("SELECT * FROM fin_contas WHERE id = ?").get(Number(id));
  if (!c) throw new Error("Conta financeira não encontrada.");
  if (!c.ativa) throw new Error(`A conta "${c.nome}" está inativa.`);
  return c;
}
function validarCategoria(id, tipo) {
  if (!id) {
    const def = db.prepare("SELECT * FROM fin_categorias WHERE tipo = ? ORDER BY id ASC LIMIT 1").get(tipo);
    if (def) return def;
    throw new Error("Selecione a categoria.");
  }
  const c = db.prepare("SELECT * FROM fin_categorias WHERE id = ?").get(Number(id));
  if (!c || c.tipo !== tipo) throw new Error("Categoria inválida para este tipo de lançamento.");
  return c;
}

function criarLancamento(b, user, ip) {
  let tipo = b.tipo;
  let ajuste = b.ajuste ? 1 : 0;
  if (tipo === "ajuste") {
    ajuste = 1;
    tipo = Number(b.valor) < 0 ? "saida" : "entrada";
  }
  if (!["entrada", "saida", "transferencia"].includes(tipo)) throw new Error("Tipo de lançamento inválido.");
  const valor = Math.abs(centavos(b.valor));
  if (valor <= 0) throw new Error("O valor deve ser maior que zero.");
  const descricao = txt(b.descricao, 200);
  if (!descricao) throw new Error("Informe a descrição.");
  const pendente = b.status === "pendente";
  if (ajuste && !pode(user, "corrigir")) throw new Error("Somente o Administrador Financeiro pode lançar ajustes de saldo.");
  if (ajuste && !txt(b.observacoes || b.descricao)) throw new Error("Ajustes exigem justificativa nas observações.");

  let categoriaId = null, contaDestino = null;
  const conta = validarConta(b.conta_id, !pendente || tipo === "transferencia");
  if (tipo === "transferencia") {
    if (pendente) throw new Error("Transferências devem ser registradas já efetivadas.");
    contaDestino = validarConta(b.conta_destino_id);
    if (contaDestino.id === conta.id) throw new Error("A conta de origem e destino devem ser diferentes.");
  } else {
    categoriaId = validarCategoria(b.categoria_id, tipo).id;
  }

  const rawData = b.data || b.data_movimento || hojeSP();
  const rawVenc = b.vencimento || b.data_vencimento || hojeSP();
  const data = pendente ? null : (dataValida(rawData) ? rawData : hojeSP());
  const vencimento = pendente ? (dataValida(rawVenc) ? rawVenc : hojeSP()) : null;

  // Bloqueia saídas efetivadas que deixem a conta negativa (exceto ajuste)
  if (!pendente && (tipo === "saida" || tipo === "transferencia") && !ajuste && !(b.permitir_negativo || b.confirmar_saldo_negativo)) {
    const saldo = saldoConta(conta.id);
    if (saldo - valor < 0) {
      const e = new Error(`Saldo insuficiente em "${conta.nome}" (saldo atual R$ ${(saldo / 100).toFixed(2).replace(".", ",")}).`);
      e.code = "SALDO_NEGATIVO"; throw e;
    }
  }

  // Proteção contra duplicidade
  const chave = crypto.createHash("sha256").update([tipo, data || vencimento, valor, conta?.id, contaDestino?.id, categoriaId, descricao.toLowerCase()].join("|")).digest("hex");
  if (!(b.confirmar_duplicado || b.confirmar_duplicidade)) {
    const dup = db.prepare("SELECT id FROM fin_lancamentos WHERE chave_dedup = ? AND status != 'cancelado'").get(chave);
    if (dup) { const e = new Error(`Já existe um lançamento idêntico (#${dup.id}). Confirme se não é duplicado.`); e.code = "DUPLICADO"; throw e; }
  }

  const parcelasTotal = Math.min(Math.max(parseInt(b.total_parcelas || b.parcelas, 10) || 1, 1), 120);
  const parcelaInicial = Math.min(Math.max(parseInt(b.parcela_inicial || b.comecar_parcela, 10) || 1, 1), parcelasTotal);
  const modoValor = b.modo_valor === "parcela" ? "parcela" : "total";
  const recorrente = Math.min(Math.max(parseInt(b.repetir_meses, 10) || 0, 0), 60);
  const grupo = parcelasTotal > 1 || recorrente > 1 ? crypto.randomBytes(6).toString("hex") : null;
  const now = agoraIso();
  const quem = `${user.nome} (${user.telefone})`;
  const ins = db.prepare(`INSERT INTO fin_lancamentos
    (tipo, status, descricao, valor, data, vencimento, competencia, categoria_id, conta_id, conta_destino_id, forma, ministerio, evento,
     contribuinte, fornecedor, observacoes, ajuste, grupo_recorrencia, parcela, total_parcelas, chave_dedup, criado_por, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const ids = [];
  const base = {
    competencia: txt(b.competencia, 7),
    forma: txt(b.forma || b.forma_pagamento, 40),
    ministerio: txt(b.ministerio, 80),
    evento: txt(b.evento, 120),
    contribuinte: pode(user, "ver_contribuinte") ? txt(b.contribuinte || b.contribuinte_nome, 120) : null,
    fornecedor: txt(b.fornecedor, 120),
    observacoes: txt(b.observacoes, 1000),
  };
  db.exec("BEGIN");
  try {
    if (parcelasTotal > 1) {
      const vp = modoValor === "parcela" ? valor : Math.floor(valor / parcelasTotal);
      const resto = modoValor === "parcela" ? 0 : (valor - vp * parcelasTotal);
      const ref = vencimento || data;
      for (let p = parcelaInicial; p <= parcelasTotal; p++) {
        const offset = p - parcelaInicial;
        const st = offset === 0 && !pendente ? "efetivado" : "pendente";
        const dt = addMeses(ref, offset);
        const valParcela = modoValor === "parcela" ? vp : (vp + (p === 1 ? resto : 0));
        const r = ins.run(tipo, st, `${descricao} (${p}/${parcelasTotal})`, valParcela, st === "efetivado" ? dt : null, st === "pendente" ? dt : null,
          base.competencia, categoriaId, conta?.id || null, contaDestino?.id || null, base.forma, base.ministerio, base.evento, base.contribuinte, base.fornecedor, base.observacoes,
          ajuste, grupo, p, parcelasTotal, offset === 0 ? chave : null, quem, now);
        ids.push(Number(r.lastInsertRowid));
      }
    } else {
      const r = ins.run(tipo, pendente ? "pendente" : "efetivado", descricao, valor, data, vencimento, base.competencia, categoriaId, conta?.id || null, contaDestino?.id || null,
        base.forma, base.ministerio, base.evento, base.contribuinte, base.fornecedor, base.observacoes, ajuste, grupo, null, null, chave, quem, now);
      ids.push(Number(r.lastInsertRowid));
      const ref = vencimento || data;
      const extraMeses = recorrente > 1 ? recorrente - 1 : 0;
      for (let i = 1; i <= extraMeses; i++) {
        const r2 = ins.run(tipo, "pendente", descricao, valor, null, addMeses(ref, i), null, categoriaId, conta?.id || null, null,
          base.forma, base.ministerio, base.evento, null, base.fornecedor, base.observacoes, 0, grupo, null, null, null, quem, now);
        ids.push(Number(r2.lastInsertRowid));
      }
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }

  auditar(user, ajuste ? "ajuste_saldo" : "criar_lancamento", "lancamento", ids[0], { tipo, valor, descricao, ids, status: pendente ? "pendente" : "efetivado" }, ip);
  return { ok: true, id: ids[0], ids, message: ids.length > 1 ? `${ids.length} lançamentos gerados com sucesso.` : "Lançamento registrado com sucesso." };
}

// Quitar (pagar/receber) um pendente — total ou parcial
function quitarLancamento(id, b, user, ip) {
  const l = db.prepare("SELECT * FROM fin_lancamentos WHERE id = ?").get(Number(id));
  if (!l) throw new Error("Lançamento não encontrado.");
  if (l.status !== "pendente") throw new Error("Este lançamento não está pendente.");
  const conta = validarConta(b.conta_id || l.conta_id);
  const rawData = b.data || b.data_movimento;
  const data = dataValida(rawData) ? rawData : hojeSP();
  const rawVal = b.valor !== undefined ? b.valor : b.valor_pago;
  const valorPago = rawVal !== undefined && rawVal !== "" ? centavos(rawVal) : l.valor;
  if (valorPago <= 0 || valorPago > l.valor) throw new Error("Valor pago inválido (deve ser entre R$ 0,01 e o valor pendente).");
  if (l.tipo === "saida" && !b.permitir_negativo && saldoConta(conta.id) - valorPago < 0) {
    const e = new Error(`Saldo insuficiente em "${conta.nome}".`); e.code = "SALDO_NEGATIVO"; throw e;
  }
  const now = agoraIso();
  const parcial = valorPago < l.valor;
  const restante = l.valor - valorPago;
  db.exec("BEGIN");
  try {
    if (parcial) {
      db.prepare(`INSERT INTO fin_lancamentos (tipo, status, descricao, valor, vencimento, competencia, categoria_id, conta_id, forma, ministerio, evento,
        fornecedor, observacoes, grupo_recorrencia, parcela, total_parcelas, origem_id, criado_por, criado_em)
        SELECT tipo, 'pendente', descricao || ' (saldo restante)', ?, vencimento, competencia, categoria_id, conta_id, forma, ministerio, evento,
        fornecedor, observacoes, grupo_recorrencia, parcela, total_parcelas, id, ?, ? FROM fin_lancamentos WHERE id = ?`)
        .run(restante, `${user.nome} (${user.telefone})`, now, l.id);
    }
    db.prepare("UPDATE fin_lancamentos SET status='efetivado', valor=?, data=?, conta_id=?, forma=COALESCE(?, forma), atualizado_em=? WHERE id=?")
      .run(valorPago, data, conta.id, txt(b.forma || b.forma_pagamento, 40), now, l.id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  auditar(user, l.tipo === "saida" ? "registrar_pagamento" : "registrar_recebimento", "lancamento", l.id, { valorPago, valorOriginal: l.valor, conta: conta.nome, data }, ip);
  return {
    ok: true,
    parcial,
    valor_restante: restante,
    message: parcial ? "Pagamento parcial registrado. O saldo restante continua pendente." : "Quitação registrada com sucesso."
  };
}

function cancelarLancamento(id, b, user, ip) {
  const l = db.prepare("SELECT * FROM fin_lancamentos WHERE id = ?").get(Number(id));
  if (!l) throw new Error("Lançamento não encontrado.");
  if (l.status === "cancelado") throw new Error("Lançamento já cancelado.");
  // Tesouraria pode cancelar pendentes; efetivados exigem administrador (correção auditável)
  if (l.status === "efetivado" && !pode(user, "corrigir")) throw new Error("Somente o Administrador Financeiro pode estornar lançamentos efetivados.");
  const motivo = txt(b.motivo, 500);
  if (!motivo) throw new Error("Informe o motivo do cancelamento/estorno.");
  db.prepare("UPDATE fin_lancamentos SET status='cancelado', motivo_cancelamento=?, atualizado_em=? WHERE id=?").run(motivo, agoraIso(), l.id);
  auditar(user, "cancelar_lancamento", "lancamento", l.id, { antes: l, motivo }, ip);
  return { ok: true, message: "Lançamento cancelado. O registro permanece no histórico." };
}

function editarLancamento(id, b, user, ip) {
  const l = db.prepare("SELECT * FROM fin_lancamentos WHERE id = ?").get(Number(id));
  if (!l) throw new Error("Lançamento não encontrado.");
  if (l.status === "cancelado") throw new Error("Lançamentos cancelados não podem ser editados.");
  if (l.status === "efetivado" && !pode(user, "corrigir")) throw new Error("Somente o Administrador Financeiro pode corrigir lançamentos efetivados.");
  const motivo = txt(b.motivo_edicao || b.motivo) || "Edição de dados pelo painel";

  const statusNovo = b.status === "pendente" || b.status === "efetivado" ? b.status : l.status;
  const rawData = b.data !== undefined ? b.data : (b.data_movimento !== undefined ? b.data_movimento : l.data);
  const dataNova = dataValida(rawData) ? rawData : (statusNovo === "efetivado" ? (l.data || hojeSP()) : null);
  const rawVenc = b.vencimento !== undefined ? b.vencimento : (b.data_vencimento !== undefined ? b.data_vencimento : l.vencimento);
  const vencNovo = dataValida(rawVenc) ? rawVenc : (statusNovo === "pendente" ? (l.vencimento || dataNova || hojeSP()) : l.vencimento);
  const compNova = b.competencia !== undefined ? txt(b.competencia, 7) : (dataNova ? dataNova.slice(0, 7) : l.competencia);

  const novo = {
    descricao: txt(b.descricao, 200) || l.descricao,
    valor: b.valor !== undefined && b.valor !== "" ? centavos(b.valor) : l.valor,
    status: statusNovo,
    data: dataNova,
    vencimento: vencNovo,
    competencia: compNova,
    categoria_id: b.categoria_id && l.tipo !== "transferencia" ? validarCategoria(b.categoria_id, l.tipo).id : l.categoria_id,
    conta_id: b.conta_id ? validarConta(b.conta_id).id : l.conta_id,
    forma: b.forma !== undefined ? txt(b.forma || b.forma_pagamento, 40) : (b.forma_pagamento !== undefined ? txt(b.forma_pagamento, 40) : l.forma),
    ministerio: b.ministerio !== undefined ? txt(b.ministerio, 80) : l.ministerio,
    fornecedor: b.fornecedor !== undefined ? txt(b.fornecedor, 120) : (b.contribuinte_nome !== undefined ? txt(b.contribuinte_nome, 120) : l.fornecedor),
    observacoes: b.observacoes !== undefined ? txt(b.observacoes, 1000) : l.observacoes,
  };
  if (novo.valor <= 0) throw new Error("Valor inválido.");
  db.prepare(`UPDATE fin_lancamentos SET descricao=?, valor=?, status=?, data=?, vencimento=?, competencia=?, categoria_id=?, conta_id=?, forma=?, ministerio=?, fornecedor=?, observacoes=?, chave_dedup=NULL, atualizado_em=? WHERE id=?`)
    .run(novo.descricao, novo.valor, novo.status, novo.data, novo.vencimento, novo.competencia, novo.categoria_id, novo.conta_id, novo.forma, novo.ministerio, novo.fornecedor, novo.observacoes, agoraIso(), l.id);
  auditar(user, "corrigir_lancamento", "lancamento", l.id, { antes: l, depois: novo, motivo }, ip);
  const atualizado = db.prepare("SELECT * FROM fin_lancamentos WHERE id = ?").get(l.id);
  return { ok: true, lancamento: atualizado, message: "Lançamento atualizado com sucesso." };
}

function salvarConta(b, user, ip) {
  const nome = txt(b.nome, 100);
  if (!nome) throw new Error("Informe o nome da conta.");
  const tipoMap = { caixa_fisico: "caixa", conta_corrente: "corrente", conta_poupanca: "poupanca", conta_digital: "digital" };
  const rawTipo = tipoMap[b.tipo] || b.tipo;
  const tipo = ["caixa", "corrente", "poupanca", "digital", "outra"].includes(rawTipo) ? rawTipo : "outra";
  const reservaFlag = b.reserva || Number(b.valor_reservado || 0) > 0 ? 1 : 0;
  const campos = [nome, tipo, txt(b.instituicao, 100), txt(b.descricao, 300), reservaFlag, txt(b.responsavel, 100), txt(b.observacoes, 500)];
  if (b.id) {
    const antes = db.prepare("SELECT * FROM fin_contas WHERE id=?").get(Number(b.id));
    if (!antes) throw new Error("Conta não encontrada.");
    let saldoIni = antes.saldo_inicial, dataIni = antes.data_saldo_inicial;
    if (b.saldo_inicial !== undefined && centavos(b.saldo_inicial) !== antes.saldo_inicial) {
      const mov = db.prepare("SELECT COUNT(*) c FROM fin_lancamentos WHERE (conta_id=? OR conta_destino_id=?) AND status='efetivado'").get(antes.id, antes.id).c;
      if (mov) throw new Error("O saldo inicial não pode ser alterado após haver movimentações. Use um lançamento de ajuste.");
      saldoIni = centavos(b.saldo_inicial); dataIni = dataValida(b.data_saldo_inicial) ? b.data_saldo_inicial : dataIni;
    }
    db.prepare("UPDATE fin_contas SET nome=?, tipo=?, instituicao=?, descricao=?, reserva=?, responsavel=?, observacoes=?, saldo_inicial=?, data_saldo_inicial=?, ativa=? WHERE id=?")
      .run(...campos, saldoIni, dataIni, b.ativa === false || b.ativa === "0" ? 0 : 1, antes.id);
    auditar(user, "editar_conta", "conta", antes.id, { antes, depois: b }, ip);
    return { ok: true, id: antes.id, message: "Conta atualizada." };
  }
  const r = db.prepare("INSERT INTO fin_contas (nome, tipo, instituicao, descricao, reserva, responsavel, observacoes, saldo_inicial, data_saldo_inicial, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(...campos, centavos(b.saldo_inicial), dataValida(b.data_saldo_inicial) ? b.data_saldo_inicial : hojeSP(), agoraIso());
  const novoId = Number(r.lastInsertRowid);
  auditar(user, "criar_conta", "conta", novoId, b, ip);
  return { ok: true, id: novoId, message: "Conta cadastrada." };
}

const CEDULAS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5];
function salvarConferencia(b, user, ip) {
  const conta = validarConta(b.conta_id);
  const qtds = b.quantidades || b.detalhes_cedulas || {};
  let total = 0; const detalhes = {};
  for (const [k, rawQ] of Object.entries(qtds)) {
    const q = Math.max(parseInt(rawQ, 10) || 0, 0);
    if (!q) continue;
    const numK = Number(k);
    const valorCent = CEDULAS.includes(numK) && !b.detalhes_cedulas ? numK : Math.round(numK * 100);
    detalhes[valorCent] = (detalhes[valorCent] || 0) + q;
    total += q * valorCent;
  }
  const saldo = saldoConta(conta.id);
  const dif = total - saldo;
  const r = db.prepare("INSERT INTO fin_conferencias (conta_id, data, saldo_sistema, valor_contado, diferenca, detalhes, responsavel, observacoes, criado_em) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(conta.id, dataValida(b.data) ? b.data : hojeSP(), saldo, total, dif, JSON.stringify(detalhes), txt(b.responsavel, 120) || user.nome, txt(b.observacoes, 500), agoraIso());
  auditar(user, "conferencia_caixa", "conferencia", Number(r.lastInsertRowid), { conta: conta.nome, saldo, total, dif }, ip);
  return {
    ok: true,
    id: Number(r.lastInsertRowid),
    diferenca: dif,
    valor_contado: total,
    saldo_sistema: saldo,
    message: dif === 0 ? "Conferência salva: caixa confere com o sistema ✅" : "Conferência salva com DIFERENÇA. Investigue e, se necessário, solicite um ajuste autorizado."
  };
}

function fecharCulto(b, user, ip) {
  const rawData = b.data || b.data_culto;
  const data = dataValida(rawData) ? rawData : hojeSP();
  const culto = txt(b.culto || b.culto_nome, 120);
  if (!data || !culto) throw new Error("Informe a data e o nome do culto.");
  if (db.prepare("SELECT id FROM fin_fechamentos WHERE data=? AND culto=?").get(data, culto)) throw new Error("Já existe um fechamento para este culto nesta data.");
  const catDiz = db.prepare("SELECT id FROM fin_categorias WHERE nome='Dízimos' AND tipo='entrada'").get();
  const catOf = db.prepare("SELECT id FROM fin_categorias WHERE nome='Ofertas gerais' AND tipo='entrada'").get();
  if (!catDiz || !catOf) throw new Error("Categorias 'Dízimos' e 'Ofertas gerais' precisam existir.");

  const linhas = Array.isArray(b.linhas) ? b.linhas : [];
  const novos = [];
  for (const ln of linhas) {
    const diz = centavos(ln.dizimos), of = centavos(ln.ofertas);
    if (diz < 0 || of < 0) throw new Error("Valores não podem ser negativos.");
    if (diz + of === 0) continue;
    const conta = validarConta(ln.conta_id);
    novos.push({ forma: txt(ln.forma, 40) || "Outros", conta, diz, of });
  }
  if (Array.isArray(b.itens)) {
    for (const it of b.itens) {
      const v = centavos(it.valor);
      if (v <= 0) continue;
      const conta = validarConta(it.conta_id);
      const isDiz = Number(it.categoria_id) === catDiz.id || /d[ií]zimo/i.test(it.descricao || "");
      novos.push({ forma: txt(it.forma_pagamento || it.forma, 40) || "Outros", conta, diz: isDiz ? v : 0, of: isDiz ? 0 : v });
    }
  }
  const vincIds = (Array.isArray(b.vincular_ids) ? b.vincular_ids : []).map(Number).filter(Boolean);
  const vinculados = vincIds.map(id => {
    const l = db.prepare("SELECT * FROM fin_lancamentos WHERE id=?").get(id);
    if (!l || l.tipo !== "entrada" || l.status !== "efetivado") throw new Error(`Lançamento #${id} não pode ser vinculado.`);
    if (l.fechamento_id) throw new Error(`Lançamento #${id} já pertence a outro fechamento.`);
    return l;
  });
  const totalNovos = novos.reduce((a, n) => a + n.diz + n.of, 0);
  const totalVinc = vinculados.reduce((a, l) => a + l.valor, 0);
  if (totalNovos + totalVinc === 0) throw new Error("Informe ao menos um valor arrecadado.");

  const quem = `${user.nome} (${user.telefone})`; const now = agoraIso();
  let fechId;
  db.exec("BEGIN");
  try {
    const r = db.prepare("INSERT INTO fin_fechamentos (data, culto, total, detalhes, conferente1, conferente2, observacoes, criado_por, criado_em) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(data, culto, totalNovos + totalVinc, JSON.stringify({ novos: novos.map(n => ({ forma: n.forma, conta: n.conta.nome, dizimos: n.diz, ofertas: n.of })), vinculados: vincIds }),
        txt(b.conferente1, 120), txt(b.conferente2, 120), txt(b.observacoes, 500), quem, now);
    fechId = Number(r.lastInsertRowid);
    const ins = db.prepare(`INSERT INTO fin_lancamentos (tipo, status, descricao, valor, data, categoria_id, conta_id, forma, evento, fechamento_id, criado_por, criado_em)
      VALUES ('entrada','efetivado',?,?,?,?,?,?,?,?,?,?)`);
    for (const n of novos) {
      if (n.diz) ins.run(`Dízimos — ${culto} (${n.forma})`, n.diz, data, catDiz.id, n.conta.id, n.forma, culto, fechId, quem, now);
      if (n.of) ins.run(`Ofertas — ${culto} (${n.forma})`, n.of, data, catOf.id, n.conta.id, n.forma, culto, fechId, quem, now);
    }
    const upd = db.prepare("UPDATE fin_lancamentos SET fechamento_id=? WHERE id=?");
    for (const l of vinculados) upd.run(fechId, l.id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  auditar(user, "fechamento_culto", "fechamento", fechId, { data, culto, totalNovos, totalVinc }, ip);
  return { ok: true, id: fechId, total_geral: totalNovos + totalVinc, message: `Arrecadação fechada: R$ ${((totalNovos + totalVinc) / 100).toFixed(2).replace(".", ",")}.` };
}

// ───────────────────────── HTML / ROTEAMENTO ─────────────────────────
const APP_JS = path.join(__dirname, "public", "financeiro_app.js");
const APP_CSS = path.join(__dirname, "public", "financeiro.css");

function enviar(res, status, tipo, corpo, extra = {}) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": tipo, "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
    "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; frame-ancestors 'none'",
    ...extra,
  });
  res.end(corpo);
}
const json = (res, st, obj) => enviar(res, st, "application/json; charset=utf-8", JSON.stringify(obj));

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tam = 0; const partes = [];
    req.on("data", ch => {
      tam += ch.length;
      if (tam > MAX_BODY) { reject(new Error("Requisição muito grande.")); req.destroy(); return; }
      partes.push(ch);
    });
    req.on("end", () => {
      const s = Buffer.concat(partes).toString("utf8");
      if (!s) return resolve({});
      try { resolve(JSON.parse(s)); } catch { reject(new Error("JSON inválido.")); }
    });
    req.on("error", reject);
  });
}

function paginaHtml(titulo, corpoId) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo} — Comunidade Cristã Curados</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/controlefinanceiro/app.css"></head>
<body class="fin-body" data-pagina="${corpoId}"><div id="app" data-pagina="${corpoId}"><div class="carregando">Carregando...</div></div>
<script src="/controlefinanceiro/app.js"></script></body></html>`;
}

/**
 * Handler principal. Retorna true se tratou a requisição.
 */
async function handle(req, res, { pathname, searchParams, ip }) {
  if (!pathname.startsWith("/controlefinanceiro")) return false;
  const metodo = req.method;

  // Arquivos estáticos
  if (metodo === "GET" && pathname === "/controlefinanceiro/app.js") {
    enviar(res, 200, "application/javascript; charset=utf-8", fs.readFileSync(APP_JS)); return true;
  }
  if (metodo === "GET" && pathname === "/controlefinanceiro/app.css") {
    enviar(res, 200, "text/css; charset=utf-8", fs.readFileSync(APP_CSS)); return true;
  }

  // CSRF básico: APIs mutáveis só aceitam JSON vindo da mesma origem
  if (metodo !== "GET") {
    const ct = req.headers["content-type"] || "";
    const origem = req.headers.origin;
    if (!ct.includes("application/json")) { json(res, 415, { ok: false, message: "Formato inválido." }); return true; }
    if (origem && req.headers.host && !origem.endsWith("//" + req.headers.host)) { json(res, 403, { ok: false, message: "Origem não permitida." }); return true; }
  }

  try {
    // ── Login ──
    if (metodo === "GET" && (pathname === "/controlefinanceiro/login")) {
      enviar(res, 200, "text/html; charset=utf-8", paginaHtml("Login — Controle Financeiro", "login")); return true;
    }
    if (metodo === "POST" && pathname === "/controlefinanceiro/api/login") {
      if (loginLimiter.isBlocked(ip)) { json(res, 429, { ok: false, message: "Muitas tentativas. Aguarde 15 minutos." }); return true; }
      const b = await lerCorpo(req);
      const tel = normTel(b.telefone || b.usuario);
      const u = db.prepare("SELECT * FROM fin_usuarios WHERE telefone = ? AND ativo = 1").get(tel);
      const falha = () => { loginLimiter.registerFailure(ip); auditar(null, "login_falhou", "usuario", u?.id, { telefone: tel }, ip); json(res, 401, { ok: false, message: "WhatsApp ou senha inválidos, ou acesso não autorizado." }); };
      if (!u) { falha(); return true; }
      if (!u.hash) { json(res, 200, { ok: false, primeiro_acesso: true, message: "Primeiro acesso: crie sua senha." }); return true; }
      if (!(await conferirSenha(String(b.senha || ""), u.salt, u.hash))) { falha(); return true; }
      loginLimiter.reset(ip);
      criarSessao(res, u.id, u.totp_ativo ? "2fa" : "ok", ip);
      auditar(u, u.totp_ativo ? "login_senha_ok_aguardando_2fa" : "login", "usuario", u.id, null, ip);
      json(res, 200, { ok: true, requer_2fa: !!u.totp_ativo, usuario: publicoUser(u) }); return true;
    }
    if (metodo === "POST" && pathname === "/controlefinanceiro/api/primeiro-acesso") {
      if (loginLimiter.isBlocked(ip)) { json(res, 429, { ok: false, message: "Muitas tentativas. Aguarde 15 minutos." }); return true; }
      const b = await lerCorpo(req);
      const tel = normTel(b.telefone || b.usuario);
      const u = db.prepare("SELECT * FROM fin_usuarios WHERE telefone = ? AND ativo = 1").get(tel);
      const nomeOk = !b.nome || (u && String(b.nome || "").trim().toLowerCase().split(/\s+/)[0] === u.nome.toLowerCase().split(/\s+/)[0]);
      if (!u || u.hash || !nomeOk) { loginLimiter.registerFailure(ip); json(res, 403, { ok: false, message: "Não foi possível criar a senha. Verifique os dados ou peça ao administrador para liberar seu acesso." }); return true; }
      const senha = String(b.senha || b.nova_senha || "");
      if (senha.length < 6) { json(res, 400, { ok: false, message: "A senha deve ter no mínimo 6 caracteres." }); return true; }
      const { salt, hash } = await hashSenha(senha);
      db.prepare("UPDATE fin_usuarios SET salt=?, hash=?, atualizado_em=? WHERE id=?").run(salt, hash, agoraIso(), u.id);
      criarSessao(res, u.id, "ok", ip);
      auditar(u, "senha_criada", "usuario", u.id, null, ip);
      json(res, 200, { ok: true, usuario: publicoUser(u), message: "Senha criada! Acesso liberado." }); return true;
    }

    const ctx = obterSessao(req);

    if (metodo === "POST" && pathname === "/controlefinanceiro/api/2fa") {
      if (!ctx || ctx.sessao.etapa !== "2fa") { json(res, 401, { ok: false, message: "Sessão inválida." }); return true; }
      if (loginLimiter.isBlocked(ip)) { json(res, 429, { ok: false, message: "Muitas tentativas. Aguarde 15 minutos." }); return true; }
      const b = await lerCorpo(req);
      if (!conferirTotp(ctx.user.totp_secret, b.codigo)) { loginLimiter.registerFailure(ip); json(res, 401, { ok: false, message: "Código inválido." }); return true; }
      db.prepare("UPDATE fin_sessoes SET etapa='ok' WHERE id=?").run(ctx.sessao.id);
      loginLimiter.reset(ip);
      auditar(ctx.user, "login", "usuario", ctx.user.id, { "2fa": true }, ip);
      json(res, 200, { ok: true }); return true;
    }

    if (pathname === "/controlefinanceiro/logout" || pathname === "/controlefinanceiro/api/logout") {
      if (ctx) auditar(ctx.user, "logout", "usuario", ctx.user.id, null, ip);
      encerrarSessao(req, res);
      if (metodo === "GET") { res.writeHead(302, { Location: "/controlefinanceiro/login" }); res.end(); }
      else json(res, 200, { ok: true });
      return true;
    }

    // ── Daqui em diante exige sessão completa ──
    if (!ctx || ctx.sessao.etapa !== "ok") {
      if (metodo === "GET" && !pathname.startsWith("/controlefinanceiro/api/")) { res.writeHead(302, { Location: "/controlefinanceiro/login" }); res.end(); }
      else json(res, 401, { ok: false, message: "Login requerido." });
      return true;
    }
    const user = ctx.user;
    const exigir = (perm) => { if (!pode(user, perm)) { const e = new Error("Você não tem permissão para esta ação."); e.status = 403; throw e; } };
    const q = Object.fromEntries(searchParams || []);

    if (metodo === "GET" && (pathname === "/controlefinanceiro" || pathname === "/controlefinanceiro/")) {
      enviar(res, 200, "text/html; charset=utf-8", paginaHtml("Controle Financeiro", "app")); return true;
    }

    if (metodo === "GET" && pathname === "/controlefinanceiro/api/me") {
      exigir("ver");
      const pub = publicoUser(user);
      json(res, 200, {
        ok: true, user: pub, usuario: pub, papeis: PAPEIS, formas: FORMAS, ministerios: MINISTERIOS, cedulas: CEDULAS,
        contas: db.prepare("SELECT id, nome, tipo, ativa, reserva FROM fin_contas ORDER BY nome").all(),
        categorias: db.prepare("SELECT * FROM fin_categorias ORDER BY tipo, grupo, nome").all(),
        hoje: hojeSP(),
      });
      return true;
    }
    if (metodo === "GET" && pathname === "/controlefinanceiro/api/dashboard") { exigir("ver"); json(res, 200, { ok: true, ...dashboard(q, user) }); return true; }
    if (metodo === "GET" && pathname === "/controlefinanceiro/api/lancamentos") {
      exigir("ver");
      const lista = listarLancamentos(q, user);
      json(res, 200, { ok: true, itens: lista, lancamentos: lista });
      return true;
    }
    if (metodo === "GET" && pathname === "/controlefinanceiro/api/contas") {
      exigir("ver");
      if (user.papel === "lider_ministerio") { json(res, 200, { ok: true, itens: [], contas: [] }); return true; }
      const cs = saldosContas();
      json(res, 200, { ok: true, itens: cs, contas: cs }); return true;
    }

    if (metodo === "POST" && pathname === "/controlefinanceiro/api/lancamentos") {
      exigir("lancar");
      const b = await lerCorpo(req);
      try { json(res, 201, criarLancamento(b, user, ip)); }
      catch (e) {
        json(res, 400, {
          ok: false,
          code: e.code,
          duplicado: e.code === "DUPLICADO",
          saldo_negativo: e.code === "SALDO_NEGATIVO",
          erro: e.message,
          message: e.message
        });
      }
      return true;
    }
    let m;
    if ((metodo === "POST" || metodo === "PUT") && (m = pathname.match(/^\/controlefinanceiro\/api\/lancamentos\/(\d+)(?:\/(quitar|cancelar|editar))?$/))) {
      const b = await lerCorpo(req);
      const acao = m[2] || "editar";
      exigir("lancar");
      try {
        const r = acao === "quitar" ? quitarLancamento(m[1], b, user, ip) : acao === "cancelar" ? cancelarLancamento(m[1], b, user, ip) : editarLancamento(m[1], b, user, ip);
        json(res, 200, r);
      } catch (e) { json(res, 400, { ok: false, code: e.code, erro: e.message, message: e.message }); }
      return true;
    }

    // Anexos (comprovantes)
    if (metodo === "POST" && (m = pathname.match(/^\/controlefinanceiro\/api\/lancamentos\/(\d+)\/anexos$/))) {
      exigir("lancar");
      const b = await lerCorpo(req);
      const l = db.prepare("SELECT id FROM fin_lancamentos WHERE id=?").get(Number(m[1]));
      if (!l) { json(res, 404, { ok: false, erro: "Lançamento não encontrado.", message: "Lançamento não encontrado." }); return true; }
      const mime = String(b.mime || b.mime_type || "");
      if (!/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(mime)) { json(res, 400, { ok: false, erro: "Envie PDF, JPG, PNG ou WEBP.", message: "Envie PDF, JPG, PNG ou WEBP." }); return true; }
      const dados = String(b.dados || b.dados_base64 || "").replace(/^data:[^,]+,/, "");
      const tamanho = Math.floor(dados.length * 3 / 4);
      if (!dados || tamanho > MAX_ANEXO) { json(res, 400, { ok: false, erro: "Arquivo vazio ou maior que 5MB.", message: "Arquivo vazio ou maior que 5MB." }); return true; }
      const nomeArq = txt(b.nome || b.nome_arquivo, 150) || "comprovante";
      const r = db.prepare("INSERT INTO fin_anexos (lancamento_id, nome, mime, tamanho, dados, enviado_por, criado_em) VALUES (?,?,?,?,?,?,?)")
        .run(l.id, nomeArq, mime, tamanho, dados, user.nome, agoraIso());
      auditar(user, "anexar_comprovante", "lancamento", l.id, { anexo: Number(r.lastInsertRowid), nome: nomeArq }, ip);
      json(res, 201, { ok: true, id: Number(r.lastInsertRowid), message: "Comprovante anexado." }); return true;
    }
    if (metodo === "GET" && (m = pathname.match(/^\/controlefinanceiro\/api\/lancamentos\/(\d+)\/anexos$/))) {
      exigir("ver");
      const rows = db.prepare("SELECT id, nome, nome AS nome_arquivo, mime, tamanho, enviado_por, criado_em FROM fin_anexos WHERE lancamento_id=?").all(Number(m[1]));
      json(res, 200, { ok: true, itens: rows, anexos: rows }); return true;
    }
    if (metodo === "GET" && (m = pathname.match(/^\/controlefinanceiro\/api\/anexos\/(\d+)$/))) {
      exigir("ver");
      const a = db.prepare("SELECT a.*, l.ministerio FROM fin_anexos a JOIN fin_lancamentos l ON l.id=a.lancamento_id WHERE a.id=?").get(Number(m[1]));
      if (!a || (user.papel === "lider_ministerio" && a.ministerio !== user.ministerio)) { json(res, 404, { ok: false, message: "Anexo não encontrado." }); return true; }
      enviar(res, 200, a.mime, Buffer.from(a.dados, "base64"), { "Content-Disposition": `inline; filename="${encodeURIComponent(a.nome)}"` });
      return true;
    }

    // Contas
    if ((metodo === "POST" || metodo === "PUT") && (m = pathname.match(/^\/controlefinanceiro\/api\/contas(?:\/(\d+))?$/))) {
      exigir("contas"); const b = await lerCorpo(req);
      if (m[1]) b.id = Number(m[1]);
      try { json(res, m[1] ? 200 : 201, salvarConta(b, user, ip)); } catch (e) { json(res, 400, { ok: false, erro: e.message, message: e.message }); }
      return true;
    }

    // Caixa físico
    if (metodo === "GET" && pathname === "/controlefinanceiro/api/conferencias") {
      exigir("ver");
      if (user.papel === "lider_ministerio") { json(res, 200, { ok: true, itens: [], conferencias: [] }); return true; }
      const rows = db.prepare("SELECT f.*, f.responsavel AS responsavel_nome, c.nome conta FROM fin_conferencias f JOIN fin_contas c ON c.id=f.conta_id ORDER BY f.id DESC LIMIT 100").all();
      json(res, 200, { ok: true, itens: rows, conferencias: rows }); return true;
    }
    if (metodo === "POST" && pathname === "/controlefinanceiro/api/conferencias") {
      exigir("conferir"); const b = await lerCorpo(req);
      try { json(res, 201, salvarConferencia(b, user, ip)); } catch (e) { json(res, 400, { ok: false, erro: e.message, message: e.message }); }
      return true;
    }

    // Fechamento de culto
    if (metodo === "GET" && pathname === "/controlefinanceiro/api/fechamentos") {
      exigir("ver");
      if (user.papel === "lider_ministerio") { json(res, 200, { ok: true, itens: [], fechamentos: [] }); return true; }
      const rows = db.prepare("SELECT *, data AS data_culto, culto AS culto_nome, total AS total_geral FROM fin_fechamentos ORDER BY data DESC, id DESC LIMIT 200").all();
      json(res, 200, { ok: true, itens: rows, fechamentos: rows }); return true;
    }
    if (metodo === "POST" && pathname === "/controlefinanceiro/api/fechamentos") {
      exigir("fechar"); const b = await lerCorpo(req);
      try { json(res, 201, fecharCulto(b, user, ip)); } catch (e) { json(res, 400, { ok: false, erro: e.message, message: e.message }); }
      return true;
    }

    // Categorias
    if (metodo === "POST" && pathname === "/controlefinanceiro/api/categorias") {
      if (!pode(user, "categorias") && !pode(user, "lancar")) {
        json(res, 403, { ok: false, erro: "Sem permissão para gerenciar categorias.", message: "Sem permissão para gerenciar categorias." });
        return true;
      }
      const b = await lerCorpo(req);
      const nome = txt(b.nome, 80);
      if (!nome || !["entrada", "saida"].includes(b.tipo)) { json(res, 400, { ok: false, erro: "Informe nome e tipo.", message: "Informe nome e tipo." }); return true; }
      if (b.id) {
        db.prepare("UPDATE fin_categorias SET nome=?, grupo=?, fixa=?, ativa=? WHERE id=?").run(nome, txt(b.grupo, 60), b.fixa ? 1 : 0, b.ativa === false ? 0 : 1, Number(b.id));
        auditar(user, "editar_categoria", "categoria", Number(b.id), b, ip);
        json(res, 200, { ok: true, message: "Categoria salva." });
        return true;
      } else {
        try {
          const r = db.prepare("INSERT INTO fin_categorias (nome, tipo, grupo, fixa) VALUES (?,?,?,?)").run(nome, b.tipo, txt(b.grupo, 60), b.fixa ? 1 : 0);
          const newId = Number(r.lastInsertRowid);
          auditar(user, "criar_categoria", "categoria", newId, b, ip);
          json(res, 200, { ok: true, id: newId, categoria: { id: newId, nome, tipo: b.tipo, grupo: txt(b.grupo, 60), fixa: 0, ativa: 1 }, message: "Categoria criada com sucesso." });
          return true;
        } catch {
          json(res, 400, { ok: false, erro: "Categoria já existe.", message: "Categoria já existe." });
          return true;
        }
      }
    }

    // Usuários
    if (metodo === "GET" && pathname === "/controlefinanceiro/api/usuarios") {
      exigir("usuarios");
      const rows = db.prepare("SELECT id, telefone, nome, papel, ministerio, ativo, totp_ativo, (hash IS NOT NULL) tem_senha, criado_em FROM fin_usuarios ORDER BY nome").all();
      json(res, 200, { ok: true, itens: rows, usuarios: rows }); return true;
    }
    if (metodo === "POST" && pathname === "/controlefinanceiro/api/usuarios") {
      exigir("usuarios"); const b = await lerCorpo(req);
      const tel = normTel(b.telefone); const nome = txt(b.nome, 100);
      if (!tel || tel.length < 12 || !nome || !PAPEIS[b.papel]) { json(res, 400, { ok: false, erro: "Informe WhatsApp, nome e nível de acesso válidos.", message: "Informe WhatsApp, nome e nível de acesso válidos." }); return true; }
      if (b.papel === "lider_ministerio" && !txt(b.ministerio)) { json(res, 400, { ok: false, erro: "Selecione o ministério do líder.", message: "Selecione o ministério do líder." }); return true; }
      const existe = db.prepare("SELECT * FROM fin_usuarios WHERE telefone=?").get(tel);
      if (existe) {
        if (existe.id === user.id && (b.papel !== "admin_financeiro" || b.ativo === false)) { json(res, 400, { ok: false, erro: "Você não pode remover seu próprio acesso de administrador.", message: "Você não pode remover seu próprio acesso de administrador." }); return true; }
        db.prepare("UPDATE fin_usuarios SET nome=?, papel=?, ministerio=?, ativo=?, atualizado_em=? WHERE id=?").run(nome, b.papel, txt(b.ministerio, 80), b.ativo === false ? 0 : 1, agoraIso(), existe.id);
        if (b.ativo === false) db.prepare("DELETE FROM fin_sessoes WHERE usuario_id=?").run(existe.id);
        auditar(user, "editar_usuario", "usuario", existe.id, { antes: { papel: existe.papel, ativo: existe.ativo }, depois: { papel: b.papel, ativo: b.ativo !== false } }, ip);
      } else {
        db.prepare("INSERT INTO fin_usuarios (telefone, nome, papel, ministerio, criado_em) VALUES (?,?,?,?,?)").run(tel, nome, b.papel, txt(b.ministerio, 80), agoraIso());
        auditar(user, "criar_usuario", "usuario", null, { telefone: tel, nome, papel: b.papel }, ip);
      }
      json(res, 200, { ok: true, message: "Usuário salvo. No primeiro acesso ele criará a própria senha." }); return true;
    }
    if ((metodo === "POST" || metodo === "PUT") && (m = pathname.match(/^\/controlefinanceiro\/api\/usuarios\/(\d+)(?:\/resetar)?$/))) {
      exigir("usuarios");
      const alvo = db.prepare("SELECT * FROM fin_usuarios WHERE id=?").get(Number(m[1]));
      if (!alvo) { json(res, 404, { ok: false, erro: "Usuário não encontrado.", message: "Usuário não encontrado." }); return true; }
      db.prepare("UPDATE fin_usuarios SET salt=NULL, hash=NULL, totp_secret=NULL, totp_ativo=0, atualizado_em=? WHERE id=?").run(agoraIso(), alvo.id);
      db.prepare("DELETE FROM fin_sessoes WHERE usuario_id=?").run(alvo.id);
      auditar(user, "resetar_senha", "usuario", alvo.id, null, ip);
      json(res, 200, { ok: true, message: "Senha e 2FA resetados. O usuário criará uma nova senha no próximo acesso." }); return true;
    }

    // Minha conta: troca de senha e 2FA
    if (metodo === "POST" && (pathname === "/controlefinanceiro/api/minha-senha" || pathname === "/controlefinanceiro/api/alterar-senha")) {
      const b = await lerCorpo(req);
      if (!(await conferirSenha(String(b.atual || b.senha_atual || ""), user.salt, user.hash))) { json(res, 400, { ok: false, erro: "Senha atual incorreta.", message: "Senha atual incorreta." }); return true; }
      const s = String(b.nova || b.nova_senha || "");
      if (s.length < 6) { json(res, 400, { ok: false, erro: "A nova senha deve ter no mínimo 6 caracteres.", message: "A nova senha deve ter no mínimo 6 caracteres." }); return true; }
      const { salt, hash } = await hashSenha(s);
      db.prepare("UPDATE fin_usuarios SET salt=?, hash=?, atualizado_em=? WHERE id=?").run(salt, hash, agoraIso(), user.id);
      db.prepare("DELETE FROM fin_sessoes WHERE usuario_id=? AND id != ?").run(user.id, ctx.sessao.id);
      auditar(user, "trocar_senha", "usuario", user.id, null, ip);
      json(res, 200, { ok: true, message: "Senha alterada. Outras sessões foram encerradas." }); return true;
    }
    if (metodo === "POST" && (pathname === "/controlefinanceiro/api/2fa/configurar" || pathname === "/controlefinanceiro/api/2fa/gerar")) {
      const segredo = base32Encode(crypto.randomBytes(20));
      db.prepare("UPDATE fin_usuarios SET totp_secret=?, totp_ativo=0 WHERE id=?").run(segredo, user.id);
      const label = encodeURIComponent(`CCC Financeiro:${user.nome}`);
      const uri = `otpauth://totp/${label}?secret=${segredo}&issuer=${encodeURIComponent("CCC Financeiro")}`;
      json(res, 200, { ok: true, segredo, secret: segredo, uri, otpauth: uri }); return true;
    }
    if (metodo === "POST" && pathname === "/controlefinanceiro/api/2fa/ativar") {
      const b = await lerCorpo(req);
      const u = db.prepare("SELECT totp_secret FROM fin_usuarios WHERE id=?").get(user.id);
      if (!u.totp_secret || !conferirTotp(u.totp_secret, b.codigo)) { json(res, 400, { ok: false, erro: "Código inválido. Confira o horário do celular e tente de novo.", message: "Código inválido." }); return true; }
      db.prepare("UPDATE fin_usuarios SET totp_ativo=1 WHERE id=?").run(user.id);
      auditar(user, "ativar_2fa", "usuario", user.id, null, ip);
      json(res, 200, { ok: true, message: "Verificação em duas etapas ativada! ✅" }); return true;
    }
    if (metodo === "POST" && pathname === "/controlefinanceiro/api/2fa/desativar") {
      db.prepare("UPDATE fin_usuarios SET totp_ativo=0, totp_secret=NULL WHERE id=?").run(user.id);
      auditar(user, "desativar_2fa", "usuario", user.id, null, ip);
      json(res, 200, { ok: true, message: "2FA desativado." }); return true;
    }

    // Prestação de Contas (Pastores e Diretores)
    if (metodo === "GET" && pathname === "/controlefinanceiro/api/prestacao-contas") {
      exigir("ver");
      const auditarAcesso = q.registrar_auditoria !== "0";
      const resumo = obterResumoPrestacaoContas({
        solicitanteNome: user.nome,
        solicitanteTel: user.telefone,
        canal: "web",
        ip,
        auditar: auditarAcesso,
      });
      json(res, 200, resumo); return true;
    }

    if (metodo === "GET" && pathname === "/controlefinanceiro/api/prestacao-contas/historico") {
      exigir("ver");
      const mesFiltro = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : null;
      let sql = `
        SELECT id, usuario, acao, entidade, detalhes, ip, criado_em
        FROM fin_auditoria
        WHERE acao = 'solicitacao_prestacao_contas'
      `;
      const params = [];
      if (mesFiltro) {
        sql += ` AND (substr(criado_em, 1, 7) = ? OR detalhes LIKE ?)`;
        params.push(mesFiltro, `%"data_solicitacao":"${mesFiltro}%`);
      }
      sql += ` ORDER BY id DESC LIMIT 200`;
      const logs = db.prepare(sql).all(...params);
      json(res, 200, { ok: true, logs }); return true;
    }

    // Auditoria
    if (metodo === "GET" && pathname === "/controlefinanceiro/api/auditoria") {
      exigir("auditoria");
      const rows = db.prepare("SELECT *, usuario AS usuario_nome, detalhes AS depois_json FROM fin_auditoria ORDER BY id DESC LIMIT 500").all();
      json(res, 200, { ok: true, itens: rows, auditoria: rows }); return true;
    }

    // Relatório CSV (extrato)
    if (metodo === "GET" && pathname === "/controlefinanceiro/api/relatorio.csv") {
      exigir("ver");
      const itens = listarLancamentos({ ...q, limite: 2000 }, user);
      const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const linhas = [["ID", "Tipo", "Status", "Data", "Vencimento", "Descrição", "Categoria", "Conta", "Conta destino", "Forma", "Ministério", "Evento", "Fornecedor", "Valor (R$)", "Lançado por"].map(esc).join(";")];
      for (const l of itens) {
        const sinal = l.tipo === "saida" ? -1 : 1;
        linhas.push([l.id, l.tipo, l.status, l.data, l.vencimento, l.descricao, l.categoria, l.conta, l.conta_destino, l.forma, l.ministerio, l.evento, l.fornecedor,
          ((sinal * l.valor) / 100).toFixed(2).replace(".", ","), l.criado_por].map(esc).join(";"));
      }
      auditar(user, "exportar_relatorio", "relatorio", null, q, ip);
      enviar(res, 200, "text/csv; charset=utf-8", "\uFEFF" + linhas.join("\r\n"), { "Content-Disposition": `attachment; filename="extrato-financeiro-${hojeSP()}.csv"` });
      return true;
    }

    json(res, 404, { ok: false, message: "Rota não encontrada." });
    return true;
  } catch (err) {
    const st = err.status || 500;
    if (st === 500) console.error("[Financeiro] Erro:", err);
    json(res, st, { ok: false, message: st === 500 ? "Erro interno no servidor financeiro." : err.message });
    return true;
  }
}

module.exports = {
  handle,
  centavos,
  saldosContas,
  criarLancamento,
  editarLancamento,
  quitarLancamento,
  cancelarLancamento,
  salvarConferencia,
  fecharCulto,
  dashboard,
  listarLancamentos,
  pode,
  totp,
  conferirTotp,
  PERMS,
  obterResumoPrestacaoContas,
  CONTATO_TESOURARIA,
  TEL_TESOURARIA_NUM,
};

