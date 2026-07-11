// Teste end-to-end do fluxo de conversa do bot (chatbot.js -> messageHandler.js).
// Dirige o handleMessage real com um client/calendar/buscarEventos falsos (sem
// Puppeteer, sem chamadas reais ao Google), simulando a troca de mensagens de
// um usuário de verdade pelo WhatsApp: cada teste manda uma sequência de
// mensagens e verifica as respostas, exatamente como o README descreve cada
// funcionalidade do bot.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const { createMessageHandler } = require("../bot/messageHandler");
const { decodificarDadosAgendamento } = require("../bot/agendamentoAutomatico");

const AGENDAS = [
  "cal-evangelismo", "cal-epifania", "cal-intercessao", "cal-outros",
  "cal-seeds", "cal-ruach", "cal-casais", "cal-homens", "cal-mulheres", "cal-kids",
];
const LIDERES = ["5511999999999"];
const NUMERO_LIDER = "5511999999999@c.us";
const NUMERO_COMUM = "5511888888888@c.us";

// Monta um novo "servidor" de teste: handler + espiões de tudo que ele chamaria
// de verdade (mensagens de grupo, mensagens diretas, gravação na Google Agenda).
function criarContexto({ eventos = [] } = {}) {
  const etapas = {};
  const gruposEnviados = []; // mensagens que o bot mandou para "Mensagens Secretaria"
  const diretasEnviadas = []; // client.sendMessage(solicitanteId, texto)
  const eventosGravados = []; // calendar.events.insert(...)
  let eventosAtuais = eventos;

  const client = {
    sendMessage: async (to, texto) => {
      diretasEnviadas.push({ to, texto });
    },
    getChats: async () => [{
      isGroup: true,
      name: "Mensagens Secretaria",
      sendMessage: async (texto) => { gruposEnviados.push(texto); },
    }],
  };

  const calendar = {
    events: {
      insert: async ({ calendarId, resource }) => {
        eventosGravados.push({ calendarId, resource });
        return { data: {} };
      },
    },
  };

  const buscarEventos = async () => eventosAtuais;

  const handleMessage = createMessageHandler({
    client, calendar, agendasParaLer: AGENDAS, lideres: LIDERES, etapas, buscarEventos,
  });

  return {
    handleMessage,
    etapas,
    gruposEnviados,
    diretasEnviadas,
    eventosGravados,
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
    from: "120363000000000000@g.us",
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
  for (const texto of ["paz", "bom dia", "MENU", "oiii", "a pazzz"]) {
    const respostas = await enviar(handleMessage, NUMERO_COMUM, texto);
    assert.match(respostas[0], /Escolha uma opção/, `"${texto}" deveria acionar o menu`);
  }
});

test("saudação: líder recebe o menu completo, com as opções 6 e 7", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_LIDER, "oi");
  assert.match(respostas[0], /6️⃣ Agendar ou alterar evento/);
  assert.match(respostas[0], /7️⃣ Comunicados e Avisos/);
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

// ---------------------------------------------------------------------------
// Opção 3 — Atendimento pastoral
// ---------------------------------------------------------------------------

test("opção 3: coleta nome e disponibilidade, notifica a secretaria e encerra o fluxo", async () => {
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
  // Atendimento pastoral não notifica o grupo da secretaria (só orienta a pessoa a aguardar contato)
  assert.equal(gruposEnviados.length, 0);
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

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendar novo evento
  await enviar(handleMessage, NUMERO_LIDER, "Culto de Jovens");
  await enviar(handleMessage, NUMERO_LIDER, "7"); // Rede de Homens
  await enviar(handleMessage, NUMERO_LIDER, "12"); // Dezembro
  await enviar(handleMessage, NUMERO_LIDER, "3"); // Quarta-feira
  await enviar(handleMessage, NUMERO_LIDER, "19:30");
  const finalResp = await enviar(handleMessage, NUMERO_LIDER, "21:00");

  assert.match(finalResp[finalResp.length - 1], /Datas Disponíveis/);

  const escolha = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(escolha[0], /Solicitação de Agendamento/);
  assert.match(escolha[0], /Culto de Jovens/);

  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /Novo Agendamento Solicitado/);
  assert.match(gruposEnviados[0], /Culto de Jovens/);

  const dados = decodificarDadosAgendamento(gruposEnviados[0]);
  assert.equal(dados.solicitanteId, NUMERO_LIDER);
  assert.equal(dados.evento, "Culto de Jovens");
  assert.equal(dados.rede, "Rede de Homens");

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

  assert.equal(diretasEnviadas.length, 1);
  assert.equal(diretasEnviadas[0].to, NUMERO_LIDER);
  assert.match(diretasEnviadas[0].texto, /Agendamento Confirmado e Gravado/);
  assert.match(aprovacao.respostas[0], /Evento gravado na agenda/);
});

