// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

// =====================================
// IMPORTAÇÕES E CONFIGURAÇÕES GLOBAIS
// =====================================
const fs = require('fs');
const path = require('path');
const qrcodeTerminal = require("qrcode-terminal");
const qrcode = require("qrcode");
const util = require('util');
const { execSync } = require('child_process');
const { Client, LocalAuth } = require("whatsapp-web.js");
const moment = require("moment-timezone");
const { google } = require("googleapis");

// =====================================
// CONFIGURAÇÃO DE LOGS (TIMESTAMP UTC-3)
// =====================================
const getTimestamp = () => `[${moment().tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm:ss")}]`;
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// Configura a escrita manual em arquivo para substituir a funcionalidade do PM2
const logFile = path.join(__dirname, 'combined.log');
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
console.error = (...args) => logger(originalError, ...args);
console.warn = (...args) => logger(originalWarn, ...args);

// Captura de erros que fariam o processo morrer sem logar
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Fatal] Rejeição de promessa não tratada em:', promise, 'motivo:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Fatal] Exceção não capturada:', err);
  console.error(err.stack);
  // Dá um tempo para o log gravar antes de sair
  setTimeout(() => process.exit(1), 500);
});

// Importamos o web.js APÓS configurar o logger global para capturar seus logs iniciais
const { startWebServer } = require("./web");

// Lista de IDs das Agendas do Google atualizada para resolver erros de credenciais
const agendasParaLer = [
  "d336e4e99db8329a2d52b123252a822073e8f23a67784892e68f3476147e694d@group.calendar.google.com", // Diretoria
  "15141665d120f01b145b6a77603eb2313fac0c0e3073033addc151d9561a79d0@group.calendar.google.com", // Epifania
  "10e97ba829f906588511279bb65b8ce6c8667d9c548339f04de137f9d8ab8a5d@group.calendar.google.com", // Intercessão
  "16b2f3baec9c14aba0d43a139b12a04893c33edb9fb45a0b8f081403a3eaa036@group.calendar.google.com", // Outros
  "10a17be6c05bc778f05dbfbddb0fda8ea1e73d2c2349b806230cc4990a14191a@group.calendar.google.com", // Projeto Social Seeds
  "fa6cf624289edd4efd67cdd11367d6fd7c15e6d74b319ab579ef378498f5fdd9@group.calendar.google.com", // Rede Ruach
  "bd9c2b98016d155d427591ed6c339224516db3724146b5dcd3f94c4fe6c22c84@group.calendar.google.com", // Rede de Casais
  "b9daab311cb773bd14efd27ce6efbada7aa94ac8a5adce857b5c694b75fe2803@group.calendar.google.com", // Rede de Homens
  "548839d693663fb3a5854930256f5fd321534a13af3ba67c5a09e6f347992be8@group.calendar.google.com", // Rede de Mulheres
  "8876e79827d1469f76bcb2758de55158ef3625dba3413ec2c1ea161f5030021b@group.calendar.google.com"  // Rede Kids
];

console.log(`[Config] ${agendasParaLer.length} agenda(s) configurada(s) para leitura.`);

const lideres = (process.env.WHATSAPP_LIDERES || "")
  .split(",")
  .map(num => num.trim())
  .filter(Boolean);
if (lideres.length > 0) {
  console.log(`[Config] ${lideres.length} número(s) de líder(es) carregado(s).`);
}

const auth = new google.auth.GoogleAuth({
  keyFile: "credenciais-google.json",
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
      const res = await calendar.events.list({
        calendarId: id,
        timeMin: inicio,
        timeMax: fim,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2500,
      });
      if (res.data.items) {
        // Anexa o calendarId a cada evento para permitir filtragem posterior
        const eventsWithCalendarId = res.data.items.map(item => ({ ...item, calendarId: id }));
        todosEventos = todosEventos.concat(eventsWithCalendarId);
      }
    } catch (e) {
      console.error(`[Google Calendar] Erro na agenda ${id}:`, e.response?.data || e.message);
    }
  }
  return todosEventos.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
}

function mapearRedeParaAgendaId(nomeRede) {
  const rede = (nomeRede || "").toLowerCase();
  if (rede.includes("diretoria")) return agendasParaLer[0];
  if (rede.includes("epifania")) return agendasParaLer[1];
  if (rede.includes("intercessao") || rede.includes("intercessão")) return agendasParaLer[2];
  if (rede.includes("seeds") || rede.includes("projeto")) return agendasParaLer[4];
  if (rede.includes("ruach")) return agendasParaLer[5];
  if (rede.includes("casais")) return agendasParaLer[6];
  if (rede.includes("homens")) return agendasParaLer[7];
  if (rede.includes("mulheres")) return agendasParaLer[8];
  if (rede.includes("kids")) return agendasParaLer[9];
  return agendasParaLer[3]; // Outros
}

function sabadosDoMes(ano, mes) {
  const sabados = [];
  const data = new Date(ano, mes - 1, 1);
  while (data.getMonth() === mes - 1) {
    if (data.getDay() === 6) sabados.push(new Date(data));
    data.setDate(data.getDate() + 1);
  }
  return sabados;
}

const etapas = {};

let client;
let clientReady = false;
let isInitializing = false;
let pendingQr = null;
let clientId = "bot";
let isGeneratingQr = false;
let isCanceling = false;

