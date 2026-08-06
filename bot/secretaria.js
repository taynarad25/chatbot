const fs = require("fs");
const path = require("path");

const NOME_GRUPO_SECRETARIA = "Mensagens Secretaria";
const NOME_GRUPO_PASTORAL = "Atendimento Pastoral";

const CACHE_FILE = process.env.GRUPO_IDS_FILE_PATH || path.join(__dirname, "..", "grupo_ids.json");

// client.getChats() (que lista TODOS os chats de uma vez) provou ser não-confiável em
// produção — falha de forma consistente com um erro opaco ("r: r") vindo de dentro da
// página do WhatsApp Web, independente da versão do whatsapp-web.js. client.getChatById()
// (que busca só UM chat) é bem mais robusto. Só que o arquivo de cache do JID
// (grupo_ids.json) é um bind mount do Docker, e mostrou duas formas de se perder por
// completo (edição manual apagando o conteúdo, bind mount virando diretório vazio). Essas
// variáveis de ambiente são uma segunda fonte do JID, gravada no .env, que sobrevive a
// qualquer problema no arquivo — garantindo que getChatById() sempre tenha a chance de
// funcionar antes de cair no getChats() frágil.
function jidPorEnv(nome) {
  const chave = nome.trim().toLowerCase();
  if (chave === NOME_GRUPO_SECRETARIA.trim().toLowerCase()) return process.env.GRUPO_JID_SECRETARIA || null;
  if (chave === NOME_GRUPO_PASTORAL.trim().toLowerCase()) return process.env.GRUPO_JID_PASTORAL || null;
  return null;
}

// Normaliza as chaves para minúsculo/sem espaços nas bordas ao ler: o arquivo é
// editável manualmente (ex: alguém colando o JID direto, como aconteceu em produção
// com "Atendimento Pastoral"/"Mensagens Secretaria" capitalizados), mas
// atualizarCacheGrupo/obterJidCached sempre operam em minúsculo — sem essa
// normalização, uma chave capitalizada nunca é encontrada e o cache fica sempre
// "vazio" na prática, fazendo o bot cair sempre no fallback lento de getChats().
function lerCacheGrupos() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const data = fs.readFileSync(CACHE_FILE, "utf8");
    const cache = data.trim() ? JSON.parse(data) : {};
    const normalizado = {};
    for (const [chave, valor] of Object.entries(cache)) {
      normalizado[chave.trim().toLowerCase()] = valor;
    }
    return normalizado;
  } catch (err) {
    console.error("[ALERTA:secretaria] Erro ao ler cache de grupos:", err.message);
    return {};
  }
}

function salvarCacheGrupos(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    console.error("[ALERTA:secretaria] Erro ao salvar cache de grupos:", err.message);
  }
}

function atualizarCacheGrupo(nome, jid) {
  const cache = lerCacheGrupos();
  const chave = nome.trim().toLowerCase();
  if (cache[chave] !== jid) {
    cache[chave] = jid;
    salvarCacheGrupos(cache);
    console.log(`[Secretaria] JID do grupo '${nome}' salvo no cache: ${jid}`);
  }
}

function obterJidCached(nome) {
  const doEnv = jidPorEnv(nome);
  if (doEnv) return doEnv;
  const cache = lerCacheGrupos();
  return cache[nome.trim().toLowerCase()] || null;
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
