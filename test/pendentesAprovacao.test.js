// Isola completamente do banco real de produção ANTES de exigir o módulo.
const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-pendentes-test-"));
process.env.DB_PATH = path.join(tmpDir, "dados.db");

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { salvarPendente, buscarPendente, removerPendente, extrairCodigo } = require("../bot/pendentesAprovacao");

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function dadosExemplo(overrides = {}) {
  return {
    solicitanteId: "5511999999999@c.us",
    evento: "Encontro de Casais",
    rede: "Rede de Casais",
    ...overrides,
  };
}

test("salvarPendente + buscarPendente: round-trip preserva os dados originais", () => {
  const dados = dadosExemplo();
  const codigo = salvarPendente(dados);
  const encontrado = buscarPendente(codigo);

  assert.equal(encontrado.solicitanteId, dados.solicitanteId);
  assert.equal(encontrado.evento, dados.evento);
  assert.equal(encontrado.rede, dados.rede);
  assert.ok(encontrado.criadoEm, "deveria registrar quando a solicitação foi criada");
});

test("salvarPendente: gera códigos diferentes para solicitações diferentes", () => {
  const codigo1 = salvarPendente(dadosExemplo({ evento: "Evento A" }));
  const codigo2 = salvarPendente(dadosExemplo({ evento: "Evento B" }));
  assert.notEqual(codigo1, codigo2);
});

test("salvarPendente: suporta várias solicitações pendentes ao mesmo tempo, sem uma sobrescrever a outra", () => {
  const codigoA = salvarPendente(dadosExemplo({ evento: "Culto A" }));
  const codigoB = salvarPendente(dadosExemplo({ evento: "Culto B" }));

  assert.equal(buscarPendente(codigoA).evento, "Culto A");
  assert.equal(buscarPendente(codigoB).evento, "Culto B");
});

test("buscarPendente: retorna null para um código que não existe", () => {
  assert.equal(buscarPendente("ZZZZ"), null);
});

test("removerPendente: some do arquivo depois de removido, sem afetar outras solicitações pendentes", () => {
  const codigoA = salvarPendente(dadosExemplo({ evento: "Fica" }));
  const codigoB = salvarPendente(dadosExemplo({ evento: "Sai" }));

  removerPendente(codigoB);

  assert.equal(buscarPendente(codigoB), null);
  assert.equal(buscarPendente(codigoA).evento, "Fica");
});

test("removerPendente: não lança erro ao tentar remover um código que já não existe", () => {
  assert.doesNotThrow(() => removerPendente("NAOEXISTE"));
});

test("extrairCodigo: encontra o código embutido na mensagem do bot", () => {
  const mensagem = `⚠️ *PEDIDO DE ALTERAÇÃO*\n\n...\n\n_Código: A3F9_`;
  assert.equal(extrairCodigo(mensagem), "A3F9");
});

test("extrairCodigo: retorna null quando não há código na mensagem", () => {
  assert.equal(extrairCodigo("Uma mensagem qualquer sem código embutido"), null);
  assert.equal(extrairCodigo(""), null);
  assert.equal(extrairCodigo(undefined), null);
});
