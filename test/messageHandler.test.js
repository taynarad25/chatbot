// Teste end-to-end do fluxo de conversa do bot (chatbot.js -> messageHandler.js).
// Dirige o handleMessage real com um client/calendar/buscarEventos falsos (sem
// Puppeteer, sem chamadas reais ao Google), simulando a troca de mensagens de
// um usuário de verdade pelo WhatsApp: cada teste manda uma sequência de
// mensagens e verifica as respostas, exatamente como o README descreve cada
// funcionalidade do bot.

// Isola completamente do banco real de produção ANTES de exigir o
// messageHandler (que usa bot/pendentesAprovacao.js e bot/secretaria.js internamente).
const os = require("os");
const path = require("path");
const fs = require("fs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-messagehandler-test-"));
process.env.DB_PATH = path.join(tmpDir, "dados.db");

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const { createMessageHandler, LINK_ATA_REUNIAO, formatarTituloReuniao, resolverOpcaoLocalReuniao } = require("../bot/messageHandler");
const { buscarPendente, extrairCodigo } = require("../bot/pendentesAprovacao");
const { atualizarCacheGrupo, NOME_GRUPO_SECRETARIA } = require("../bot/secretaria");
const { AGENDAS_INTERNAS } = require("../bot/redes");

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

// Extrai o código embutido na mensagem do bot pro grupo e busca a solicitação
// pendente correspondente — substitui o antigo decodificarDadosAgendamento().
function decodificarDadosAgendamento(mensagem) {
  const codigo = extrairCodigo(mensagem);
  return codigo ? buscarPendente(codigo) : null;
}

const AGENDAS = [
  "cal-evangelismo", "cal-epifania", "cal-intercessao", "cal-outros",
  "cal-seeds", "cal-ruach", "cal-casais", "cal-homens", "cal-mulheres", "cal-kids",
  "cal-externos",
  "cal-reunioes", "cal-atendimento", "cal-limpeza", "cal-ensaios",
];
const LIDERES = ["5511999999999"];
const NUMERO_LIDER = "5511999999999@c.us";
const NUMERO_COMUM = "5511888888888@c.us";

// Únicos em todo o arquivo (não redefinidos por teste): o cache de JID de grupo
// (bot/secretaria.js) é compartilhado entre todos os testes via DB_PATH
// (um único banco, nunca resetado entre testes) — se criarContexto() e criarMsgGrupo()
// usassem JIDs "de mentira" diferentes pro mesmo grupo, um teste anterior que recebe
// mensagem de grupo (criarMsgGrupo) sobrescreveria o cache com um JID que o
// client.sendMessage mockado de outro teste não reconhece, e a mensagem de
// notificação cairia silenciosamente no bucket errado.
const JID_GRUPO_SECRETARIA = "111111111111111@g.us";
const JID_GRUPO_PASTORAL = "222222222222222@g.us";

// Monta um novo "servidor" de teste: handler + espiões de tudo que ele chamaria
// de verdade (mensagens de grupo, mensagens diretas, gravação na Google Agenda).
function criarContexto({ eventos = [], lideresCadastrados = [] } = {}) {
  const etapas = {};
  const gruposEnviados = []; // mensagens que o bot mandou para "Mensagens Secretaria"
  const diretasEnviadas = []; // client.sendMessage(solicitanteId, texto)
  const eventosGravados = []; // calendar.events.insert(...)
  const eventosAlterados = []; // calendar.events.patch(...)
  const eventosCancelados = []; // calendar.events.delete(...)
  let eventosAtuais = eventos;

  // notificarSecretaria/notificarPastoral (bot/secretaria.js) mandam a mensagem de
  // grupo direto por JID via client.sendMessage(jid, texto) — não mais buscando o
  // chat e chamando chat.sendMessage(texto) — então o mock precisa rotear pelo "to"
  // pra separar mensagem de grupo de mensagem direta ao solicitante, com o mesmo
  // client.sendMessage único usado pelos dois casos.
  const JIDS_DE_GRUPO = new Set([JID_GRUPO_SECRETARIA, JID_GRUPO_PASTORAL]);

  const client = {
    sendMessage: async (to, texto, options) => {
      const conteudo = options?.caption || (typeof texto === "string" ? texto : texto?.caption || texto);
      if (JIDS_DE_GRUPO.has(to)) {
        gruposEnviados.push(conteudo);
      } else {
        diretasEnviadas.push({ to, texto: conteudo, media: typeof texto !== "string" ? texto : null });
      }
    },
    getChats: async () => [
      {
        id: { _serialized: JID_GRUPO_SECRETARIA },
        isGroup: true,
        name: "Mensagens Secretaria",
      },
      {
        id: { _serialized: JID_GRUPO_PASTORAL },
        isGroup: true,
        name: "Atendimento Pastoral",
      }
    ],
  };

  const calendar = {
    events: {
      insert: async ({ calendarId, resource }) => {
        eventosGravados.push({ calendarId, resource });
        return { data: {} };
      },
      patch: async ({ calendarId, eventId, resource }) => {
        eventosAlterados.push({ calendarId, eventId, resource });
        return { data: {} };
      },
      delete: async ({ calendarId, eventId }) => {
        eventosCancelados.push({ calendarId, eventId });
        return { data: {} };
      },
    },
  };

  const buscarEventos = async () => eventosAtuais;

  const handleMessage = createMessageHandler({
    client, calendar, agendasParaLer: AGENDAS, lideres: LIDERES, etapas, buscarEventos,
    listLideres: () => lideresCadastrados,
  });

  return {
    handleMessage,
    etapas,
    gruposEnviados,
    diretasEnviadas,
    eventosGravados,
    eventosAlterados,
    eventosCancelados,
    setEventos: (novos) => { eventosAtuais = novos; },
  };
}

// Mensagem privada (não é de grupo). Cada chamada acumula a resposta em `respostas`.
function criarMsgPrivada(numero, body, { pushname } = {}) {
  const respostas = [];
  const msg = {
    from: numero,
    fromMe: false,
    body,
    reply: async (texto) => { respostas.push(texto); return texto; },
    getContact: async () => ({ id: { _serialized: numero }, pushname, name: undefined }),
    respostas,
  };
  return msg;
}

// Mensagem em grupo, respondendo (reply/quote) a uma mensagem anterior do próprio bot.
function criarMsgGrupo({ nomeGrupo, body, quotedBody, quotedFromMe = true }) {
  const respostas = [];
  const msg = {
    from: nomeGrupo === "Atendimento Pastoral" ? JID_GRUPO_PASTORAL : JID_GRUPO_SECRETARIA,
    fromMe: false,
    hasQuotedMsg: true,
    body,
    reply: async (texto) => { respostas.push(texto); return texto; },
    getChat: async () => ({ name: nomeGrupo, isGroup: true }),
    getQuotedMessage: async () => ({ fromMe: quotedFromMe, body: quotedBody }),
    respostas,
  };
  return msg;
}

async function enviar(handleMessage, numero, body, opts) {
  const msg = criarMsgPrivada(numero, body, opts);
  await handleMessage(msg);
  return msg.respostas;
}

function criarEventoIgreja(agora, mesAtual, { dia = 16, calendarId = AGENDAS[6], summary = "Culto de Casais", location = "Salão Nobre" } = {}) {
  return {
    calendarId,
    summary,
    location,
    start: { dateTime: agora.clone().set({ month: mesAtual - 1, date: dia, hour: 19, minute: 30 }).format() },
    end: { dateTime: agora.clone().set({ month: mesAtual - 1, date: dia, hour: 21, minute: 0 }).format() },
  };
}

async function iniciarAgendamentoDataEspecifica(handleMessage, {
  titulo = "Culto Extra",
  local = "Igreja",
  rede = "7",
  mes = "12",
  dia,
  extraOpts,
} = {}) {
  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, titulo);
  await enviar(handleMessage, NUMERO_LIDER, local);
  const respRede = await enviar(handleMessage, NUMERO_LIDER, String(rede));
  await enviar(handleMessage, NUMERO_LIDER, String(mes));
  const respModo = await enviar(handleMessage, NUMERO_LIDER, "1");
  const respDia = dia !== undefined ? await enviar(handleMessage, NUMERO_LIDER, String(dia), extraOpts) : undefined;
  return { respRede, respModo, respDia };
}

async function solicitarAgendamentoSemana(handleMessage, {
  titulo = "Culto de Jovens",
  local = "Igreja",
  rede = "7",
  mes = "12",
  diaSemana = "3",
  inicio = "19:30",
  fim = "21:00",
  escolhaItem = "1",
  extraOpts,
} = {}) {
  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, titulo);
  await enviar(handleMessage, NUMERO_LIDER, local);
  await enviar(handleMessage, NUMERO_LIDER, String(rede));
  await enviar(handleMessage, NUMERO_LIDER, String(mes));
  await enviar(handleMessage, NUMERO_LIDER, "2");
  await enviar(handleMessage, NUMERO_LIDER, String(diaSemana));
  await enviar(handleMessage, NUMERO_LIDER, inicio);
  const finalResp = await enviar(handleMessage, NUMERO_LIDER, fim);
  const escolha = escolhaItem !== undefined ? await enviar(handleMessage, NUMERO_LIDER, escolhaItem, extraOpts) : undefined;
  return { finalResp, escolha };
}

function criarEventoExistente({ id, summary, diasAFrente = 10, hora = 19, minuto = 0, duracaoHoras = 2 } = {}) {
  const start = moment.tz("America/Sao_Paulo").add(diasAFrente, "days").set({ hour: hora, minute: minuto });
  const end = start.clone().add(duracaoHoras, "hours");
  return { id, summary, start: { dateTime: start.format() }, end: { dateTime: end.format() } };
}

