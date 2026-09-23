// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

// =====================================
// IMPORTAÇÕES E CONFIGURAÇÕES GLOBAIS
// =====================================
const fs = require('fs');
const path = require('path');
const qrcode = require("qrcode");
const util = require('util');
const { execSync } = require('child_process');
const { Client, LocalAuth } = require("whatsapp-web.js");
const moment = require("moment-timezone");
const { google } = require("googleapis");
const { createMessageHandler } = require("./messageHandler");
const { telefonesLideres, loadLideres, listLideres } = require("../web/lideres");
const { notificarAlerta, extrairAlerta } = require("./alertas");
const { garantirDiretorioTemp, limparMidiasAntigas } = require("./mediaStorage");
const { aplicarResilienciaClient, injetarPatchesCompatibilidade } = require("./senderResiliente");
const db = require("../db");

// Raiz do projeto (um nível acima de bot/). Login, credenciais, log combinado,
// estado persistido e a sessão do WhatsApp (.wwebjs_auth) sempre viveram na
// raiz — o docker-compose.bot.yml monta os volumes nesses caminhos exatos —
// então essa referência precisa ficar explícita para não depender de onde
// dentro do projeto o processo Node foi iniciado.
const ROOT_DIR = path.join(__dirname, "..");

// =====================================
// CONFIGURAÇÃO DE LOGS (TIMESTAMP UTC-3)
// =====================================
const getTimestamp = () => `[${moment().tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm:ss")}]`;
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// Configura a escrita manual em arquivo para substituir a funcionalidade do PM2
const logFile = path.join(ROOT_DIR, 'combined.log');
let logStream = null;

try {
  // Verifica se o caminho existe e se é um diretório para evitar erro EISDIR (comum em mounts Docker)
  if (fs.existsSync(logFile) && fs.lstatSync(logFile).isDirectory()) {
    originalError(`${getTimestamp()} [Critical] '${logFile}' é um diretório. O log em arquivo será desativado.`);
  } else {
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
    logStream.on('error', (err) => {
      originalError(`${getTimestamp()} [LogStream Error] ${err.message}`);
      logStream = null; // Desativa a escrita se houver erro no stream
    });
  }
} catch (err) {
  originalError(`${getTimestamp()} [LogStream Init Error] ${err.message}`);
}

const logger = (originalFn, ...args) => {
  const msg = `${getTimestamp()} ${util.format(...args)}`;
  originalFn(msg); // Envia para o stdout/stderr (importante para o comando 'docker logs')
  // Escreve no arquivo e lida com possíveis erros de stream
  if (logStream && logStream.writable) {
    logStream.write(msg + '\n', 'utf8');
  }
};

console.log = (...args) => logger(originalLog, ...args);
console.error = (...args) => {
  logger(originalError, ...args);

  // Convenção "[ALERTA:categoria] ..." (veja bot/alertas.js) marca esse
  // console.error como falha operacional crítica — some dispara um aviso pro
  // grupo "Alertas" do WhatsApp, separado do log normal. `client` é lido no
  // momento da chamada (não na definição desse override), então já reflete a
  // conexão em andamento mesmo sendo atribuído mais abaixo neste arquivo.
  const alerta = extrairAlerta(args[0]);
  if (alerta) {
    const detalhes = args.slice(1)
      .map((a) => (a instanceof Error ? (a.stack || a.message) : util.format(a)))
      .filter(Boolean)
      .join("\n");
    const mensagem = `🚨 *Alerta do Bot*\n\n${alerta.textoLimpo}${detalhes ? `\n${detalhes}` : ""}\n\n${getTimestamp()}`;
    notificarAlerta(client, alerta.categoria, mensagem).catch(() => { });
  }
};
console.warn = (...args) => logger(originalWarn, ...args);

