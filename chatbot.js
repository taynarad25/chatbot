// =====================================
// IMPORTAÇÕES E CONFIGURAÇÕES GLOBAIS
// =====================================
const qrcodeTerminal = require("qrcode-terminal");
const qrcode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { google } = require("googleapis");
const { startWebServer } = require("./web");

const calendarId = "secretariacasaforte.cf@gmail.com"; 

const auth = new google.auth.GoogleAuth({
  keyFile: "credenciais-google.json",
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({
  version: "v3",
  auth: auth, 
});

const agendasParaLer = [
  calendarId,
  "16b2f3baec9c14aba0d43a139b12a04893c33edb9fb45a0b8f081403a3eaa036@group.calendar.google.com", 
  "d336e4e99db8329a2d52b123252a822073e8f23a67784892e68f3476147e694d@group.calendar.google.com", 
  "15141665d120f01b145b6a77603eb2313fac0c0e3073033addc151d9561a79d0@group.calendar.google.com", 
  "51dcf0048432b8fcdbdb663f6198d88398b6481c73f81847bbc867cf25534458@group.calendar.google.com", 
  "10e97ba829f906588511279bb65b8ce6c8667d9c548339f04de137f9d8ab8a5d@group.calendar.google.com", 
  "bd9c2b98016d155d427591ed6c339224516db3724146b5dcd3f94c4fe6c22c84@group.calendar.google.com", 
  "b9daab311cb773bd14efd27ce6efbada7aa94ac8a5adce857b5c694b75fe2803@group.calendar.google.com", 
  "fa6cf624289edd4efd67cdd11367d6fd7c15e6d74b319ab579ef378498f5fdd9@group.calendar.google.com", 
  "548839d693663fb3a5854930256f5fd321534a13af3ba67c5a09e6f347992be8@group.calendar.google.com", 
  "8876e79827d1469f76bcb2758de55158ef3625dba3413ec2c1ea161f5030021b@group.calendar.google.com", 
  "10a17be6c05bc778f05dbfbddb0fda8ea1e73d2c2349b806230cc4990a14191a@group.calendar.google.com" 
];

const lideres = [
    "5511995824388@c.us", "5511970658048@c.us", "5511985526434@c.us", 
    "5511983338655@c.us", "5511970498716@c.us", "5511946798919@c.us", 
    "5511951617993@c.us", "5511997832279@c.us", "5511973419733@c.us", 
    "5511944565738@c.us", "5511969536715@c.us", "5511957022269@c.us", 
    "5511942685501@c.us"
];

// Funções auxiliares
async function buscarEventos(inicio, fim) {
  const res = await calendar.events.list({
    calendarId: calendarId,
    timeMin: inicio,
    timeMax: fim,
    singleEvents: true,
    orderBy: "startTime",
  });
  return res.data.items;
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
    console.log("Escaneie o QR Code:");
    qrcodeTerminal.generate(qr, { small: true });
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
    console.log("WhatsApp desconectado:", reason);
  });

  client.on("message", async (msg) => {
    if (msg.from.endsWith("@g.us")) return;

    const contato = await msg.getContact();
    const numero = contato.id._serialized;
    const texto = msg.body.toLowerCase().trim();
    const isLider = lideres.includes(numero);

    console.log(`Mensagem recebida de ${numero}: "${msg.body}"`);

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

      console.log(`Usuário ${numero} em fluxo: ${info.fluxo}, etapa: ${info.etapa}`);

      if (info.fluxo === "agendamento") {
        if (info.etapa === "evento_nome") {
          console.log(`Recebendo nome do evento de ${numero}: ${msg.body}`);
          info.nome = msg.body;
          info.etapa = "evento_rede";
          return msg.reply("Qual rede está organizando? (Ex: Jovens, Mulheres, Code)");
        }

        if (info.etapa === "evento_rede") {
          console.log(`Recebendo rede do evento de ${numero}: ${msg.body}`);
          info.rede = msg.body;
          info.etapa = "evento_mes";
          return msg.reply("📅 Para qual *mês* você quer agendar?\nDigite o número (ex: 5 para Maio)");
        }

        if (info.etapa === "evento_mes") {
          const mes = parseInt(msg.body);
          if (isNaN(mes) || mes < 1 || mes > 12) return msg.reply("❌ Mês inválido. Digite de 1 a 12.");
          console.log(`Mês selecionado por ${numero}: ${mes}`);
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
          return msg.reply("⏰ Qual o horário do evento? (Ex: 19:30)\nOu digite *DIA TODO* para eventos longos.");
        }

        if (info.etapa === "evento_horario") {
          const entrada = msg.body.toUpperCase();
          info.horario = entrada;
          info.isDiaInteiro = entrada.includes("DIA");
          console.log(`Horário do evento de ${numero}: ${entrada}`);

          await msg.reply("🔍 Consultando agendas e aplicando regras de reserva...");

          console.log(`Consultando agendas para agendamento de ${numero}`);

          try {
            const ano = 2026;
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
      }
      return;
    }

    if (texto === "1") {
      console.log(`Opção 1 selecionada por ${numero}`);
      return msg.reply(`📅 *Horário dos Cultos*\n\nDomingo\n18h \n\nPrimeiro domingo do mês\n08h30 — Santa Ceia\n⚠️ Não há culto à noite.\n\nEsperamos você!`);
    }

    if (texto === "2") {
      console.log(`Opção 2 selecionada por ${numero}`);
      const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const hoje = new Date();
      const inicioBusca = hoje.toISOString();
      const fimBusca = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0).toISOString();

      console.log(`Buscando agenda para ${numero}`);

      try {
        let todosEventos = [];
        for (const id of agendasParaLer) {
          const res = await calendar.events.list({ calendarId: id, timeMin: inicioBusca, timeMax: fimBusca, singleEvents: true, orderBy: "startTime" });
          if (res.data.items) todosEventos = todosEventos.concat(res.data.items);
        }
        todosEventos.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));

        console.log(`Encontrados ${todosEventos.length} eventos para ${numero}`);

        let msgAgenda = "📋 *Agenda Casa Forte*\n\n";
        todosEventos.forEach(ev => {
          const d = new Date(ev.start.dateTime || ev.start.date);
          if (d.getDay() === 6 || d.getDay() === 0) {
            const dataFmt = d.toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' });
            msgAgenda += `📌 *${dataFmt}* | ${ev.summary}\n`;
          }
        });
        return msg.reply(msgAgenda);
      } catch (e) {
        console.error(`Erro ao buscar agenda para ${numero}:`, e);
        return msg.reply("Erro ao carregar agenda.");
      }
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
      console.warn("⚠️ Sessão do Chrome bloqueada. Tentando iniciar com nova pasta de sessão...");
      try {
        if (client) await client.destroy();
      } catch (destroyErr) {
        console.warn("❌ Falha ao destruir o cliente antigo:", destroyErr?.message || destroyErr);
      }
      client = null;
      clientReady = false;
      pendingQr = null;
      clientId = `bot-${Date.now()}`;
      criarClient();
      try {
        await client.initialize();
        console.log("🚀 Cliente reinicializado com novo ID de sessão.");
        return;
      } catch (retryErr) {
        console.error("❌ Erro fatal ao iniciar o WhatsApp com nova sessão:", retryErr);
        isGeneratingQr = false;
      }
    } else {
      console.error("❌ Erro ao iniciar o WhatsApp:", err);
      try {
        if (client) await client.destroy();
      } catch (destroyErr) {
        // Silencioso pois o target já pode estar fechado
      }
      client = null;
      clientReady = false;
      isGeneratingQr = false;
    }
  } finally {
    isInitializing = false;
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
    return { ok: false, message: "Não há cliente ativo para desconectar." };
  }

  try {
    if (typeof client.logout === "function") {
      await client.logout();
    } else if (typeof client.destroy === "function") {
      await client.destroy();
    }
    client = null;
    clientReady = false;
    isInitializing = false;
    isGeneratingQr = false;
    pendingQr = null;
    console.log("✅ WhatsApp desconectado e sessão encerrada.");
    return { ok: true, message: "WhatsApp desconectado com sucesso." };
  } catch (err) {
    console.error("❌ Erro ao desconectar WhatsApp:", err);
    return { ok: false, message: "Erro ao desconectar WhatsApp." };
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