async function iniciarAlteracaoEvento(handleMessage, { rede = "7", item = "1", setEventos, evento } = {}) {
  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "2");
  if (setEventos && evento) setEventos([evento]);
  const listaResp = await enviar(handleMessage, NUMERO_LIDER, String(rede));
  const escolhaResp = item !== undefined ? await enviar(handleMessage, NUMERO_LIDER, String(item)) : undefined;
  return { listaResp, escolhaResp };
}

async function iniciarCancelamentoEvento(handleMessage, { rede = "1", item = "1", setEventos, evento } = {}) {
  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "3");
  if (setEventos && evento) setEventos([evento]);
  const listaResp = await enviar(handleMessage, NUMERO_LIDER, String(rede));
  const confirmarResp = await enviar(handleMessage, NUMERO_LIDER, String(item));
  const finalResp = await enviar(handleMessage, NUMERO_LIDER, "SIM");
  return { listaResp, confirmarResp, finalResp };
}

function criarMsgGrupoSemQuote(jid, body, nomeChat) {
  let chamadasGetChat = 0;
  const respostas = [];
  return {
    from: jid,
    fromMe: false,
    hasQuotedMsg: false,
    body,
    reply: async (texto) => { respostas.push(texto); return texto; },
    getChat: async () => { chamadasGetChat++; return { name: nomeChat, isGroup: true }; },
    respostas,
    getChamadasGetChat: () => chamadasGetChat,
  };
}

async function responderGrupoPastoral(handleMessage, { body, quotedBody }) {
  const msg = criarMsgGrupo({
    nomeGrupo: "Atendimento Pastoral",
    body,
    quotedBody,
  });
  await handleMessage(msg);
  return msg;
}

// ---------------------------------------------------------------------------
// Menu principal
// ---------------------------------------------------------------------------

test("saudação: usuário comum recebe o menu sem as opções de líder (6 e 7)", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "oi");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /1️⃣ Horário dos cultos/);
  assert.doesNotMatch(respostas[0], /Agendar ou alterar evento/);
});

test("saudação: variações de texto (paz, bom dia, MENU, oiii) ativam o menu", async () => {
  const { handleMessage } = criarContexto();
  for (const texto of ["paz", "bom dia", "MENU", "oiii", "a pazzz", "A paz", "Paz do Senhor", "paz do senhor"]) {
    const respostas = await enviar(handleMessage, NUMERO_COMUM, texto);
    assert.match(respostas[0], /Escolha uma opção/, `"${texto}" deveria acionar o menu`);
  }
});

test("saudação: mensagens com mais de uma saudação combinada também ativam o menu", async () => {
  const { handleMessage } = criarContexto();
  for (const texto of ["Oi, boa tarde", "boa tarde a Paz", "bom dia e paz"]) {
    const respostas = await enviar(handleMessage, NUMERO_COMUM, texto);
    assert.match(respostas[0], /Escolha uma opção/, `"${texto}" deveria acionar o menu`);
  }
});

test("saudação: mensagem com texto além da saudação NÃO ativa o menu (pode ser conversa com a secretaria)", async () => {
  const { handleMessage } = criarContexto();
  for (const texto of ["a paz, boa tarde. vou no ensaio hoje", "boa tarde! vou chegar mais tarde na reunião"]) {
    const respostas = await enviar(handleMessage, NUMERO_COMUM, texto);
    assert.equal(respostas.length, 0, `"${texto}" não deveria gerar resposta nenhuma`);
  }
});

test("saudação: líder recebe o menu com a opção 6 da Área do Líder", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_LIDER, "oi");
  assert.match(respostas[0], /6️⃣ Área do Líder/);
  assert.doesNotMatch(respostas[0], /7️⃣/);
});

test("texto livre sem fluxo ativo: bot fica em silêncio (pode ser conversa com a secretaria fora do menu)", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "hoje não vou conseguir ir");
  assert.equal(respostas.length, 0);
});

test("número fora das opções sem fluxo ativo: bot orienta a digitar 'menu'", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "9");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /Não entendi sua mensagem/);
});

test("mensagens ignoradas: status@broadcast e mensagens do próprio bot não geram nenhuma resposta", async () => {
  const { handleMessage } = criarContexto();
  const msg1 = { from: "status@broadcast", fromMe: false, reply: async () => { throw new Error("não deveria responder"); } };
  const msg2 = { from: NUMERO_COMUM, fromMe: true, reply: async () => { throw new Error("não deveria responder"); } };
  await handleMessage(msg1);
  await handleMessage(msg2);
});

// ---------------------------------------------------------------------------
// Opção 1 — Horário dos cultos
// ---------------------------------------------------------------------------

test("opção 1: retorna a mensagem estática de horário dos cultos", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "1");
  assert.match(respostas[0], /Culto de Celebração/);
  assert.match(respostas[0], /Santa Ceia/);
});

// ---------------------------------------------------------------------------
// Opção 2 — Ver agenda
// ---------------------------------------------------------------------------

test("opção 2: fluxo completo por mês, incluindo o detalhe do evento", async () => {
  const agora = moment.tz("America/Sao_Paulo");
  const mesAtual = agora.month() + 1;
  const evento = {
    calendarId: AGENDAS[6],
    summary: "Culto de Casais",
    location: "Salão Novo",
    description: "Traga seu cônjuge!",
    start: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 15, hour: 19, minute: 30 }).format() },
    end: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 15, hour: 21, minute: 0 }).format() },
  };
  const { handleMessage, setEventos } = criarContexto({ eventos: [evento] });

  const menuResp = await enviar(handleMessage, NUMERO_COMUM, "2");
  assert.match(menuResp[0], /Para qual mês/);

  setEventos([evento]);
  const listaResp = await enviar(handleMessage, NUMERO_COMUM, String(mesAtual));
  assert.equal(listaResp.length, 2); // "🔍 Consultando..." + a lista em si
  assert.match(listaResp[1], /Culto de Casais/);

  const detalheResp = await enviar(handleMessage, NUMERO_COMUM, "1");
  assert.match(detalheResp[0], /Salão Novo/);
  assert.match(detalheResp[0], /Traga seu cônjuge!/);
});

test("opção 2: mês sem eventos avisa e encerra o fluxo (não trava esperando um número de item)", async () => {
  const agora = moment.tz("America/Sao_Paulo");
  const mesAtual = agora.month() + 1;
  const { handleMessage, etapas } = criarContexto({ eventos: [] });

  await enviar(handleMessage, NUMERO_COMUM, "2");
  const respostas = await enviar(handleMessage, NUMERO_COMUM, String(mesAtual));
  assert.match(respostas[1], /Não há eventos programados/);
  assert.equal(etapas[NUMERO_COMUM], undefined, "o fluxo deveria ter sido encerrado");
});

test("opção 2: período personalizado (DD/MM a DD/MM) busca e entrega a agenda", async () => {
  const agora = moment.tz("America/Sao_Paulo");
  const inicio = agora.clone().add(2, "days");
  const fim = agora.clone().add(5, "days");
  const evento = {
    calendarId: AGENDAS[0],
    summary: "Mutirão de Evangelismo",
    start: { dateTime: inicio.clone().add(1, "day").hour(9).format() },
    end: { dateTime: inicio.clone().add(1, "day").hour(11).format() },
  };
  const { handleMessage } = criarContexto({ eventos: [evento] });

  await enviar(handleMessage, NUMERO_COMUM, "2");
  const escolhaZero = await enviar(handleMessage, NUMERO_COMUM, "0");
  assert.match(escolhaZero[0], /Digite as datas de início e fim/);

  const periodo = `${inicio.format("DD/MM")} a ${fim.format("DD/MM")}`;
  const resposta = await enviar(handleMessage, NUMERO_COMUM, periodo);
  assert.match(resposta[1], /Mutirão de Evangelismo/);
});

test("opção 2: período personalizado em formato inválido pede para tentar de novo, sem encerrar o fluxo", async () => {
  const { handleMessage, etapas } = criarContexto();
  await enviar(handleMessage, NUMERO_COMUM, "2");
  await enviar(handleMessage, NUMERO_COMUM, "0");
  const resposta = await enviar(handleMessage, NUMERO_COMUM, "não sei quando");
  assert.match(resposta[0], /Não consegui entender as datas/);
  assert.equal(etapas[NUMERO_COMUM].etapa, "periodo_personalizado");
});

test("opção 2: eventos da agenda 'Eventos Externos' ficam ocultos na consulta da agenda da igreja", async () => {
  const agora = moment.tz("America/Sao_Paulo");
  const mesAtual = agora.month() + 1;
  const eventoIgreja = criarEventoIgreja(agora, mesAtual);
  const eventoExterno = {
    calendarId: AGENDAS[10], // Eventos Externos
    summary: "Congresso Regional Externo",
    location: "Ginásio Municipal",
    start: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 17, hour: 14, minute: 0 }).format() },
    end: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 17, hour: 18, minute: 0 }).format() },
  };

  // 1. Quando há evento da igreja e evento externo, apenas o evento da igreja aparece
  const ctx1 = criarContexto({ eventos: [eventoIgreja, eventoExterno] });
  await enviar(ctx1.handleMessage, NUMERO_COMUM, "2");
  const res1 = await enviar(ctx1.handleMessage, NUMERO_COMUM, String(mesAtual));
  assert.match(res1[1], /Culto de Casais/);
  assert.doesNotMatch(res1[1], /Congresso Regional Externo/);

  // 2. Quando há apenas evento externo no mês, a agenda informa que não há eventos programados
  const ctx2 = criarContexto({ eventos: [eventoExterno] });
  await enviar(ctx2.handleMessage, NUMERO_COMUM, "2");
  const res2 = await enviar(ctx2.handleMessage, NUMERO_COMUM, String(mesAtual));
  assert.match(res2[1], /Não há eventos programados/);
});

