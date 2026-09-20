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
  extrairSerializedId,
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

  await t.test("extrairSerializedId extrai IDs no formato clássico, formato $1 e por reconstrução de objeto", () => {
    // 1. Clássico _serialized
    assert.equal(
      extrairSerializedId({ _serialized: "false_120363@g.us_3EB0123" }),
      "false_120363@g.us_3EB0123"
    );

    // 2. Novo padrão $1 do WhatsApp Web 2.3000.x
    assert.equal(
      extrairSerializedId({ $1: "true_5511999990001@c.us_3EB0456" }),
      "true_5511999990001@c.us_3EB0456"
    );

    // 3. String direta
    assert.equal(
      extrairSerializedId("false_120363@g.us_3EB0789"),
      "false_120363@g.us_3EB0789"
    );

    // 4. Objeto puro sem _serialized nem $1
    assert.equal(
      extrairSerializedId({
        fromMe: false,
        remote: "120363999999999999@g.us",
        id: "3EB0ABCDEF123456",
      }),
      "false_120363999999999999@g.us_3EB0ABCDEF123456"
    );

    // 5. Objeto com remote aninhado e participant
    assert.equal(
      extrairSerializedId({
        fromMe: false,
        remote: { _serialized: "120363888888888888@g.us" },
        id: "3EB09999",
        participant: "5511988880001@c.us",
      }),
      "false_120363888888888888@g.us_3EB09999_5511988880001@c.us"
    );

    // 6. Inválido ou nulo
    assert.equal(extrairSerializedId(null), null);
    assert.equal(extrairSerializedId({}), null);
  });

  await t.test("baixarMidiaComRetry normaliza msg.id sem _serialized e evita passar [object Object] para getMessageById", async () => {
    let idRecebidoNoGet = null;
    const fakeBase64 = Buffer.from("conteudo_imagem").toString("base64");

    const clientMock = {
      getMessageById: async (msgId) => {
        idRecebidoNoGet = msgId;
        return {
          id: { _serialized: msgId },
          downloadMedia: async () => ({
            mimetype: "image/jpeg",
            data: fakeBase64,
            filename: "foto_recarregada.jpg",
          }),
        };
      },
    };

    // Mensagem com id sem _serialized (formato moderno que gerava [object Object])
    const msgMock = {
      id: {
        fromMe: false,
        remote: "120363999999999999@g.us",
        id: "3EB01234567890AB",
      },
      hasMedia: true,
      type: "image",
      downloadMedia: async function () {
        // Na 1ª e 2ª tentativa lança o erro r característico de msgId undefined
        throw new Error("r: r");
      },
    };

    const resultado = await baixarMidiaComRetry(msgMock, {
      client: clientMock,
      contexto: "TesteIdObjeto",
      tentativas: 3,
      esperaMs: 10,
      salvarEmDisco: false,
    });

    assert.ok(resultado, "Deveria ter recuperado na 3ª tentativa via getMessageById");
    assert.equal(msgMock.id._serialized, "false_120363999999999999@g.us_3EB01234567890AB");
    assert.equal(idRecebidoNoGet, "false_120363999999999999@g.us_3EB01234567890AB");
    assert.notEqual(idRecebidoNoGet, "[object Object]");
  });

  await t.test("Client.prototype.getMessageById serializa objeto de ID automaticamente", async () => {
    const { Client } = require("whatsapp-web.js");
    let chamadoCom = null;
    const fakeClient = Object.create(Client.prototype);
    fakeClient.pupPage = {
      evaluate: async (fn, arg) => {
        chamadoCom = arg;
        return null;
      },
    };

    await fakeClient.getMessageById({
      fromMe: false,
      remote: "120363999999999999@g.us",
      id: "3EB0TESTE123",
    });

    assert.equal(chamadoCom, "false_120363999999999999@g.us_3EB0TESTE123");
  });
});