function criarClient() {
  client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath: path.join(__dirname, ".wwebjs_auth") }),
    authTimeoutMs: 60000, // Aumenta tempo de espera da autenticação
    puppeteer: {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: true,
      timeout: 60000, // Aumenta o tempo limite para abrir o Chrome na VM
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-extensions',
        '--no-zygote',
      ]
    }
  });

  client.on("qr", async (qr) => {
    console.log("✅ QR Code gerado com sucesso.");
    try {
      const dataUrl = await qrcode.toDataURL(qr);
      pendingQr = { qr, dataUrl, createdAt: new Date().toISOString() };
    } catch (err) {
      console.error("Erro ao gerar QR Code em data URL:", err);
      pendingQr = { qr, dataUrl: null, createdAt: new Date().toISOString() };
    }
  });

  client.on("ready", () => {
    clientReady = true;
    pendingQr = null;
    isGeneratingQr = false;
    saveBotState(true); // Salva como ativo apenas quando a conexão é confirmada
    console.log("✅ Bot conectado!");
  });

  client.on("authenticated", () => {
    console.log("✅ Autenticado no WhatsApp");
  });

  client.on("auth_failure", (msg) => {
    console.error("Falha na autenticação:", msg);
    clientReady = false;
    pendingQr = null;
    isGeneratingQr = false;
    isInitializing = false;
    saveBotState(false); // Se a sessão no cache falhou, paramos o bot para evitar loops
  });

  client.on("disconnected", (reason) => {
    clientReady = false;
    pendingQr = null;
    isGeneratingQr = false;
    isInitializing = false;
    saveBotState(false); // Salva como inativo ao desconectar
    console.warn(`[WhatsApp] Cliente desconectado. Motivo: ${reason}`);
  });

  client.on("message", async (msg) => {
    try {
      // Ignora mensagens de status e mensagens enviadas pelo próprio bot
      if (msg.from === 'status@broadcast' || msg.fromMe) {
        return;
      }

      // Lógica para mensagens em grupo (Confirmação da Secretaria)
      if (msg.from.endsWith("@g.us")) {
        const chat = await msg.getChat();
        if (chat.name === "Mensagens Secretaria" && msg.hasQuotedMsg) {
          const textoMsg = msg.body.toLowerCase().trim();
          if (textoMsg === "marcar evento" || textoMsg === "não marcar") {
            const quotedMsg = await msg.getQuotedMessage();
            // Verifica se a mensagem respondida é o resumo enviado pelo bot
            if (quotedMsg.fromMe && quotedMsg.body.includes("Ref: ")) {
              const body = quotedMsg.body;
              const matchRef = body.match(/Ref: ([\d-]+@c\.us)/);
              if (matchRef) {
                const solicitanteId = matchRef[1];
                
                if (textoMsg === "marcar evento") {
                  try {
                    const evento = body.match(/📅 \*Evento:\* (.*)/)?.[1]?.trim();
                    const rede = body.match(/🌐 \*Rede:\* (.*)/)?.[1]?.trim();
                    const dataMatch = body.match(/📆 \*Data:\* (\d+)\/(\d+)/);
                    const horarioRaw = body.match(/⏰ \*Horário:\* (.*)/)?.[1]?.trim();

                    if (!evento || !rede || !dataMatch || !horarioRaw) {
                      return msg.reply("❌ Erro ao extrair dados para o agendamento automático.");
                    }

                    const dia = dataMatch[1];
                    const mes = dataMatch[2];
                    const ano = moment().tz("America/Sao_Paulo").year();
                    const agendaId = mapearRedeParaAgendaId(rede);

                    const resource = {
                      summary: evento,
                      description: `Agendado via Bot - Solicitado pela Rede: ${rede}`,
                      location: "Comunidade Cristã Casa Forte"
                    };

                    if (horarioRaw.includes("DIA TODO")) {
                      const start = moment.tz(`${dia}/${mes}/${ano}`, "D/M/YYYY", "America/Sao_Paulo");
                      const end = start.clone().add(1, 'day');
                      resource.start = { date: start.format("YYYY-MM-DD") };
                      resource.end = { date: end.format("YYYY-MM-DD") };
                    } else {
                      const [hInicio, hFim] = horarioRaw.split(" - ").map(s => s.trim());
                      const start = moment.tz(`${dia}/${mes}/${ano} ${hInicio}`, "D/M/YYYY HH:mm", "America/Sao_Paulo");
                      const end = moment.tz(`${dia}/${mes}/${ano} ${hFim}`, "D/M/YYYY HH:mm", "America/Sao_Paulo");
                      resource.start = { dateTime: start.format(), timeZone: "America/Sao_Paulo" };
                      resource.end = { dateTime: end.format(), timeZone: "America/Sao_Paulo" };
                    }

                    await calendar.events.insert({ calendarId: agendaId, resource });
                    
                    const feedback = "✅ *Agendamento Confirmado e Gravado!*\n\nSua solicitação foi aprovada e já consta na agenda oficial da Casa Forte. 🙏\n\nDigite *menu* para voltar ao menu principal.";
                    await client.sendMessage(solicitanteId, feedback);
                    console.log(`[Secretaria] Agendamento automático realizado para ${solicitanteId}`);
                    return msg.reply(`✅ Evento gravado na agenda de *${rede}* e líder notificado.`);
                  } catch (err) {
                    console.error("[Secretaria] Erro no agendamento automático:", err);
                    return msg.reply("❌ Erro ao salvar na agenda do Google. A permissão ou conflito impediu a gravação automática.");
                  }
                } else {
                  const feedback = "❌ *Aviso de Agendamento*\n\nInfelizmente não pudemos confirmar sua solicitação de evento para esta data. Por favor, entre em contato com a secretaria para verificar outras opções.\n\nDigite *menu* para voltar ao menu principal.";
                  try {
                    await client.sendMessage(solicitanteId, feedback);
                    console.log(`[Secretaria] Feedback de recusa enviado para ${solicitanteId}`);
                  } catch (sendErr) {
                    console.error(`[Secretaria] Erro ao enviar feedback para ${solicitanteId}:`, sendErr.message);
                  }
                  return msg.reply(`✅ Líder notificado sobre a recusa.`);
                }
              }
            }
          }
        }
        return; // Ignora outras mensagens em grupos
      }

      const contato = await msg.getContact();
      const numero = contato.id._serialized;
      const texto = msg.body.toLowerCase().trim();
      // Verificação mais flexível para o número de líder
      const isLider = lideres.some(l => numero.includes(l));

      console.log(`[Mensagem Recebida] De: ${numero} (${isLider ? 'Líder' : 'Usuário'}) | Texto: "${msg.body}"`);

      // Expressão regular para capturar saudações permitindo letras repetidas e variações
      // Exemplos: "pazzz", "a pazzz", "oiiiii", "olaaaaa", "diaaa", "olla"
      const saudacoesRegex = /^(oi+|ol[aá]+|paz+|a\s+paz+|bom\s+dia|boa\s+tarde|boa\s+noite|menu|dia+|olla+)$/i;
      const ehSaudacao = saudacoesRegex.test(texto);

      if (ehSaudacao) {
        delete etapas[numero];
      const menu = isLider
        ? `Olá! 👋
Secretaria da Comunidade Cristã Casa Forte.

Escolha uma opção:

1️⃣ Horário dos cultos
2️⃣ Ver agenda da igreja
3️⃣ Atendimento pastoral
4️⃣ Aulas de música
5️⃣ Falar com a secretaria
6️⃣ Agendar ou alterar evento (líderes)
7️⃣ Comunicados e Avisos nos Cultos

Digite *menu* a qualquer momento para voltar ao menu principal.`
        : `Olá! 👋
Secretaria da Comunidade Cristã Casa Forte.

Escolha uma opção:

1️⃣ Horário dos cultos
2️⃣ Ver agenda da igreja
3️⃣ Atendimento pastoral
4️⃣ Aulas de música
5️⃣ Falar com a secretaria

Digite *menu* a qualquer momento para voltar ao menu principal.`;

      return msg.reply(menu);
    }

    if (etapas[numero]) {
      const info = etapas[numero];
      console.log(`[Fluxo Ativo] Usuário: ${numero} | Fluxo: ${info.fluxo} | Etapa: ${info.etapa}`);

      if (info.fluxo === "agendamento") {
        // Lógica de agendamento (Opção 3)
        if (info.etapa === "evento_acao") {
          if (msg.body === "1") {
            info.etapa = "evento_nome";
            console.log(`[Fluxo] Usuário ${numero} iniciou novo agendamento.`);
            return msg.reply("📅 *Novo Agendamento*\nQual o nome do evento?");
          } else if (msg.body === "2") {
            info.etapa = "alterar_departamento";
            console.log(`[Fluxo] Usuário ${numero} iniciou alteração de evento.`);
            return msg.reply("De qual departamento é o evento que deseja alterar?\n\n1 - Diretoria\n2 - Epifania\n3 - Intercessão\n4 - Projeto Social Seeds\n5 - Rede Ruach\n6 - Rede de Casais\n7 - Rede de Homens\n8 - Rede de Mulheres\n9 - Rede Kids\n10 - Outros");
          } else {
            return msg.reply("❌ Opção inválida. Digite 1 para Agendar ou 2 para Alterar.");
          }
        }

        if (info.etapa === "alterar_departamento") {
          const mapaConfig = {
            "1": { nome: "Diretoria", id: agendasParaLer[0] },
            "2": { nome: "Epifania", id: agendasParaLer[1] },
            "3": { nome: "Intercessão", id: agendasParaLer[2] },
            "4": { nome: "Projeto Social Seeds", id: agendasParaLer[4] },
            "5": { nome: "Rede Ruach", id: agendasParaLer[5] },
            "6": { nome: "Rede de Casais", id: agendasParaLer[6] },
            "7": { nome: "Rede de Homens", id: agendasParaLer[7] },
            "8": { nome: "Rede de Mulheres", id: agendasParaLer[8] },
            "9": { nome: "Rede Kids", id: agendasParaLer[9] },
            "10": { nome: "Outros", id: agendasParaLer[3] }
          };
          const config = mapaConfig[msg.body];
          if (!config) return msg.reply("❌ Escolha um departamento da lista (1 a 10).");

          info.departamento = config.nome;
          info.calendarIdBusca = config.id;
          await msg.reply(`🔍 Buscando eventos de *${info.departamento}* em ${new Date().getFullYear()}...`);

          try {
            const agora = moment.tz("America/Sao_Paulo");
            const ano = agora.year();
            const inicioAno = agora.clone().startOf('year').subtract(1, 'minute').format();
            const fimAno = agora.clone().endOf('year').format();
            
            // Busca eventos especificamente na agenda do departamento selecionado
            const filtrados = await buscarEventos(inicioAno, fimAno, info.calendarIdBusca);

            if (filtrados.length === 0) {
              delete etapas[numero];
              return msg.reply(`📅 Não encontrei eventos futuros para o departamento ${info.departamento}.`);
            }

            info.eventosEncontrados = filtrados.slice(0, 15); // Limita a 15 para não travar o zap
            info.etapa = "alterar_selecionar_evento";
            
            let lista = `📋 *Eventos de ${info.departamento}*\nQual você deseja alterar?\n\n`;
            info.eventosEncontrados.forEach((ev, i) => {
              const d = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo");
              lista += `${i + 1} - ${d.format("DD/MM")}: ${ev.summary}\n`;
            });
            return msg.reply(lista);
          } catch (e) {
            console.error(e);
            delete etapas[numero];
            return msg.reply("⚠️ Erro ao buscar eventos.");
          }
        }

        if (info.etapa === "alterar_selecionar_evento") {
          const index = parseInt(msg.body) - 1;
          if (isNaN(index) || !info.eventosEncontrados[index]) return msg.reply("❌ Escolha um número válido da lista.");
          
          info.eventoParaAlterar = info.eventosEncontrados[index];
          info.etapa = "alterar_detalhes";
          return msg.reply(`📝 Você selecionou: *${info.eventoParaAlterar.summary}*\n\nQuais alterações você precisa fazer? (Ex: Mudar horário para 20h, alterar data para o dia seguinte, etc)`);
        }

        if (info.etapa === "alterar_detalhes") {
          info.detalhesAlteracao = msg.body;
          const dataOriginal = new Date(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date);
          
          const resumo = `🔄 *Solicitação de Alteração*\n\n*Evento:* ${info.eventoParaAlterar.summary}\n*Data Original:* ${dataOriginal.getDate()}/${dataOriginal.getMonth()+1}\n*Solicitação:* ${info.detalhesAlteracao}\n\nAguarde o retorno da secretaria!\n\nDigite *menu* para voltar ao menu principal.`;
          
          // Notificar o grupo
          try {
            const chats = await client.getChats();
            const grupo = chats.find(chat => chat.isGroup && chat.name === "Mensagens Secretaria");
            if (grupo) {
              const resumoGrupo = `⚠️ *PEDIDO DE ALTERAÇÃO*\n\n👤 *Solicitante:* ${contato.pushname || contato.name || numero}\n🏢 *Depto:* ${info.departamento}\n📅 *Evento:* ${info.eventoParaAlterar.summary}\n📆 *Data Atual:* ${dataOriginal.getDate()}/${dataOriginal.getMonth()+1}\n📝 *Mudança:* ${info.detalhesAlteracao}\n\n_Responda com "agendar" para confirmar ou "não agendar" para recusar._\nRef: ${numero}`;
              await grupo.sendMessage(resumoGrupo);
            }
          } catch (error) {
            console.error("Erro ao notificar grupo:", error);
          }

          await msg.reply(resumo);
          delete etapas[numero];
          return;
        }

        if (info.etapa === "evento_nome") {
          console.log(`[Agendamento] Nome do evento: ${msg.body}`);
          info.nome = msg.body;
          info.etapa = "evento_rede";
          return msg.reply("Qual rede está organizando?\n\n1 - Diretoria\n2 - Epifania\n3 - Intercessão\n4 - Projeto Social Seeds\n5 - Rede Ruach\n6 - Rede de Casais\n7 - Rede de Homens\n8 - Rede de Mulheres\n9 - Rede Kids\n10 - Outros");
        }

        if (info.etapa === "evento_rede") {
          const mapaRedes = {
            "1": "Diretoria",
            "2": "Epifania",
            "3": "Intercessão",
            "4": "Projeto Social Seeds",
            "5": "Rede Ruach",
            "6": "Rede de Casais",
            "7": "Rede de Homens",
            "8": "Rede de Mulheres",
            "9": "Rede Kids",
            "10": "Outros"
          };
          const escolha = msg.body.trim();
          if (!mapaRedes[escolha]) return msg.reply("❌ Escolha uma opção da lista (1 a 10).");

          info.rede = mapaRedes[escolha];
          console.log(`[Agendamento] Rede selecionada: ${info.rede}`);
          info.etapa = "evento_mes";
          return msg.reply("📅 Para qual *mês* você quer agendar?\nDigite o número (ex: 5 para Maio)");
        }

        if (info.etapa === "evento_mes") {
          const mes = parseInt(msg.body);
          if (isNaN(mes) || mes < 1 || mes > 12) return msg.reply("❌ Mês inválido. Digite um número de 1 a 12.");
          console.log(`[Agendamento] Mês: ${mes}`);
          info.mes = mes;
          info.etapa = "evento_tipo_dia";
          return msg.reply("Qual o dia da semana desejado?\n\n1 - Segunda-feira\n2 - Terça-feira\n3 - Quarta-feira\n4 - Quinta-feira\n5 - Sexta-feira\n6 - Sábado\n7 - Domingo\n8 - Vários dias / Evento longo");
        }

        if (info.etapa === "evento_tipo_dia") {
          const escolha = msg.body;
          // Mapeamento: 1-Seg, 2-Ter, 3-Qua, 4-Qui, 5-Sex, 6-Sáb, 7-Dom, 8-Todos/Vários
          const diasMapa = { 
            "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 0, "8": "TODOS"
          };
          
          if (diasMapa[escolha] === undefined) {
            return msg.reply("❌ Opção inválida. Por favor, escolha um número de 1 a 8.");
          }

          info.diaSemanaFiltro = diasMapa[escolha];
          console.log(`Dia da semana selecionado por ${numero}: ${escolha} (${info.diaSemanaFiltro})`);

          info.etapa = "evento_horario";
          return msg.reply("⏰ Qual o *horário de início* do evento? (Ex: 19:30)\nOu digite *DIA TODO* para eventos de longa duração ou vários dias.");
        }

        if (info.etapa === "evento_horario") {
          const entrada = msg.body.toUpperCase();
          info.horarioInicio = entrada; // Armazena o horário de início
          info.isDiaInteiro = entrada.includes("DIA");
          console.log(`[Agendamento] Horário de início: ${entrada}`);

          if (info.isDiaInteiro) {
            info.horarioFim = "DIA TODO"; // Se for dia inteiro, o fim também é dia todo
            info.etapa = "consultar_disponibilidade"; // Pula para a consulta
            // Não retorna aqui, deixa o fluxo cair para a próxima etapa
          } else {
            // Valida o formato do horário de início
            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(info.horarioInicio)) {
              return msg.reply("❌ Formato de horário de início inválido. Por favor, use HH:MM (ex: 19:30) ou *DIA TODO*.");
            }
            info.etapa = "evento_horario_fim";
            return msg.reply("⏰ Qual o *horário de término* do evento? (Ex: 21:00)");
          }
        }

        if (info.etapa === "evento_horario_fim") {
          const entradaFim = msg.body.toUpperCase();
          info.horarioFim = entradaFim;

          // Valida o formato do horário de término
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(info.horarioFim)) {
            return msg.reply("❌ Formato de horário de término inválido. Por favor, use HH:MM (ex: 21:00).");
          }

          // Compara os horários de início e fim
          const [hInicio, mInicio] = info.horarioInicio.split(":").map(Number);
          const [hFim, mFim] = info.horarioFim.split(":").map(Number);
          const tempStart = moment().set({hour: hInicio, minute: mInicio, second: 0, millisecond: 0});
          const tempEnd = moment().set({hour: hFim, minute: mFim, second: 0, millisecond: 0});
          if (tempEnd.isSameOrBefore(tempStart)) {
            return msg.reply("❌ O horário de término deve ser depois do horário de início.");
          }
          console.log(`[Agendamento] Horário de término: ${info.horarioFim}`);
          info.etapa = "consultar_disponibilidade"; // Prossegue para a consulta
          // Não retorna aqui, deixa o fluxo cair para a próxima etapa
        }

        // Nova etapa para centralizar a consulta de disponibilidade
        if (info.etapa === "consultar_disponibilidade") {

          await msg.reply("🔍 Consultando agenda...");
          console.log(`[Agenda] Consultando disponibilidades para ${numero}...`);

          try {
            const agora = moment.tz("America/Sao_Paulo");
            const ano = agora.year();
            const inicioBusca = moment.tz([ano, info.mes - 1], "America/Sao_Paulo").startOf('month').subtract(1, 'minute').format();
            const fimBusca = moment.tz([ano, info.mes - 1], "America/Sao_Paulo").endOf('month').format();

            const todosEventos = await buscarEventos(inicioBusca, fimBusca);

            let firstConflictDetails = null; // Para armazenar detalhes do primeiro conflito encontrado

            // Identificar sábados livres da diretoria para bloqueio
            const sabadosLivresDiretoria = todosEventos.filter(ev =>
              ev.calendarId === agendasParaLer[0] && // ID da agenda da Diretoria
              ev.summary && ev.summary.toLowerCase().includes("sábado livre")
            ).map(ev => moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo").startOf('day').format('YYYY-MM-DD'));

            let diasPossiveis = [];
            let dataCursor = new Date(ano, info.mes - 1, 1);
            while (dataCursor.getMonth() === info.mes - 1) {
              if (info.diaSemanaFiltro === "TODOS" || dataCursor.getDay() === info.diaSemanaFiltro) {
                diasPossiveis.push(new Date(dataCursor));
              }
              dataCursor.setDate(dataCursor.getDate() + 1);
            }

            let disponiveis = diasPossiveis.filter(dataMsg => {
              const dTarget = moment(dataMsg).tz("America/Sao_Paulo").startOf('day');
              const dTargetFormatted = dTarget.format('YYYY-MM-DD');

              // Se este dia é um "Sábado LIVRE" da Diretoria, ele não está disponível para outros agendamentos
              if (sabadosLivresDiretoria.includes(dTargetFormatted)) {
                if (!firstConflictDetails) { // Armazena apenas o primeiro conflito
                  firstConflictDetails = {
                    type: "sabado_livre",
                    date: dTargetFormatted
                  };
                }
                return false;
              }

              const eventosNoDia = todosEventos.filter(ev => {
                // Ignorar os próprios eventos "Sábado LIVRE" da Diretoria ao verificar conflitos com outros eventos
                if (ev.calendarId === agendasParaLer[0] && ev.summary && ev.summary.toLowerCase().includes("sábado livre")) {
                    return false;
                }
                const evStart = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo").startOf('day');
                let evEnd = moment.tz(ev.end.dateTime || ev.end.date, "America/Sao_Paulo");

                // Ajuste para eventos de dia inteiro (o Google define o fim como o dia seguinte, exclusivo)
                if (ev.start.date && !ev.start.dateTime) { // É um evento de dia inteiro
                  evEnd = moment.tz(ev.end.date, "America/Sao_Paulo").subtract(1, 'day').endOf('day'); // Fim do dia anterior à data de término do Google
                } else {
                  evEnd.endOf('day');
                }

                return dTarget.isBetween(evStart, evEnd, 'day', '[]');
              });

              // Se o novo evento é de dia inteiro, qualquer evento existente no dia o torna indisponível
              if (info.isDiaInteiro) {
                if (eventosNoDia.length > 0 && !firstConflictDetails) {
                  const conflictingEv = eventosNoDia[0]; // Pega o primeiro evento que causa conflito
                  firstConflictDetails = {
                    type: "day_long_conflict",
                    date: dTargetFormatted,
                    summary: conflictingEv.summary || "Evento sem título",
                    start: conflictingEv.start.dateTime || conflictingEv.start.date,
                    end: conflictingEv.end.dateTime || conflictingEv.end.date
                  };
                }
                return eventosNoDia.length === 0;
              }

              // Para eventos com horário, verifica sobreposição com buffer
              const [hInicioNovo, mInicioNovo] = info.horarioInicio.split(":").map(Number);
              const [hFimNovo, mFimNovo] = info.horarioFim.split(":").map(Number);

              const newEventStartMoment = moment(dataMsg).set({
                hour: hInicioNovo,
                minute: mInicioNovo,
                second: 0, millisecond: 0
              });
              const newEventEndMoment = moment(dataMsg).set({
                hour: hFimNovo,
                minute: mFimNovo,
                second: 0, millisecond: 0
              });

              const bufferDuration = moment.duration(60, 'minutes'); // Buffer de 1h

              for (const ev of eventosNoDia) {
                // Se um evento existente é de dia inteiro, ele conflita com qualquer novo evento com horário
                if (ev.start.date && !ev.start.dateTime) {
                  return false;
                }

                const existingEventStart = moment.tz(ev.start.dateTime, "America/Sao_Paulo");
                const existingEventEnd = moment.tz(ev.end.dateTime, "America/Sao_Paulo");

                // Calcula os horários do evento existente com o buffer
                const bufferedExistingEventStart = existingEventStart.clone().subtract(bufferDuration);
                const bufferedExistingEventEnd = existingEventEnd.clone().add(bufferDuration);

                // Verifica sobreposição: o novo evento se sobrepõe se seu início for antes do fim buffered de um evento existente
                // E seu fim for depois do início buffered de um evento existente.
                if (newEventStartMoment.isBefore(bufferedExistingEventEnd) && newEventEndMoment.isAfter(bufferedExistingEventStart)) {
                  if (!firstConflictDetails) { // Armazena apenas o primeiro conflito
                    firstConflictDetails = {
                      type: "time_conflict",
                      date: dTargetFormatted,
                      summary: ev.summary || "Evento sem título",
                      start: ev.start.dateTime,
                      end: ev.end.dateTime
                    };
                  }
                  return false; // Sobreposição encontrada, este dia não está disponível
                }
              }
              return true; // Nenhuma sobreposição encontrada para este dia
            });

            // Lógica específica para "Rede Ruach" em sábados (mantida)
            if (info.diaSemanaFiltro === 6 && !info.rede.toLowerCase().includes("ruach")) {
              if (disponiveis.length > 1) {
                disponiveis.pop();
              } else {
                disponiveis = [];
              }
            }

            console.log(`Datas disponíveis para ${numero}: ${disponiveis.length}`);

            if (disponiveis.length === 0) {
              delete etapas[numero];
              let conflictMessage = "❌ Não há datas disponíveis para essas condições neste mês.";

              if (firstConflictDetails) {
                if (firstConflictDetails.type === "sabado_livre") {
                  conflictMessage = `❌ Não há datas disponíveis para agendamento no dia ${moment(firstConflictDetails.date).format('DD/MM')}. Este sábado está reservado como "Sábado LIVRE" da Diretoria. Por favor, escolha outra data ou mês.`;
                } else if (firstConflictDetails.type === "day_long_conflict") {
                  conflictMessage = `❌ Não há datas disponíveis para o seu evento de *DIA TODO* no dia ${moment(firstConflictDetails.date).format('DD/MM')}. Já existe o evento "*${firstConflictDetails.summary}*" agendado para este dia. Por favor, escolha outra data ou mês.`;
                } else if (firstConflictDetails.type === "time_conflict") {
                  const conflictingEventStart = moment.tz(firstConflictDetails.start, "America/Sao_Paulo").format("HH:mm");
                  const conflictingEventEnd = moment.tz(firstConflictDetails.end, "America/Sao_Paulo").format("HH:mm");
                  conflictMessage = `❌ Não há datas disponíveis para o seu evento com o horário solicitado no dia ${moment(firstConflictDetails.date).format('DD/MM')}.
Encontramos um conflito com o evento "*${firstConflictDetails.summary}*" que ocorre das *${conflictingEventStart}* às *${conflictingEventEnd}*.
Por favor, tente agendar seu evento em outro horário ou data.`;
                }
              }
              return msg.reply(conflictMessage);
            }

            info.datasEncontradas = disponiveis;
            info.etapa = "evento_finalizar";
            let lista = "📅 *Datas Disponíveis:*\n\n";
            disponiveis.forEach((d, i) => {
              const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
              lista += `${i + 1} - ${d.getDate()}/${info.mes} (${diasSemana[d.getDay()]})\n`;
            });
            return msg.reply(lista + "\nDigite o número da opção desejada:");

          } catch (e) {
            console.error(`Erro ao consultar agendas para ${numero}:`, e);
            delete etapas[numero];
            return msg.reply("⚠️ Erro ao acessar a agenda.");
          }
        }

        if (info.etapa === "evento_finalizar") {
          const escolha = parseInt(msg.body) - 1;
          if (isNaN(escolha) || !info.datasEncontradas[escolha]) return msg.reply("❌ Escolha um número da lista.");

          const dataFinal = info.datasEncontradas[escolha];
          const resumo = `✅ *Solicitação de Agendamento*\n\nEvento: ${info.nome}\nRede: ${info.rede}\nData: ${dataFinal.getDate()}/${info.mes}\nHorário: ${info.horarioInicio} - ${info.horarioFim}\n\nAguarde a confirmação da secretaria!\n\n📝 *Enquanto aguarda a confirmação, por favor, já preencha o formulário detalhado com os dados do evento:* \nhttps://forms.gle/LXLGbS3CDxQwxMBf6\n\nDigite *menu* para voltar ao menu principal.`;
          
          // Notificar o grupo de agendamento
          try {
            const chats = await client.getChats();
            const grupoAgendamento = chats.find(chat => chat.isGroup && chat.name === "Mensagens Secretaria");
            if (grupoAgendamento) {
              const resumoGrupo = `🔔 *Novo Agendamento Solicitado*\n\n👤 *Solicitante:* ${contato.pushname || contato.name || numero}\n📅 *Evento:* ${info.nome}\n🌐 *Rede:* ${info.rede}\n📆 *Data:* ${dataFinal.getDate()}/${info.mes}\n⏰ *Horário:* ${info.horarioInicio} - ${info.horarioFim}\n\n_Responda a este resumo com "marcar evento" ou "não marcar" para realizar o agendamento automático._\nRef: ${numero}`;
              await grupoAgendamento.sendMessage(resumoGrupo);
              console.log(`[Notificação] Resumo de agendamento enviado ao grupo 'Mensagens Secretaria'.`);
            } else {
              console.warn("[Aviso] Grupo 'Mensagens Secretaria' não encontrado para envio da notificação.");
            }
          } catch (error) {
            console.error("[Erro] Falha ao enviar notificação para o grupo:", error);
          }

          console.log(`Agendamento solicitado por ${numero}: ${resumo.replace(/\n/g, ' | ')}`);
          await msg.reply(resumo);
          delete etapas[numero];
          return;
        }
      } else if (info.fluxo === "comunicados") {
        // Lógica de comunicados (Opção 7)
        if (info.etapa === "texto_comunicado") {
          const comunicado = msg.body;
          const resumoUsuario = `📢 *Solicitação de Comunicado Enviada!*\n\nSua mensagem foi encaminhada para a secretaria analisar e incluir nos avisos do culto.\n\nDigite *menu* para voltar ao menu principal.`;

          // Notificar o grupo
          try {
            const chats = await client.getChats();
            const grupo = chats.find(chat => chat.isGroup && chat.name === "Mensagens Secretaria");
            if (grupo) {
              const resumoGrupo = `📢 *NOVO COMUNICADO PARA O CULTO*\n\n👤 *Solicitante:* ${contato.pushname || contato.name || numero}\n📝 *Mensagem:* ${comunicado}`;
              await grupo.sendMessage(resumoGrupo);
              console.log(`[Comunicado] Enviado ao grupo por ${numero}`);
            } else {
              console.warn("[Aviso] Grupo 'Mensagens Secretaria' não encontrado para o comunicado.");
            }
          } catch (error) {
            console.error("Erro ao notificar grupo sobre comunicado:", error);
          }

          await msg.reply(resumoUsuario);
          delete etapas[numero];
          return;
        }
      } else if (info.fluxo === "pastoral") {
        // Lógica de atendimento pastoral (Opção 4)
        if (info.etapa === "nome") {
          info.nome = msg.body;
          info.etapa = "disponibilidade";
          console.log(`[Pastoral] Nome recebido: ${info.nome} (${numero}). Solicitando disponibilidade.`);
          return msg.reply(`Obrigado, ${info.nome}. 🙏\nAgora, por favor, informe quais os *dias e horários* você tem disponível para o atendimento.`);
        }

        if (info.etapa === "disponibilidade") {
          info.disponibilidade = msg.body;
          console.log(`[Pastoral] Pedido finalizado para ${info.nome} (${numero}). Disponibilidade: ${info.disponibilidade}`);
          await msg.reply(`Perfeito! Sua solicitação de atendimento pastoral foi registrada.\n\n👤 *Nome:* ${info.nome}\n🗓️ *Disponibilidade:* ${info.disponibilidade}\n\nA secretaria entrará em contato em breve para confirmar o agendamento. 🙏\n\nDigite *menu* para voltar ao menu principal.`);
          delete etapas[numero];
          return;
        }
      } else if (info.fluxo === "ver_agenda") {
        // Lógica de consulta de agenda (Opção 2)
        if (info.etapa === "escolha_mes") {
          const agora = moment.tz("America/Sao_Paulo");
          const mesAtual = agora.month() + 1;
          const escolha = parseInt(msg.body.trim());

          if (isNaN(escolha) || escolha < mesAtual || escolha > 12) {
            return msg.reply(`❌ Opção inválida. Por favor, escolha um mês de ${mesAtual} a 12.`);
          }

          const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
          const mesNome = meses[escolha - 1];
          const ano = agora.year();

          // Define o início e fim do mês usando format() para manter o offset -03:00, garantindo que o Google entenda o horário local
          const inicioBusca = moment.tz([ano, escolha - 1], "America/Sao_Paulo").startOf('month').subtract(1, 'minute').format();
          const fimBusca = moment.tz([ano, escolha - 1], "America/Sao_Paulo").endOf('month').format();

          console.log(`[Agenda] Buscando eventos para ${numero} em ${mesNome}`);
          await msg.reply(`🔍 Consultando eventos de ${mesNome}...`);

          try {
            const todosEventosRaw = await buscarEventos(inicioBusca, fimBusca);
            // Filtrar eventos "Sábado LIVRE" da Diretoria para não aparecerem na agenda geral
            const todosEventos = todosEventosRaw.filter(ev =>
              !(ev.calendarId === agendasParaLer[0] && ev.summary && ev.summary.toLowerCase().includes("sábado livre"))
            );
            let msgAgenda = `📋 *Agenda Casa Forte - ${mesNome}*\n\n`;
            let encontrou = false;

            const agrupados = {};
            const diasSemanaPlural = ["Domingos", "Segundas-feiras", "Terças-feiras", "Quartas-feiras", "Quintas-feiras", "Sextas-feiras", "Sábados"];

            todosEventos.forEach(ev => {
              const startStr = ev.start.dateTime || ev.start.date;
              // Usa moment-timezone para evitar que eventos "pulem" de dia por causa do fuso horário
              const d = moment.tz(startStr, "America/Sao_Paulo");
              const weekday = d.day();

              const summary = ev.summary || "Evento sem título";
              const horaFmt = ev.start.dateTime ? d.format("HH:mm") : "";
              const diaNum = d.date();
              const dataFmt = d.format("DD/MM");

              const chave = `${summary}|${horaFmt}|${weekday}`;
              if (!agrupados[chave]) {
                agrupados[chave] = { summary, horaFmt, weekday, datas: [], primeiroDia: diaNum };
              }
              agrupados[chave].datas.push(dataFmt);
            });

            const listaOrdenada = Object.values(agrupados).sort((a, b) => a.primeiroDia - b.primeiroDia);

            listaOrdenada.forEach(grp => {
              const horaStr = grp.horaFmt ? ` às ${grp.horaFmt}` : "";
              // Se o evento ocorre 3 ou mais vezes no mês, agrupa como "Todas as [Dia da Semana]"
              if (grp.datas.length >= 3) {
                const prefixo = (grp.weekday === 0 || grp.weekday === 6) ? "Todos os" : "Todas as";
                msgAgenda += `🗓️ *${prefixo} ${diasSemanaPlural[grp.weekday]}*${horaStr} | ${grp.summary}\n`;
              } else {
                grp.datas.forEach(dt => {
                  msgAgenda += `📌 *${dt}*${horaStr} | ${grp.summary}\n`;
                });
              }
              encontrou = true;
            });

            delete etapas[numero];
            return msg.reply((encontrou ? msgAgenda : `📅 Não há eventos programados para ${mesNome}.`) + "\n\nDigite *menu* para voltar ao menu principal.");
          } catch (e) {
            console.error(`Erro ao buscar agenda para ${numero}:`, e);
            delete etapas[numero];
            return msg.reply("⚠️ Erro ao carregar agenda.");
          }
        }
      }
      return;
    }

    if (texto === "1") {
      console.log(`Opção 1 selecionada por ${numero}`);
      const mensagemCultos = `✨ *Celebre Conosco!* ✨

Estamos esperando por você e sua família em nossos encontros:

⛪ *Culto de Celebração*
🗓️ Todos os Domingos
⏰ Às *18h*

🍞 *Santa Ceia + Sala de Oração*
🗓️ Todo 1º Domingo do Mês
⏰ Às *08h30*
⚠️ _Neste dia, não temos culto à noite._

Venha viver um tempo precioso na presença de Deus! 🙏🙌

Digite *menu* para voltar ao menu principal.`;
      return msg.reply(mensagemCultos);
    }

    if (texto === "2") {
      console.log(`Opção 2 selecionada por ${numero}`);
      const hoje = new Date();
      const mesAtual = hoje.getMonth();
      const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      
      let listaMeses = "📅 *Ver Agenda*\n\nPara qual mês você deseja consultar?\n\n";
      for (let i = mesAtual; i < 12; i++) {
        listaMeses += `${i + 1} - ${meses[i]}\n`;
      }

      etapas[numero] = { fluxo: "ver_agenda", etapa: "escolha_mes" };
      return msg.reply(listaMeses + "\nDigite o número do mês desejado:");
    }

    if (texto === "3") {
      console.log(`Opção 3 selecionada por ${numero}, iniciando atendimento pastoral`);
      etapas[numero] = { fluxo: "pastoral", etapa: "nome" };
      return msg.reply("🙏 *Atendimento Pastoral*\n\n📝 Qual é o seu *nome*?");
    }

    if (texto === "4") {
      console.log(`Opção 4 selecionada por ${numero}`);
      return msg.reply(`🎵 *Aulas de Música*\n\nOferecemos: Canto, Teclado, Violão e Guitarra.\n\n*Em breve abriremos novas inscrições!* Fique atento aos avisos.\n\nDigite *menu* para voltar ao menu principal.`);
    }

    if (texto === "5") {
      console.log(`Opção 5 selecionada por ${numero}`);
      // Notificar o grupo
      try {
        const chats = await client.getChats();
        const grupo = chats.find(chat => chat.isGroup && chat.name === "Mensagens Secretaria");
        if (grupo) {
          const avisoSecretaria = `📞 *PEDIDO DE ATENDIMENTO*\n\n👤 *Solicitante:* ${contato.pushname || contato.name || numero}\n\nO usuário solicitou falar com a secretaria.`;
          await grupo.sendMessage(avisoSecretaria);
          console.log(`[Atendimento] Aviso enviado ao grupo por ${numero}`);
        }
      } catch (error) {
        console.error("Erro ao notificar grupo sobre atendimento:", error);
      }
      return msg.reply(`📞 *Secretaria*\n\nUm atendente responderá em breve.\nAtendimento: Terça a Sábado, 08h às 18h.\n\nDigite *menu* para voltar ao menu principal.`);
    }

    if (texto === "6" && isLider) {
      console.log(`Opção 6 selecionada por ${numero}, iniciando agendamento`);
      etapas[numero] = { fluxo: "agendamento", etapa: "evento_acao" };
      return msg.reply("O que você deseja fazer?\n\n1 - Agendar novo evento\n2 - Alterar evento existente");
    }

    if (texto === "7" && isLider) {
      console.log(`Opção 7 selecionada por ${numero}`);
      etapas[numero] = { fluxo: "comunicados", etapa: "texto_comunicado" };
      return msg.reply("📢 *Comunicados e Avisos*\n\nPor favor, digite abaixo o texto do comunicado que você deseja que seja lido ou exibido nos cultos:");
    }

    } catch (err) {
      console.error("[Erro Fatal no Listener de Mensagens]:", err);
    }
  });
}