test("opção 2: eventos das agendas internas (Reuniões, Atendimento, Limpeza, Ensaios) ficam ocultos na consulta da agenda da igreja", async () => {
  const agora = moment.tz("America/Sao_Paulo");
  const mesAtual = agora.month() + 1;
  const eventoIgreja = criarEventoIgreja(agora, mesAtual);
  const eventoReuniao = {
    calendarId: AGENDAS[11], // Reuniões
    summary: "Reunião de Líderes",
    start: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 16, hour: 10, minute: 0 }).format() },
    end: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 16, hour: 12, minute: 0 }).format() },
  };
  const eventoAtendimento = {
    calendarId: AGENDAS[12], // Atendimento
    summary: "Atendimento Individual",
    start: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 16, hour: 14, minute: 0 }).format() },
    end: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 16, hour: 15, minute: 0 }).format() },
  };
  const eventoLimpeza = {
    calendarId: AGENDAS[13], // Limpeza
    summary: "Faxina Geral do Templo",
    start: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 17, hour: 8, minute: 0 }).format() },
    end: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 17, hour: 12, minute: 0 }).format() },
  };
  const eventoEnsaio = {
    calendarId: AGENDAS[14], // Ensaios
    summary: "Ensaio Louvor Geral",
    start: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 18, hour: 15, minute: 0 }).format() },
    end: { dateTime: agora.clone().set({ month: mesAtual - 1, date: 18, hour: 17, minute: 0 }).format() },
  };

  const ctx = criarContexto({ eventos: [eventoIgreja, eventoReuniao, eventoAtendimento, eventoLimpeza, eventoEnsaio] });
  await enviar(ctx.handleMessage, NUMERO_COMUM, "2");
  const res = await enviar(ctx.handleMessage, NUMERO_COMUM, String(mesAtual));
  assert.match(res[1], /Culto de Casais/);
  assert.doesNotMatch(res[1], /Reunião de Líderes/);
  assert.doesNotMatch(res[1], /Atendimento Individual/);
  assert.doesNotMatch(res[1], /Faxina Geral do Templo/);
  assert.doesNotMatch(res[1], /Ensaio Louvor Geral/);
});

test("opção 6: eventos das agendas internas não impedem o agendamento de eventos da igreja", async () => {
  const agora = moment.tz("America/Sao_Paulo");
  const mesAlvo = agora.month() + 1;
  const anoAlvo = agora.year();
  const diaAlvo = 22;

  const eventoLimpeza = {
    calendarId: AGENDAS[13], // Limpeza
    summary: "Limpeza da Nave",
    start: { dateTime: moment.tz(`${diaAlvo}/${mesAlvo}/${anoAlvo} 19:00`, "D/M/YYYY HH:mm", "America/Sao_Paulo").format() },
    end: { dateTime: moment.tz(`${diaAlvo}/${mesAlvo}/${anoAlvo} 21:00`, "D/M/YYYY HH:mm", "America/Sao_Paulo").format() },
  };

  const { handleMessage } = criarContexto({ eventos: [eventoLimpeza] });

  const { respDia } = await iniciarAgendamentoDataEspecifica(handleMessage, {
    titulo: "Culto de Homens",
    local: "igreja",
    rede: "7",
    mes: mesAlvo,
    dia: diaAlvo,
  });
  assert.doesNotMatch(respDia.join(" "), /Limpeza da Nave/);
  assert.match(respDia[1], /Horários livres/i);
});

test("opção 6: evento da agenda 'Eventos Externos' conta como conflito no agendamento de novo evento", async () => {
  const agora = moment.tz("America/Sao_Paulo");
  const mesAlvo = agora.month() + 1;
  const anoAlvo = agora.year();
  const diaAlvo = 20;

  const eventoExterno = {
    calendarId: AGENDAS[10], // Eventos Externos
    summary: "Evento Externo Bloqueador",
    start: { dateTime: moment.tz(`${diaAlvo}/${mesAlvo}/${anoAlvo} 19:00`, "D/M/YYYY HH:mm", "America/Sao_Paulo").format() },
    end: { dateTime: moment.tz(`${diaAlvo}/${mesAlvo}/${anoAlvo} 21:00`, "D/M/YYYY HH:mm", "America/Sao_Paulo").format() },
  };

  const { handleMessage } = criarContexto({ eventos: [eventoExterno] });

  await iniciarAgendamentoDataEspecifica(handleMessage, {
    titulo: "Reunião de Homens",
    local: "igreja",
    rede: "7",
    mes: mesAlvo,
    dia: diaAlvo,
  });
  await enviar(handleMessage, NUMERO_LIDER, "19:30"); // Horário de início em conflito
  const respFim = await enviar(handleMessage, NUMERO_LIDER, "20:30");

  assert.match(respFim[0], /Esse horário conflita com o evento/);
  assert.match(respFim[0], /Evento Externo Bloqueador/);
});

test("opção 6: líder pode agendar evento escolhendo departamento 'Eventos Externos' (opção 10)", async () => {
  const agora = moment.tz("America/Sao_Paulo");
  const mesAlvo = agora.month() + 1;
  const diaAlvo = 22;

  const { handleMessage, gruposEnviados, eventosGravados } = criarContexto();

  const { respRede } = await iniciarAgendamentoDataEspecifica(handleMessage, {
    titulo: "Encontro Regional",
    local: "Parque da Cidade",
    rede: "10",
    mes: mesAlvo,
    dia: diaAlvo,
  });
  assert.match(respRede[0], /Para qual \*mês\*/);

  await enviar(handleMessage, NUMERO_LIDER, "14:00");
  const respFinalizar = await enviar(handleMessage, NUMERO_LIDER, "17:00");

  assert.match(respFinalizar[0], /Solicitação de Agendamento/);
  assert.match(respFinalizar[0], /Departamento:\* Eventos Externos/);

  // Secretaria aprova no grupo
  const codigo = extrairCodigo(gruposEnviados[0]);
  assert.ok(codigo);

  const msgSecretaria = criarMsgGrupo({
    body: "marcar evento",
    quotedBody: gruposEnviados[0],
  });
  await handleMessage(msgSecretaria);

  assert.equal(eventosGravados.length, 1);
  assert.equal(eventosGravados[0].calendarId, AGENDAS[10]); // Salvo na agenda de Eventos Externos
  assert.match(eventosGravados[0].resource.summary, /Encontro Regional/);
});

// ---------------------------------------------------------------------------
// Opção 3 — Atendimento pastoral
// ---------------------------------------------------------------------------

test("opção 3: coleta nome e disponibilidade, notifica o grupo de atendimento pastoral e encerra o fluxo", async () => {
  const { handleMessage, etapas, gruposEnviados } = criarContexto();

  const r1 = await enviar(handleMessage, NUMERO_COMUM, "3");
  assert.match(r1[0], /Qual é o seu \*nome\*/);

  const r2 = await enviar(handleMessage, NUMERO_COMUM, "Maria");
  assert.match(r2[0], /dias e horários/);

  const r3 = await enviar(handleMessage, NUMERO_COMUM, "Terças à tarde");
  assert.match(r3[0], /solicitação de atendimento pastoral foi registrada/);
  assert.match(r3[0], /Maria/);
  assert.match(r3[0], /Terças à tarde/);

  assert.equal(etapas[NUMERO_COMUM], undefined);
  // Atendimento pastoral notifica o grupo "Atendimento Pastoral"
  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /NOVA SOLICITAÇÃO DE ATENDIMENTO PASTORAL/);
});

// ---------------------------------------------------------------------------
// Opção 4 — Aulas de música
// ---------------------------------------------------------------------------

test("opção 4: retorna a mensagem estática sobre aulas de música", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "4");
  assert.match(respostas[0], /Aulas de Música/);
});

// ---------------------------------------------------------------------------
// Opção 5 — Falar com a secretaria
// ---------------------------------------------------------------------------

test("opção 5: notifica o grupo da secretaria com o nome do contato", async () => {
  const { handleMessage, gruposEnviados } = criarContexto();
  const msg = criarMsgPrivada(NUMERO_COMUM, "5", { pushname: "João" });
  await handleMessage(msg);

  assert.match(msg.respostas[0], /Um atendente responderá em breve/);
  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /João/);
  assert.match(gruposEnviados[0], /PEDIDO DE ATENDIMENTO/);
});

// ---------------------------------------------------------------------------
// Opção 6 — Agendar ou alterar evento (só líderes)
// ---------------------------------------------------------------------------

test("opção 6: usuário comum não tem acesso (cai no fallback genérico, sem revelar a opção de líder)", async () => {
  const { handleMessage, etapas } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "6");
  assert.match(respostas[0], /Não entendi sua mensagem/);
  assert.equal(etapas[NUMERO_COMUM], undefined);
});

