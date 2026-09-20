const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isTransientPuppeteerError,
  enviarComRetry,
  enviarMensagemResiliente,
  aplicarResilienciaClient,
} = require("../bot/senderResiliente");
const { executarBroadcast } = require("../bot/broadcast");

test("senderResiliente: isTransientPuppeteerError detecta erros de CDP e contexto destruído", () => {
  const erroContextoDestruido = new Error(
    "Protocol error (Runtime.callFunctionOn): Execution context was destroyed."
  );
  assert.equal(isTransientPuppeteerError(erroContextoDestruido), true);

  const erroTargetClosed = new Error("Protocol error: Target closed.");
  assert.equal(isTransientPuppeteerError(erroTargetClosed), true);

  const erroSessionClosed = new Error("Session closed. Most likely the page has been closed.");
  assert.equal(isTransientPuppeteerError(erroSessionClosed), true);

  const erroWWebJSNaoDefinido = new Error("Cannot read properties of undefined (reading 'sendMessage')");
  assert.equal(isTransientPuppeteerError(erroWWebJSNaoDefinido), true);

  const erroMemoizeGetter = new Error("Data passed to getter must include an id property (it's how we memoize) but got undefined");
  assert.equal(isTransientPuppeteerError(erroMemoizeGetter), true);

  const erroNaoTransiente = new Error("Número de telefone não registrado no WhatsApp");
  assert.equal(isTransientPuppeteerError(erroNaoTransiente), false);

  assert.equal(isTransientPuppeteerError(null), false);
  assert.equal(isTransientPuppeteerError(undefined), false);
});

test("senderResiliente: enviarComRetry recupera com sucesso quando ocorre erro transitório na 1ª tentativa", async () => {
  let chamadas = 0;
  const mockFn = async () => {
    chamadas++;
    if (chamadas === 1) {
      throw new Error("Protocol error (Runtime.callFunctionOn): Execution context was destroyed.");
    }
    return { id: "msg-123", status: "OK" };
  };

  const res = await enviarComRetry(
    {},
    mockFn,
    { jid: "5511999990001@c.us", maxTentativas: 3, esperaBaseMs: 10 }
  );

  assert.equal(chamadas, 2, "Deveria ter tentado 2 vezes (1 falha + 1 sucesso)");
  assert.equal(res.id, "msg-123");
  assert.equal(res.status, "OK");
});

test("senderResiliente: enviarComRetry não retenta erros não transitórios", async () => {
  let chamadas = 0;
  const mockFn = async () => {
    chamadas++;
    throw new Error("Invalid JID: número inexistente");
  };

  await assert.rejects(
    async () => {
      await enviarComRetry({}, mockFn, { maxTentativas: 3, esperaBaseMs: 10 });
    },
    { message: "Invalid JID: número inexistente" }
  );

  assert.equal(chamadas, 1, "Não deveria tentar novamente para erros de validação/negócio");
});

test("senderResiliente: enviarComRetry lança último erro se esgotar o número máximo de tentativas", async () => {
  let chamadas = 0;
  const mockFn = async () => {
    chamadas++;
    throw new Error("Protocol error (Runtime.callFunctionOn): Execution context was destroyed.");
  };

  await assert.rejects(
    async () => {
      await enviarComRetry({}, mockFn, { maxTentativas: 2, esperaBaseMs: 10 });
    },
    { message: /Execution context was destroyed/ }
  );

  assert.equal(chamadas, 2, "Deveria ter parado exatamente no limite de maxTentativas");
});

test("senderResiliente: aplicarResilienciaClient envolve client.sendMessage e recupera automaticamente", async () => {
  let tentativas = 0;
  const clientMock = {
    sendMessage: async (chatId, content) => {
      tentativas++;
      if (tentativas === 1) {
        throw new Error("Protocol error (Runtime.callFunctionOn): Execution context was destroyed.");
      }
      return { chatId, content, id: "msg-sent" };
    },
  };

  aplicarResilienciaClient(clientMock);
  assert.equal(clientMock._sendMessageResiliente, true);

  const resultado = await clientMock.sendMessage("5511999990001@c.us", "Olá Gabriela!");
  assert.equal(tentativas, 2);
  assert.equal(resultado.id, "msg-sent");
  assert.equal(resultado.content, "Olá Gabriela!");
});

test("broadcast: executarBroadcast recupera de erro 'Execution context was destroyed' sem falhar a transmissão", async () => {
  let tentativasEnvio = 0;
  const mensagensRecebidas = [];

  const clientMock = {
    sendMessage: async (to, content, options) => {
      tentativasEnvio++;
      if (tentativasEnvio === 1) {
        throw new Error("Protocol error (Runtime.callFunctionOn): Execution context was destroyed.");
      }
      mensagensRecebidas.push({ to, content, options });
      return { id: "ok" };
    },
  };

  const res = await executarBroadcast({
    client: clientMock,
    texto: "Aviso urgente da Igreja!",
    delayMs: 10,
    destinatarios: [
      { nome: "Gabriela Diniz", telefone: "5511999990001" },
    ],
  });

  assert.equal(res.enviados, 1, "Deveria ter completado o envio após o retry");
  assert.equal(res.falhas, 0, "Não deveria constar falhas");
  assert.equal(mensagensRecebidas.length, 1);
  assert.equal(mensagensRecebidas[0].to, "5511999990001@c.us");
  assert.equal(mensagensRecebidas[0].content, "Aviso urgente da Igreja!");
});
