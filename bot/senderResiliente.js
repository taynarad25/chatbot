/**
 * senderResiliente.js
 * 
 * Camada de resiliência para envio de mensagens via Puppeteer / whatsapp-web.js.
 * Intercepta e recupera automaticamente falhas transitórias de protocolo do Chrome DevTools Protocol (CDP),
 * como "Execution context was destroyed", reinicialização de frames ou atraso na reinjeção do WWebJS.
 */

/**
 * Determina se o erro lançado pelo Puppeteer / Chromium é transitório de contexto ou sessão
 * @param {Error|string} err 
 * @returns {boolean}
 */
function isTransientPuppeteerError(err) {
  if (!err) return false;
  const msg = [
    typeof err === "string" ? err : "",
    err.message || "",
    err.name || "",
    err.stack || "",
  ].join(" ");

  return (
    msg.includes("Execution context was destroyed") ||
    msg.includes("Session closed") ||
    msg.includes("Target closed") ||
    msg.includes("Protocol error (Runtime.callFunctionOn)") ||
    msg.includes("Protocol error") ||
    msg.includes("detached frame") ||
    msg.includes("Cannot read properties of undefined (reading 'getChat')") ||
    msg.includes("Cannot read properties of undefined (reading 'sendMessage')") ||
    msg.includes("WWebJS is not defined") ||
    msg.includes("Evaluation failed") ||
    msg.includes("Data passed to getter must include an id property") ||
    msg.includes("it's how we memoize")
  );
}

/**
 * Injeta correções no ambiente de execução do navegador para contornar problemas de compatibilidade
 * de versões recentes do WhatsApp Web (como MsgKey._serialized indefinido que gera erro de memoização no Store.Msg.get).
 * @param {object} pupPage 
 */
async function injetarPatchesCompatibilidade(pupPage) {
  if (!pupPage || typeof pupPage.evaluate !== "function") return;
  try {
    await pupPage.evaluate(() => {
      try {
        if (typeof window === "undefined") return;

        // 1. Garante getters _serialized nos protótipos de MsgKey e Wid
        if (window.Store) {
          if (window.Store.MsgKey && window.Store.MsgKey.prototype) {
            const desc = Object.getOwnPropertyDescriptor(window.Store.MsgKey.prototype, "_serialized");
            if (!desc || typeof desc.get !== "function") {
              Object.defineProperty(window.Store.MsgKey.prototype, "_serialized", {
                get: function () {
                  return this.$1 || (typeof this.toString === "function" ? this.toString() : "");
                },
                configurable: true,
                enumerable: true,
              });
            }
          }

          if (window.Store.Wid && window.Store.Wid.prototype) {
            const desc = Object.getOwnPropertyDescriptor(window.Store.Wid.prototype, "_serialized");
            if (!desc || typeof desc.get !== "function") {
              Object.defineProperty(window.Store.Wid.prototype, "_serialized", {
                get: function () {
                  return this.$1 || (typeof this.toString === "function" ? this.toString() : "");
                },
                configurable: true,
                enumerable: true,
              });
            }
          }

          // 2. Protege window.Store.Msg.get contra chamadas com id indefinido que geram erro de memoize
          if (window.Store.Msg && typeof window.Store.Msg.get === "function" && !window.Store.Msg._patchedMemoizeSafe) {
            const originalGet = window.Store.Msg.get.bind(window.Store.Msg);
            window.Store.Msg.get = function (id) {
              if (!id) return null;
              try {
                return originalGet(id);
              } catch (err) {
                if (err && err.message && err.message.includes("Data passed to getter must include an id property")) {
                  return null;
                }
                throw err;
              }
            };
            window.Store.Msg._patchedMemoizeSafe = true;
          }
        }

        // 3. Protege window.WWebJS.sendMessage para recuperar a mensagem enviada caso o getter final falhe
        if (window.WWebJS && typeof window.WWebJS.sendMessage === "function" && !window.WWebJS.sendMessage._patchedMemoize) {
          const originalSendMessage = window.WWebJS.sendMessage;
          const patchedSendMessage = async function (chat, message, options = {}, sendMsgResult) {
            try {
              return await originalSendMessage(chat, message, options, sendMsgResult);
            } catch (err) {
              const msgErro = err?.message || "";
              if (msgErro.includes("Data passed to getter must include an id property") || msgErro.includes("it's how we memoize")) {
                // A mensagem já foi inserida e enviada pelo Store.SendMessage. Tenta recuperar do chat.
                if (chat && chat.msgs) {
                  if (typeof chat.msgs.last === "function") {
                    const last = chat.msgs.last();
                    if (last) return last;
                  }
                  if (Array.isArray(chat.msgs._models) && chat.msgs._models.length > 0) {
                    return chat.msgs._models[chat.msgs._models.length - 1];
                  }
                }
                return { id: message?.id || {}, ack: 1, body: message?.body || "" };
              }
              throw err;
            }
          };
          patchedSendMessage._patchedMemoize = true;
          window.WWebJS.sendMessage = patchedSendMessage;
        }
      } catch (_) {}
    });
  } catch (_) {}
}