test("opção 6 (líder): agenda um novo evento do início ao fim, e a secretaria aprova pelo grupo", async () => {
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosGravados } = criarContexto({ eventos: [] });

  const { finalResp, escolha } = await solicitarAgendamentoSemana(handleMessage);

  assert.match(finalResp[finalResp.length - 1], /Datas Disponíveis/);

  assert.match(escolha[0], /Solicitação de Agendamento/);
  assert.match(escolha[0], /Culto de Jovens/);
  assert.match(escolha[0], /Rua Benedicto de Abreu Júnior/);
  assert.doesNotMatch(escolha[0], /forms\.gle/, "o link do formulário não deveria aparecer antes da confirmação");

  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /NOVO AGENDAMENTO SOLICITADO/);
  assert.match(gruposEnviados[0], /Culto de Jovens/);
  assert.match(gruposEnviados[0], /Rua Benedicto de Abreu Júnior/);
  assert.match(gruposEnviados[0], /Código: [A-Z0-9]{4}/, "a mensagem deveria trazer um código curto, não o blob de dados cru");
  assert.doesNotMatch(gruposEnviados[0], /DADOS:/, "não deveria mais existir o blob base64 antigo na mensagem");

  const dados = decodificarDadosAgendamento(gruposEnviados[0]);
  assert.equal(dados.solicitanteId, NUMERO_LIDER);
  assert.equal(dados.evento, "Culto de Jovens");
  assert.equal(dados.rede, "Rede de Homens");
  assert.match(dados.local, /Rua Benedicto de Abreu Júnior/);

  // A secretaria responde ("reply") à mensagem do bot no grupo com "marcar evento"
  const aprovacao = criarMsgGrupo({
    nomeGrupo: "Mensagens Secretaria",
    body: "marcar evento",
    quotedBody: gruposEnviados[0],
  });
  await handleMessage(aprovacao);

  assert.equal(eventosGravados.length, 1, "deveria ter gravado o evento na Google Agenda");
  assert.equal(eventosGravados[0].calendarId, AGENDAS[7]); // índice da Rede de Homens
  assert.equal(eventosGravados[0].resource.summary, "Culto de Jovens");
  assert.match(eventosGravados[0].resource.location, /Rua Benedicto de Abreu Júnior/);

  assert.equal(diretasEnviadas.length, 1);
  assert.equal(diretasEnviadas[0].to, NUMERO_LIDER);
  assert.match(diretasEnviadas[0].texto, /Agendamento Confirmado e Gravado/);
  assert.match(diretasEnviadas[0].texto, /forms\.gle\/paug7A1kx5eyA2zr6/);
  assert.match(aprovacao.respostas[0], /Evento gravado na agenda/);

  // Depois de já aprovado, responder de novo à mesma mensagem não grava outra vez
  const segundaResposta = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "marcar evento", quotedBody: gruposEnviados[0] });
  await handleMessage(segundaResposta);
  assert.equal(eventosGravados.length, 1, "não deveria gravar o evento duas vezes");
  assert.match(segundaResposta.respostas[0], /Não encontrei essa solicitação/);
});

test("opção 6 (líder): resumo do grupo usa o nome cadastrado no painel de líderes, não o nome do contato salvo no celular", async () => {
  const { handleMessage, gruposEnviados } = criarContexto({
    eventos: [],
    lideresCadastrados: [{ nome: "Pastor Marcos", telefone: "5511999999999" }],
  });

  await solicitarAgendamentoSemana(handleMessage, { extraOpts: { pushname: "celular do Pastor" } });

  assert.match(gruposEnviados[0], /Solicitante:\* Pastor Marcos/);
  assert.doesNotMatch(gruposEnviados[0], /celular do Pastor/);
});

test("opção 6 (líder): sem nome cadastrado no painel, o resumo do grupo cai de volta pro nome do contato", async () => {
  const { handleMessage, gruposEnviados } = criarContexto({ eventos: [], lideresCadastrados: [] });

  await solicitarAgendamentoSemana(handleMessage, { extraOpts: { pushname: "celular do Pastor" } });

  assert.match(gruposEnviados[0], /Solicitante:\* celular do Pastor/);
});

test("opção 6 (líder): duas solicitações pendentes ao mesmo tempo não se confundem — cada código resolve o pedido certo", async () => {
  const { handleMessage, gruposEnviados, eventosGravados } = criarContexto({ eventos: [] });

  // Primeira solicitação
  await solicitarAgendamentoSemana(handleMessage, { titulo: "Culto A", rede: "7" });

  // Segunda solicitação, de outro líder, antes da primeira ser respondida
  await solicitarAgendamentoSemana(handleMessage, { titulo: "Culto B", rede: "6" });

  assert.equal(gruposEnviados.length, 2);
  const dadosA = decodificarDadosAgendamento(gruposEnviados[0]);
  const dadosB = decodificarDadosAgendamento(gruposEnviados[1]);
  assert.equal(dadosA.evento, "Culto A");
  assert.equal(dadosB.evento, "Culto B");

  // Aprova só a segunda solicitação (Culto B) — a primeira (Culto A) continua pendente
  const aprovacaoB = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "marcar evento", quotedBody: gruposEnviados[1] });
  await handleMessage(aprovacaoB);

  assert.equal(eventosGravados.length, 1);
  assert.equal(eventosGravados[0].resource.summary, "Culto B");

  // A primeira (Culto A) ainda deve estar pendente e resolvível normalmente
  const aprovacaoA = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "marcar evento", quotedBody: gruposEnviados[0] });
  await handleMessage(aprovacaoA);

  assert.equal(eventosGravados.length, 2);
  assert.equal(eventosGravados[1].resource.summary, "Culto A");
});

test("opção 6 (líder): endereço customizado (evento fora da igreja) é usado como informado, sem substituição", async () => {
  const { handleMessage } = criarContexto({ eventos: [] });

  const { escolha } = await solicitarAgendamentoSemana(handleMessage, {
    titulo: "Reunião de Casais",
    local: "Rua das Flores, 123 - Jardim Primavera",
    rede: "6",
  });

  assert.match(escolha[0], /Rua das Flores, 123 - Jardim Primavera/);
  assert.doesNotMatch(escolha[0], /Rua Benedicto de Abreu Júnior/);
});

test("opção 6 (líder): evento de DIA TODO pula a pergunta de horário de término", async () => {
  const { handleMessage } = criarContexto({ eventos: [] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Retiro Espiritual");
  await enviar(handleMessage, NUMERO_LIDER, "Sítio da Família Silva"); // local
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Evangelismo
  await enviar(handleMessage, NUMERO_LIDER, "11"); // Novembro
  await enviar(handleMessage, NUMERO_LIDER, "2"); // busca por dia da semana/horário
  await enviar(handleMessage, NUMERO_LIDER, "8"); // Vários dias / evento longo
  const resp = await enviar(handleMessage, NUMERO_LIDER, "DIA TODO");

  assert.match(resp[resp.length - 1], /Datas Disponíveis/);
});

// ---------------------------------------------------------------------------
// Opção 6 (líder) — Agendar por data específica ("1" no menu de modo de busca)
// ---------------------------------------------------------------------------

test("opção 6 (líder): agenda por data específica — dia livre sugere horários e completa o fluxo", async () => {
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosGravados } = criarContexto({ eventos: [] });

  const { respModo, respDia } = await iniciarAgendamentoDataEspecifica(handleMessage, {
    titulo: "Culto Extra",
    local: "Igreja",
    rede: "7",
    mes: "12",
    dia: "10",
  });
  assert.match(respModo[0], /Qual o dia do mês/);

  assert.match(respDia[respDia.length - 1], /está livre/);
  assert.match(respDia[respDia.length - 1], /07:00 às 22:00/);

  await enviar(handleMessage, NUMERO_LIDER, "19:00");
  const finalResp = await enviar(handleMessage, NUMERO_LIDER, "21:00");
  assert.match(finalResp[0], /Solicitação de Agendamento/);
  assert.match(finalResp[0], /10\/12/);

  assert.equal(gruposEnviados.length, 1);
  const dados = decodificarDadosAgendamento(gruposEnviados[0]);
  assert.equal(dados.dia, 10);
  assert.equal(dados.mes, 12);

  const aprovacao = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "marcar evento", quotedBody: gruposEnviados[0] });
  await handleMessage(aprovacao);

  assert.equal(eventosGravados.length, 1);
  assert.match(diretasEnviadas[0].texto, /Agendamento Confirmado e Gravado/);
});

test("opção 6 (líder): agenda por data específica — dia de Sábado LIVRE é recusado com motivo claro", async () => {
  const eventos = [{
    calendarId: AGENDAS[0],
    summary: "Sábado LIVRE",
    start: { date: "2026-12-05" },
    end: { date: "2026-12-06" },
  }];
  const { handleMessage, etapas } = criarContexto({ eventos });

  const { respDia } = await iniciarAgendamentoDataEspecifica(handleMessage, {
    titulo: "Culto Extra",
    local: "Igreja",
    rede: "7",
    mes: "12",
    dia: "5",
  });
  assert.match(respDia[respDia.length - 1], /Sábado LIVRE/);
  assert.equal(etapas[NUMERO_LIDER], undefined, "o fluxo deveria ser encerrado após o bloqueio");
});

test("opção 6 (líder): agenda por data específica — horário pedido conflita com evento existente no dia", async () => {
  const eventos = [{
    calendarId: AGENDAS[7],
    summary: "Culto de Homens",
    start: { dateTime: "2026-12-10T19:00:00-03:00" },
    end: { dateTime: "2026-12-10T20:00:00-03:00" },
  }];
  const { handleMessage } = criarContexto({ eventos });

  const { respDia } = await iniciarAgendamentoDataEspecifica(handleMessage, {
    titulo: "Culto Extra",
    local: "Igreja",
    rede: "7",
    mes: "12",
    dia: "10",
  });
  assert.match(respDia[respDia.length - 1], /07:00 às 18:00/); // livre até 18h (buffer de 1h antes do evento das 19h)
  assert.match(respDia[respDia.length - 1], /21:00 às 22:00/); // livre depois do buffer de 1h após o evento das 20h

  await enviar(handleMessage, NUMERO_LIDER, "20:15"); // dentro do buffer de 1h do evento das 19h-20h
  const conflitoResp = await enviar(handleMessage, NUMERO_LIDER, "21:00");
  assert.match(conflitoResp[0], /Culto de Homens/);
  assert.match(conflitoResp[0], /19:00/);
});

test("opção 6 (líder): agenda por data específica — dia inválido para o mês pede pra tentar de novo", async () => {
  const { handleMessage, etapas } = criarContexto({ eventos: [] });

  const { respDia } = await iniciarAgendamentoDataEspecifica(handleMessage, {
    titulo: "Culto Extra",
    local: "Igreja",
    rede: "7",
    mes: "2",
    dia: "30",
  });
  assert.match(respDia[0], /Dia inválido/);
  assert.equal(etapas[NUMERO_LIDER].etapa, "evento_dia_especifico", "deveria continuar esperando um dia válido");
});