test("opção 6 (líder): evento de DIA TODO pula a pergunta de horário de término", async () => {
  const { handleMessage } = criarContexto({ eventos: [] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Retiro Espiritual");
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Evangelismo
  await enviar(handleMessage, NUMERO_LIDER, "11"); // Novembro
  await enviar(handleMessage, NUMERO_LIDER, "8"); // Vários dias / evento longo
  const resp = await enviar(handleMessage, NUMERO_LIDER, "DIA TODO");

  assert.match(resp[resp.length - 1], /Datas Disponíveis/);
});

test("opção 6 (líder): secretaria recusa a solicitação ('não marcar') — solicitante é avisado e nada é gravado", async () => {
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosGravados } = criarContexto({ eventos: [] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Culto de Jovens");
  await enviar(handleMessage, NUMERO_LIDER, "7");
  await enviar(handleMessage, NUMERO_LIDER, "12");
  await enviar(handleMessage, NUMERO_LIDER, "3");
  await enviar(handleMessage, NUMERO_LIDER, "19:30");
  await enviar(handleMessage, NUMERO_LIDER, "21:00");
  await enviar(handleMessage, NUMERO_LIDER, "1");

  const recusa = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "não marcar", quotedBody: gruposEnviados[0] });
  await handleMessage(recusa);

  assert.equal(eventosGravados.length, 0);
  assert.equal(diretasEnviadas.length, 1);
  assert.match(diretasEnviadas[0].texto, /não pudemos confirmar/);
  assert.match(recusa.respostas[0], /Líder notificado sobre a recusa/);
});

test("opção 6 (líder): alterar evento existente, do início ao fim, com aprovação da secretaria", async () => {
  const eventoExistente = {
    summary: "Culto de Mulheres",
    start: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").format() },
    end: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").add(2, "hours").format() },
  };
  const { handleMessage, gruposEnviados, diretasEnviadas, setEventos } = criarContexto({ eventos: [eventoExistente] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "2"); // Alterar evento existente
  setEventos([eventoExistente]);
  const listaResp = await enviar(handleMessage, NUMERO_LIDER, "9"); // Rede de Mulheres
  assert.match(listaResp[1], /Culto de Mulheres/);

  const escolhaResp = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(escolhaResp[0], /Você selecionou.*Culto de Mulheres/s);

  const finalResp = await enviar(handleMessage, NUMERO_LIDER, "Mudar horário para 20h");
  assert.match(finalResp[0], /Solicitação de Alteração/);

  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /PEDIDO DE ALTERAÇÃO/);

  const aprovacao = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "agendar", quotedBody: gruposEnviados[0] });
  await handleMessage(aprovacao);

  assert.equal(diretasEnviadas.length, 1);
  assert.match(diretasEnviadas[0].texto, /Alteração Aprovada/);
  assert.match(aprovacao.respostas[0], /aprovação da alteração/);
});

test("opção 6 (líder): alterar evento — secretaria recusa ('não agendar')", async () => {
  const eventoExistente = {
    summary: "Culto de Mulheres",
    start: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").format() },
    end: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").add(2, "hours").format() },
  };
  const { handleMessage, gruposEnviados, diretasEnviadas } = criarContexto({ eventos: [eventoExistente] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "2");
  await enviar(handleMessage, NUMERO_LIDER, "9");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Mudar horário para 20h");

  const recusa = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "não agendar", quotedBody: gruposEnviados[0] });
  await handleMessage(recusa);

  assert.match(diretasEnviadas[0].texto, /não pôde ser aprovada/);
  assert.match(recusa.respostas[0], /recusa da alteração/);
});

test("opção 6 (líder): departamento sem eventos futuros encerra o fluxo de alteração", async () => {
  const { handleMessage, etapas } = criarContexto({ eventos: [] });
  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "2");
  const resp = await enviar(handleMessage, NUMERO_LIDER, "9");
  assert.match(resp[1], /Não encontrei eventos futuros/);
  assert.equal(etapas[NUMERO_LIDER], undefined);
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

  const r1 = await enviar(handleMessage, NUMERO_LIDER, "7");
  assert.match(r1[0], /Comunicados e Avisos/);

  const r2 = await enviar(handleMessage, NUMERO_LIDER, "Não haverá culto no dia 20 por conta da reforma.");
  assert.match(r2[0], /encaminhada para a secretaria/);

  assert.equal(gruposEnviados.length, 1);
  assert.match(gruposEnviados[0], /NOVO COMUNICADO PARA O CULTO/);
  assert.match(gruposEnviados[0], /reforma/);
  assert.equal(etapas[NUMERO_LIDER], undefined);
});

// ---------------------------------------------------------------------------
// Grupo "Mensagens Secretaria" — casos de borda
// ---------------------------------------------------------------------------

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

test("grupo: 'marcar evento' respondendo a uma mensagem do bot sem o blob de dados avisa do erro de extração", async () => {
  const { handleMessage } = criarContexto();
  const msg = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "marcar evento", quotedBody: "resumo sem o marcador DADOS:" });
  await handleMessage(msg);
  assert.match(msg.respostas[0], /Erro ao extrair dados/);
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
