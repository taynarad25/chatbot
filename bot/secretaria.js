const db = require("../db");

const NOME_GRUPO_SECRETARIA = "Mensagens Secretaria";
const NOME_GRUPO_PASTORAL = "Atendimento Pastoral";

// client.getChats() (que lista TODOS os chats de uma vez) provou ser não-confiável em
// produção — falha de forma consistente com um erro opaco ("r: r") vindo de dentro da
// página do WhatsApp Web, independente da versão do whatsapp-web.js. client.getChatById()
// (que busca só UM chat) é bem mais robusto. Essas variáveis de ambiente são uma segunda
// fonte do JID, gravada no .env, que sobrevive a qualquer problema no banco — garantindo
// que getChatById() sempre tenha a chance de funcionar antes de cair no getChats() frágil.
function jidPorEnv(nome) {
  const chave = nome.trim().toLowerCase();
  if (chave === NOME_GRUPO_SECRETARIA.trim().toLowerCase()) return process.env.GRUPO_JID_SECRETARIA || null;
  if (chave === NOME_GRUPO_PASTORAL.trim().toLowerCase()) return process.env.GRUPO_JID_PASTORAL || null;
  return null;
}

function extrairCodigoConvite(codigoOuLink) {
  if (!codigoOuLink) return null;
  const match = codigoOuLink.match(/(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([a-zA-Z0-9\-]{20,26})/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9\-]{20,26}$/.test(codigoOuLink)) {
    return codigoOuLink;
  }
  return null;
}

// A chave sempre normalizada (minúsculo/sem espaços nas bordas) evita o bug que já
// aconteceu em produção com o arquivo grupo_ids.json antigo: uma edição manual com
// o nome "de exibição" capitalizado nunca batia com a chave usada pelo código. Como
// agora a escrita só acontece por aqui (não tem mais arquivo pra editar à mão), essa
// classe inteira de bug deixa de existir.
function atualizarCacheGrupo(nome, jid) {
  try {
    const chave = nome.trim().toLowerCase();
    const atual = db.prepare("SELECT jid FROM grupo_ids WHERE nome = ?").get(chave);
    if (atual && atual.jid === jid) return;

    db.prepare(`
      INSERT INTO grupo_ids (nome, jid) VALUES (?, ?)
      ON CONFLICT(nome) DO UPDATE SET jid = excluded.jid
    `).run(chave, jid);
    console.log(`[Secretaria] JID do grupo '${nome}' salvo no cache: ${jid}`);
  } catch (err) {
    console.error("[ALERTA:secretaria] Erro ao salvar cache de grupos:", err.message);
  }
}

function lerCacheGrupo(nome) {
  try {
    const chave = nome.trim().toLowerCase();
    const row = db.prepare("SELECT jid FROM grupo_ids WHERE nome = ?").get(chave);
    return row ? row.jid : null;
  } catch (err) {
    console.error("[ALERTA:secretaria] Erro ao ler cache de grupos:", err.message);
    return null;
  }
}

function obterJidCached(nome) {
  const doEnv = jidPorEnv(nome);
  const doCache = lerCacheGrupo(nome);

  if (doEnv && doEnv.includes("@")) {
    return doEnv;
  }

  if (doCache && doCache.includes("@")) {
    return doCache;
  }

  return doEnv || doCache;
}

function encontrarGrupoSecretaria(chats) {
  const target = NOME_GRUPO_SECRETARIA.trim().toLowerCase();
  const grupo = chats.find((chat) => chat.isGroup && chat.name && chat.name.trim().toLowerCase().includes(target)) || null;
  if (grupo && grupo.id && grupo.id._serialized) {
    atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, grupo.id._serialized);
  }
  return grupo;
}

function encontrarGrupoPastoral(chats) {
  const target = NOME_GRUPO_PASTORAL.trim().toLowerCase();
  const grupo = chats.find((chat) => chat.isGroup && chat.name && chat.name.trim().toLowerCase().includes(target)) || null;
  if (grupo && grupo.id && grupo.id._serialized) {
    atualizarCacheGrupo(NOME_GRUPO_PASTORAL, grupo.id._serialized);
  }
  return grupo;
}