test("opção 6 (líder): agenda por data específica — não deixa escolher um dia que já passou", async () => {
  const { handleMessage, gruposEnviados } = criarContexto({ eventos: [] });
  const ontem = moment.tz("America/Sao_Paulo").subtract(1, "day");

  const { respDia } = await iniciarAgendamentoDataEspecifica(handleMessage, {
    titulo: "Culto Extra",
    local: "Igreja",
    rede: "7",
    mes: String(ontem.month() + 1),
    dia: String(ontem.date()),
  });
  assert.match(respDia[respDia.length - 1], /já passou/);
  assert.match(respDia[respDia.length - 1], /a partir de hoje/);
  assert.equal(gruposEnviados.length, 0, "não deveria notificar a secretaria de uma data que já passou");
});

test("opção 6 (líder): secretaria recusa a solicitação ('não marcar') — solicitante é avisado e nada é gravado", async () => {
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosGravados } = criarContexto({ eventos: [] });

  await solicitarAgendamentoSemana(handleMessage);

  const recusa = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "não marcar", quotedBody: gruposEnviados[0] });
  await handleMessage(recusa);

  assert.equal(eventosGravados.length, 0);
  assert.equal(diretasEnviadas.length, 1);
  assert.match(diretasEnviadas[0].texto, /não pudemos confirmar/);
  assert.match(recusa.respostas[0], /Líder notificado sobre a recusa/);
});

test("opção 6 (líder): alterar evento existente (texto livre), do início ao fim, com aprovação manual da secretaria", async () => {
  const eventoExistente = criarEventoExistente({ id: "evt-culto-mulheres", summary: "Culto de Mulheres" });
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosAlterados, setEventos } = criarContexto({ eventos: [eventoExistente] });

  const { listaResp, escolhaResp } = await iniciarAlteracaoEvento(handleMessage, { rede: "9", item: "1", setEventos, evento: eventoExistente });
  assert.match(listaResp[1], /Culto de Mulheres/);
  assert.match(escolhaResp[0], /Você selecionou.*Culto de Mulheres/s);
  assert.match(escolhaResp[0], /O que você deseja alterar/);

  const submenuResp = await enviar(handleMessage, NUMERO_LIDER, "5"); // Outra alteração (texto livre)
  assert.match(submenuResp[0], /Descreva a alteração/);

  const finalResp = await enviar(handleMessage, NUMERO_LIDER, "Mudar horário para 20h");
  assert.match(finalResp[0], /Solicitação de Alteração/);

  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /PEDIDO DE ALTERAÇÃO/);

  const aprovacao = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "alterar evento", quotedBody: gruposEnviados[0] });
  await handleMessage(aprovacao);

  // Texto livre não tem como ser aplicado automaticamente: fica só no aviso, sem chamar o patch.
  assert.equal(eventosAlterados.length, 0);
  assert.equal(diretasEnviadas.length, 1);
  assert.match(diretasEnviadas[0].texto, /Alteração Aprovada/);
  assert.doesNotMatch(diretasEnviadas[0].texto, /Aplicada/);
  assert.match(aprovacao.respostas[0], /aprovação da alteração/);
});

test("opção 6 (líder): alterar evento (texto livre) — secretaria recusa ('não alterar')", async () => {
  const eventoExistente = criarEventoExistente({ id: "evt-culto-mulheres", summary: "Culto de Mulheres" });
  const { handleMessage, gruposEnviados, diretasEnviadas } = criarContexto({ eventos: [eventoExistente] });

  await iniciarAlteracaoEvento(handleMessage, { rede: "9", item: "1" });
  await enviar(handleMessage, NUMERO_LIDER, "5"); // Outra alteração (texto livre)
  await enviar(handleMessage, NUMERO_LIDER, "Mudar horário para 20h");

  const recusa = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "não alterar", quotedBody: gruposEnviados[0] });
  await handleMessage(recusa);

  assert.match(diretasEnviadas[0].texto, /não pôde ser aprovada/);
  assert.match(recusa.respostas[0], /recusa da alteração/);
});

test("opção 6 (líder): alterar horário de evento existente, aplicado automaticamente na aprovação", async () => {
  const eventoExistente = criarEventoExistente({ id: "evt-culto-jovens", summary: "Culto de Jovens", hora: 19, duracaoHoras: 2 });
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosAlterados, setEventos } = criarContexto({ eventos: [eventoExistente] });

  await iniciarAlteracaoEvento(handleMessage, { rede: "7", item: "1", setEventos, evento: eventoExistente });

  const submenuResp = await enviar(handleMessage, NUMERO_LIDER, "1"); // Horário
  assert.match(submenuResp[0], /horário de início/);

  await enviar(handleMessage, NUMERO_LIDER, "20:00");
  const finalResp = await enviar(handleMessage, NUMERO_LIDER, "22:00");
  assert.match(finalResp[0], /Solicitação de Alteração/);
  assert.match(finalResp[0], /20:00 - 22:00/);

  const aprovacao = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "alterar evento", quotedBody: gruposEnviados[0] });
  await handleMessage(aprovacao);

  assert.equal(eventosAlterados.length, 1);
  assert.equal(eventosAlterados[0].eventId, "evt-culto-jovens");
  assert.match(eventosAlterados[0].resource.start.dateTime, /20:00:00/);
  assert.match(eventosAlterados[0].resource.end.dateTime, /22:00:00/);
  assert.match(diretasEnviadas[0].texto, /Aprovada e Aplicada/);
  assert.match(aprovacao.respostas[0], /Alteração aplicada na agenda/);
});

test("opção 6 (líder): alterar a data de um evento para um dia que já passou é recusado como data inválida", async () => {
  const eventoExistente = criarEventoExistente({ id: "evt-culto-jovens", summary: "Culto de Jovens", hora: 19, duracaoHoras: 2 });
  const { handleMessage, etapas, setEventos } = criarContexto({ eventos: [eventoExistente] });

  await iniciarAlteracaoEvento(handleMessage, { rede: "7", item: "1", setEventos, evento: eventoExistente });
  await enviar(handleMessage, NUMERO_LIDER, "2"); // Data

  const ontem = moment.tz("America/Sao_Paulo").subtract(1, "day");
  const resp = await enviar(handleMessage, NUMERO_LIDER, ontem.format("DD/MM"));

  assert.match(resp[0], /Data inválida/);
  assert.match(resp[0], /já passou/);
  assert.equal(etapas[NUMERO_LIDER].etapa, "alterar_nova_data", "deveria continuar esperando uma data válida");
});

test("opção 6 (líder): cancelar evento existente — aprovado pela secretaria remove da agenda", async () => {
  const eventoExistente = criarEventoExistente({ id: "evt-retiro", summary: "Retiro Espiritual" });
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosCancelados, setEventos } = criarContexto({ eventos: [eventoExistente] });

  const { listaResp, confirmarResp, finalResp } = await iniciarCancelamentoEvento(handleMessage, {
    rede: "1",
    item: "1",
    setEventos,
    evento: eventoExistente,
  });
  assert.match(listaResp[1], /Retiro Espiritual/);
  assert.match(confirmarResp[0], /certeza.*cancelar/is);
  assert.match(finalResp[0], /Solicitação de Cancelamento/);

  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /PEDIDO DE CANCELAMENTO/);

  const aprovacao = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "cancelar evento", quotedBody: gruposEnviados[0] });
  await handleMessage(aprovacao);

  assert.equal(eventosCancelados.length, 1);
  assert.equal(eventosCancelados[0].eventId, "evt-retiro");
  assert.match(diretasEnviadas[0].texto, /Evento Cancelado/);
  assert.match(aprovacao.respostas[0], /Evento cancelado na agenda/);
});

test("opção 6 (líder): cancelar evento — secretaria nega ('manter evento')", async () => {
  const eventoExistente = criarEventoExistente({ id: "evt-retiro-2", summary: "Retiro Espiritual" });
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosCancelados } = criarContexto({ eventos: [eventoExistente] });

  await iniciarCancelamentoEvento(handleMessage, { rede: "1", item: "1" });

  const negativa = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "manter evento", quotedBody: gruposEnviados[0] });
  await handleMessage(negativa);

  assert.equal(eventosCancelados.length, 0);
  assert.match(diretasEnviadas[0].texto, /Evento Mantido/);
  assert.match(negativa.respostas[0], /evento foi mantido/);
});

test("opção 6 (líder): departamento sem eventos futuros encerra o fluxo de alteração", async () => {
  const { handleMessage, etapas } = criarContexto({ eventos: [] });
  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "2");
  const resp = await enviar(handleMessage, NUMERO_LIDER, "9");
  assert.match(resp[1], /Não encontrei eventos futuros/);
  assert.equal(etapas[NUMERO_LIDER], undefined);
});

test("opção 6 (líder): evento que já passou não aparece na lista pra alterar/cancelar (precisa ser um agendamento novo)", async () => {
  const etapas = {};
  const client = {
    sendMessage: async () => {},
    getChats: async () => [{ isGroup: true, name: "Mensagens Secretaria", sendMessage: async () => {} }],
  };
  const calendar = { events: {} };

  const ontem = moment.tz("America/Sao_Paulo").subtract(1, "day");
  const amanha = moment.tz("America/Sao_Paulo").add(1, "day");
  const eventoPassado = {
    summary: "Evento Já Ocorrido",
    start: { dateTime: ontem.clone().set({ hour: 10, minute: 0 }).format() },
    end: { dateTime: ontem.clone().set({ hour: 11, minute: 0 }).format() },
  };
  const eventoFuturo = {
    summary: "Evento Futuro",
    start: { dateTime: amanha.clone().set({ hour: 10, minute: 0 }).format() },
    end: { dateTime: amanha.clone().set({ hour: 11, minute: 0 }).format() },
  };
  // Mock realista: filtra por período, como a implementação de verdade (bot/chatbot.js)
  // faz via calendar.events.list({ timeMin, timeMax }) — diferente do mock padrão de
  // criarContexto(), que ignora o período e sempre retorna tudo.
  const buscarEventosPorPeriodo = async (inicio, fim) => {
    return [eventoPassado, eventoFuturo].filter((ev) => {
      const d = moment(ev.start.dateTime);
      return d.isSameOrAfter(moment(inicio)) && d.isSameOrBefore(moment(fim));
    });
  };

  const handleMessage = createMessageHandler({
    client, calendar, agendasParaLer: AGENDAS, lideres: LIDERES, etapas,
    buscarEventos: buscarEventosPorPeriodo,
  });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "2"); // Alterar evento existente
  const listaResp = await enviar(handleMessage, NUMERO_LIDER, "7"); // Rede de Homens

  const ultimaResp = listaResp[listaResp.length - 1];
  assert.doesNotMatch(ultimaResp, /Evento Já Ocorrido/);
  assert.match(ultimaResp, /Evento Futuro/);
});

