const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  garantirDiretorioTemp,
  obterExtensaoMime,
  salvarMidiaEmDisco,
  carregarMidiaDeDisco,
  limparMidiasAntigas,
  baixarMidiaComRetry,
} = require("../bot/mediaStorage");

test("suite mediaStorage", async (t) => {
  await t.test("garantirDiretorioTemp cria pasta e confirma permissão de escrita", () => {
    const dir = garantirDiretorioTemp();
    assert.ok(dir, "Deveria retornar um diretório válido");
    assert.ok(fs.existsSync(dir), "Diretório temporário deve existir fisicamente no disco");

    const testePath = path.join(dir, `.test_write_${Date.now()}`);
    fs.writeFileSync(testePath, "teste");
    assert.ok(fs.existsSync(testePath));
    fs.unlinkSync(testePath);
  });

  await t.test("obterExtensaoMime mapeia corretamente os tipos MIME comuns", () => {
    assert.equal(obterExtensaoMime("image/jpeg"), ".jpg");
    assert.equal(obterExtensaoMime("image/jpg"), ".jpg");
    assert.equal(obterExtensaoMime("image/png"), ".png");
    assert.equal(obterExtensaoMime("image/webp"), ".webp");
    assert.equal(obterExtensaoMime("application/pdf"), ".pdf");
    assert.equal(obterExtensaoMime("video/mp4"), ".mp4");
    assert.equal(obterExtensaoMime("audio/ogg"), ".ogg");
    assert.equal(obterExtensaoMime("unknown/type"), ".bin");
    assert.equal(obterExtensaoMime(null), ".bin");
  });

  await t.test("salvarMidiaEmDisco grava base64 como binário e carregarMidiaDeDisco recupera", () => {
    const payloadOriginal = "Ola mundo das midias!";
    const base64Data = Buffer.from(payloadOriginal, "utf8").toString("base64");

    const mediaMock = {
      mimetype: "image/jpeg",
      data: base64Data,
      filename: "teste_foto.jpg",
    };

    const salvo = salvarMidiaEmDisco(mediaMock, { prefixo: "unit_test" });
    assert.ok(salvo.caminho);
    assert.ok(fs.existsSync(salvo.caminho));
    assert.equal(salvo.mimetype, "image/jpeg");
    assert.ok(salvo.tamanhoBytes > 0);

    const lido = carregarMidiaDeDisco(salvo.caminho);
    assert.ok(lido);
    assert.equal(lido.data, base64Data);

    try {
      fs.unlinkSync(salvo.caminho);
    } catch (_) {}
  });

  await t.test("limparMidiasAntigas remove arquivos que ultrapassaram a idade máxima", () => {
    const dir = garantirDiretorioTemp();
    const arquivoAntigo = path.join(dir, `antigo_${Date.now()}.jpg`);
    const arquivoRecente = path.join(dir, `recente_${Date.now()}.jpg`);

    fs.writeFileSync(arquivoAntigo, "antigo");
    fs.writeFileSync(arquivoRecente, "recente");

    const doisDiasAtras = (Date.now() - (2 * 24 * 60 * 60 * 1000)) / 1000;
    fs.utimesSync(arquivoAntigo, doisDiasAtras, doisDiasAtras);

    limparMidiasAntigas({ maxIdadeMs: 24 * 60 * 60 * 1000 });

    assert.equal(fs.existsSync(arquivoAntigo), false, "Arquivo antigo deveria ter sido excluído");
    assert.equal(fs.existsSync(arquivoRecente), true, "Arquivo recente deve ser preservado");

    try {
      fs.unlinkSync(arquivoRecente);
    } catch (_) {}
  });

  await t.test("baixarMidiaComRetry recupera após retorno inicial vazio (undefined)", async () => {
    let chamadas = 0;
    const fakeBase64 = Buffer.from("imagem_valida").toString("base64");

    const msgMock = {
      id: { _serialized: "msg_teste_recupera" },
      hasMedia: true,
      type: "image",
      downloadMedia: async () => {
        chamadas++;
        if (chamadas < 3) {
          return undefined;
        }
        return {
          mimetype: "image/png",
          data: fakeBase64,
          filename: "culto.png",
        };
      },
    };

    const resultado = await baixarMidiaComRetry(msgMock, {
      contexto: "TesteRecuperacao",
      tentativas: 4,
      esperaMs: 10,
      salvarEmDisco: true,
    });

    assert.ok(resultado, "Deveria ter recuperado na 3ª tentativa");
    assert.equal(chamadas, 3);
    assert.equal(resultado.mimetype, "image/png");
    assert.equal(resultado.data, fakeBase64);
    assert.ok(resultado.caminhoArquivo, "Deveria ter salvo no disco");
    assert.ok(fs.existsSync(resultado.caminhoArquivo));

    try {
      fs.unlinkSync(resultado.caminhoArquivo);
    } catch (_) {}
  });

  await t.test("baixarMidiaComRetry recupera após erro de exceção lançado", async () => {
    let chamadas = 0;
    const fakeBase64 = Buffer.from("conteudo_foto").toString("base64");

    const msgMock = {
      id: { _serialized: "msg_erro_transiente" },
      hasMedia: true,
      type: "image",
      downloadMedia: async () => {
        chamadas++;
        if (chamadas === 1) {
          throw new Error("Evaluation failed: r: r");
        }
        return {
          mimetype: "image/jpeg",
          data: fakeBase64,
          filename: "foto.jpg",
        };
      },
    };

    const resultado = await baixarMidiaComRetry(msgMock, {
      contexto: "TesteExcecao",
      tentativas: 3,
      esperaMs: 10,
      salvarEmDisco: true,
    });

    assert.ok(resultado);
    assert.equal(chamadas, 2);
    assert.equal(resultado.mimetype, "image/jpeg");

    if (resultado.caminhoArquivo && fs.existsSync(resultado.caminhoArquivo)) {
      try {
        fs.unlinkSync(resultado.caminhoArquivo);
      } catch (_) {}
    }
  });

  await t.test("baixarMidiaComRetry retorna null de forma segura após esgotar tentativas", async () => {
    let chamadas = 0;
    const msgMock = {
      id: { _serialized: "msg_falha_total" },
      hasMedia: true,
      type: "image",
      downloadMedia: async () => {
        chamadas++;
        throw new Error("Media expired or deleted from server");
      },
    };

    const resultado = await baixarMidiaComRetry(msgMock, {
      contexto: "TesteFalhaTotal",
      tentativas: 3,
      esperaMs: 10,
      salvarEmDisco: false,
    });

    assert.equal(resultado, null, "Deve retornar null sem derrubar o processo");
    assert.equal(chamadas, 3);
  });

  await t.test("mensagem sem mídia é ignorada sem chamar downloadMedia", async () => {
    let chamado = false;
    const msgMock = {
      id: { _serialized: "msg_texto_puro" },
      hasMedia: false,
      type: "chat",
      downloadMedia: async () => {
        chamado = true;
        return null;
      },
    };

    const resultado = await baixarMidiaComRetry(msgMock, {
      contexto: "TesteTexto",
      tentativas: 2,
      esperaMs: 10,
    });

    assert.equal(resultado, null);
    assert.equal(chamado, false, "Não deveria tentar baixar mídia de mensagem de texto comum");
  });
});
