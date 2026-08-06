const db = require("../db");

const NOME_GRUPO_SECRETARIA = "Mensagens Secretaria";
const NOME_GRUPO_PASTORAL = "Atendimento Pastoral";

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

function obterJidCached(nome) {
  try {
    const chave = nome.trim().toLowerCase();
    const row = db.prepare("SELECT jid FROM grupo_ids WHERE nome = ?").get(chave);
    return row ? row.jid : null;
  } catch (err) {
    console.error("[ALERTA:secretaria] Erro ao ler cache de grupos:", err.message);
    return null;
  }
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
    let grupo = null;
    const cachedJid = obterJidCached(NOME_GRUPO_SECRETARIA);

    if (cachedJid) {
      try {
        grupo = await client.getChatById(cachedJid);
      } catch (err) {
        console.warn(`[Aviso] Falha ao carregar grupo 'Mensagens Secretaria' pelo JID cached ${cachedJid}:`, err.message);
      }
    }

    if (!grupo) {
      const chats = await client.getChats();
      grupo = encontrarGrupoSecretaria(chats);
    }

    if (!grupo) {
      console.warn(`[Aviso] Grupo '${NOME_GRUPO_SECRETARIA}' não encontrado para envio da notificação.`);
      return false;
    }

    await grupo.sendMessage(mensagem);
    console.log(`[Notificação] Mensagem enviada ao grupo '${NOME_GRUPO_SECRETARIA}'.`);
    return true;
  } catch (error) {
    console.error("[ALERTA:secretaria] Falha ao enviar notificação para o grupo 'Mensagens Secretaria':", error);
    return false;
  }
}

async function notificarPastoral(client, mensagem) {
  try {
    let grupo = null;
    const cachedJid = obterJidCached(NOME_GRUPO_PASTORAL);

    if (cachedJid) {
      try {
        grupo = await client.getChatById(cachedJid);
      } catch (err) {
        console.warn(`[Aviso] Falha ao carregar grupo 'Atendimento Pastoral' pelo JID cached ${cachedJid}:`, err.message);
      }
    }

    if (!grupo) {
      const chats = await client.getChats();
      grupo = encontrarGrupoPastoral(chats);
    }

    if (!grupo) {
      console.warn(`[Aviso] Grupo '${NOME_GRUPO_PASTORAL}' não encontrado para envio da notificação.`);
      return false;
    }

    await grupo.sendMessage(mensagem);
    console.log(`[Notificação] Mensagem enviada ao grupo '${NOME_GRUPO_PASTORAL}'.`);
    return true;
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