// ---------------------------------------------------------------------------
// Opção 7 — Comunicados e avisos (só líderes)
// ---------------------------------------------------------------------------

test("opção 7: usuário comum não tem acesso (fallback genérico)", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "7");
  assert.match(respostas[0], /Não entendi sua mensagem/);
});

test("opção 7 (líder): encaminha o comunicado em texto livre para a secretaria", async () => {
  const { handleMessage, gruposEnviados, etapas } = criarContexto();

  const r1 = await enviar(handleMessage, NUMERO_LIDER, "6");
  assert.match(r1[0], /Área do Líder/);

  const r2 = await enviar(handleMessage, NUMERO_LIDER, "2");
  assert.match(r2[0], /comunicado/i);

  const r3 = await enviar(handleMessage, NUMERO_LIDER, "Não haverá culto no dia 20 por conta da reforma.");
  assert.match(r3[0], /encaminhada para a secretaria/);

  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /NOVO COMUNICADO PARA O CULTO/);
  assert.match(gruposEnviados[0], /reforma/);
  assert.equal(etapas[NUMERO_LIDER], undefined);
});

test("opção 7 (líder): resumo do comunicado também usa o nome cadastrado no painel de líderes", async () => {
  const { handleMessage, gruposEnviados } = criarContexto({
    lideresCadastrados: [{ nome: "Pastor Marcos", telefone: "5511999999999" }],
  });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "2");
  await enviar(handleMessage, NUMERO_LIDER, "Não haverá culto no dia 20.", { pushname: "celular do Pastor" });

  assert.match(gruposEnviados[0], /Solicitante:\* Pastor Marcos/);
  assert.doesNotMatch(gruposEnviados[0], /celular do Pastor/);
});

// ---------------------------------------------------------------------------
// Grupo "Mensagens Secretaria" — casos de borda
// ---------------------------------------------------------------------------

test("grupo: msg.getChat() falhando uma vez (soluço passageiro do whatsapp-web.js) tenta de novo e processa normalmente", async () => {
  const { handleMessage } = criarContexto({ eventos: [] });

  let chamadas = 0;
  const respostas = [];
  const msg = {
    from: "120363000000000000@g.us",
    fromMe: false,
    hasQuotedMsg: true, // só chega em getChat() se for resposta a algo E bater uma palavra-chave
    body: "marcar evento",
    reply: async (texto) => { respostas.push(texto); return texto; },
    getChat: async () => {
      chamadas++;
      if (chamadas === 1) throw new Error("r: r"); // simula a falha transitória real relatada
      return { name: "Outro Grupo Qualquer", isGroup: true };
    },
  };

  await handleMessage(msg);

  assert.equal(chamadas, 2, "deveria ter tentado getChat() de novo depois da primeira falha");
  assert.equal(respostas.length, 0, "grupo não é 'Mensagens Secretaria', então segue ignorado normalmente após a retentativa");
});

test("grupo: msg.getChat() que nunca resolve (JID inválido/sintético) é ignorado sem virar erro fatal", async () => {
  const { handleMessage } = criarContexto({ eventos: [] });

  let chamadas = 0;
  const respostas = [];
  const msg = {
    from: "12030000000000000043@g.us", // JID estranho, sem chat de verdade por trás
    fromMe: false,
    hasQuotedMsg: true,
    body: "marcar evento",
    reply: async (texto) => { respostas.push(texto); return texto; },
    getChat: async () => {
      chamadas++;
      throw new Error("r: r"); // sempre falha, como no caso real relatado em produção
    },
  };

  // Não deveria lançar (o catch interno precisa segurar isso antes de chegar no
  // catch externo, que é o que gera o alerta crítico repetidamente).
  await assert.doesNotReject(() => handleMessage(msg));

  assert.equal(chamadas, 2, "ainda tenta de novo uma vez, mas desiste depois disso");
  assert.equal(respostas.length, 0, "não responde nada — a mensagem é só ignorada");
});

test("grupo: mensagem comum (não é palavra-chave de aprovação) é ignorada sem chamar getChat() nem logar", async () => {
  const { handleMessage } = criarContexto({ eventos: [] });

  const jidGrupoConhecido = "120363000000000000@g.us";
  atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, jidGrupoConhecido);

  const msg = criarMsgGrupoSemQuote(jidGrupoConhecido, "Obrigado ♥️\n\nA paz e bom dia", "DIÁCONOS CURADOS");
  await handleMessage(msg);

  assert.equal(msg.getChamadasGetChat(), 0, "não deveria nem tentar carregar o chat pra uma mensagem comum do grupo");
  assert.equal(msg.respostas.length, 0);
});

test("grupo: palavra-chave digitada sem usar 'Responder' é ignorada sem chamar getChat()", async () => {
  const { handleMessage } = criarContexto({ eventos: [] });

  const jidGrupoConhecido = "120363000000000000@g.us";
  atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, jidGrupoConhecido);

  const msg = criarMsgGrupoSemQuote(jidGrupoConhecido, "marcar evento", "Mensagens Secretaria");
  await handleMessage(msg);

  assert.equal(msg.getChamadasGetChat(), 0, "não precisa do nome do chat só pra registrar que a palavra-chave veio sem reply");
  assert.equal(msg.respostas.length, 0);
});

test("grupo: mensagens em outros grupos são ignoradas (sem resposta)", async () => {
  const { handleMessage } = criarContexto();
  const msg = criarMsgGrupo({ nomeGrupo: "Outro Grupo Qualquer", body: "marcar evento", quotedBody: "irrelevante" });
  await handleMessage(msg);
  assert.equal(msg.respostas.length, 0);
});

test("grupo: 'marcar evento' que não é resposta a uma mensagem (hasQuotedMsg=false) é ignorado", async () => {
  const { handleMessage } = criarContexto();
  const msg = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "marcar evento", quotedBody: "x" });
  msg.hasQuotedMsg = false;
  await handleMessage(msg);
  assert.equal(msg.respostas.length, 0);
});

test("grupo: 'marcar evento' respondendo a uma mensagem que não é do bot é ignorado", async () => {
  const { handleMessage } = criarContexto();
  const msg = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "marcar evento", quotedBody: "algo", quotedFromMe: false });
  await handleMessage(msg);
  assert.equal(msg.respostas.length, 0);
});

test("grupo: 'marcar evento' respondendo a uma mensagem do bot sem código embutido avisa que não encontrou a solicitação", async () => {
  const { handleMessage } = criarContexto();
  const msg = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "marcar evento", quotedBody: "resumo sem código embutido" });
  await handleMessage(msg);
  assert.match(msg.respostas[0], /Não encontrei essa solicitação/);
});

// ---------------------------------------------------------------------------
// "menu" interrompe qualquer fluxo em andamento
// ---------------------------------------------------------------------------

test("digitar 'menu' no meio de qualquer fluxo reseta a conversa e mostra o menu principal", async () => {
  const { handleMessage, etapas } = criarContexto();
  await enviar(handleMessage, NUMERO_COMUM, "3"); // entra no fluxo pastoral
  assert.equal(etapas[NUMERO_COMUM].fluxo, "pastoral");

  const respostas = await enviar(handleMessage, NUMERO_COMUM, "menu");
  assert.match(respostas[0], /Escolha uma opção/);
  assert.equal(etapas[NUMERO_COMUM], undefined);
});

// ---------------------------------------------------------------------------
// Fluxo Pastoral (Opção 3) e aprovação pelo grupo "Atendimento Pastoral"
// ---------------------------------------------------------------------------

test("opção 3: fluxo de atendimento pastoral completo - solicitação + confirmação pela pastoral", async () => {
  const { handleMessage, gruposEnviados, diretasEnviadas } = criarContexto();

  // 1. Discípulo inicia o fluxo pastoral
  const r1 = await enviar(handleMessage, NUMERO_COMUM, "3");
  assert.match(r1[0], /Qual é o seu \*nome\*/);

  // 2. Discípulo informa o nome
  const r2 = await enviar(handleMessage, NUMERO_COMUM, "Gabriel");
  assert.match(r2[0], /informe quais os \*dias e horários\*/);

  // 3. Discípulo informa a disponibilidade
  const r3 = await enviar(handleMessage, NUMERO_COMUM, "Segunda à noite ou quarta de manhã");
  assert.match(r3[0], /atendimento pastoral foi registrada/);
  assert.match(r3[0], /Gabriel/);
  assert.match(r3[0], /Segunda à noite ou quarta de manhã/);

  // Deve ter notificado o grupo "Atendimento Pastoral"
  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /NOVA SOLICITAÇÃO DE ATENDIMENTO PASTORAL/);
  assert.match(gruposEnviados[0], /Gabriel/);
  assert.match(gruposEnviados[0], /Segunda à noite ou quarta de manhã/);

  const codigo = extrairCodigo(gruposEnviados[0]);
  assert.ok(codigo);

  // 4. Pastor responde no grupo "Atendimento Pastoral" confirmando o atendimento
  const msgPastor = await responderGrupoPastoral(handleMessage, {
    body: "confirmar segunda as 19h",
    quotedBody: gruposEnviados[0],
  });

  // Deve ter respondido ao pastor no grupo
  assert.equal(msgPastor.respostas.length, 1);
  assert.match(msgPastor.respostas[0], /✅ Atendimento de \*Gabriel\* confirmado para \*segunda as 19h\*/);

  // Deve ter enviado mensagem direta confirmando para o discípulo
  assert.equal(diretasEnviadas.length, 1);
  assert.equal(diretasEnviadas[0].to, NUMERO_COMUM);
  assert.match(diretasEnviadas[0].texto, /Atendimento Pastoral foi confirmado/);
  assert.match(diretasEnviadas[0].texto, /Dia: segunda/);
  assert.match(diretasEnviadas[0].texto, /Horário: 19h/);

  // Solicitação pendente deve ter sido removida
  assert.equal(buscarPendente(codigo), null);
});