// Captura de erros que fariam o processo morrer sem logar
process.on('unhandledRejection', (reason, promise) => {
  const isTargetClose =
    reason?.name === 'TargetCloseError' ||
    (typeof reason?.message === 'string' && (
      reason.message.includes('Target closed') ||
      reason.message.includes('Session closed') ||
      reason.message.includes('Protocol error') ||
      reason.message.includes('Execution context was destroyed')
    ));

  if (isTargetClose) {
    console.warn('[Puppeteer] Sessão do navegador finalizada durante operação assíncrona.');
    return;
  }

  console.error('[ALERTA:fatal] Rejeição de promessa não tratada em:', promise, 'motivo:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[ALERTA:fatal] Exceção não capturada:', err);
  // Dá um tempo para o log gravar antes de sair
  setTimeout(() => process.exit(1), 500);
});

// Importamos o web.js APÓS configurar o logger global para capturar seus logs iniciais
const { startWebServer } = require("../web");

// Lista de IDs das Agendas do Google atualizada para resolver erros de credenciais
const agendasParaLer = [
  "694d1388f8f961bdbefed402fab5d498b44e0a489ec5fbcb3a40a5d1c3eda011@group.calendar.google.com", // Evangelismo
  "692b7e0551c4113b02838eadaf1d60873587a956000b7b1932c4575c3a00ddd2@group.calendar.google.com", // Epifania
  "f4625f5738f62b443b1f6279b5f124b37dffec23b9a56e3bb0dff064dc30e057@group.calendar.google.com", // Intercessão
  "9f1ee711c5b270aed77f50597c3fbdcf7bd33775707f4def5c82cc3794810ca4@group.calendar.google.com", // Outros
  "2ebaead80554da51744895e38dc117c3b43e0982e95d75ef64193702f9811bbd@group.calendar.google.com", // Projeto Social Seeds
  "3839992a12d4695f87a19e9cfa3257f9ca60fab24e96549160e94c8603862b45@group.calendar.google.com", // Rede Ruach
  "8eae57daa28963736c7ab1c343e2d8e973b4c5caecf78caa8f38255662aa9f17@group.calendar.google.com", // Rede de Casais
  "384215b0335082cfde0c5f5f98b75ca59612a77a5123544f15bd41dd60d238d4@group.calendar.google.com", // Rede de Homens
  "b02048ebc98f7504e086cf4b2a54881a4e645189b565c90b5f7c477a4d0de10f@group.calendar.google.com", // Rede de Mulheres
  "b0aae19433652d50d04ae2290889cf7f905cc226ae103eb839ff3ca511acd6af@group.calendar.google.com", // Rede Kids
  "18e7b84e62b7f4155bb98458b8c750099b937bed118a572d51d9a21b87aaaa3e@group.calendar.google.com", // Eventos Externos
  "b8f01bfd149139d388080ec63176c2556e6e1aedce184b84d37671c3d082d238@group.calendar.google.com", // Reuniões
  "0a55126694643f39944faf173fe3acd127b2a52074c6ecc9e9ed4dc23edf8b57@group.calendar.google.com", // Atendimento
  "7975950de545f60f585bc041682c6564ce4c29d0ef7e06cdeffa21ffc0ffd572@group.calendar.google.com", // Limpeza
  "fc012c51d15e9b272d4f955f504df24d816277da10194302f0ac1f04ae997e81@group.calendar.google.com", // Ensaios
  "49b999ac91607d07310d7e36a26fe088ddc3cd2b34ff741a0e139b43a18bdabc@group.calendar.google.com", // Uso do Salão
  "ca137e32f53409b1bd297929b9a2afd663eaf7df370e4c0aea6442c6a68a7946@group.calendar.google.com", // Departamento de Artes
];

console.log(`[Config] ${agendasParaLer.length} agenda(s) configurada(s) para leitura.`);

// A lista de líderes agora é gerenciada pelo painel web (aba "Líderes") e
// persistida no banco (tabela "lideres"). `telefonesLideres` é a mesma referência de array
// usada pelo módulo web/lideres.js, então uma edição feita no painel já reflete
// aqui sem precisar reiniciar o bot.
loadLideres();
const lideres = telefonesLideres;
if (lideres.length > 0) {
  console.log(`[Config] ${lideres.length} número(s) de líder(es) carregado(s).`);
}

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(ROOT_DIR, "credenciais-google.json"),
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({
  version: "v3",
  auth: auth,
});

