const fs = require("fs");
const path = require("path");
const os = require("os");
let MessageMedia;
let MessageStructure;
let ClientStructure;
try {
  const wweb = require("whatsapp-web.js");
  MessageMedia = wweb.MessageMedia;
  MessageStructure = wweb.Message;
  ClientStructure = wweb.Client;
} catch (_) {
  MessageMedia = null;
  MessageStructure = null;
  ClientStructure = null;
}

// Aplica monkey-patch em Message.prototype.downloadMedia para assegurar que this.id._serialized não seja undefined
if (MessageStructure && MessageStructure.prototype && !MessageStructure.prototype._patchedDownloadMedia) {
  const originalDownloadMedia = MessageStructure.prototype.downloadMedia;
  MessageStructure.prototype.downloadMedia = async function () {
    if (this.id) {
      const idStr = extrairSerializedId(this.id) || extrairSerializedId(this._data?.id);
      if (idStr) {
        if (typeof this.id === "object") {
          this.id._serialized = idStr;
        } else {
          this.id = { _serialized: idStr, id: idStr };
        }
      }
    }
    return originalDownloadMedia.apply(this, arguments);
  };
  MessageStructure.prototype._patchedDownloadMedia = true;
}

// Aplica monkey-patch em Client.prototype.getMessageById para serializar objetos e evitar 'messageId.split is not a function'
if (ClientStructure && ClientStructure.prototype && !ClientStructure.prototype._patchedGetMessageById) {
  const originalGetMessageById = ClientStructure.prototype.getMessageById;
  ClientStructure.prototype.getMessageById = async function (messageId) {
    let resolvedId = messageId;
    if (messageId && typeof messageId === "object") {
      resolvedId = extrairSerializedId(messageId);
    }
    if (typeof resolvedId !== "string" || !resolvedId) {
      throw new Error(`Invalid message ID specified: ${typeof messageId === "object" ? JSON.stringify(messageId) : messageId}`);
    }
    return originalGetMessageById.call(this, resolvedId);
  };
  ClientStructure.prototype._patchedGetMessageById = true;
}

// Diretório primário na raiz do projeto e fallback no os.tmpdir()
const DIRETORIO_TEMP_PADRAO = path.join(__dirname, "..", "temp", "media");
const DIRETORIO_TEMP_FALLBACK = path.join(os.tmpdir(), "chatbot_media");

let diretorioVerificado = null;

/**
 * Garante que o diretório temporário para armazenamento de mídias existe
 * e possui permissões ativas de leitura e escrita.
 */
