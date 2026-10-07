const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

// Configura banco de dados em memória ou arquivo temporário para os testes
const tempDbPath = path.join(__dirname, `test_saude_mulher_${Date.now()}.db`);
process.env.DB_PATH = tempDbPath;

const db = require("../db");
const {
  salvarInscricaoSaudeMulher,
  buscarInscricaoSaudeMulherPorId,
  buscarInscricaoSaudeMulherPorTelefone,
  listarInscricoesSaudeMulher,
  obterEstatisticasSaudeMulher,
  excluirInscricaoSaudeMulher,
  marcarConfirmacaoSaudeMulherEnviada,
  enviarInscricaoPlanilhaSaudeMulher,
  montarMensagemConfirmacaoSaudeMulher,
  renderSaudeMulherPdfHtml,
} = require("../web/saude_mulher");

test.after(() => {
  try {
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  } catch {}
});

test("Saúde da Mulher (Pilates): salvar e consultar anamnese no SQLite", () => {
  const aluna = salvarInscricaoSaudeMulher({
    nome: "Juliana Mendes",
    idade: "35",
    telefone: "11999998888",
    condicoesSaude: "Hipertensão (pressão alta)",
    tratamentoMedicamento: "Losartana 50mg",
    cirurgia: "Sim",
    cirurgiaDetalhes: "Cesárea em 2021",
    lesaoDor: "Sim",
    lesaoDorDetalhes: "Dor lombar frequente",
    limitacao: "Não",
    limitacaoDetalhes: "",
    gravida: "Não",
    atividadeFisica: "Sim",
    atividadeFisicaDetalhes: "Caminhada 2x semana",
    outrasInformacoes: "Sinto tontura se levantar rápido",
  });

  assert.ok(aluna);
  assert.equal(aluna.nome, "Juliana Mendes");
  assert.equal(aluna.idade, "35");
  assert.equal(aluna.telefone, "11999998888");
  assert.equal(aluna.condicoesSaude, "Hipertensão (pressão alta)");
  assert.equal(aluna.tratamentoMedicamento, "Losartana 50mg");
  assert.equal(aluna.cirurgia, "Sim");
  assert.equal(aluna.cirurgiaDetalhes, "Cesárea em 2021");
  assert.equal(aluna.lesaoDor, "Sim");
  assert.equal(aluna.lesaoDorDetalhes, "Dor lombar frequente");
  assert.equal(aluna.gravida, "Não");
  assert.equal(aluna.atividadeFisica, "Sim");
  assert.equal(aluna.whatsappConfirmacaoEnviado, false);

  const buscadaId = buscarInscricaoSaudeMulherPorId(aluna.id);
  assert.ok(buscadaId);
  assert.equal(buscadaId.nome, "Juliana Mendes");

  const buscadaTel = buscarInscricaoSaudeMulherPorTelefone("11999998888");
  assert.ok(buscadaTel);
  assert.equal(buscadaTel.id, aluna.id);

  let stats = obterEstatisticasSaudeMulher();
  assert.equal(stats.total, 1);
  assert.equal(stats.comCondicaoSaude, 1);
  assert.equal(stats.comCirurgia, 1);
  assert.equal(stats.comLesaoDor, 1);
  assert.equal(stats.gestantes, 0);
  assert.equal(stats.praticamAtividade, 1);

  // Marcar confirmação WhatsApp
  marcarConfirmacaoSaudeMulherEnviada(aluna.id);
  stats = obterEstatisticasSaudeMulher();
  assert.equal(stats.whatsappConfirmados, 1);
  assert.equal(stats.pendentesConfirmacao, 0);

  // Gerar relatório HTML/PDF
  const htmlPdf = renderSaudeMulherPdfHtml();
  assert.match(htmlPdf, /Juliana Mendes/);
  assert.match(htmlPdf, /Hipertensão/);
  assert.match(htmlPdf, /Cesárea/);
  assert.match(htmlPdf, /Dor lombar/);

  // Montar mensagem de WhatsApp
  const msg = montarMensagemConfirmacaoSaudeMulher(aluna);
  assert.match(msg, /Juliana/);
  assert.match(msg, /Pilates/);
  assert.match(msg, /31 de Outubro/);

  // Excluir inscrição
  const removido = excluirInscricaoSaudeMulher(aluna.id);
  assert.equal(removido, true);
  assert.equal(listarInscricoesSaudeMulher().length, 0);
});

