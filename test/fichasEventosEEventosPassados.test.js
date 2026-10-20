const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

process.env.NODE_ENV = "test";
const tempDbPath = path.join(__dirname, `test_fichas_passados_${Date.now()}.db`);
process.env.DB_PATH = tempDbPath;

const db = require("../db");
const {
  montarSubmenuPastoralAgenda,
  montarSubmenuDiretorAgenda,
  formatarDetalhesFichaEvento,
  createMessageHandler,
} = require("../bot/messageHandler");
const { salvarFormularioEvento } = require("../bot/formularioEvento");
const { unificarEventosPreparacaoLimpeza, identificarInfoPreparacaoLimpeza, montarMensagemPreparacaoLimpeza, extrairItensADefinirFormulario } = require("../bot/lembretes");

test.after(() => {
  try {
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  } catch {}
});

test("Menus Pastoral e de Direção contêm a opção 7️⃣ 📄 Fichas dos Eventos", () => {
  const menuPastoral = montarSubmenuPastoralAgenda();
  assert.ok(menuPastoral.includes("7️⃣ 📄 *Fichas dos Eventos*"), "Menu pastoral deve ter a opção 7");
  assert.ok(menuPastoral.includes("Ver formulários preenchidos e links"));

  const menuDiretor = montarSubmenuDiretorAgenda();
  assert.ok(menuDiretor.includes("7️⃣ 📄 *Fichas dos Eventos*"), "Menu da direção deve ter a opção 7");
  assert.ok(menuDiretor.includes("Ver formulários preenchidos e links"));
});

test("formatarDetalhesFichaEvento: exibe dados, itens a definir/decidir e link do Google Docs", () => {
  const fichaMock = {
    evento: "Mesa Posta - Mulheres",
    departamento: "Rede de Mulheres",
    data: "24/10/2026",
    solicitanteId: "5511988887777",
    docUrl: "https://docs.google.com/document/d/12345/edit",
    payload: {
      nomeSolicitante: "Glaucia",
      local: "Rua Benedicto de Abreu Júnior, 40",
      horario_inicio: "13:00",
      horario_termino: "18:00",
      horario_total: "10:00 às 21:00",
      alimentacao: "Terá lanche... Ainda a decidir cardápio",
      equipe_apoio: "A definir voluntários",
    },
    criadoEm: "2026-10-15T10:00:00.000Z",
  };

  const texto = formatarDetalhesFichaEvento(fichaMock);
  assert.ok(texto.includes("📄 *Ficha do Evento: Mesa Posta - Mulheres*"));
  assert.ok(texto.includes("🏢 *Departamento/Ministério:* Rede de Mulheres"));
  assert.ok(texto.includes("📆 *Data:* 24/10/2026"));
  assert.ok(texto.includes("⏰ *Horário:* 13:00 às 18:00"));
  assert.ok(texto.includes("🧹 *Preparação/Limpeza:* 10:00 às 21:00"));
  assert.ok(texto.includes("⚠️ *Itens a Definir / Decidir:*"));
  assert.ok(texto.includes("Ainda a decidir cardápio"));
  assert.ok(texto.includes("A definir voluntários"));
  assert.ok(texto.includes("📄 *Documento Oficial (Google Docs):*"));
  assert.ok(texto.includes("https://docs.google.com/document/d/12345/edit"));
});

test("Lembretes: unifica [Preparação/Decoração] Mesa posta com o evento principal e gera mensagem de preparação", () => {
  const evPrincipal = {
    id: "ev-mesa-posta",
    summary: "Mesa posta",
    start: { dateTime: "2026-10-24T13:00:00-03:00" },
    end: { dateTime: "2026-10-24T18:00:00-03:00" },
    calendarId: "cal-mulheres",
  };
  const evPrep = {
    id: "ev-mesa-posta-prep",
    summary: "[Preparação/Decoração] Mesa posta",
    start: { dateTime: "2026-10-24T10:00:00-03:00" },
    end: { dateTime: "2026-10-24T21:00:00-03:00" },
    calendarId: "cal-mulheres",
  };

  const infoPrep = identificarInfoPreparacaoLimpeza(evPrep);
  assert.equal(infoPrep.isPrep, true);
  assert.equal(infoPrep.nomePrincipal, "Mesa posta");

  const unificados = unificarEventosPreparacaoLimpeza([evPrincipal, evPrep]);
  // Deve conter apenas o evento principal
  assert.equal(unificados.length, 1);
  assert.equal(unificados[0].summary, "Mesa posta");

  const msgPrep = montarMensagemPreparacaoLimpeza({
    faixas: unificados[0]._faixasPrep,
    horarioPreparacaoLimpeza: unificados[0].horarioPreparacaoLimpeza,
  });

  assert.ok(msgPrep.includes("🧹 *Preparação e Limpeza do Salão*"));
  assert.ok(msgPrep.includes("10:00"));
  assert.ok(msgPrep.includes("21:00"));
  assert.ok(msgPrep.includes("mesmas condições em que foram encontrados"));
});

test("Lembretes: extrairItensADefinirFormulario detecta 'a decidir', 'ainda a definir', etc.", () => {
  const payload = {
    alimentacao: "Terá coffee break, mas os itens estão ainda a decidir",
    decoracao: "Painel de balões já comprado",
    som: "A definir microfones",
  };
  const pendencias = extrairItensADefinirFormulario(payload);
  assert.equal(pendencias.length, 2);
  assert.ok(pendencias.some(p => p.campo === "Alimentação"));
  assert.ok(pendencias.some(p => p.campo === "Sonorização / Multimídia"));
});

test("Páginas públicas e Secretaria não possuem o evento passado das crianças", () => {
  const homeHtml = fs.readFileSync(path.join(__dirname, "../public/home.html"), "utf8");
  const minHtml = fs.readFileSync(path.join(__dirname, "../public/ministerios.html"), "utf8");
  const viewsJs = fs.readFileSync(path.join(__dirname, "../web/views.js"), "utf8");

  // Home: não deve ter card-criancas nem link no drawer
  assert.doesNotMatch(homeHtml, /class="evento-home-card card-criancas"/);
  assert.doesNotMatch(homeHtml, /Especial Dia das Crianças/);
  assert.ok(homeHtml.includes("removerEventosPassados"), "deve ter script que auto-remove eventos passados");

  // Ministérios: Rede Kids não deve ter próximo evento do dia das crianças
  assert.doesNotMatch(minHtml, /Especial Dia das Crianças/);
  assert.ok(minHtml.includes("removerEventosPassados"), "deve ter script que auto-remove eventos passados");

  // Secretaria (views.js): não deve ter o card de Dia das Crianças
  assert.doesNotMatch(viewsJs, /<h4[^>]*>Especial Dia das Crianças<\/h4>/);
  assert.ok(viewsJs.includes("removerEventosPassadosSecretaria"), "deve ter script que auto-remove eventos passados na secretaria");
});