// PERSISTÊNCIA DE ESTADO (ATIVO/PARADO)
// =====================================
const STATE_FILE = path.join(__dirname, 'bot_state.json');
const saveBotState = (active) => {
  try {
    if (fs.existsSync(STATE_FILE) && fs.lstatSync(STATE_FILE).isDirectory()) {
      return console.error(`[Critical] '${STATE_FILE}' é um diretório. Persistência de estado desativada.`);
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ active }), 'utf8');
  } catch (err) {
    console.error(`[State Error] Falha ao salvar estado: ${err.message}`);
  }
};

const loadBotState = () => {
  try {
    if (!fs.existsSync(STATE_FILE)) return { active: false };
    if (fs.lstatSync(STATE_FILE).isDirectory()) return { active: false };
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } 
  catch (e) { return { active: false }; }
};

async function startClient() {
  if (clientReady || isInitializing) return;
  console.log("🚀 Iniciando processo de inicialização do cliente...");
  console.time("client_init");

  // Força o encerramento de processos zumbis do Chromium antes de iniciar
  try {
    console.log("[Browser] Limpando processos antigos do Chromium...");
    execSync("pkill -9 -f chromium", { stdio: 'ignore' });
  } catch (e) {
    // Silencia o erro se o pkill não encontrar nada
  }

  // Remove o arquivo SingletonLock do Chromium se ele existir. 
  // Isso previne o erro "Code 21" (Profile in use) comum em ambientes Docker/PM2.
  const sessionDir = path.join(__dirname, ".wwebjs_auth", `session-${clientId}`);
  const profileDir = path.join(sessionDir, "Default");
  const locks = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
  
  [sessionDir, profileDir].forEach(dir => {
    try {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        // Verifica se o arquivo contém as palavras-chave de trava do Chromium
        if (locks.some(lock => file.includes(lock))) {
          const lockPath = path.join(dir, file);
          try {
            // No Linux, SingletonLock é um link simbólico. fs.existsSync falha se o link estiver "quebrado".
            // Tentamos a remoção direta para garantir que limpe mesmo links órfãos de sessões anteriores.
            fs.unlinkSync(lockPath);
            console.log(`[Browser] 🔓 Trava residual removida com sucesso: ${lockPath}`);
          } catch (e) {
            // Ignora se o arquivo sumiu entre o readdir e o unlink
          }
        }
      });
    } catch (err) {
      // Falha silenciosa se não conseguir ler o diretório (ex: pasta Default ainda não criada)
    }
  });

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

  if (!client) {
    console.warn("⚠️ Tentativa de desconexão ignorada: Nenhum cliente ativo.");
    // Garante que o status seja resetado mesmo se o objeto client não existir
    clientReady = false;
    isInitializing = false;
    isGeneratingQr = false;
    pendingQr = null;
    return { ok: false, message: "Não há cliente ativo para desconectar." };
  }

  try {
    if (shouldLogout && typeof client.logout === "function") {
      await client.logout();
    } else if (typeof client.destroy === "function") {
      await client.destroy();
    }
    console.log(`✅ WhatsApp desconectado via ${action}.`);
    return { ok: true, message: "WhatsApp desconectado com sucesso." };
  } catch (err) {
    console.error("❌ Erro ao desconectar WhatsApp:", err);
    return { ok: true, message: "WhatsApp desconectado (com aviso de erro no processo)." };
  } finally {
    client = null;
    saveBotState(false); // Salva que o bot DEVE estar parado
    clientReady = false;
    isInitializing = false;
    isGeneratingQr = false;
    pendingQr = null;
  }
}

