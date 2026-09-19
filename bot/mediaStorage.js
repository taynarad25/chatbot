const fs = require("fs");
const path = require("path");
const os = require("os");
let MessageMedia;
try {
  MessageMedia = require("whatsapp-web.js").MessageMedia;
} catch (_) {
  MessageMedia = null;
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

  const msgId = msg.id?._serialized || msg.id || "desconhecido";
  const tipoMsg = msg.type || "desconhecido";
  const temIndicadorMidia = Boolean(msg.hasMedia || tipoMsg === "image" || tipoMsg === "document" || tipoMsg === "video" || tipoMsg === "audio");

  console.log(`[Mídia:${contexto}] Iniciando processo de download. ID: ${msgId} | Tipo: ${tipoMsg} | hasMedia: ${msg.hasMedia}`);

  if (!temIndicadorMidia) {
    console.log(`[Mídia:${contexto}] Mensagem ${msgId} não contém indicador de mídia.`);
    return null;
  }

  if (typeof msg.downloadMedia !== "function") {
    console.log(`[Mídia:${contexto}] Mensagem ${msgId} não possui função downloadMedia.`);
    return null;
  }

  let ultimoErro = null;
  let msgAlvo = msg;

  for (let i = 1; i <= tentativas; i++) {
    try {
      console.log(`[Mídia:${contexto}] Tentativa ${i}/${tentativas} de download (ID: ${msgId})...`);

      // Se nas tentativas seguintes msgAlvo falhar e client estiver disponível, tenta buscar nova referência da mensagem
      if (i >= 3 && client && typeof client.getMessageById === "function") {
        try {
          const freshMsg = await client.getMessageById(msgId);
          if (freshMsg && typeof freshMsg.downloadMedia === "function") {
            msgAlvo = freshMsg;
            console.log(`[Mídia:${contexto}] Referência da mensagem ${msgId} recarregada via client.getMessageById().`);
          }
        } catch (reloadErr) {
          console.warn(`[Mídia:${contexto}] Não foi possível recarregar mensagem via getMessageById: ${reloadErr.message}`);
        }
      }

      if (typeof msgAlvo.downloadMedia !== "function") {
        throw new Error("Método downloadMedia não é uma função no objeto de mensagem");
      }

      const media = await msgAlvo.downloadMedia();

      // Verifica se a mídia retornou vazia (caso muito comum do WhatsApp Web quando a mídia ainda está descriptografando)
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
  baixarMidiaComRetry,
};