// Funções auxiliares
async function buscarEventos(inicio, fim, agendaId = null) {
  let todosEventos = [];
  const agendas = agendaId ? [agendaId] : agendasParaLer;
  console.log(`[Google Calendar] Buscando eventos em ${agendas.length} agenda(s) entre ${inicio} e ${fim}`);

  for (const id of agendas) {
    try {
      let pageToken;
      do {
        const res = await calendar.events.list({
          calendarId: id,
          timeMin: inicio,
          timeMax: fim,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 2500,
          pageToken,
        });
        if (res.data.items) {
          // Anexa o calendarId a cada evento para permitir filtragem posterior
          const eventsWithCalendarId = res.data.items.map(item => ({ ...item, calendarId: id }));
          todosEventos = todosEventos.concat(eventsWithCalendarId);
        }
        // Segue paginando enquanto o Google indicar que há mais resultados
        // (agendas com mais de 2500 eventos no período não ficavam truncadas)
        pageToken = res.data.nextPageToken;
      } while (pageToken);
    } catch (e) {
      console.error(`[ALERTA:google-calendar] Erro na agenda ${id}:`, e.response?.data || e.message);
    }
  }
  return todosEventos.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
}

const etapas = {};

let client;
let clientReady = false;
let clientAuthenticated = false;
let loadingPercent = 0;
let loadingMessage = "";
let isInitializing = false;
let pendingQr = null;
let clientId = "bot";
let isGeneratingQr = false;
let isCanceling = false;

function limparTravasChromium(id = clientId) {
  const sessionDir = path.join(ROOT_DIR, ".wwebjs_auth", `session-${id}`);
  const profileDir = path.join(sessionDir, "Default");
  const locks = ["SingletonLock", "SingletonCookie", "SingletonSocket"];

  [sessionDir, profileDir].forEach(dir => {
    try {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        if (locks.some(lock => file.includes(lock))) {
          const lockPath = path.join(dir, file);
          try {
            fs.unlinkSync(lockPath);
            console.log(`[Browser] 🔓 Trava residual removida: ${lockPath}`);
          } catch (e) {}
        }
      });
    } catch (err) {}
  });
}

function limparSessaoResidual(id = clientId) {
  const sessionDir = path.join(ROOT_DIR, ".wwebjs_auth", `session-${id}`);
  try {
    if (fs.existsSync(sessionDir)) {
      console.log(`[Browser] 🧹 Limpando dados da sessão residual em ${sessionDir}...`);
      fs.rmSync(sessionDir, { recursive: true, force: true, maxRetries: 5 });
      console.log(`[Browser] ✨ Sessão residual limpa com sucesso.`);
    }
  } catch (err) {
    console.warn(`[Browser] Aviso ao limpar sessão residual: ${err.message}`);
  }
}

