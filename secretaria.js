const NOME_GRUPO_SECRETARIA = "Mensagens Secretaria";

// Parte pura e testável: dado um array de chats já carregado, encontra o grupo.
function encontrarGrupoSecretaria(chats) {
  return chats.find((chat) => chat.isGroup && chat.name === NOME_GRUPO_SECRETARIA) || null;
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
    console.error("[Erro] Falha ao enviar notificação para o grupo:", error);
    return false;
  }
}

module.exports = { NOME_GRUPO_SECRETARIA, encontrarGrupoSecretaria, notificarSecretaria };