/**
 * Aguarda e garante que o contexto do navegador e o script WWebJS estão prontos para envio
 * @param {object} client - Instância do whatsapp-web.js
 * @param {number} timeoutMs - Tempo máximo de espera em milissegundos
 * @returns {Promise<boolean>}
 */
async function garantirAmbientePronto(client, timeoutMs = 8000) {
  if (!client || !client.pupPage) return false;
  const inicio = Date.now();

  while (Date.now() - inicio < timeoutMs) {
    try {
      if (typeof client.pupPage.isClosed === "function" && client.pupPage.isClosed()) {
        return false;
      }

      const pronto = await client.pupPage.evaluate(() => {
        return Boolean(
          typeof window !== "undefined" &&
          window.WWebJS &&
          typeof window.WWebJS.sendMessage === "function"
        );
      });

      if (pronto) {
        await injetarPatchesCompatibilidade(client.pupPage);
        return true;
      }
    } catch (_) {
      // O contexto pode estar no meio de uma transição CDP; ignora e aguarda próximo ciclo
    }

    // Se o WWebJS ainda não estiver presente, aciona a reinjeção caso disponível
    if (typeof client.inject === "function") {
      try {
        await client.inject();
      } catch (_) {}
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  return false;
}

/**
 * Executa uma função de envio assíncrona com política de retry para erros transitórios de CDP/Puppeteer
 * @param {object} client 
 * @param {Function} fnEnvio 
 * @param {object} config 
 * @returns {Promise<any>}
 */
async function enviarComRetry(client, fnEnvio, { jid = "", maxTentativas = 3, esperaBaseMs = 1500 } = {}) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      return await fnEnvio();
    } catch (err) {
      ultimoErro = err;
      const ehTransiente = isTransientPuppeteerError(err);

      if (!ehTransiente || tentativa >= maxTentativas) {
        throw err;
      }

      const esperaMs = tentativa * esperaBaseMs;
      console.warn(
        `[WhatsApp] ⚠️ Falha transitória no navegador ao enviar mensagem ${jid ? `para ${jid} ` : ""}(${err.message}). Aguardando restabelecimento do contexto em ${esperaMs}ms (tentativa ${tentativa}/${maxTentativas})...`
      );

      await new Promise((resolve) => setTimeout(resolve, esperaMs));

      try {
        await garantirAmbientePronto(client, 6000);
      } catch (garantirErr) {
        console.warn(`[WhatsApp] Aviso ao verificar prontidão do Puppeteer: ${garantirErr.message}`);
      }
    }
  }

  throw ultimoErro;
}

/**
 * Envia uma mensagem via cliente WhatsApp com proteção de retry automático
 * @param {object} client 
 * @param {string} jid 
 * @param {any} content 
 * @param {object} options 
 * @param {object} config 
 * @returns {Promise<any>}
 */
async function enviarMensagemResiliente(client, jid, content, options = {}, config = {}) {
  if (!client || typeof client.sendMessage !== "function") {
    throw new Error("Cliente WhatsApp inválido ou sem método sendMessage");
  }

  // Se o client já possui resiliência ativa no sendMessage, chama diretamente para não duplicar retries
  if (client._sendMessageResiliente) {
    return client.sendMessage(jid, content, options);
  }

  return enviarComRetry(
    client,
    () => client.sendMessage(jid, content, options),
    { jid, ...config }
  );
}

/**
 * Decora a instância do cliente whatsapp-web.js para tornar o método sendMessage nativamente resiliente
 * @param {object} client 
 * @returns {object}
 */
function aplicarResilienciaClient(client) {
  if (!client || typeof client.sendMessage !== "function" || client._sendMessageResiliente) {
    return client;
  }

  const originalSendMessage = client.sendMessage.bind(client);

  client.sendMessage = async function (chatId, content, options) {
    return enviarComRetry(
      client,
      () => originalSendMessage(chatId, content, options),
      { jid: chatId }
    );
  };

  client._sendMessageResiliente = true;
  return client;
}

module.exports = {
  isTransientPuppeteerError,
  injetarPatchesCompatibilidade,
  garantirAmbientePronto,
  enviarComRetry,
  enviarMensagemResiliente,
  aplicarResilienciaClient,
};