function criarClient() {
  // Garante que a pasta temporária de mídias existe e tem permissão de escrita
  garantirDiretorioTemp();
  limparMidiasAntigas();

  const puppeteerOpts = {
    headless: true,
    timeout: 120000, // Aumenta o tempo limite de inicialização para 2 minutos
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection',
      '--memory-pressure-off',
      '--disable-features=CalculateNativeWinOcclusion,InterestFeedContentSuggestions,BlinkLifecycleScriptForbidden',
    ]
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  } else if (fs.existsSync('/usr/bin/chromium')) {
    puppeteerOpts.executablePath = '/usr/bin/chromium';
  }

  // Define User-Agent condizente com o sistema operacional para evitar bloqueio por spoofing inconsistente
  const defaultUserAgent = process.platform === 'win32'
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  const clientOptions = {
    authStrategy: new LocalAuth({ clientId, dataPath: path.join(ROOT_DIR, ".wwebjs_auth") }),
    authTimeoutMs: 0, // Desativa timeout de autenticação rígido para evitar cancelamento prematuro na sincronização
    puppeteer: puppeteerOpts,
    userAgent: process.env.WHATSAPP_USER_AGENT || defaultUserAgent,
  };

  // Suporte a cache de versão do WhatsApp Web para máxima estabilidade
  const defaultRemotePath = 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html';
  if (process.env.WWEB_VERSION_REMOTE_PATH) {
    clientOptions.webVersionCache = {
      type: 'remote',
      remotePath: process.env.WWEB_VERSION_REMOTE_PATH,
      strict: false,
    };
    console.log(`[Config] webVersionCache remoto customizado configurado: ${process.env.WWEB_VERSION_REMOTE_PATH}`);
  } else if (process.env.WWEB_CACHE_TYPE === 'local' || process.env.WWEB_VERSION) {
    clientOptions.webVersionCache = {
      type: 'local',
      path: path.join(ROOT_DIR, '.wwebjs_cache'),
    };
    console.log(`[Config] webVersionCache local configurado em .wwebjs_cache`);
  } else {
    clientOptions.webVersionCache = {
      type: 'remote',
      remotePath: defaultRemotePath,
      strict: false,
    };
    console.log(`[Config] webVersionCache remoto configurado com versão homologada da comunidade.`);
  }

  client = new Client(clientOptions);
  aplicarResilienciaClient(client);

  client.on("qr", async (qr) => {
    console.log("✅ QR Code gerado com sucesso.");
    clientAuthenticated = false;
    loadingPercent = 0;
    try {
      const dataUrl = await qrcode.toDataURL(qr);
      pendingQr = { qr, dataUrl, createdAt: new Date().toISOString() };
    } catch (err) {
      console.error("Erro ao gerar QR Code em data URL:", err);
      pendingQr = { qr, dataUrl: null, createdAt: new Date().toISOString() };
    }
  });

  client.on("authenticated", () => {
    clientAuthenticated = true;
    pendingQr = null; // Remove o QR Code da tela imediatamente após a leitura
    isGeneratingQr = false;
    console.log("✅ Autenticado no WhatsApp com sucesso! Sincronizando dados e conversas...");
  });

  client.on("loading_screen", (percent, message) => {
    loadingPercent = percent;
    loadingMessage = message || "WhatsApp";
    console.log(`[WhatsApp] ⏳ Sincronizando dados: ${percent}% (${message || 'Carregando'})`);
  });

  client.on("change_state", (state) => {
    console.log(`[WhatsApp] 📶 Estado da sessão alterado para: ${state}`);
  });

  client.on("ready", async () => {
    clientReady = true;
    clientAuthenticated = true;
    pendingQr = null;
    isGeneratingQr = false;
    loadingPercent = 100;
    saveBotState(true); // Salva como ativo apenas quando a conexão é confirmada
    console.log("✅ Bot conectado e pronto para uso!");

    try {
      const waVersion = await client.getWWebVersion();
      console.log(`[WhatsApp] Versão do WhatsApp Web ativa no navegador: ${waVersion}`);
    } catch (errVer) {
      console.warn(`[WhatsApp] Não foi possível consultar a versão do WhatsApp Web: ${errVer.message}`);
    }

    // Injeta patch de compatibilidade para serialização de IDs no WhatsApp Web (formato 2.3000.x e $1)
    try {
      if (client.pupPage && !client.pupPage.isClosed?.()) {
        await client.pupPage.evaluate(() => {
          if (window.WWebJS && window.WWebJS.getMessageModel && !window.WWebJS._patchedIdSerialization) {
            const originalGetModel = window.WWebJS.getMessageModel;
            window.WWebJS.getMessageModel = function (message) {
              const res = originalGetModel(message);
              if (res && res.id) {
                if (!res.id._serialized) {
                  res.id._serialized = res.id.$1 || (res.id.remote && res.id.id ? `${res.id.fromMe ? 'true' : 'false'}_${res.id.remote?._serialized || res.id.remote}_${res.id.id}` : null);
                }
              }
              return res;
            };
            window.WWebJS._patchedIdSerialization = true;
          }
        });
        await injetarPatchesCompatibilidade(client.pupPage);
        console.log("[WhatsApp] 🛡️ Patches de serialização e resiliência de mensagens injetados no navegador.");
      }
    } catch (errPatch) {
      console.warn(`[WhatsApp] Aviso ao aplicar patch de IDs no navegador: ${errPatch.message}`);
    }

    try {
      const inviteSec = "KsHKE5q5BiI81KvJ1ARdUp";
      const invitePas = "I2AxSM7v9CI211RGWJBX2Y";
      const inviteMul = "D7exjarQTrcGSAjzCvM5QV";
      
      console.log('=============== RESOLVENDO GRUPOS POR CONVITE ===============');
      try {
        const info = await client.getInviteInfo(inviteSec);
        const jid = info && info.id ? (typeof info.id === "object" ? info.id._serialized : info.id) : null;
        console.log(`NOME: "Mensagens Secretaria"  --->  JID RESOLVIDO: "${jid}"`);
        if (jid) {
          const { atualizarCacheGrupo } = require("./secretaria");
          atualizarCacheGrupo("Mensagens Secretaria", jid);
        }
      } catch (err) {
        console.error("Erro ao resolver convite Secretaria:", err.message);
      }
      
      try {
        const info = await client.getInviteInfo(invitePas);
        const jid = info && info.id ? (typeof info.id === "object" ? info.id._serialized : info.id) : null;
        console.log(`NOME: "Atendimento Pastoral"  --->  JID RESOLVIDO: "${jid}"`);
        if (jid) {
          const { atualizarCacheGrupo } = require("./secretaria");
          atualizarCacheGrupo("Atendimento Pastoral", jid);
        }
      } catch (err) {
        console.error("Erro ao resolver convite Pastoral:", err.message);
      }

      try {
        const info = await client.getInviteInfo(inviteMul);
        const jid = info && info.id ? (typeof info.id === "object" ? info.id._serialized : info.id) : null;
        console.log(`NOME: "MULTIMÍDIAS"  --->  JID RESOLVIDO: "${jid}"`);
        if (jid) {
          const { atualizarCacheGrupo } = require("./secretaria");
          atualizarCacheGrupo("MULTIMÍDIAS", jid);
        }
      } catch (err) {
        console.error("Erro ao resolver convite MULTIMÍDIAS:", err.message);
      }
      console.log('=============================================================');
    } catch (err) {
      console.error('Erro na rotina de resolução de grupos:', err);
    }

    // Inicia agendador automático de lembretes para os líderes (5 dias antes)
    try {
      const { iniciarAgendadorLembretes } = require("./lembretes");
      iniciarAgendadorLembretes({
        client,
        buscarEventos,
        agendasParaLer,
        horaExecucao: 9,
      });
      console.log("[Lembretes] Agendador de lembretes de eventos iniciado.");
    } catch (errLembrete) {
      console.error("[Lembretes] Erro ao iniciar agendador de lembretes:", errLembrete.message);
    }
  });

  // Heartbeat periódico unref'd para manter o contexto do Puppeteer ativo contra idle discard do navegador
  setInterval(async () => {
    if (client && clientReady && client.pupPage) {
      try {
        if (typeof client.pupPage.isClosed !== "function" || !client.pupPage.isClosed()) {
          await client.pupPage.evaluate(() => typeof window !== "undefined" && Boolean(window.WWebJS));
        }
      } catch (_) {}
    }
  }, 3 * 60 * 1000).unref();

  client.on("auth_failure", (msg) => {
    console.error("Falha na autenticação:", msg);
    clientReady = false;
    clientAuthenticated = false;
    loadingPercent = 0;
    pendingQr = null;
    isGeneratingQr = false;
    isInitializing = false;
    saveBotState(false); // Se a sessão no cache falhou, paramos o bot para evitar loops
  });

  client.on("disconnected", async (reason) => {
    clientReady = false;
    clientAuthenticated = false;
    loadingPercent = 0;
    pendingQr = null;
    isGeneratingQr = false;
    isInitializing = false;
    saveBotState(false); // Salva como inativo ao desconectar
    console.warn(`[WhatsApp] Cliente desconectado. Motivo: ${reason}`);

    const oldClient = client;
    client = null;
    if (oldClient) {
      try {
        await oldClient.destroy();
      } catch (errDestroy) {}
    }

    if (reason === "LOGOUT") {
      limparSessaoResidual(clientId);
    }
  });

  const handleMessage = createMessageHandler({
    client,
    calendar,
    agendasParaLer,
    lideres,
    etapas,
    buscarEventos,
    listLideres,
  });
  client.on("message", handleMessage);
}

