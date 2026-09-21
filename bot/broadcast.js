const fs = require("fs");
const db = require("../db");
const { carregarMidiaDeDisco } = require("./mediaStorage");
let MessageMedia;
try {
  MessageMedia = require("whatsapp-web.js").MessageMedia;
} catch (_) {
  MessageMedia = null;
}
const { enviarMensagemResiliente } = require("./senderResiliente");

const BROADCAST_CONFIG = {
  // Quando true, envia EXCLUSIVAMENTE para Gabriela Diniz (fase de testes).
  // Para ativar para todos os membros após os testes, basta mudar para false (ou via env BROADCAST_MODO_TESTE=false).
  modoTeste: process.env.BROADCAST_MODO_TESTE !== "false",

  // Nome do contato buscado na base de dados durante a fase de testes
  nomeTeste: "Gabriela Diniz",

  // Intervalo de segurança contra bloqueios entre cada envio (em ms). Padrão: 3 segundos.
  delayMs: parseInt(process.env.BROADCAST_DELAY_MS, 10) || 3000,

  // Nome do grupo monitorado
  nomeGrupo: "Mensagens Secretaria",
};

function formatarJidWhatsApp(telefone) {
  if (!telefone) return "";
  let limpo = String(telefone).replace(/\D/g, "");
  if (!limpo) return "";
  if ((limpo.length === 10 || limpo.length === 11) && !limpo.startsWith("55")) {
    limpo = `55${limpo}`;
  }
  return limpo.endsWith("@c.us") ? limpo : `${limpo}@c.us`;
}

function mascararTelefone(jidOuTel) {
  const limpo = String(jidOuTel || "").replace(/\D/g, "");
  if (limpo.length < 8) return limpo;
  return `${limpo.slice(0, 4)}*****${limpo.slice(-4)}`;
}

/**
 * Busca destinatários do broadcast no banco de dados SQLite (tabela 'lideres')
 * ou usa a lista customizada informada.
 * - Em modo teste: busca exclusivamente Gabriela Diniz por nome.
 * - Em produção: retorna todos os líderes cadastrados com número válido.
 */
function buscarDestinatariosBroadcast({ modoTeste = BROADCAST_CONFIG.modoTeste, listLideres = null } = {}) {
  try {
    if (modoTeste) {
      const termo = BROADCAST_CONFIG.nomeTeste.toLowerCase();
      // 1. Tenta usar a lista injetada (se fornecida via DI)
      if (typeof listLideres === "function") {
        const listaInjetada = listLideres() || [];
        let matches = listaInjetada.filter((u) => (u.nome || "").toLowerCase().includes(termo));
        if (matches.length === 0) {
          // Fallback para primeiro nome
          matches = listaInjetada.filter((u) => (u.nome || "").toLowerCase().includes("gabriela"));
        }
        if (matches.length > 0) {
          const r = matches[0];
          return [{
            telefone: r.telefone,
            nome: r.nome || BROADCAST_CONFIG.nomeTeste,
          }];
        }
      }

      // 2. Busca específica por Gabriela Diniz (ou Gabriela) na base de dados SQLite
      let rows = db.prepare("SELECT telefone, nome FROM lideres WHERE LOWER(nome) = ?").all(termo);
      if (rows.length === 0) {
        rows = db.prepare("SELECT telefone, nome FROM lideres WHERE LOWER(nome) LIKE ?").all(`%${termo}%`);
      }
      if (rows.length === 0) {
        // Fallback para primeiro nome 'Gabriela'
        rows = db.prepare("SELECT telefone, nome FROM lideres WHERE LOWER(nome) LIKE '%gabriela%'").all();
      }

      if (rows.length > 0) {
        const r = rows[0];
        return [{
          telefone: r.telefone,
          nome: r.nome || BROADCAST_CONFIG.nomeTeste,
        }];
      }

      if (process.env.BROADCAST_TESTE_TELEFONE) {
        return [
          {
            telefone: process.env.BROADCAST_TESTE_TELEFONE,
            nome: BROADCAST_CONFIG.nomeTeste,
          },
        ];
      }

      console.warn(`[Broadcast] '${BROADCAST_CONFIG.nomeTeste}' não foi encontrada na tabela 'lideres' do banco de dados.`);
      return [];
    }

    // Modo produção: retorna todos os líderes com telefone válido cadastrado
    if (typeof listLideres === "function") {
      const listaInjetada = listLideres() || [];
      const validos = listaInjetada.filter((l) => l.telefone && String(l.telefone).trim() !== "");
      if (validos.length > 0) {
        return validos.map((l) => ({ telefone: l.telefone, nome: l.nome || "" }));
      }
    }

    const todos = db.prepare("SELECT telefone, nome FROM lideres WHERE telefone IS NOT NULL AND telefone != ''").all();
    return todos.map((r) => ({ telefone: r.telefone, nome: r.nome || "" }));
  } catch (err) {
    console.error("[Broadcast] Erro ao consultar destinatários no banco:", err.message);
    return [];
  }
}

