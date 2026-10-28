const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-gestao-test-"));
process.env.DB_PATH = path.join(tmpDir, "dados.db");
process.env.COMBINED_LOG_PATH = path.join(tmpDir, "combined.log");
fs.writeFileSync(process.env.COMBINED_LOG_PATH, "linha de log\n");

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startWebServer, addUser } = require("../web");
const gestao = require("../web/gestao");
const { createSession } = require("../web/auth");

const getStatus = () => ({ connected: false, initializing: false });
const noop = async () => ({ ok: true });

let server;
let baseUrl;

before(async () => {
  server = startWebServer({ getStatus, startClient: noop, cancelQr: noop, disconnectClient: noop, port: 0 });
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

test("GET /gestao sem autenticação: redireciona 302 para login", async () => {
  const res = await fetch(`${baseUrl}/gestao`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/secretaria/login?redirect=/gestao");
});

test("GET /gestao autenticado: retorna a página HTML com status 200 e componentes do painel", async () => {
  const token = createSession("pastor.teste", "pastor", "active");
  const res = await fetch(`${baseUrl}/gestao`, {
    headers: { Cookie: `whatsapp_control_session=${token}` }
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Gestão de Eventos/);
  assert.match(html, /Calendário & Disponibilidade/);
  assert.match(html, /Novo Agendamento/);
  assert.match(html, /modal-agendamento/);
});

test("GET /gestao/api/eventos: retorna 200 e lista de eventos", async () => {
  const res = await fetch(`${baseUrl}/gestao/api/eventos`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.eventos));
});

test("obterPerfilGestao: identifica corretamente os perfis Líder, Diretor, Pastor e Admin", () => {
  const perfilLider = gestao.obterPerfilGestao({ username: "joao.lider", role: "lider" });
  assert.equal(perfilLider.perfilTitulo, "Líder");
  assert.equal(perfilLider.isLider, true);

  const perfilDiretor = gestao.obterPerfilGestao({ username: "carlos.diretor", role: "diretor" });
  assert.equal(perfilDiretor.perfilTitulo, "Diretor");
  assert.equal(perfilDiretor.isDiretor, true);

  const perfilPastor = gestao.obterPerfilGestao({ username: "pr.mauricio", role: "user" });
  assert.equal(perfilPastor.perfilTitulo, "Pastor");
  assert.equal(perfilPastor.isPastor, true);

  const perfilAdmin = gestao.obterPerfilGestao({ username: "admin", role: "admin" });
  assert.equal(perfilAdmin.perfilTitulo, "Administrador");
  assert.equal(perfilAdmin.isAdmin, true);
});

test("POST /gestao/api/solicitar: valida campos e cria solicitação com código único", async () => {
  const token = createSession("lider.teste", "lider", "active");

  // Tentativa sem nome do evento
  const resInvalido = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${token}`
    },
    body: JSON.stringify({
      nome_lider: "Líder de Teste",
      data_evento: "2026-11-20"
    })
  });
  assert.equal(resInvalido.status, 400);

  // Tentativa com dados válidos completos
  const resValido = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${token}`
    },
    body: JSON.stringify({
      nome_lider: "Líder Débora",
      telefone_lider: "11988887777",
      nome_evento: "Vigília de Mulheres",
      departamento: "Rede de Mulheres",
      data_evento: "2026-11-20",
      horario_inicio: "22:00",
      horario_termino: "03:00",
      precisa_salao_antes: "sim",
      salao_detalhes: "No dia a partir das 21h",
      local: "Igreja",
      publico: "Mulheres",
      responsavel_geral: "Líder Débora",
      convidado: "Banda Convidada",
      louvor: "Equipe Local",
      decoracao: "Simples",
      alimentacao: "Café da manhã ao término",
      equipe: "5 voluntárias",
      materiais: "Som e microfones",
      cronograma: "22h Abertura, 23h Louvor, 00h Oração, 02h Palavra",
      midia_ja_feita: "nao",
      paleta: "Lilás e branco",
      estilo: "Flyer stories",
      prazo_imagem: "Até 10/11",
      data_maxima_divulgacao: "11/11/2026",
      valor_inscricao: "Gratuito",
      precisa_valor_ministerio: "nao",
      tema: "Despertar",
      versiculo: "Isaías 60:1",
      objetivo_espiritual: "Despertamento e renovo espiritual",
      observacoes: "Levar almofadas"
    })
  });

  assert.equal(resValido.status, 200);
  const data = await resValido.json();
  assert.equal(data.ok, true);
  assert.ok(data.codigo);
  assert.equal(data.codigo.length, 4);
  assert.match(data.message, /Solicitação registrada com sucesso/);
});

