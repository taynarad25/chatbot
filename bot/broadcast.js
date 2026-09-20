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
  const limpo = String(telefone).replace(/\D/g, "");
  if (!limpo) return "";
  return limpo.endsWith("@c.us") ? limpo : `${limpo}@c.us`;
}

function mascararTelefone(jidOuTel) {
  const limpo = String(jidOuTel || "").replace(/\D/g, "");
  if (limpo.length < 8) return limpo;
  return `${limpo.slice(0, 4)}*****${limpo.slice(-4)}`;
}

/**
 * Busca destinatários do broadcast no banco de dados SQLite (tabela 'lideres')
 * ou via listLideres (caso injetado).
 * - Em modo teste: busca exclusivamente Gabriela Diniz por nome.
 * - Em modo geral: busca todos os membros/líderes cadastrados no banco.
 */
function buscarDestinatariosBroadcast({ modoTeste = BROADCAST_CONFIG.modoTeste, listLideres = null } = {}) {
  try {
    let listaInjetada = [];
    if (typeof listLideres === "function") {
      try {
        listaInjetada = listLideres() || [];
      } catch (_) {
        listaInjetada = [];
      }
    }

    if (modoTeste) {
      const termo = BROADCAST_CONFIG.nomeTeste.toLowerCase();

      // 1. Tenta encontrar na lista injetada primeiro
      if (listaInjetada.length > 0) {
        let matches = listaInjetada.filter((u) => (u.nome || "").toLowerCase().trim() === termo);
        if (matches.length === 0) {
          matches = listaInjetada.filter((u) => (u.nome || "").toLowerCase().includes(termo));
        }
        if (matches.length === 0) {
          matches = listaInjetada.filter((u) => (u.nome || "").toLowerCase().includes("gabriela"));
        }
        if (matches.length > 0) {
          return matches.map((r) => ({
            telefone: r.telefone,
            nome: r.nome || BROADCAST_CONFIG.nomeTeste,
          }));
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
        return rows.map((r) => ({
          telefone: r.telefone,
          nome: r.nome || BROADCAST_CONFIG.nomeTeste,
        }));
      }

      // Se não encontrada no banco, verifica se há número configurado em env var de fallback
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

    // Modo Geral: se houver lista injetada com membros
    if (listaInjetada.length > 0) {
      return listaInjetada
        .filter((u) => u.telefone)
        .map((r) => ({
          telefone: r.telefone,
          nome: r.nome || "Membro",
        }));
    }

    // Retorna todos os membros/usuários cadastrados com telefone no SQLite
    const todos = db.prepare("SELECT telefone, nome FROM lideres WHERE telefone IS NOT NULL AND telefone != ''").all();
    return todos.map((r) => ({
      telefone: r.telefone,
      nome: r.nome || "Membro",
    }));
  } catch (err) {
    console.error("[Broadcast] Erro ao consultar destinatários no banco:", err.message);
    return [];
  }
}

/**
 * Executa o envio de transmissão (broadcast) para a lista de destinatários
 * com intervalo de segurança (delay) entre cada mensagem.
 */
async function executarBroadcast({
  client,
  media = null,
  texto = "",
  delayMs = BROADCAST_CONFIG.delayMs,
  modoTeste = BROADCAST_CONFIG.modoTeste,
  destinatarios = null,
  listLideres = null,
} = {}) {
  const listaAlvo = destinatarios || buscarDestinatariosBroadcast({ modoTeste, listLideres });
  const total = listaAlvo.length;

  if (total === 0) {
    console.warn("[Broadcast] Nenhum destinatário encontrado para o envio.");
    return { total: 0, enviados: 0, falhas: 0, modoTeste, destinatariosEnviados: [] };
  }

  console.log(
    `[Broadcast] Iniciando transmissão de ${total} mensagem(ns) (Modo Teste: ${modoTeste ? "SIM (exclusivo para " + BROADCAST_CONFIG.nomeTeste + ")" : "NÃO (todos os membros)"}, Intervalo: ${delayMs}ms)...`
  );

  let enviados = 0;
  let falhas = 0;
  const destinatariosEnviados = [];

  // Instancia MessageMedia se vier como objeto serializado simples
  let mediaObj = media;
  if (media && MessageMedia && !(media instanceof MessageMedia) && media.data && media.mimetype) {
    try {
      mediaObj = new MessageMedia(media.mimetype, media.data, media.filename);
    } catch (_) {
      mediaObj = media;
    }
  }

  for (let i = 0; i < listaAlvo.length; i++) {
    const dest = listaAlvo[i];
    const jid = formatarJidWhatsApp(dest.telefone);

    if (!jid || jid.includes("@g.us")) {
      console.warn(`[Broadcast] Destinatário ignorado (JID inválido ou grupo): ${dest.telefone}`);
      continue;
    }

    let enviadoComSucesso = false;
    try {
      if (mediaObj && client && typeof client.sendMessage === "function") {
        const options = texto ? { caption: texto } : {};
        console.log(`[Broadcast] (${i + 1}/${total}) Enviando mídia (${mediaObj.mimetype || "sem mimetype"}) para ${dest.nome} (${mascararTelefone(dest.telefone)})...`);
        await enviarMensagemResiliente(client, jid, mediaObj, options, { jid });
      } else if (texto && client && typeof client.sendMessage === "function") {
        console.log(`[Broadcast] (${i + 1}/${total}) Enviando texto para ${dest.nome} (${mascararTelefone(dest.telefone)})...`);
        await enviarMensagemResiliente(client, jid, texto, {}, { jid });
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
          await enviarMensagemResiliente(client, jid, mediaDoDisco, texto ? { caption: texto } : {}, { jid });
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
