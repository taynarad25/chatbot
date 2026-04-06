// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

// =====================================
// IMPORTAÇÕES E CONFIGURAÇÕES GLOBAIS
// =====================================
const fs = require('fs');
const path = require('path');
const qrcodeTerminal = require("qrcode-terminal");
const qrcode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { google } = require("googleapis");
const { startWebServer } = require("./web");

// Configurações sensíveis via Variáveis de Ambiente
const calendarId = process.env.GOOGLE_CALENDAR_ID; 
const additionalCalendars = (process.env.GOOGLE_ADDITIONAL_CALENDARS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

const agendasParaLer = [calendarId, ...additionalCalendars].filter(Boolean);
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
async function buscarEventos(inicio, fim) {
  let todosEventos = [];
  for (const id of agendasParaLer) {
    try {
      const res = await calendar.events.list({
        calendarId: id,
        timeMin: inicio,
        timeMax: fim,
        singleEvents: true,
        orderBy: "startTime",
      });
      if (res.data.items) todosEventos = todosEventos.concat(res.data.items);
    } catch (e) {
      console.error(`[Google Calendar] Erro na agenda ${id}:`, e.message);
    }
  }
  return todosEventos.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
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

function criarClient() {
  client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath: "./.wwebjs_auth" }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--no-zygote'
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
    console.log("✅ Bot conectado!");
  });

  client.on("authenticated", () => {
    console.log("✅ Autenticado no WhatsApp");
  });

  client.on("auth_failure", (msg) => {
    console.error("Falha na autenticação:", msg);
  });

  client.on("disconnected", (reason) => {
    clientReady = false;
    pendingQr = null;
    isGeneratingQr = false;
    isInitializing = false;
    console.log("WhatsApp desconectado:", reason);
  });

  client.on("message", async (msg) => {
    try {
      if (msg.from.endsWith("@g.us")) return;

      const contato = await msg.getContact();
      const numero = contato.id._serialized;
      const texto = msg.body.toLowerCase().trim();
      // Verificação mais flexível para o número de líder
      const isLider = lideres.some(l => numero.includes(l));

      console.log(`[Mensagem Recebida] De: ${numero} (${isLider ? 'Líder' : 'Usuário'}) | Texto: "${msg.body}"`);

      if (
      texto === "oi" ||
      texto === "oii" ||
      texto === "olá" ||
      texto === "ola" ||
      texto === "menu" ||
      texto === "bom dia" ||
      texto === "boa tarde" ||
      texto === "boa noite" ||
      texto === "paz"
    ) {
      delete etapas[numero];

      console.log(`Enviando menu para ${numero}`);

      const menu = isLider
        ? `Olá! 👋
Secretaria da Comunidade Cristã Casa Forte.

Escolha uma opção:

1️⃣ Horário dos cultos
2️⃣ Ver agenda da igreja
3️⃣ Agendar evento (líderes)
4️⃣ Atendimento pastoral
5️⃣ Aulas de música
6️⃣ Falar com a secretaria

Digite *menu* a qualquer momento para voltar ao menu principal.`
        : `Olá! 👋
Secretaria da Comunidade Cristã Casa Forte.

Escolha uma opção:

1️⃣ Horário dos cultos
2️⃣ Ver agenda da igreja
4️⃣ Atendimento pastoral
5️⃣ Aulas de música
6️⃣ Falar com a secretaria

Digite *menu* a qualquer momento para voltar ao menu principal.`;

      return msg.reply(menu);
    }

    if (etapas[numero]) {
      const info = etapas[numero];
      console.log(`[Fluxo Ativo] Usuário: ${numero} | Fluxo: ${info.fluxo} | Etapa: ${info.etapa}`);

      if (info.fluxo === "agendamento") {
        // Lógica de agendamento (Opção 3)
        if (info.etapa === "evento_nome") {
          console.log(`[Agendamento] Nome do evento: ${msg.body}`);
          info.nome = msg.body;
          info.etapa = "evento_rede";
          return msg.reply("Qual rede está organizando? (Ex: Jovens, Mulheres, Code)");
        }

        if (info.etapa === "evento_rede") {
          console.log(`[Agendamento] Rede: ${msg.body}`);
          info.rede = msg.body;
          info.etapa = "evento_mes";
          return msg.reply("📅 Para qual *mês* você quer agendar?\nDigite o número (ex: 5 para Maio)");
        }

        if (info.etapa === "evento_mes") {
          const mes = parseInt(msg.body);
          if (isNaN(mes) || mes < 1 || mes > 12) return msg.reply("❌ Mês inválido. Digite um número de 1 a 12.");
          console.log(`[Agendamento] Mês: ${mes}`);
          info.mes = mes;
          info.etapa = "evento_tipo_dia";
          return msg.reply("Qual o dia da semana desejado?\n\n1 - Sábados\n2 - Domingos\n3 - Sextas\n4 - Outro dia");
        }

        if (info.etapa === "evento_tipo_dia") {
          const escolha = msg.body;
          const diasMapa = { "1": 6, "2": 0, "3": 5 };
          info.diaSemanaFiltro = diasMapa[escolha] !== undefined ? diasMapa[escolha] : "OUTRO";
          console.log(`Dia da semana selecionado por ${numero}: ${escolha} (${info.diaSemanaFiltro})`);

          info.etapa = "evento_horario";
          return msg.reply("⏰ Qual o horário do evento? (Ex: 19:30)\nOu digite *DIA TODO* para eventos de longa duração.");
        }

        if (info.etapa === "evento_horario") {
          const entrada = msg.body.toUpperCase();
          info.horario = entrada;
          info.isDiaInteiro = entrada.includes("DIA");
          console.log(`[Agendamento] Horário: ${entrada}`);

          await msg.reply("🔍 Consultando agendas e aplicando regras de reserva...");
          console.log(`[Agenda] Consultando disponibilidades para ${numero}...`);

          try {
            const ano = new Date().getFullYear();
            const inicioBusca = new Date(ano, info.mes - 1, 1).toISOString();
            const fimBusca = new Date(ano, info.mes, 0, 23, 59, 59).toISOString();

            let todosEventos = [];
            for (const id of agendasParaLer) {
              const res = await calendar.events.list({ calendarId: id, timeMin: inicioBusca, timeMax: fimBusca, singleEvents: true });
              if (res.data.items) todosEventos = todosEventos.concat(res.data.items);
            }

            let diasPossiveis = [];
            let dataCursor = new Date(ano, info.mes - 1, 1);
            while (dataCursor.getMonth() === info.mes - 1) {
              if (info.diaSemanaFiltro === "OUTRO" || dataCursor.getDay() === info.diaSemanaFiltro) {
                diasPossiveis.push(new Date(dataCursor));
              }
              dataCursor.setDate(dataCursor.getDate() + 1);
            }

            let disponiveis = diasPossiveis.filter(dataMsg => {
              const diaS = dataMsg.getDate();
              const eventosNoDia = todosEventos.filter(ev => {
                const startStr = ev.start.dateTime || ev.start.date;
                const endStr = ev.end.dateTime || ev.end.date;
                const evStart = new Date(startStr);
                const evEnd = new Date(endStr);
                const diaInicio = startStr.includes('T') ? evStart.getDate() : parseInt(startStr.split('-')[2]);
                const diaFim = endStr.includes('T') ? evEnd.getDate() : parseInt(endStr.split('-')[2]);
                return (diaS >= diaInicio && diaS <= diaFim);
              });

              if (eventosNoDia.length === 0) return true;
              if (info.isDiaInteiro && eventosNoDia.length > 0) return false;

              const [hDesejada] = info.horario.split(":").map(Number);
              return !eventosNoDia.some(ev => {
                if (ev.start.date) return true;
                if (ev.summary.toLowerCase().includes("code")) return false;

                const evStart = new Date(ev.start.dateTime);
                const evEnd = new Date(ev.end.dateTime);
                const hIni = evStart.getHours();
                const hFim = evEnd.getHours() || (hIni + 1);
                return (hDesejada < hFim && (hDesejada + 3) > hIni);
              });
            });

            if (info.diaSemanaFiltro === 6 && !info.rede.toLowerCase().includes("code")) {
              if (disponiveis.length > 1) {
                disponiveis.pop();
              } else {
                disponiveis = [];
              }
            }

            console.log(`Datas disponíveis para ${numero}: ${disponiveis.length}`);

            if (disponiveis.length === 0) {
              delete etapas[numero];
              return msg.reply("❌ Não há datas disponíveis para essas condições neste mês.");
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
          const resumo = `✅ *Solicitação de Agendamento*\n\nEvento: ${info.nome}\nRede: ${info.rede}\nData: ${dataFinal.getDate()}/${info.mes}\nHorário: ${info.horario}\n\nAguarde a confirmação da secretaria!`;
          console.log(`Agendamento solicitado por ${numero}: ${resumo.replace(/\n/g, ' | ')}`);
          await msg.reply(resumo);
          delete etapas[numero];
          return;
        }
      } else if (info.fluxo === "pastoral") {
        // Lógica de atendimento pastoral (Opção 4)
        if (info.etapa === "nome") {
          info.nome = msg.body;
          info.etapa = "finalizado";
          console.log(`[Pastoral] Pedido finalizado para ${info.nome} (${numero})`);
          await msg.reply(`Obrigado, ${info.nome}. 🙏\nSua solicitação de atendimento pastoral foi registrada. A secretaria entrará em contato em breve para agendar.`);
          delete etapas[numero];
          return;
        }
      } else if (info.fluxo === "ver_agenda") {
        // Lógica de consulta de agenda (Opção 2)
        if (info.etapa === "escolha_mes") {
          const escolha = msg.body.trim();
          if (escolha !== "1" && escolha !== "2") return msg.reply("❌ Opção inválida. Digite 1 ou 2.");

          const hoje = new Date();
          let inicioBusca, fimBusca, mesNome;
          const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

          if (escolha === "1") {
            // Do momento atual até o fim do mês corrente
            inicioBusca = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
            fimBusca = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59).toISOString();
            mesNome = meses[hoje.getMonth()];
          } else {
            // Do primeiro ao último dia do próximo mês
            inicioBusca = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString();
            fimBusca = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0, 23, 59, 59).toISOString();
            const proximoMesIdx = (hoje.getMonth() + 1) % 12;
            mesNome = meses[proximoMesIdx];
          }

          console.log(`[Agenda] Buscando eventos para ${numero} em ${mesNome}`);
          await msg.reply(`🔍 Consultando eventos de ${mesNome}...`);

          try {
            const todosEventos = await buscarEventos(inicioBusca, fimBusca);
            let msgAgenda = `📋 *Agenda Casa Forte - ${mesNome}*\n\n`;
            let encontrou = false;
            todosEventos.forEach(ev => {
              const d = new Date(ev.start.dateTime || ev.start.date);
              if (d.getDay() === 6 || d.getDay() === 0) {
                const dataFmt = d.toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' });
                msgAgenda += `📌 *${dataFmt}* | ${ev.summary}\n`;
                encontrou = true;
              }
            });
            delete etapas[numero];
            return msg.reply(encontrou ? msgAgenda : `📅 Não há eventos programados para ${mesNome}.`);
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
      return msg.reply(`📅 *Horário dos Cultos*\n\nDomingo\n18h \n\nPrimeiro domingo do mês\n08h30 — Santa Ceia\n⚠️ Não há culto à noite.\n\nEsperamos você!`);
    }

    if (texto === "2") {
      console.log(`Opção 2 selecionada por ${numero}`);
      etapas[numero] = { fluxo: "ver_agenda", etapa: "escolha_mes" };
      return msg.reply("📅 *Ver Agenda*\n\nQual período você deseja consultar?\n\n1 - Este mês\n2 - Próximo mês");
    }

    if (texto === "3" && isLider) {
      console.log(`Opção 3 selecionada por ${numero}, iniciando agendamento`);
      etapas[numero] = { fluxo: "agendamento", etapa: "evento_nome" };
      return msg.reply("📅 *Novo Evento*\nQual o nome do evento?");
    }

    if (texto === "4") {
      console.log(`Opção 4 selecionada por ${numero}, iniciando atendimento pastoral`);
      etapas[numero] = { fluxo: "pastoral", etapa: "nome" };
      return msg.reply("🙏 *Atendimento Pastoral*\n\n📝 Qual é o seu *nome*?");
    }

    if (texto === "5") {
      console.log(`Opção 5 selecionada por ${numero}`);
      return msg.reply(`🎵 *Aulas de Música*\n\nOferecemos: Canto, Teclado, Violão e Guitarra.\n\nPara inscrições, digite "MÚSICA".`);
    }

    if (texto === "6") {
      console.log(`Opção 6 selecionada por ${numero}`);
      return msg.reply(`📞 *Secretaria*\n\nUm atendente responderá em breve.\nAtendimento: Terça a Sábado, 08h às 18h.`);
    }

    } catch (err) {
      console.error("[Erro Fatal no Listener de Mensagens]:", err);
    }
  });
}

async function startClient() {
  if (clientReady || isInitializing) return;
  console.log("🚀 Iniciando processo de inicialização do cliente...");
  isInitializing = true;
  isGeneratingQr = true;
  pendingQr = null;
  criarClient();
  try {
    await client.initialize();
    console.log("⏳ Aguardando geração do QR Code ou autenticação...");
    return;
  } catch (err) {
    const message = err?.message || "";
    if (message.includes("already running") || message.includes("Use a different `userDataDir`") || message.includes("already in use")) {
      console.warn("⚠️ Sessão do Chrome bloqueada. O PM2 reiniciará o processo para tentar liberar o lock.");
      try {
        if (client) await client.destroy();
      } catch (destroyErr) {
        console.warn("❌ Falha ao destruir o cliente antigo:", destroyErr?.message || destroyErr);
      }
      process.exit(1); // Força o PM2 a reiniciar o bot do zero
    } else {
      console.error("❌ Erro ao iniciar o WhatsApp:", err);
      await cancelQr();
    }
  } finally {
    isInitializing = false;
    isGeneratingQr = clientReady || !!pendingQr;
  }
}

async function cancelQr() {
  console.log("⏹️ Solicitando cancelamento da geração do QR Code...");
  if (client && !clientReady) {
    try {
      await client.destroy();
    } catch (err) {
      console.warn("⚠️ Erro ao destruir cliente no cancelamento:", err);
    }
  }
  client = null;
  clientReady = false;
  isInitializing = false;
  isGeneratingQr = false;
  pendingQr = null;
  console.log("✅ Solicitação de QR Code cancelada com sucesso.");
}

async function disconnectClient() {
  console.log("🔌 Iniciando processo de desconexão...");
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
    if (typeof client.logout === "function") {
      await client.logout();
    } else if (typeof client.destroy === "function") {
      await client.destroy();
    }
    console.log("✅ WhatsApp desconectado e sessão encerrada.");
    return { ok: true, message: "WhatsApp desconectado com sucesso." };
  } catch (err) {
    console.error("❌ Erro ao desconectar WhatsApp:", err);
    return { ok: true, message: "WhatsApp desconectado (com aviso de erro no processo)." };
  } finally {
    client = null;
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
    hasQr: !!pendingQr,
    qrDataUrl: pendingQr?.dataUrl || null,
    qrCreatedAt: pendingQr?.createdAt || null,
  };
}

startWebServer({ getStatus, startClient, cancelQr, disconnectClient });

// Verifica se existe uma sessão salva para decidir se inicia o bot automaticamente.
// Isso evita que o QR Code seja gerado sem que haja alguém logado no painel para ver.
const sessionPath = path.join(__dirname, ".wwebjs_auth", `session-${clientId}`);
if (fs.existsSync(sessionPath)) {
  console.log("[Autostart] Sessão detectada. Conectando ao WhatsApp...");
  startClient();
} else {
  console.log("[Autostart] Nenhuma sessão detectada. O QR Code só será gerado após solicitação no painel.");
}