test("opção 3: fluxo de atendimento pastoral completo - solicitação + recusa pela pastoral", async () => {
  const { handleMessage, gruposEnviados, diretasEnviadas } = criarContexto();

  // 1. Discípulo inicia o fluxo pastoral
  await enviar(handleMessage, NUMERO_COMUM, "3");
  await enviar(handleMessage, NUMERO_COMUM, "Gabriel");
  await enviar(handleMessage, NUMERO_COMUM, "Segunda à noite");

  const codigo = extrairCodigo(gruposEnviados[0]);
  assert.ok(codigo);

  // 2. Pastor responde no grupo "Atendimento Pastoral" recusando
  const msgPastor = await responderGrupoPastoral(handleMessage, {
    body: "não confirmar",
    quotedBody: gruposEnviados[0],
  });

  // Deve ter respondido ao pastor no grupo
  assert.equal(msgPastor.respostas.length, 1);
  assert.match(msgPastor.respostas[0], /❌ Atendimento de \*Gabriel\* não confirmado/);

  // Deve ter enviado mensagem direta para o discípulo informando a recusa
  assert.equal(diretasEnviadas.length, 1);
  assert.equal(diretasEnviadas[0].to, NUMERO_COMUM);
  assert.match(diretasEnviadas[0].texto, /Infelizmente não teremos disponibilidade para o Atendimento Pastoral na Segunda à noite no momento/);

  // Solicitação pendente deve ter sido removida
  assert.equal(buscarPendente(codigo), null);
});

test("opção 3: fluxo pastoral - comando inválido do pastor avisa no grupo", async () => {
  const { handleMessage, gruposEnviados, diretasEnviadas } = criarContexto();

  await enviar(handleMessage, NUMERO_COMUM, "3");
  await enviar(handleMessage, NUMERO_COMUM, "Gabriel");
  await enviar(handleMessage, NUMERO_COMUM, "Segunda");

  const msgPastor = await responderGrupoPastoral(handleMessage, {
    body: "confirmar",
    quotedBody: gruposEnviados[0],
  });

  assert.equal(msgPastor.respostas.length, 1);
  assert.match(msgPastor.respostas[0], /❌ Comando inválido/);
  assert.equal(diretasEnviadas.length, 0); // discipulo não foi notificado de nada ainda
});

// ---------------------------------------------------------------------------
// Fluxo de Artes e Flyers (Área do Líder - Opção 3)
// ---------------------------------------------------------------------------

test("fluxo artes_flyers: solicita com sucesso sem imagem anexa", async () => {
  const { handleMessage, gruposEnviados, etapas } = criarContexto();

  // 1. Inicia Área do Líder -> Artes e Flyers
  const r1 = await enviar(handleMessage, NUMERO_LIDER, "6");
  const r2 = await enviar(handleMessage, NUMERO_LIDER, "3");
  assert.match(r2[0], /De qual departamento é a solicitação/);

  // 2. Escolhe departamento inválido e depois válido (7 - Rede de Homens)
  const r3 = await enviar(handleMessage, NUMERO_LIDER, "15");
  assert.match(r3[0], /Escolha um departamento da lista/);

  const r4 = await enviar(handleMessage, NUMERO_LIDER, "7");
  assert.match(r4[0], /Qual o \*tipo de material\* que você precisa/);

  // 3. Escolhe tipo de material inválido e depois válido (1 - Flyer)
  const r5 = await enviar(handleMessage, NUMERO_LIDER, "5");
  assert.match(r5[0], /Escolha uma opção de 1 a 4/);

  const r6 = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(r6[0], /O que \*deve constar na arte\/material\*/);

  // 4. Digita os detalhes da arte
  const r7 = await enviar(handleMessage, NUMERO_LIDER, "Texto: Culto dos Homens. Tema: Coragem.");
  assert.match(r7[0], /Você tem alguma \*foto, logotipo ou referência visual\*/);

  // 5. Responde "NÃO" para a foto
  const r8 = await enviar(handleMessage, NUMERO_LIDER, "não");
  assert.match(r8[0], /Para qual \*data máxima\*/);

  // 6. Define o prazo final e encerra
  const r9 = await enviar(handleMessage, NUMERO_LIDER, "25/08");
  assert.match(r9[0], /Solicitação enviada com sucesso/);
  assert.match(r9[0], /prazo de \*25\/08\*/);

  // Verifica se a notificação foi enviada ao grupo da secretaria
  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /NOVA SOLICITAÇÃO DE ARTE\/FLYER/);
  assert.match(gruposEnviados[0], /Rede de Homens/);
  assert.match(gruposEnviados[0], /Flyer \/ Arte para Redes Sociais/);
  assert.match(gruposEnviados[0], /Coragem/);
  assert.match(gruposEnviados[0], /25\/08/);

  // O fluxo deve ter sido finalizado
  assert.equal(etapas[NUMERO_LIDER], undefined);
});

test("fluxo artes_flyers: solicita com sucesso anexando imagem/mídia", async () => {
  const { handleMessage, gruposEnviados, etapas } = criarContexto();

  // Inicia e avança até a etapa da foto
  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "3");
  await enviar(handleMessage, NUMERO_LIDER, "7");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Detalhes da arte");

  // Simula o envio de imagem (hasMedia=true)
  const respostas = [];
  const msgComMidia = {
    from: NUMERO_LIDER,
    fromMe: false,
    body: "",
    hasMedia: true,
    downloadMedia: async () => ({ data: "fake_base64_data", mimetype: "image/png" }),
    reply: async (texto) => { respostas.push(texto); return texto; },
    getContact: async () => ({ id: { _serialized: NUMERO_LIDER }, pushname: "Pastor", name: undefined }),
  };
  await handleMessage(msgComMidia);
  assert.match(respostas[0], /Para qual \*data máxima\*/);

  // Finaliza informando o prazo
  const rFinal = await enviar(handleMessage, NUMERO_LIDER, "25/08");
  assert.match(rFinal[0], /Solicitação enviada com sucesso/);

  // Deve ter enviado ao grupo da secretaria
  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /NOVA SOLICITAÇÃO DE ARTE\/FLYER/);
  assert.equal(etapas[NUMERO_LIDER], undefined);
});

// ---------------------------------------------------------------------------
// Fluxo de Reuniões (Área do Líder - Opção 4)
// ---------------------------------------------------------------------------