// PERSISTÊNCIA DE ESTADO (ATIVO/PARADO)
// =====================================
const saveBotState = (active) => {
  try {
    db.prepare(`
      INSERT INTO bot_state (id, active) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET active = excluded.active
    `).run(active ? 1 : 0);
  } catch (err) {
    console.error(`[ALERTA:persistencia] Falha ao salvar estado do bot: ${err.message}`);
  }
};

const loadBotState = () => {
  // Sem estado salvo (primeira instalação) ou erro de leitura: assume que deve tentar
  // conectar, igual ao comportamento histórico. Só fica "false" quando alguém realmente
  // pediu para desconectar (ver disconnectClient).
  try {
    const row = db.prepare("SELECT active FROM bot_state WHERE id = 1").get();
    return row ? { active: !!row.active } : { active: true };
  } catch (e) {
    return { active: true };
  }
};

async function startClient(options = {}) {
  if (clientReady || isInitializing) return;
  console.log("🚀 Iniciando processo de inicialização do cliente...");
  console.time("client_init");

  // Se já havia uma referência ativa de client desconectada ou quebrada, destrói antes
  if (client) {
    try {
      console.log("[Browser] Encerrando cliente anterior antes de reiniciar...");
      await client.destroy();
    } catch (e) {}
    client = null;
  }

  // Força o encerramento de processos zumbis do Chromium antes de iniciar.
  // Caminho absoluto (não "pkill" solto) para não depender da resolução via
  // PATH — é onde o pacote "procps" instala o binário na imagem node:20-slim
  // usada pelo Dockerfile.
  try {
    console.log("[Browser] Limpando processos antigos do Chromium...");
    execSync("/usr/bin/pkill -9 -f chromium", { stdio: 'ignore' });
  } catch (e) {
    // Silencia o erro se o pkill não encontrar nada (ou não existir nesse caminho, fora do Docker)
  }

  // Remove o arquivo SingletonLock do Chromium se ele existir. 
  // Isso previne o erro "Code 21" (Profile in use) comum em ambientes Docker/PM2.
  limparTravasChromium(clientId);

  if (options.forceClean) {
    limparSessaoResidual(clientId);
  }

  isInitializing = true;
  isGeneratingQr = true;
  pendingQr = null;
  criarClient();
  try {
    console.log("[WhatsApp] Tentando inicializar o cliente Puppeteer...");
    await client.initialize();
    console.timeEnd("client_init");
    return;
  } catch (err) {
    console.timeEnd("client_init");
    const message = err?.message || "";
    if (message.includes("already running") || message.includes("Use a different `userDataDir`") || message.includes("already in use") || message.includes("Code: 21")) {
      console.warn("⚠️ Sessão do Chrome bloqueada. O PM2 reiniciará o processo para tentar liberar o lock.");
      try {
        if (client) await client.destroy();
      } catch (destroyErr) {
        console.warn("❌ Falha ao destruir o cliente antigo:", destroyErr?.message || destroyErr);
      }
      isInitializing = false;
      process.exit(1); // Força o PM2 a reiniciar o bot do zero
    } else {
      console.error("❌ Erro ao iniciar o WhatsApp:", err);
      await cancelQr();
    }
  } finally {
    isInitializing = false;
  }
}