function getStatus() {
  return {
    connected: clientReady,
    initializing: isInitializing,
    generatingQr: isGeneratingQr,
    canceling: isCanceling,
    hasQr: !!pendingQr,
    qrDataUrl: pendingQr?.dataUrl || null,
    qrCreatedAt: pendingQr?.createdAt || null,
  };
}

startWebServer({ getStatus, startClient, cancelQr, disconnectClient });

console.log("[Autostart] Iniciando conexão automática...");
startClient();

// Tratamento de encerramento gracioso para evitar travas residuais no Chromium
const gracefulShutdown = async (signal) => {
  console.log(`[Process] Recebido sinal ${signal}. Encerrando bot de forma limpa...`);
  // Aqui usamos false para APENAS fechar o navegador, sem deslogar a conta do WhatsApp
  await disconnectClient(false);
  process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
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

  if (!client) {
    console.warn("⚠️ Tentativa de desconexão ignorada: Nenhum cliente ativo.");
    // Garante que o status seja resetado mesmo se o objeto client não existir
    clientReady = false;
    isInitializing = false;
    isGeneratingQr = false;
    pendingQr = null;
    return { ok: false, message: "Não há cliente ativo para desconectar." };
  }

  try {
    if (shouldLogout && typeof client.logout === "function") {
      await client.logout();
    } else if (typeof client.destroy === "function") {
      await client.destroy();
    }
    console.log(`✅ WhatsApp desconectado via ${action}.`);
    return { ok: true, message: "WhatsApp desconectado com sucesso." };
  } catch (err) {
    console.error("❌ Erro ao desconectar WhatsApp:", err);
    return { ok: true, message: "WhatsApp desconectado (com aviso de erro no processo)." };
  } finally {
    client = null;
    saveBotState(false); // Salva que o bot DEVE estar parado
    clientReady = false;
    isInitializing = false;
    isGeneratingQr = false;
    pendingQr = null;
  }
}

function getStatus() {
  return {
    connected: clientReady,
    initializing: isInitializing,
    generatingQr: isGeneratingQr,
    canceling: isCanceling,
    hasQr: !!pendingQr,
    qrDataUrl: pendingQr?.dataUrl || null,
    qrCreatedAt: pendingQr?.createdAt || null,
  };
}

startWebServer({ getStatus, startClient, cancelQr, disconnectClient });

console.log("[Autostart] Iniciando conexão automática...");
startClient();

// Tratamento de encerramento gracioso para evitar travas residuais no Chromium
const gracefulShutdown = async (signal) => {
  console.log(`[Process] Recebido sinal ${signal}. Encerrando bot de forma limpa...`);
  // Aqui usamos false para APENAS fechar o navegador, sem deslogar a conta do WhatsApp
  await disconnectClient(false);
  process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