test("área do líder: agendar reunião coleta dados rapidamente, secretaria aprova e líder recebe ata em anexo", async () => {
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosGravados, etapas } = criarContexto();

  const rMenu = await enviar(handleMessage, NUMERO_LIDER, "6");
  assert.match(rMenu[0], /4️⃣ Agendar, alterar ou desmarcar reunião/);

  const rSub = await enviar(handleMessage, NUMERO_LIDER, "4");
  assert.match(rSub[0], /1 - Agendar reunião/);

  const r1 = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(r1[0], /1️⃣ Qual é o \*departamento\* da reunião\?/);

  const r2 = await enviar(handleMessage, NUMERO_LIDER, "Diretoria");
  assert.match(r2[0], /2️⃣ Para qual \*data\*/);

  const r3 = await enviar(handleMessage, NUMERO_LIDER, "28/11/2026");
  assert.match(r3[0], /3️⃣ Qual é o \*horário de início\*/);

  const r4 = await enviar(handleMessage, NUMERO_LIDER, "19h30");
  assert.match(r4[0], /4️⃣ Qual é o \*horário previsto de término\*/);

  const r5 = await enviar(handleMessage, NUMERO_LIDER, "21h30");
  assert.match(r5[0], /5️⃣ Qual será o \*local\* da reunião/);
  assert.match(r5[0], /1 - Na Igreja/);
  assert.match(r5[0], /2 - Online/);

  const rFinal = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(rFinal[0], /Solicitação de Reunião Enviada/);
  assert.match(rFinal[0], /Diretoria/);
  assert.match(rFinal[0], /Rua Benedicto de Abreu Júnior/);
  assert.doesNotMatch(rFinal[0], new RegExp(LINK_ATA_REUNIAO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(etapas[NUMERO_LIDER], undefined);

  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /NOVA REUNIÃO SOLICITADA/);
  assert.match(gruposEnviados[0], /Diretoria/);
  assert.match(gruposEnviados[0], /28\/11\/2026/);
  assert.match(gruposEnviados[0], /19:30 - 21:30/);
  assert.match(gruposEnviados[0], /Rua Benedicto de Abreu Júnior/);
  assert.doesNotMatch(gruposEnviados[0], new RegExp(LINK_ATA_REUNIAO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  // Secretaria responde no grupo aprovando
  const msgAprovacao = criarMsgGrupo({
    body: "marcar reuniao",
    quotedBody: gruposEnviados[0],
  });
  await handleMessage(msgAprovacao);
  assert.doesNotMatch(msgAprovacao.respostas[0], new RegExp(LINK_ATA_REUNIAO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.equal(eventosGravados.length, 1);
  assert.equal(eventosGravados[0].calendarId, AGENDAS_INTERNAS.REUNIOES);
  assert.equal(eventosGravados[0].resource.summary, "Reunião de Diretoria");
  assert.equal(eventosGravados[0].resource.location, "Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi");

  assert.equal(diretasEnviadas.length, 1);
  assert.equal(diretasEnviadas[0].to, NUMERO_LIDER);
  assert.match(diretasEnviadas[0].texto, /Reunião Confirmada e Agendada/);
  assert.match(diretasEnviadas[0].texto, /Ata de Reunião/);
  assert.match(diretasEnviadas[0].texto, /impresso e preenchido/);
  assert.match(diretasEnviadas[0].texto, /secretárias para arquivar/);
  assert.match(diretasEnviadas[0].texto, new RegExp(LINK_ATA_REUNIAO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // Se o PDF da ata existe no ambiente de execução, deve ter sido anexado como media
  if (diretasEnviadas[0].media) {
    assert.equal(diretasEnviadas[0].media.mimetype, "application/pdf");
  }
});

test("área do líder: agendar reunião e secretaria recusa", async () => {
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosGravados } = criarContexto();

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "4");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Intercessão");
  await enviar(handleMessage, NUMERO_LIDER, "20/12/2026");
  await enviar(handleMessage, NUMERO_LIDER, "20:00");
  await enviar(handleMessage, NUMERO_LIDER, "21:00");
  await enviar(handleMessage, NUMERO_LIDER, "Na Igreja");

  assert.equal(gruposEnviados.length, 1);

  const msgRecusa = criarMsgGrupo({
    body: "não marcar",
    quotedBody: gruposEnviados[0],
  });
  await handleMessage(msgRecusa);

  assert.equal(eventosGravados.length, 0);
  assert.equal(diretasEnviadas.length, 1);
  assert.match(diretasEnviadas[0].texto, /não pudemos confirmar sua solicitação de reunião/);
});

test("área do líder: alterar reunião existente na agenda de reuniões", async () => {
  const reunioesExistentes = [
    {
      id: "reuniao-louvor-99",
      summary: "Reunião: Louvor (Louvor)",
      start: { dateTime: "2026-11-20T19:00:00-03:00" },
      end: { dateTime: "2026-11-20T21:00:00-03:00" },
      location: "Sala 02",
    },
  ];
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosAlterados, setEventos } = criarContexto();
  setEventos(reunioesExistentes);

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "4");
  const rLista = await enviar(handleMessage, NUMERO_LIDER, "2");
  assert.match(rLista[1], /Reuniões Agendadas/);
  assert.match(rLista[1], /Reunião: Louvor/);

  const rOpcoes = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(rOpcoes[0], /O que você deseja alterar/);

  const rHorario = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(rHorario[0], /novo horário de início/);

  const rFim = await enviar(handleMessage, NUMERO_LIDER, "20h");
  assert.match(rFim[0], /novo horário previsto de término/);

  const rFinal = await enviar(handleMessage, NUMERO_LIDER, "22h");
  assert.match(rFinal[0], /Solicitação de Alteração de Reunião Enviada/);

  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /PEDIDO DE ALTERAÇÃO DE REUNIÃO/);

  const msgAprovacaoAlt = criarMsgGrupo({
    body: "alterar reuniao",
    quotedBody: gruposEnviados[0],
  });
  await handleMessage(msgAprovacaoAlt);

  assert.equal(eventosAlterados.length, 1);
  assert.equal(eventosAlterados[0].calendarId, AGENDAS_INTERNAS.REUNIOES);
  assert.equal(eventosAlterados[0].eventId, "reuniao-louvor-99");
  assert.equal(diretasEnviadas.length, 1);
  assert.match(diretasEnviadas[0].texto, /Alteração de Reunião Aprovada/);
});

test("área do líder: desmarcar reunião existente na agenda de reuniões", async () => {
  const reunioesExistentes = [
    {
      id: "reuniao-kids-88",
      summary: "Reunião: Equipe Kids (Kids)",
      start: { dateTime: "2026-11-22T15:00:00-03:00" },
      end: { dateTime: "2026-11-22T17:00:00-03:00" },
      location: "Salão Infantil",
    },
  ];
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosCancelados, setEventos } = criarContexto();
  setEventos(reunioesExistentes);

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "4");
  const rLista = await enviar(handleMessage, NUMERO_LIDER, "3");
  assert.match(rLista[1], /Reuniões Agendadas/);

  const rConfirma = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(rConfirma[0], /Confirma a solicitação para \*desmarcar\*/);

  const rEnviado = await enviar(handleMessage, NUMERO_LIDER, "SIM");
  assert.match(rEnviado[0], /Solicitação para Desmarcar Reunião Enviada/);

  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /PEDIDO PARA DESMARCAR REUNIÃO/);

  const msgDesmarcar = criarMsgGrupo({
    body: "desmarcar reuniao",
    quotedBody: gruposEnviados[0],
  });
  await handleMessage(msgDesmarcar);

  assert.equal(eventosCancelados.length, 1);
  assert.equal(eventosCancelados[0].calendarId, AGENDAS_INTERNAS.REUNIOES);
  assert.equal(eventosCancelados[0].eventId, "reuniao-kids-88");
  assert.equal(diretasEnviadas.length, 1);
  assert.match(diretasEnviadas[0].texto, /Reunião Desmarcada/);
});

test("área do líder: validações de data, horários e local no fluxo de reunião", async () => {
  const { handleMessage, etapas } = criarContexto();

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "4");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Depto Teste");

  const rDataInvalida = await enviar(handleMessage, NUMERO_LIDER, "31/02/2026");
  assert.match(rDataInvalida[0], /Formato de data inválido/);

  const rDataValida = await enviar(handleMessage, NUMERO_LIDER, "10/11/2026");
  assert.match(rDataValida[0], /Qual é o \*horário de início\*/);

  const rHoraInicioInvalida = await enviar(handleMessage, NUMERO_LIDER, "horario-errado");
  assert.match(rHoraInicioInvalida[0], /Formato de horário inválido/);

  await enviar(handleMessage, NUMERO_LIDER, "19h");

  const rHoraFimAnterior = await enviar(handleMessage, NUMERO_LIDER, "18h");
  assert.match(rHoraFimAnterior[0], /horário de término deve ser posterior/);

  const rHoraFimValida = await enviar(handleMessage, NUMERO_LIDER, "21h");
  assert.match(rHoraFimValida[0], /5️⃣ Qual será o \*local\* da reunião/);

  const rLocalInvalido = await enviar(handleMessage, NUMERO_LIDER, "Salão de festas");
  assert.match(rLocalInvalido[0], /Opção inválida/);
  assert.match(rLocalInvalido[0], /1 - Na Igreja/);
  assert.match(rLocalInvalido[0], /2 - Online/);

  const rLocalOnline = await enviar(handleMessage, NUMERO_LIDER, "2");
  assert.match(rLocalOnline[0], /Solicitação de Reunião Enviada/);
  assert.match(rLocalOnline[0], /Local:\* Online/);
  assert.doesNotMatch(rLocalOnline[0], new RegExp(LINK_ATA_REUNIAO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(etapas[NUMERO_LIDER], undefined);
});

test("formatarTituloReuniao gera 'Reunião de [Departamento]'", () => {
  assert.equal(formatarTituloReuniao("Jovens"), "Reunião de Jovens");
  assert.equal(formatarTituloReuniao("Mulheres"), "Reunião de Mulheres");
  assert.equal(formatarTituloReuniao("Diáconos"), "Reunião de Diáconos");
  assert.equal(formatarTituloReuniao("de Louvor"), "Reunião de Louvor");
  assert.equal(formatarTituloReuniao("  Casais  "), "Reunião de Casais");
});

test("resolverOpcaoLocalReuniao aceita 'Na Igreja' e 'Online'", () => {
  const ENDERECO = "Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi";
  assert.equal(resolverOpcaoLocalReuniao("1"), ENDERECO);
  assert.equal(resolverOpcaoLocalReuniao("Na Igreja"), ENDERECO);
  assert.equal(resolverOpcaoLocalReuniao("igreja"), ENDERECO);
  assert.equal(resolverOpcaoLocalReuniao("templo"), ENDERECO);
  assert.equal(resolverOpcaoLocalReuniao("1 - Na Igreja"), ENDERECO);

  assert.equal(resolverOpcaoLocalReuniao("2"), "Online");
  assert.equal(resolverOpcaoLocalReuniao("Online"), "Online");
  assert.equal(resolverOpcaoLocalReuniao("online"), "Online");
  assert.equal(resolverOpcaoLocalReuniao("2 - Online"), "Online");

  assert.equal(resolverOpcaoLocalReuniao("Outro lugar"), null);
  assert.equal(resolverOpcaoLocalReuniao(""), null);
});

test("área do líder: opção 5 fluxo de consulta de disponibilidade por mês e dia da semana", async () => {
  const agora = moment.tz("America/Sao_Paulo");
  const mesAtual = agora.month() + 1;
  const { handleMessage, etapas } = criarContexto({ eventos: [] });

  // 1. Inicia Área do Líder
  const r1 = await enviar(handleMessage, NUMERO_LIDER, "6");
  assert.match(r1[0], /5️⃣ Consultar disponibilidade de dias e horários/);

  // 2. Escolhe opção 5
  const r2 = await enviar(handleMessage, NUMERO_LIDER, "5");
  assert.match(r2[0], /Consulta de Disponibilidade/);
  assert.match(r2[0], /Para qual mês você deseja consultar/);

  // 3. Escolhe o mês atual
  const r3 = await enviar(handleMessage, NUMERO_LIDER, String(mesAtual));
  assert.match(r3[0], /qual \*dia da semana\* você deseja consultar/);
  assert.match(r3[0], /2 - Terça-feira/);

  // 4. Escolhe terça-feira (opção 2)
  const r4 = await enviar(handleMessage, NUMERO_LIDER, "2");
  assert.equal(r4.length, 2); // "🔍 Consultando..." + resultado
  assert.match(r4[0], /Consultando disponibilidade/);
  assert.match(r4[1], /Consulta de Disponibilidade — Terças-feiras/);
  assert.match(r4[1], /Dia totalmente livre|Horários disponíveis|Sem horários disponíveis/);
  assert.equal(etapas[NUMERO_LIDER], undefined);
});