async function cancelQr() {
  isCanceling = true;
  try {
    console.log("⏹️ Solicitando cancelamento da geração do QR Code...");
    if (client && !clientReady) {
      try {
        await client.destroy();
      } catch (err) {
        console.warn("⚠️ Erro ao destruir cliente no cancelamento:", err);
      }
    }
    client = null;
    saveBotState(false); // Salva que o bot DEVE estar parado
    clientReady = false;
    clientAuthenticated = false;
    loadingPercent = 0;
    loadingMessage = "";
    isInitializing = false;
    isGeneratingQr = false;
    pendingQr = null;
    console.log("✅ Solicitação de QR Code cancelada com sucesso.");
  } finally {
    isCanceling = false;
  }
}

/**
 * Desconecta o cliente.
 * @param {boolean} shouldLogout - Se true, realiza logout (despareia o celular). Se false, apenas fecha o navegador.
 */
async function disconnectClient(shouldLogout = true) {
  const action = shouldLogout ? "logout (desparear)" : "fechamento (manter sessão)";
  console.log(`🔌 Iniciando processo de desconexão: ${action}...`);

  const currentClient = client;
  client = null;
  clientReady = false;
  clientAuthenticated = false;
  loadingPercent = 0;
  loadingMessage = "";
  isInitializing = false;
  isGeneratingQr = false;
  pendingQr = null;

  if (shouldLogout) {
    saveBotState(false);
  }

  if (!currentClient) {
    console.warn("⚠️ Tentativa de desconexão ignorada: Nenhum cliente ativo.");
    if (shouldLogout) {
      limparSessaoResidual(clientId);
    }
    return { ok: true, message: "Nenhum cliente ativo estava rodando. Sessão limpa com sucesso." };
  }

  try {
    if (shouldLogout && typeof currentClient.logout === "function") {
      try {
        await currentClient.logout();
      } catch (errLogout) {
        console.warn("⚠️ Erro ao executar logout do cliente:", errLogout.message);
      }
    }
    if (typeof currentClient.destroy === "function") {
      try {
        await currentClient.destroy();
      } catch (errDestroy) {
        console.warn("⚠️ Erro ao destruir cliente:", errDestroy.message);
      }
    }
    if (shouldLogout) {
      limparSessaoResidual(clientId);
    }
    console.log(`✅ WhatsApp desconectado via ${action}.`);
    return { ok: true, message: "WhatsApp desconectado com sucesso." };
  } catch (err) {
    console.error("❌ Erro ao desconectar WhatsApp:", err);
    if (shouldLogout) {
      limparSessaoResidual(clientId);
    }
    return { ok: true, message: "WhatsApp desconectado (com aviso de erro no processo)." };
  } finally {
    client = null;
    clientReady = false;
    clientAuthenticated = false;
    loadingPercent = 0;
    loadingMessage = "";
    isInitializing = false;
    isGeneratingQr = false;
    pendingQr = null;
  }
}