// Busca os chats, encontra o grupo "Mensagens Secretaria" e envia a mensagem.
// Antes duplicado em 4 lugares no chatbot.js, cada um com pequenas diferenças de
// log já "driftadas" entre si — aqui o comportamento fica único e consistente.
async function notificarSecretaria(client, mensagem) {
  try {
    let cachedJid = obterJidCached(NOME_GRUPO_SECRETARIA);

    if (cachedJid && !cachedJid.includes("@")) {
      const codigoConvite = extrairCodigoConvite(cachedJid);
      if (codigoConvite) {
        console.log(`[Secretaria] Resolvendo convite '${codigoConvite}' para obter o JID do grupo '${NOME_GRUPO_SECRETARIA}'...`);
        try {
          const info = await client.getInviteInfo(codigoConvite);
          const resolvedJid = info && info.id ? (typeof info.id === "object" ? info.id._serialized : info.id) : null;
          if (resolvedJid) {
            console.log(`[Secretaria] JID obtido com sucesso do convite para '${NOME_GRUPO_SECRETARIA}': ${resolvedJid}`);
            atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, resolvedJid);
            cachedJid = resolvedJid;
          }
        } catch (err) {
          console.error(`[ALERTA:secretaria] Erro ao resolver código de convite '${codigoConvite}' para '${NOME_GRUPO_SECRETARIA}':`, err.message);
        }
      }
    }

    if (cachedJid && cachedJid.includes("@")) {
      try {
        await client.sendMessage(cachedJid, mensagem);
        console.log(`[Notificação] Mensagem enviada ao grupo '${NOME_GRUPO_SECRETARIA}' via JID.`);
        return true;
      } catch (err) {
        console.warn(`[Aviso] Falha ao enviar para o grupo 'Mensagens Secretaria' pelo JID cached ${cachedJid}:`, err.message);
      }
    }

    // Fallback lento/legado em caso de falha no JID direto
    try {
      const chats = await client.getChats();
      const grupo = encontrarGrupoSecretaria(chats);
      if (grupo && grupo.id && grupo.id._serialized) {
        await client.sendMessage(grupo.id._serialized, mensagem);
        console.log(`[Notificação] Mensagem enviada ao grupo '${NOME_GRUPO_SECRETARIA}' via fallback de busca.`);
        return true;
      }
    } catch (err) {
      console.warn("[Aviso] Falha ao obter todos os chats via client.getChats() para 'Mensagens Secretaria':", err.message || err);
    }

    console.warn(`[Aviso] Grupo '${NOME_GRUPO_SECRETARIA}' não encontrado para envio da notificação.`);
    return false;
  } catch (error) {
    console.error("[ALERTA:secretaria] Falha ao enviar notificação para o grupo 'Mensagens Secretaria':", error);
    return false;
  }
}

async function notificarPastoral(client, mensagem) {
  try {
    let cachedJid = obterJidCached(NOME_GRUPO_PASTORAL);

    if (cachedJid && !cachedJid.includes("@")) {
      const codigoConvite = extrairCodigoConvite(cachedJid);
      if (codigoConvite) {
        console.log(`[Secretaria] Resolvendo convite '${codigoConvite}' para obter o JID do grupo '${NOME_GRUPO_PASTORAL}'...`);
        try {
          const info = await client.getInviteInfo(codigoConvite);
          const resolvedJid = info && info.id ? (typeof info.id === "object" ? info.id._serialized : info.id) : null;
          if (resolvedJid) {
            console.log(`[Secretaria] JID obtido com sucesso do convite para '${NOME_GRUPO_PASTORAL}': ${resolvedJid}`);
            atualizarCacheGrupo(NOME_GRUPO_PASTORAL, resolvedJid);
            cachedJid = resolvedJid;
          }
        } catch (err) {
          console.error(`[ALERTA:secretaria] Erro ao resolver código de convite '${codigoConvite}' para '${NOME_GRUPO_PASTORAL}':`, err.message);
        }
      }
    }

    if (cachedJid && cachedJid.includes("@")) {
      try {
        await client.sendMessage(cachedJid, mensagem);
        console.log(`[Notificação] Mensagem enviada ao grupo '${NOME_GRUPO_PASTORAL}' via JID.`);
        return true;
      } catch (err) {
        console.warn(`[Aviso] Falha ao enviar para o grupo 'Atendimento Pastoral' pelo JID cached ${cachedJid}:`, err.message);
      }
    }

    // Fallback lento/legado em caso de falha no JID direto
    try {
      const chats = await client.getChats();
      const grupo = encontrarGrupoPastoral(chats);
      if (grupo && grupo.id && grupo.id._serialized) {
        await client.sendMessage(grupo.id._serialized, mensagem);
        console.log(`[Notificação] Mensagem enviada ao grupo '${NOME_GRUPO_PASTORAL}' via fallback de busca.`);
        return true;
      }
    } catch (err) {
      console.warn("[Aviso] Falha ao obter todos os chats via client.getChats() para 'Atendimento Pastoral':", err.message || err);
    }

    console.warn(`[Aviso] Grupo '${NOME_GRUPO_PASTORAL}' não encontrado para envio da notificação.`);
    return false;
  } catch (error) {
    console.error("[ALERTA:secretaria] Falha ao enviar notificação para o grupo 'Atendimento Pastoral':", error);
    return false;
  }
}

module.exports = {
  NOME_GRUPO_SECRETARIA,
  encontrarGrupoSecretaria,
  notificarSecretaria,
  NOME_GRUPO_PASTORAL,
  encontrarGrupoPastoral,
  notificarPastoral,
  atualizarCacheGrupo,
  obterJidCached,
};