function garantirDiretorioTemp() {
  if (diretorioVerificado && fs.existsSync(diretorioVerificado)) {
    return diretorioVerificado;
  }

  const candidatos = [DIRETORIO_TEMP_PADRAO, DIRETORIO_TEMP_FALLBACK];

  for (const dir of candidatos) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
      }

      // Teste ativo de escrita e leitura de arquivo probe
      const probePath = path.join(dir, `.write_probe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
      fs.writeFileSync(probePath, "probe", "utf8");
      fs.unlinkSync(probePath);

      diretorioVerificado = dir;
      console.log(`[Mídia:Storage] Diretório temporário verificado e pronto: ${dir}`);
      return dir;
    } catch (errDir) {
      console.warn(`[Mídia:Storage] Não foi possível usar diretório '${dir}': ${errDir.message}. Tentando próximo candidato...`);
    }
  }

  // Se nenhum candidato funcionar, usa os.tmpdir() direto
  diretorioVerificado = os.tmpdir();
  console.warn(`[Mídia:Storage] Usando os.tmpdir() como último recurso: ${diretorioVerificado}`);
  return diretorioVerificado;
}

/**
 * Retorna a extensão recomendada com base no MIME type.
 */
function obterExtensaoMime(mimetype) {
  if (!mimetype) return ".bin";
  const m = mimetype.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("gif")) return ".gif";
  if (m.includes("pdf")) return ".pdf";
  if (m.includes("mp4")) return ".mp4";
  if (m.includes("ogg") || m.includes("opus")) return ".ogg";
  if (m.includes("mp3") || m.includes("mpeg")) return ".mp3";
  if (m.includes("json")) return ".json";
  return ".bin";
}

/**
 * Salva um objeto de mídia em disco no diretório temporário.
 */
function salvarMidiaEmDisco(media, { prefixo = "media", nomeArquivo = null } = {}) {
  if (!media || !media.data) {
    throw new Error("Objeto de mídia inválido ou sem dados base64");
  }

  const dir = garantirDiretorioTemp();
  const extensao = obterExtensaoMime(media.mimetype);
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const finalFilename = nomeArquivo || `${prefixo}_${timestamp}_${randomSuffix}${extensao}`;
  const caminhoCompleto = path.join(dir, finalFilename);

  try {
    const buffer = Buffer.from(media.data, "base64");
    fs.writeFileSync(caminhoCompleto, buffer);
    const tamanhoKb = (buffer.length / 1024).toFixed(1);
    console.log(`[Mídia:Storage] Mídia salva em disco com sucesso: ${caminhoCompleto} (${tamanhoKb} KB, mimetype: ${media.mimetype})`);

    return {
      caminho: caminhoCompleto,
      nomeArquivo: finalFilename,
      tamanhoBytes: buffer.length,
      mimetype: media.mimetype,
    };
  } catch (errWrite) {
    console.error(`[Mídia:Storage] Erro ao gravar mídia temporária no disco (${caminhoCompleto}):`, errWrite);
    throw errWrite;
  }
}

/**
 * Carrega uma mídia salva do disco e a transforma em MessageMedia (ou objeto compatível).
 */
function carregarMidiaDeDisco(caminho) {
  if (!caminho || !fs.existsSync(caminho)) {
    throw new Error(`Arquivo de mídia não encontrado: ${caminho}`);
  }

  if (MessageMedia && typeof MessageMedia.fromFilePath === "function") {
    return MessageMedia.fromFilePath(caminho);
  }

  const buffer = fs.readFileSync(caminho);
  const ext = path.extname(caminho).toLowerCase();
  let mimetype = "application/octet-stream";
  if (ext === ".jpg" || ext === ".jpeg") mimetype = "image/jpeg";
  else if (ext === ".png") mimetype = "image/png";
  else if (ext === ".webp") mimetype = "image/webp";
  else if (ext === ".pdf") mimetype = "application/pdf";

  return {
    data: buffer.toString("base64"),
    mimetype,
    filename: path.basename(caminho),
    filesize: buffer.length,
  };
}

/**
 * Remove mídias antigas do diretório temporário para evitar consumo de disco.
 */
function limparMidiasAntigas({ maxIdadeMs = 24 * 60 * 60 * 1000 } = {}) {
  try {
    const dir = garantirDiretorioTemp();
    const agora = Date.now();
    const arquivos = fs.readdirSync(dir);
    let removidos = 0;

    for (const arq of arquivos) {
      if (arq.startsWith(".write_probe")) continue;
      const caminho = path.join(dir, arq);
      try {
        const stats = fs.statSync(caminho);
        if (agora - stats.mtimeMs > maxIdadeMs) {
          fs.unlinkSync(caminho);
          removidos++;
        }
      } catch (_) {}
    }

    if (removidos > 0) {
      console.log(`[Mídia:Storage] Limpeza automática: ${removidos} arquivo(s) temporário(s) antigo(s) removido(s).`);
    }
  } catch (errClean) {
    console.warn("[Mídia:Storage] Aviso ao limpar mídias antigas:", errClean.message);
  }
}

/**
 * Extrai de forma resiliente o identificador serializado de uma mensagem,
 * suportando o formato clássico _serialized, o novo padrão $1 do WhatsApp Web 2.3000.x,
 * ou reconstruindo via { fromMe, remote, id, participant }.
 */
function extrairSerializedId(idObj) {
  if (!idObj) return null;
  if (typeof idObj === "string") return idObj;
  if (typeof idObj._serialized === "string" && idObj._serialized) return idObj._serialized;
  if (typeof idObj.$1 === "string" && idObj.$1) return idObj.$1;

  if (typeof idObj.toString === "function") {
    const s = idObj.toString();
    if (s && s !== "[object Object]" && s.includes("_")) return s;
  }

  const fromMe = Boolean(idObj.fromMe);
  const remote = typeof idObj.remote === "object"
    ? (idObj.remote?._serialized || idObj.remote?.$1 || idObj.remote?.user)
    : idObj.remote;
  const id = idObj.id;
  const participant = typeof idObj.participant === "object"
    ? (idObj.participant?._serialized || idObj.participant?.$1 || idObj.participant?.user)
    : idObj.participant;

  if (remote && id) {
    if (participant) {
      return `${fromMe}_${remote}_${id}_${participant}`;
    }
    return `${fromMe}_${remote}_${id}`;
  }

  return null;
}

/**
 * Fallback de download direto de mídia interagindo com o Store interno do WhatsApp Web via Puppeteer
 */
async function baixarMidiaViaPuppeteer(client, msgId) {
  if (!client || !client.pupPage || !msgId || msgId === "desconhecido") {
    return null;
  }

  try {
    const result = await client.pupPage.evaluate(async (idAlvo) => {
      if (!window.Store || !window.Store.Msg) return null;

      // 1. Tenta obter pelo ID direto
      let msg = window.Store.Msg.get(idAlvo);

      // 2. Tenta por getMessagesById
      if (!msg && window.Store.Msg.getMessagesById) {
        try {
          const res = await window.Store.Msg.getMessagesById([idAlvo]);
          if (res && res.messages && res.messages.length) {
            msg = res.messages[0];
          }
        } catch (_) {}
      }

      // 3. Tenta localizar por id.$1 ou id._serialized ou stanzaId nos models
      if (!msg && window.Store.Msg.models) {
        const parts = idAlvo.split('_');
        const stanzaId = parts[2] || idAlvo;
        msg = window.Store.Msg.models.find((m) => {
          if (!m.id) return false;
          if (m.id._serialized === idAlvo || m.id.$1 === idAlvo) return true;
          if (m.id.id === stanzaId) return true;
          return false;
        });
      }

      if (!msg || !msg.mediaData) return null;

      // Se a mídia estiver em download, aguarda até 3 segundos para resolver
      if (msg.mediaData.mediaStage === 'FETCHING') {
        const inicio = Date.now();
        while (Date.now() - inicio < 3000) {
          if (msg.mediaData.mediaStage !== 'FETCHING') break;
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      if (msg.mediaData.mediaStage !== 'RESOLVED' && typeof msg.downloadMedia === 'function') {
        try {
          await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
        } catch (_) {}
      }

      if (!window.Store.DownloadManager || !window.Store.DownloadManager.downloadAndMaybeDecrypt) {
        return null;
      }

      try {
        const mockQpl = {
          addAnnotations: function () { return this; },
          addPoint: function () { return this; },
        };
        const decryptedMedia = await window.Store.DownloadManager.downloadAndMaybeDecrypt({
          directPath: msg.directPath,
          encFilehash: msg.encFilehash,
          filehash: msg.filehash,
          mediaKey: msg.mediaKey,
          mediaKeyTimestamp: msg.mediaKeyTimestamp,
          type: msg.type,
          signal: (new AbortController()).signal,
          downloadQpl: mockQpl,
        });

        if (!decryptedMedia) return null;
        const data = await window.WWebJS.arrayBufferToBase64Async(decryptedMedia);
        return {
          data,
          mimetype: msg.mimetype,
          filename: msg.filename,
          filesize: msg.size,
        };
      } catch (errDecrypt) {
        return null;
      }
    }, msgId);

    if (result && result.data) {
      if (MessageMedia) {
        return new MessageMedia(result.mimetype, result.data, result.filename, result.filesize);
      }
      return result;
    }
    return null;
  } catch (errEval) {
    return null;
  }
}

/**
 * Baixa mídia de uma mensagem com tentativas e verificação ativa de conteúdo base64.
 * Inclui logs detalhados de diagnóstico em cada etapa.
 */
async function baixarMidiaComRetry(msg, {
  client = null,
  contexto = "Geral",
  tentativas = 5,
  esperaMs = 2000,
  salvarEmDisco = true,
} = {}) {
  if (!msg) {
    console.warn(`[Mídia:${contexto}] Objeto msg nulo ou indefinido recebido.`);
    return null;
  }

  // Normaliza o identificador serializado para evitar que objetos brutos gerem [object Object] ou falhas em getMessageById
  const msgId = extrairSerializedId(msg.id) ||
                extrairSerializedId(msg._data?.id) ||
                (typeof msg.id === "string" ? msg.id : null) ||
                "desconhecido";

  // Preenche _serialized para evitar chamadas de Puppeteer com undefined no downloadMedia nativo
  if (msg.id && typeof msg.id === "object" && !msg.id._serialized && msgId !== "desconhecido") {
    msg.id._serialized = msgId;
  }
  if (msg._data?.id && typeof msg._data.id === "object" && !msg._data.id._serialized && msgId !== "desconhecido") {
    msg._data.id._serialized = msgId;
  }

  const tipoMsg = msg.type || "desconhecido";
  const temIndicadorMidia = Boolean(msg.hasMedia || tipoMsg === "image" || tipoMsg === "document" || tipoMsg === "video" || tipoMsg === "audio");

  console.log(`[Mídia:${contexto}] Iniciando processo de download. ID: ${msgId} | Tipo: ${tipoMsg} | hasMedia: ${msg.hasMedia}`);

  if (!temIndicadorMidia) {
    console.log(`[Mídia:${contexto}] Mensagem ${msgId} não contém indicador de mídia.`);
    return null;
  }

  let ultimoErro = null;
  let msgAlvo = msg;

  for (let i = 1; i <= tentativas; i++) {
    try {
      console.log(`[Mídia:${contexto}] Tentativa ${i}/${tentativas} de download (ID: ${msgId})...`);

      // Se nas tentativas seguintes msgAlvo falhar e client estiver disponível, tenta buscar nova referência da mensagem
      if (i >= 3 && client && typeof client.getMessageById === "function" && msgId && msgId !== "desconhecido") {
        try {
          const freshMsg = await client.getMessageById(msgId);
          if (freshMsg && typeof freshMsg.downloadMedia === "function") {
            if (freshMsg.id && typeof freshMsg.id === "object" && !freshMsg.id._serialized) {
              freshMsg.id._serialized = msgId;
            }
            msgAlvo = freshMsg;
            console.log(`[Mídia:${contexto}] Referência da mensagem ${msgId} recarregada via client.getMessageById().`);
          }
        } catch (reloadErr) {
          console.warn(`[Mídia:${contexto}] Não foi possível recarregar mensagem via getMessageById: ${reloadErr.message}`);
        }
      }

      let media = null;
      if (typeof msgAlvo.downloadMedia === "function") {
        try {
          media = await msgAlvo.downloadMedia();
        } catch (dlErr) {
          console.warn(`[Mídia:${contexto}] ⚠️ msg.downloadMedia() falhou na tentativa ${i} (${dlErr.message}). Tentando fallback direto via Puppeteer...`);
          if (client) {
            media = await baixarMidiaViaPuppeteer(client, msgId);
          }
          if (!media) throw dlErr;
        }
      }

      // Se retornou vazio/undefined, tenta o fallback do Puppeteer
      if (!media && client) {
        console.log(`[Mídia:${contexto}] downloadMedia retornou vazio na tentativa ${i}. Tentando fallback direto via Puppeteer...`);
        media = await baixarMidiaViaPuppeteer(client, msgId);
      }

      // Verifica se a mídia retornou vazia
      if (!media) {
        throw new Error("downloadMedia() retornou undefined/null (WhatsApp Web ainda descriptografando ou mídia indisponível no servidor)");
      }

      if (!media.data || media.data.length === 0) {
        throw new Error("Objeto de mídia retornado sem dados base64 (media.data vazio)");
      }

      const tamanhoAproxKb = Math.round((media.data.length * 0.75) / 1024);
      console.log(`[Mídia:${contexto}] ✅ Download bem-sucedido na tentativa ${i}! Mimetype: ${media.mimetype}, Tamanho: ~${tamanhoAproxKb} KB, Nome: ${media.filename || "sem_nome"}`);

      // Salva em disco para garantir persistência e disponibilidade
      if (salvarEmDisco) {
        try {
          const infoDisco = salvarMidiaEmDisco(media, {
            prefixo: contexto.toLowerCase().replace(/[^a-z0-9]/g, "_"),
            nomeArquivo: media.filename ? `${Date.now()}_${media.filename}` : null,
          });
          media.caminhoArquivo = infoDisco.caminho;
        } catch (errDisk) {
          console.warn(`[Mídia:${contexto}] Aviso: Mídia baixada em memória, mas falhou ao gravar em disco: ${errDisk.message}`);
        }
      }

      return media;
    } catch (err) {
      ultimoErro = err;
      console.warn(`[Mídia:${contexto}] ⚠️ Tentativa ${i}/${tentativas} falhou: ${err.message}`);

      if (err.stack && i === tentativas) {
        console.error(`[Mídia:${contexto}] Detalhes da stack do erro:`, err.stack);
      }

      if (i < tentativas) {
        await new Promise((resolve) => setTimeout(resolve, esperaMs));
      }
    }
  }

  console.error(`[Mídia:${contexto}] ❌ FALHA DEFINITIVA após ${tentativas} tentativas para mensagem ${msgId}. Último erro: ${ultimoErro?.message}`);
  return null;
}

module.exports = {
  DIRETORIO_TEMP_PADRAO,
  DIRETORIO_TEMP_FALLBACK,
  garantirDiretorioTemp,
  obterExtensaoMime,
  salvarMidiaEmDisco,
  carregarMidiaDeDisco,
  limparMidiasAntigas,
  extrairSerializedId,
  baixarMidiaViaPuppeteer,
  baixarMidiaComRetry,
};