test("Saúde da Mulher: envio para planilha via Web App", async () => {
  let postChamado = false;
  let payloadRecebido = null;

  const mockFetch = async (url, options) => {
    postChamado = true;
    payloadRecebido = JSON.parse(options.body);
    return {
      status: 200,
      text: async () => JSON.stringify({ ok: true, status: "success", message: "Registrado com sucesso!" })
    };
  };

  const resultado = await enviarInscricaoPlanilhaSaudeMulher(
    { nome: "Beatriz Lima", telefone: "11977776666" },
    { url: "https://script.google.com/test", fetchFn: mockFetch }
  );

  assert.equal(resultado.ok, true);
  assert.equal(postChamado, true);
  assert.equal(payloadRecebido.nome, "Beatriz Lima");
});

test("Saúde da Mulher: rotas HTTP no web.js", async () => {
  const { startWebServer } = require("../web");
  const getStatus = () => ({ connected: false, initializing: false, generatingQr: false, canceling: false, hasQr: false });
  const noop = async () => ({ ok: true });

  const server = startWebServer({ getStatus, startClient: noop, cancelQr: noop, disconnectClient: noop, port: 0 });
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Rota pública /saude-da-mulher
    const resPagina = await fetch(`${baseUrl}/saude-da-mulher`);
    assert.equal(resPagina.status, 200);
    const htmlPagina = await resPagina.text();
    assert.match(htmlPagina, /Anamnese/);
    assert.match(htmlPagina, /Pilates/);
    assert.match(htmlPagina, /Possui alguma condição de saúde/);
    assert.match(htmlPagina, /Já realizou alguma cirurgia/);
    assert.match(htmlPagina, /Está grávida/);

    // Rota alternativa /pilates
    const resPilates = await fetch(`${baseUrl}/pilates`);
    assert.equal(resPilates.status, 200);

    // 2. Inscrição via POST /saude-mulher/api/inscrever
    const resInscricao = await fetch(`${baseUrl}/saude-mulher/api/inscrever`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: "Fernanda Costa",
        idade: "29",
        telefone: "11988889999",
        condicoesSaude: "Problemas respiratórios",
        tratamentoMedicamento: "Bombinha de asma",
        cirurgia: "Não",
        lesaoDor: "Sim",
        lesaoDorDetalhes: "Dor no joelho direito",
        limitacao: "Não",
        gravida: "Não",
        atividadeFisica: "Sim",
        atividadeFisicaDetalhes: "Natação",
        outrasInformacoes: "Ansiosa para a aula!",
      }),
    });

    assert.equal(resInscricao.status, 200);
    const jsonInscricao = await resInscricao.json();
    assert.equal(jsonInscricao.ok, true);
    assert.equal(jsonInscricao.inscricao.nome, "Fernanda Costa");

    // 3. Consulta de inscritas via GET /saude-mulher/api/inscritas
    const resLista = await fetch(`${baseUrl}/saude-mulher/api/inscritas`);
    assert.equal(resLista.status, 200);
    const jsonLista = await resLista.json();
    assert.equal(jsonLista.ok, true);
    assert.ok(jsonLista.inscricoes.length >= 1);
    const fernanda = jsonLista.inscricoes.find(i => i.nome === "Fernanda Costa");
    assert.ok(fernanda);
    assert.equal(fernanda.telefone, "11988889999");

    // 4. Relatório em PDF via GET /saude-mulher/api/relatorio-pdf
    const resPdf = await fetch(`${baseUrl}/saude-mulher/api/relatorio-pdf`);
    assert.equal(resPdf.status, 200);
    const htmlPdf = await resPdf.text();
    assert.match(htmlPdf, /Fernanda Costa/);
    assert.match(htmlPdf, /Dor no joelho direito/);

    // 5. Exclusão via DELETE /saude-mulher/api/inscricoes/:id
    const resDel = await fetch(`${baseUrl}/saude-mulher/api/inscricoes/${fernanda.id}`, {
      method: "DELETE",
    });
    assert.equal(resDel.status, 200);
    const jsonDel = await resDel.json();
    assert.equal(jsonDel.ok, true);

  } finally {
    server.close();
  }
});
