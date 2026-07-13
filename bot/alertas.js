// Envia avisos de falhas operacionais críticas (WhatsApp desconectado, erro ao
// gravar em disco, Google Calendar indisponível, etc.) para um grupo dedicado
// do WhatsApp, separado do grupo "Mensagens Secretaria" (que é só pra pedidos
// de agendamento). Mesmo padrão de bot/secretaria.js.
const NOME_GRUPO_ALERTAS = "Alertas";

// Evita spam quando o mesmo tipo de falha se repete várias vezes seguidas
// (ex: Google Calendar fora do ar por alguns minutos) — no máximo 1 alerta
// por categoria dentro dessa janela.
const JANELA_REPETICAO_MS = 10 * 60 * 1000; // 10 minutos

let ultimoEnvioPorCategoria = {};

function encontrarGrupoAlertas(chats) {
  return chats.find((chat) => chat.isGroup && chat.name === NOME_GRUPO_ALERTAS) || null;
}

// Convenção usada nos console.error() considerados falha operacional crítica:
// o primeiro argumento começa com "[ALERTA:categoria]" (ex: "[ALERTA:google-calendar]
// Erro na agenda X:"). Mensagens de erro comuns (validação, senha errada, etc.)
// não usam essa tag e por isso nunca viram alerta no grupo — só logam normalmente.
const TAG_ALERTA_REGEX = /^\[ALERTA:([a-z0-9-]+)\]\s*/i;

function extrairAlerta(primeiroArg) {
  if (typeof primeiroArg !== "string") return null;
  const match = primeiroArg.match(TAG_ALERTA_REGEX);
  if (!match) return null;
  return { categoria: match[1].toLowerCase(), textoLimpo: primeiroArg.slice(match[0].length) };
}

function podeEnviar(categoria, agora = Date.now(), janelaMs = JANELA_REPETICAO_MS) {
  const ultimo = ultimoEnvioPorCategoria[categoria];
  if (ultimo !== undefined && agora - ultimo < janelaMs) return false;
  ultimoEnvioPorCategoria[categoria] = agora;
  return true;
}

// Só para os testes conseguirem isolar a janela de repetição entre casos.
function resetDeduplicacao() {
  ultimoEnvioPorCategoria = {};
}

async function notificarAlerta(client, categoria, mensagem, { agora, janelaMs } = {}) {
  if (!podeEnviar(categoria, agora, janelaMs)) return false;
  if (!client) return false;

  try {
    const chats = await client.getChats();
    const grupo = encontrarGrupoAlertas(chats);

    if (!grupo) {
      console.warn(`[Aviso] Grupo '${NOME_GRUPO_ALERTAS}' não encontrado para envio de alerta.`);
      return false;
    }

    await grupo.sendMessage(mensagem);
    return true;
  } catch (error) {
    // De propósito console.warn, não console.error: um alerta que falha ao ser
    // enviado não deveria por si só disparar outro alerta.
    console.warn(`[Aviso] Falha ao enviar alerta pro grupo '${NOME_GRUPO_ALERTAS}':`, error.message);
    return false;
  }
}

module.exports = {
  NOME_GRUPO_ALERTAS,
  encontrarGrupoAlertas,
  extrairAlerta,
  notificarAlerta,
  podeEnviar,
  resetDeduplicacao,
};
