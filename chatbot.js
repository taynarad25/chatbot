require('dotenv').config();

// =====================================
// IMPORTAÇÕES E CONFIGURAÇÕES GLOBAIS
// =====================================
const fs = require('fs');
const path = require('path');
const qrcodeTerminal = require("qrcode-terminal");
const qrcode = require("qrcode");
const { execSync } = require('child_process');
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
      console.error(`[Google Calendar] Erro na agenda ${id}:`, e.response?.data || e.message);
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
          const texto = msg.body.toLowerCase().trim();
          if (texto === "agendar" || texto === "não agendar") {
            const quotedMsg = await msg.getQuotedMessage();
            // Verifica se a mensagem respondida é o resumo enviado pelo bot
            if (quotedMsg.fromMe && quotedMsg.body.includes("Ref: ")) {
              const match = quotedMsg.body.match(/Ref: ([\d-]+@c\.us)/);
              if (match) {
                const solicitanteId = match[1];
                const feedback = texto === "agendar"
                  ? "✅ *Agendamento Confirmado!*\n\nSua solicitação foi aprovada pela secretaria da Casa Forte. Nos vemos lá! 🙏\n\nDigite *menu* para voltar ao menu principal."
                  : "❌ *Aviso de Agendamento*\n\nInfelizmente não pudemos confirmar sua solicitação de evento para esta data. Por favor, entre em contato com a secretaria para verificar outras opções.\n\nDigite *menu* para voltar ao menu principal.";

                try {
                  await client.sendMessage(solicitanteId, feedback);
                  console.log(`[Secretaria] Feedback "${texto}" enviado com sucesso para ${solicitanteId}`);
                } catch (sendErr) {
                  console.error(`[Secretaria] Erro ao enviar feedback para ${solicitanteId}:`, sendErr.message);
                }
                return msg.reply(`✅ Feedback enviado com sucesso para o solicitante.`);
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

      const saudacoes = ["oi", "ola", "olá", "paz", "bom dia", "boa tarde", "boa noite", "menu"];
      const ehSaudacao = saudacoes.some(s => texto.startsWith(s));
      const opcoesValidas = isLider ? ["1", "2", "3", "4", "5", "6", "7"] : ["1", "2", "4", "5", "6"];

      // Atende saudações ou qualquer mensagem que não seja uma opção de menu válida (quando fora de um fluxo)
      if (ehSaudacao || (!etapas[numero] && !opcoesValidas.includes(texto))) {
        delete etapas[numero];
      const menu = isLider
        ? `Olá! 👋
Secretaria da Comunidade Cristã Casa Forte.

Escolha uma opção:

1️⃣ Horário dos cultos
2️⃣ Ver agenda da igreja
3️⃣ Agendar ou alterar evento (líderes)
4️⃣ Atendimento pastoral
5️⃣ Aulas de música
6️⃣ Falar com a secretaria
7️⃣ Comunicados e Avisos nos Cultos

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
        if (info.etapa === "evento_acao") {
          if (msg.body === "1") {
            info.etapa = "evento_nome";
            console.log(`[Fluxo] Usuário ${numero} iniciou novo agendamento.`);
            return msg.reply("📅 *Novo Agendamento*\nQual o nome do evento?");
          } else if (msg.body === "2") {
            info.etapa = "alterar_departamento";
            console.log(`[Fluxo] Usuário ${numero} iniciou alteração de evento.`);
            return msg.reply("De qual departamento é o evento que deseja alterar?\n\n1 - Epifania\n2 - Rede Code\n3 - Intercessão\n4 - Rede de Homens\n5 - Rede de Casais\n6 - Rede de mulheres\n7 - Flechas Kids\n8 - Projeto Social Seeds\n9 - Outros");
          } else {
            return msg.reply("❌ Opção inválida. Digite 1 para Agendar ou 2 para Alterar.");
          }
        }

        if (info.etapa === "alterar_departamento") {
          const deptoMapa = {
            "1": "Epifania", "2": "Rede Code", "3": "Intercessão",
            "4": "Rede de Homens", "5": "Rede de Casais", "6": "Rede de mulheres",
            "7": "Rede Kids", "8": "Projeto Social Seeds", "9": "Outros"
          };
          const depto = deptoMapa[msg.body];
          if (!depto) return msg.reply("❌ Escolha um departamento da lista (1 a 9).");

          info.departamento = depto;
          await msg.reply(`🔍 Buscando eventos de *${depto}* em ${new Date().getFullYear()}...`);

          try {
            const ano = new Date().getFullYear();
            const inicioAno = new Date(ano, 0, 1).toISOString();
            const fimAno = new Date(ano, 11, 31, 23, 59, 59).toISOString();
            
            // Busca eventos que contenham o nome do departamento no resumo
            const eventos = await buscarEventos(inicioAno, fimAno);
            const filtrados = eventos.filter(ev => 
              (ev.summary && ev.summary.toLowerCase().includes(depto.toLowerCase())) || 
              (depto === "Outros")
            );

            if (filtrados.length === 0) {
              delete etapas[numero];
              return msg.reply(`📅 Não encontrei eventos futuros para o departamento ${depto}.`);
            }

            info.eventosEncontrados = filtrados.slice(0, 15); // Limita a 15 para não travar o zap
            info.etapa = "alterar_selecionar_evento";
            
            let lista = `📋 *Eventos de ${depto}*\nQual você deseja alterar?\n\n`;
            info.eventosEncontrados.forEach((ev, i) => {
              const d = new Date(ev.start.dateTime || ev.start.date);
              lista += `${i + 1} - ${d.getDate()}/${d.getMonth()+1}: ${ev.summary}\n`;
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

          await msg.reply("🔍 Consultando agenda...");
          console.log(`[Agenda] Consultando disponibilidades para ${numero}...`);

          try {
            const ano = new Date().getFullYear();
            const inicioBusca = new Date(ano, info.mes - 1, 1).toISOString();
            const fimBusca = new Date(ano, info.mes, 0, 23, 59, 59).toISOString();

            const todosEventos = await buscarEventos(inicioBusca, fimBusca);

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
                if (ev.summary && ev.summary.toLowerCase().includes("code")) return false;

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
          const resumo = `✅ *Solicitação de Agendamento*\n\nEvento: ${info.nome}\nRede: ${info.rede}\nData: ${dataFinal.getDate()}/${info.mes}\nHorário: ${info.horario}\n\nAguarde a confirmação da secretaria!\n\n📝 *Enquanto aguarda a confirmação, por favor, já preencha o formulário detalhado com os dados do evento:* \nhttps://forms.gle/LXLGbS3CDxQwxMBf6\n\nDigite *menu* para voltar ao menu principal.`;

          // Notificar o grupo de agendamento
          try {
            const chats = await client.getChats();
            const grupoAgendamento = chats.find(chat => chat.isGroup && chat.name === "Mensagens Secretaria");
            if (grupoAgendamento) {
              const resumoGrupo = `🔔 *Novo Agendamento Solicitado*\n\n👤 *Solicitante:* ${contato.pushname || contato.name || numero}\n📅 *Evento:* ${info.nome}\n🌐 *Rede:* ${info.rede}\n📆 *Data:* ${dataFinal.getDate()}/${info.mes}\n⏰ *Horário:* ${info.horario}\n\n_Responda a este resumo com "agendar" ou "não agendar" para notificar o líder._\nRef: ${numero}`;
              await grupoAgendamento.sendMessage(resumoGrupo);
              console.log(`[Notificação] Resumo enviado ao grupo 'Mensagens Secretaria'.`);
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
          const hoje = new Date();
          const mesAtual = hoje.getMonth() + 1;
          const escolha = parseInt(msg.body.trim());

          if (isNaN(escolha) || escolha < mesAtual || escolha > 12) {
            return msg.reply(`❌ Opção inválida. Por favor, escolha um mês de ${mesAtual} a 12.`);
          }

          let inicioBusca, fimBusca, mesNome;
          const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
          mesNome = meses[escolha - 1];
          const ano = hoje.getFullYear();

          if (escolha === mesAtual) {
            inicioBusca = new Date(ano, escolha - 1, hoje.getDate()).toISOString();
          } else {
            inicioBusca = new Date(ano, escolha - 1, 1).toISOString();
          }
          fimBusca = new Date(ano, escolha, 0, 23, 59, 59).toISOString();

          console.log(`[Agenda] Buscando eventos para ${numero} em ${mesNome}`);
          await msg.reply(`🔍 Consultando eventos de ${mesNome}...`);

          try {
            const todosEventos = await buscarEventos(inicioBusca, fimBusca);
            let msgAgenda = `📋 *Agenda Casa Forte - ${mesNome}*\n\n`;
            let encontrou = false;

            const agrupados = {};
            const diasSemanaNomes = ["Domingos", "Segundas", "Terças", "Quartas", "Quintas", "Sextas", "Sábados"];

            // Agrupa os eventos por Nome, Horário e Dia da Semana
            todosEventos.forEach(ev => {
              const startStr = ev.start.dateTime || ev.start.date;
              const d = new Date(startStr);
              const weekday = d.getDay();

              if (weekday !== 3 && weekday !== 4) {
                const summary = ev.summary || "Evento sem título";
                const horaFmt = ev.start.dateTime
                  ? `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
                  : "";
                const diaNum = d.getDate();
                const dataFmt = d.toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' });

                const chave = `${summary}|${horaFmt}|${weekday}`;
                if (!agrupados[chave]) {
                  agrupados[chave] = { summary, horaFmt, weekday, datas: [], primeiroDia: diaNum };
                }
                agrupados[chave].datas.push(dataFmt);
              }
            });

            // Ordena os grupos pelo primeiro dia em que aparecem para manter a cronologia
            const listaOrdenada = Object.values(agrupados).sort((a, b) => a.primeiroDia - b.primeiroDia);

            listaOrdenada.forEach(grp => {
              const horaStr = grp.horaFmt ? ` às ${grp.horaFmt}` : "";
              if (grp.datas.length >= 3) {
                msgAgenda += `🗓️ *Todas as ${diasSemanaNomes[grp.weekday]}*${horaStr} | ${grp.summary}\n`;
                encontrou = true;
              } else {
                grp.datas.forEach(dt => {
                  msgAgenda += `📌 *${dt}*${horaStr} | ${grp.summary}\n`;
                  encontrou = true;
                });
              }
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

    if (texto === "3" && isLider) {
      console.log(`Opção 3 selecionada por ${numero}, iniciando agendamento`);
      etapas[numero] = { fluxo: "agendamento", etapa: "evento_acao" };
      return msg.reply("O que você deseja fazer?\n\n1 - Agendar novo evento\n2 - Alterar evento existente");
    }

    if (texto === "4") {
      console.log(`Opção 4 selecionada por ${numero}, iniciando atendimento pastoral`);
      etapas[numero] = { fluxo: "pastoral", etapa: "nome" };
      return msg.reply("🙏 *Atendimento Pastoral*\n\n📝 Qual é o seu *nome*?");
    }

    if (texto === "5") {
      console.log(`Opção 5 selecionada por ${numero}`);
      return msg.reply(`🎵 *Aulas de Música*\n\nOferecemos: Canto, Teclado, Violão e Guitarra.\n\n*Em breve abriremos novas inscrições!* Fique atento aos avisos.\n\nDigite *menu* para voltar ao menu principal.`);
    }

    if (texto === "6") {
      console.log(`Opção 6 selecionada por ${numero}`);
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

async function startClient() {
  if (clientReady || isInitializing) return;
  console.log("🚀 Iniciando processo de inicialização do cliente...");
  console.time("client_init");

  // Força o encerramento de processos zumbis do Chromium antes de iniciar
  try {
    console.log("[Browser] Limpando processos antigos do Chromium...");
    execSync("pkill -9 -f chromium || true");
  } catch (e) {
    // Ignora erros se não houver processos para matar
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
    await client.initialize();
    return;
  } catch (err) {
    const message = err?.message || "";
    if (message.includes("already running") || message.includes("Use a different `userDataDir`") || message.includes("already in use") || message.includes("Code: 21")) {
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

// Tratamento de encerramento gracioso para evitar travas residuais no Chromium
const gracefulShutdown = async (signal) => {
  console.log(`[Process] Recebido sinal ${signal}. Encerrando bot de forma limpa...`);
  await disconnectClient();
  process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