function getStatus() {
  return {
    connected: clientReady,
    authenticated: clientAuthenticated,
    loadingPercent,
    loadingMessage,
    initializing: isInitializing,
    generatingQr: isGeneratingQr,
    canceling: isCanceling,
    hasQr: !!pendingQr && !clientAuthenticated,
    qrDataUrl: pendingQr?.dataUrl || null,
    qrCreatedAt: pendingQr?.createdAt || null,
  };
}

startWebServer({ getStatus, startClient, cancelQr, disconnectClient, getClient: () => client });

// Só inicia automaticamente se o bot não foi explicitamente desconectado antes de
// desligar (ver disconnectClient). Assim, um restart/redeploy com o WhatsApp já
// conectado reconecta sozinho usando a sessão salva, mas um logout manual não fica
// gerando QR Code (e log) a cada reinício até alguém pedir de novo pelo painel.
const estadoPersistido = loadBotState();
if (estadoPersistido.active === false) {
  console.log("[Autostart] Bot foi desconectado manualmente antes do último desligamento. Aguardando solicitação de QR Code pelo painel.");
} else {
  console.log("[Autostart] Iniciando conexão automática...");
  startClient();
}

// Tratamento de encerramento gracioso para evitar travas residuais no Chromium
const gracefulShutdown = async (signal) => {
  console.log(`[Process] Recebido sinal ${signal}. Encerrando bot de forma limpa...`);
  // Aqui usamos false para APENAS fechar o navegador, sem deslogar a conta do WhatsApp
  await disconnectClient(false);
  process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
