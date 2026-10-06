const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const tempDbPath = path.join(__dirname, `test_criancas_${Date.now()}.db`);
process.env.DB_PATH = tempDbPath;

const db = require("../db");
const diaDasCriancas = require("../web/dia_das_criancas");
const {
  montarListaInscritosTexto,
  gerarResumoDiaDasCriancas,
  gerarPdfEvento,
} = require("../bot/consultaInscricoes");

test.after(() => {
  try {
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  } catch {}
});

test("Dia das Crianças: salvar, listar e obter estatísticas no banco local SQLite", () => {
  const item = diaDasCriancas.salvarInscricaoCriancas({
    nomeCrianca: "Enzo Gabriel",
    nomeResponsavel: "Mariana Souza",
    idade: "6 anos",
    telefone: "11987654321",
    alergiaAlimentos: "Amendoim",
    alergiaMedicamentos: "Nenhuma",
  });

  assert.ok(item);
  assert.equal(item.nomeCrianca, "Enzo Gabriel");
  assert.equal(item.nomeResponsavel, "Mariana Souza");
  assert.equal(item.idade, "6 anos");
  assert.equal(item.alergiaAlimentos, "Amendoim");

  const lista = diaDasCriancas.listarInscricoesCriancas();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nomeCrianca, "Enzo Gabriel");

  const stats = diaDasCriancas.obterEstatisticasCriancas();
  assert.equal(stats.total, 1);
  assert.equal(stats.pendentesConfirmacao, 1);
  assert.equal(stats.whatsappConfirmados, 0);

  // Marcar confirmação
  const marcou = diaDasCriancas.marcarConfirmacaoCriancasEnviada(item.id);
  assert.equal(marcou, true);

  const statsAtualizada = diaDasCriancas.obterEstatisticasCriancas();
  assert.equal(statsAtualizada.whatsappConfirmados, 1);
  assert.equal(statsAtualizada.pendentesConfirmacao, 0);
});

test("Dia das Crianças: renderCriancasPdfHtml gera o modelo de impressão com alergias destacadas", () => {
  const html = diaDasCriancas.renderCriancasPdfHtml();
  assert.ok(html.includes("Especial Dia das Crianças"));
  assert.ok(html.includes("Enzo Gabriel"));
  assert.ok(html.includes("Amendoim"));
  assert.ok(html.includes("Mariana Souza"));
});

test("Dia das Crianças: sincronizar com mock do Google Apps Script com mapeamento flexível de colunas", async () => {
  const mockFetch = async () => {
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          status: "success",
          total: 2,
          spreadsheetId: "mock-sheet-id",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/mock-sheet-id/edit",
          pdfUrl: "https://docs.google.com/spreadsheets/d/mock-sheet-id/export?format=pdf",
          inscricoes: [
            {
              "Nome completo da criança:": "Valentina Silva",
              "Nome da mãe ou responsável:": "Camila Silva",
              "Idade da criança:": "8 anos",
              "Número para contato:": "11999990001",
              "A criança tem alguma alergia ou restrição alimentar? Se sim, qual?": "Lactose",
              "A criança tem alguma alergia à medicamentos? Se sim, qual?": "Dipirona",
              "Carimbo de data/hora": "2026-10-06T10:00:00.000Z",
            },
            {
              nomeCrianca: "Lucas Pereira",
              nomeResponsavel: "João Pereira",
              idade: "5 anos",
              telefone: "11999990002",
              alergiaAlimentos: "Nenhuma",
              alergiaMedicamentos: "Nenhuma",
            },
          ],
        }),
    };
  };

  const resultado = await diaDasCriancas.sincronizarInscricoesComNuvem(
    "https://fake-url.com",
    mockFetch
  );

  assert.equal(resultado.ok, true);
  assert.ok(resultado.total >= 2);

  const lista = diaDasCriancas.listarInscricoesCriancas();
  const valentina = lista.find((c) => c.nomeCrianca === "Valentina Silva");
  assert.ok(valentina);
  assert.equal(valentina.nomeResponsavel, "Camila Silva");
  assert.equal(valentina.alergiaAlimentos, "Lactose");
  assert.equal(valentina.alergiaMedicamentos, "Dipirona");

  const lucas = lista.find((c) => c.nomeCrianca === "Lucas Pereira");
  assert.ok(lucas);
  assert.equal(lucas.nomeResponsavel, "João Pereira");
});

test("Dia das Crianças: exclusão de inscrição", () => {
  const listaAntes = diaDasCriancas.listarInscricoesCriancas();
  const item = listaAntes[0];
  const excluiu = diaDasCriancas.excluirInscricaoCriancas(item.id);
  assert.equal(excluiu, true);

  const listaDepois = diaDasCriancas.listarInscricoesCriancas();
  assert.equal(listaDepois.length, listaAntes.length - 1);
});

test("Consulta Inscrições: resumo e lista nominal em texto para Dia das Crianças", () => {
  const resumo = gerarResumoDiaDasCriancas();
  assert.ok(resumo.includes("Especial Dia das Crianças"));
  assert.ok(resumo.includes("Estatísticas das Inscrições"));

  const texto = montarListaInscritosTexto("dia_das_criancas");
  assert.ok(texto.length > 0);
  assert.ok(texto.includes("Lucas Pereira") || texto.includes("Valentina Silva") || texto.includes("Enzo Gabriel"));
});