/**
 * Executa o envio de transmissão (broadcast) para a lista de destinatários
 */
async function executarBroadcast({
  client,
  media = null,
  texto = "",
  destinatarios = null,
  listLideres = null,
  delayMs = BROADCAST_CONFIG.delayMs,
  modoTeste = BROADCAST_CONFIG.modoTeste,
} = {}) {
  const listaAlvo = destinatarios || buscarDestinatariosBroadcast({ modoTeste, listLideres });
  const total = listaAlvo.length;

  if (total === 0) {
    console.warn("[Broadcast] Nenhum destinatário encontrado para o envio.");
    return { enviados: 0, falhas: 0, total: 0, destinatarios: [] };
  }

  console.log(
    `[Broadcast] Iniciando transmissão de ${total} mensagem(ns) (Modo Teste: ${modoTeste ? "SIM (exclusivo para " + BROADCAST_CONFIG.nomeTeste + ")" : "NÃO (todos os membros)"}, Intervalo: ${delayMs}ms)...`
  );

  let enviados = 0;
  let falhas = 0;
  const destinatariosEnviados = [];

  // Prioriza carregar do arquivo em disco para garantir integridade binária da mídia
  let mediaObj = null;
  if (media?.caminhoArquivo && fs.existsSync(media.caminhoArquivo)) {
    try {
      mediaObj = carregarMidiaDeDisco(media.caminhoArquivo, media.mimetype);
      console.log(`[Broadcast] Mídia carregada diretamente do arquivo em disco: ${media.caminhoArquivo}`);
    } catch (errCarregar) {
      console.warn(`[Broadcast] Falha ao carregar mídia do disco (${media.caminhoArquivo}):`, errCarregar.message);
      mediaObj = null;
    }
  }

  // Fallback para objeto MessageMedia em memória
  if (!mediaObj && media) {
    mediaObj = media;
  }

  // Se MessageMedia estiver disponível, garante que mediaObj seja uma instância de MessageMedia
  if (mediaObj && MessageMedia && !(mediaObj instanceof MessageMedia) && mediaObj.data && mediaObj.mimetype) {
    try {
      mediaObj = new MessageMedia(mediaObj.mimetype, mediaObj.data, mediaObj.filename || "imagem.jpg", mediaObj.filesize);
    } catch (errWrap) {
      console.warn("[Broadcast] Aviso ao instanciar MessageMedia:", errWrap.message);
    }
  }

  for (let i = 0; i < listaAlvo.length; i++) {
    const dest = listaAlvo[i];
    let jid = formatarJidWhatsApp(dest.telefone);
    if (client && typeof client.getNumberId === "function") {
      try {
        const contactId = await client.getNumberId(dest.telefone);
        if (contactId && contactId._serialized) {
          jid = contactId._serialized;
        }
      } catch (errId) {
        console.warn(`[Broadcast] Falha ao resolver numberId para ${dest.telefone}:`, errId.message);
      }
    }

    if (!jid || jid.includes("@g.us")) {
      console.warn(`[Broadcast] Destinatário ignorado (JID inválido ou grupo): ${dest.telefone}`);
      continue;
    }

    let enviadoComSucesso = false;
    try {
      let resEnvio = null;
      if (mediaObj && client && typeof client.sendMessage === "function") {
        const options = {
          caption: texto || undefined,
          sendMediaAsDocument: false,
          waitUntilMsgSent: true,
        };
        console.log(`[Broadcast] (${i + 1}/${total}) Enviando mídia (${mediaObj.mimetype || "sem mimetype"}) para ${dest.nome} [JID: ${jid}] (${mascararTelefone(dest.telefone)})...`);
        resEnvio = await enviarMensagemResiliente(client, jid, mediaObj, options, { jid });
      } else if (texto && client && typeof client.sendMessage === "function") {
        console.log(`[Broadcast] (${i + 1}/${total}) Enviando texto para ${dest.nome} [JID: ${jid}] (${mascararTelefone(dest.telefone)})...`);
        resEnvio = await enviarMensagemResiliente(client, jid, texto, {}, { jid });
      }

      if (resEnvio === false || (typeof resEnvio === "object" && resEnvio !== null && resEnvio.id && Object.keys(resEnvio.id).length === 0 && !resEnvio.ack && !resEnvio._serialized)) {
        throw new Error("Envio não confirmado pelo cliente WhatsApp");
      }



      enviados++;
      enviadoComSucesso = true;
      destinatariosEnviados.push(dest);
      console.log(`[Broadcast] (${i + 1}/${total}) ✅ Enviado com sucesso para ${dest.nome} (${mascararTelefone(dest.telefone)})`);
    } catch (sendErr) {
      console.error(`[Broadcast] ❌ Falha ao enviar para ${dest.nome} (${mascararTelefone(dest.telefone)}):`, sendErr.message);
      if (sendErr.stack) {
        console.error(`[Broadcast] Detalhes do erro:`, sendErr.stack);
      }

      // Tentativa de fallback: se falhou o envio com objeto em memória e temos arquivo salvo em disco
      if (mediaObj && media?.caminhoArquivo && fs.existsSync(media.caminhoArquivo) && client && typeof client.sendMessage === "function") {
        try {
          console.log(`[Broadcast] Tentando fallback enviando mídia do arquivo em disco: ${media.caminhoArquivo}...`);
          const mediaDoDisco = carregarMidiaDeDisco(media.caminhoArquivo);
          const resFallback = await enviarMensagemResiliente(client, jid, mediaDoDisco, texto ? { caption: texto, sendMediaAsDocument: false, waitUntilMsgSent: true } : { sendMediaAsDocument: false, waitUntilMsgSent: true }, { jid });
          if (!resFallback || (typeof resFallback === "object" && resFallback !== null && resFallback.id && Object.keys(resFallback.id).length === 0 && !resFallback.ack && !resFallback._serialized)) {
            throw new Error("Envio via fallback de disco não confirmado");
          }
          enviados++;
          enviadoComSucesso = true;
          destinatariosEnviados.push(dest);
          console.log(`[Broadcast] ✅ Sucesso no envio via fallback de disco para ${dest.nome}!`);
        } catch (fallbackErr) {
          console.error(`[Broadcast] ❌ Fallback via disco também falhou para ${dest.nome}:`, fallbackErr.message);
        }
      }

      if (!enviadoComSucesso) {
        falhas++;
      }
    }

    // Intervalo de segurança (delay) entre envios para evitar bloqueios do WhatsApp
    if (i < listaAlvo.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.log(`[Broadcast] Transmissão finalizada. Enviados: ${enviados} | Falhas: ${falhas} | Total: ${total}`);
  return { total, enviados, falhas, modoTeste, destinatariosEnviados };
}

module.exports = {
  BROADCAST_CONFIG,
  formatarJidWhatsApp,
  mascararTelefone,
  buscarDestinatariosBroadcast,
  executarBroadcast,
};
