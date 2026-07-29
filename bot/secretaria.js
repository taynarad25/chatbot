const NOME_GRUPO_SECRETARIA = "Mensagens Secretaria";
const NOME_GRUPO_PASTORAL = "Atendimento Pastoral";

// Parte pura e testável: dado um array de chats já carregado, encontra o grupo.
function encontrarGrupoSecretaria(chats) {
  return chats.find((chat) => chat.isGroup && chat.name && chat.name.trim().toLowerCase() === NOME_GRUPO_SECRETARIA.trim().toLowerCase()) || null;
}

function encontrarGrupoPastoral(chats) {
  return chats.find((chat) => chat.isGroup && chat.name && chat.name.trim().toLowerCase() === NOME_GRUPO_PASTORAL.trim().toLowerCase()) || null;
}

// Busca os chats, encontra o grupo "Mensagens Secretaria" e envia a mensagem.
// Antes duplicado em 4 lugares no chatbot.js, cada um com pequenas diferenças de
// log já "driftadas" entre si — aqui o comportamento fica único e consistente.
async function notificarSecretaria(client, mensagem) {
  try {
    const chats = await client.getChats();
    const grupo = encontrarGrupoSecretaria(chats);

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
    const chats = await client.getChats();
    const grupo = encontrarGrupoPastoral(chats);

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
};
