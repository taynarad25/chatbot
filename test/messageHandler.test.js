// Teste end-to-end do fluxo de conversa do bot (chatbot.js -> messageHandler.js).
// Dirige o handleMessage real com um client/calendar/buscarEventos falsos (sem
// Puppeteer, sem chamadas reais ao Google), simulando a troca de mensagens de
// um usuário de verdade pelo WhatsApp: cada teste manda uma sequência de
// mensagens e verifica as respostas, exatamente como o README descreve cada
// funcionalidade do bot.

// Isola completamente do pendentes.json real de produção ANTES de exigir o
// messageHandler (que usa bot/pendentesAprovacao.js internamente).
const os = require("os");
const path = require("path");
const fs = require("fs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-messagehandler-test-"));
process.env.PENDENTES_FILE_PATH = path.join(tmpDir, "pendentes.json");

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const { createMessageHandler } = require("../bot/messageHandler");
const { buscarPendente, extrairCodigo } = require("../bot/pendentesAprovacao");

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
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
];
const LIDERES = ["5511999999999"];
const NUMERO_LIDER = "5511999999999@c.us";
const NUMERO_COMUM = "5511888888888@c.us";

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
  assert.match(respostas[0], /6️⃣ Agendar, alterar ou cancelar evento/);
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
  await enviar(handleMessage, NUMERO_LIDER, "Igreja"); // local
  await enviar(handleMessage, NUMERO_LIDER, "7"); // Rede de Homens
  await enviar(handleMessage, NUMERO_LIDER, "12"); // Dezembro
  await enviar(handleMessage, NUMERO_LIDER, "2"); // busca por dia da semana/horário
  await enviar(handleMessage, NUMERO_LIDER, "3"); // Quarta-feira
  await enviar(handleMessage, NUMERO_LIDER, "19:30");
  const finalResp = await enviar(handleMessage, NUMERO_LIDER, "21:00");

  assert.match(finalResp[finalResp.length - 1], /Datas Disponíveis/);

  const escolha = await enviar(handleMessage, NUMERO_LIDER, "1");
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

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendar novo evento
  await enviar(handleMessage, NUMERO_LIDER, "Culto de Jovens");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "7"); // Rede de Homens
  await enviar(handleMessage, NUMERO_LIDER, "12"); // Dezembro
  await enviar(handleMessage, NUMERO_LIDER, "2");
  await enviar(handleMessage, NUMERO_LIDER, "3"); // Quarta-feira
  await enviar(handleMessage, NUMERO_LIDER, "19:30");
  await enviar(handleMessage, NUMERO_LIDER, "21:00");
  await enviar(handleMessage, NUMERO_LIDER, "1", { pushname: "celular do Pastor" });

  assert.match(gruposEnviados[0], /Solicitante:\* Pastor Marcos/);
  assert.doesNotMatch(gruposEnviados[0], /celular do Pastor/);
});

test("opção 6 (líder): sem nome cadastrado no painel, o resumo do grupo cai de volta pro nome do contato", async () => {
  const { handleMessage, gruposEnviados } = criarContexto({ eventos: [], lideresCadastrados: [] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Culto de Jovens");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "7");
  await enviar(handleMessage, NUMERO_LIDER, "12");
  await enviar(handleMessage, NUMERO_LIDER, "2");
  await enviar(handleMessage, NUMERO_LIDER, "3");
  await enviar(handleMessage, NUMERO_LIDER, "19:30");
  await enviar(handleMessage, NUMERO_LIDER, "21:00");
  await enviar(handleMessage, NUMERO_LIDER, "1", { pushname: "celular do Pastor" });

  assert.match(gruposEnviados[0], /Solicitante:\* celular do Pastor/);
});

test("opção 6 (líder): duas solicitações pendentes ao mesmo tempo não se confundem — cada código resolve o pedido certo", async () => {
  const { handleMessage, gruposEnviados, eventosGravados } = criarContexto({ eventos: [] });

  // Primeira solicitação
  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Culto A");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "7"); // Rede de Homens
  await enviar(handleMessage, NUMERO_LIDER, "12");
  await enviar(handleMessage, NUMERO_LIDER, "2");
  await enviar(handleMessage, NUMERO_LIDER, "3");
  await enviar(handleMessage, NUMERO_LIDER, "19:30");
  await enviar(handleMessage, NUMERO_LIDER, "21:00");
  await enviar(handleMessage, NUMERO_LIDER, "1");

  // Segunda solicitação, de outro líder, antes da primeira ser respondida
  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Culto B");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "6"); // Rede de Casais
  await enviar(handleMessage, NUMERO_LIDER, "12");
  await enviar(handleMessage, NUMERO_LIDER, "2");
  await enviar(handleMessage, NUMERO_LIDER, "3");
  await enviar(handleMessage, NUMERO_LIDER, "19:30");
  await enviar(handleMessage, NUMERO_LIDER, "21:00");
  await enviar(handleMessage, NUMERO_LIDER, "1");

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

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Reunião de Casais");
  await enviar(handleMessage, NUMERO_LIDER, "Rua das Flores, 123 - Jardim Primavera");
  await enviar(handleMessage, NUMERO_LIDER, "6"); // Rede de Casais
  await enviar(handleMessage, NUMERO_LIDER, "12"); // Dezembro
  await enviar(handleMessage, NUMERO_LIDER, "2"); // busca por dia da semana/horário
  await enviar(handleMessage, NUMERO_LIDER, "3"); // Quarta-feira
  await enviar(handleMessage, NUMERO_LIDER, "19:30");
  await enviar(handleMessage, NUMERO_LIDER, "21:00");

  const escolha = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(escolha[0], /Rua das Flores, 123 - Jardim Primavera/);
  assert.doesNotMatch(escolha[0], /Rua Benedicto de Abreu Júnior/);
});

test("opção 6 (líder): evento de DIA TODO pula a pergunta de horário de término", async () => {
  const { handleMessage } = criarContexto({ eventos: [] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
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

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Culto Extra");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "7"); // Rede de Homens
  await enviar(handleMessage, NUMERO_LIDER, "12"); // Dezembro
  const modoResp = await enviar(handleMessage, NUMERO_LIDER, "1"); // já tenho uma data específica
  assert.match(modoResp[0], /Qual o dia do mês/);

  const diaResp = await enviar(handleMessage, NUMERO_LIDER, "10"); // 10/12, quinta-feira, sem eventos
  assert.match(diaResp[diaResp.length - 1], /está livre/);
  assert.match(diaResp[diaResp.length - 1], /07:00 às 22:00/);

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

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Culto Extra");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "7");
  await enviar(handleMessage, NUMERO_LIDER, "12");
  await enviar(handleMessage, NUMERO_LIDER, "1");

  const diaResp = await enviar(handleMessage, NUMERO_LIDER, "5"); // sábado marcado como Sábado LIVRE
  assert.match(diaResp[diaResp.length - 1], /Sábado LIVRE/);
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

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Culto Extra");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "7");
  await enviar(handleMessage, NUMERO_LIDER, "12");
  await enviar(handleMessage, NUMERO_LIDER, "1");

  const diaResp = await enviar(handleMessage, NUMERO_LIDER, "10");
  assert.match(diaResp[diaResp.length - 1], /07:00 às 18:00/); // livre até 18h (buffer de 1h antes do evento das 19h)
  assert.match(diaResp[diaResp.length - 1], /21:00 às 22:00/); // livre depois do buffer de 1h após o evento das 20h

  await enviar(handleMessage, NUMERO_LIDER, "20:15"); // dentro do buffer de 1h do evento das 19h-20h
  const conflitoResp = await enviar(handleMessage, NUMERO_LIDER, "21:00");
  assert.match(conflitoResp[0], /Culto de Homens/);
  assert.match(conflitoResp[0], /19:00/);
});

test("opção 6 (líder): agenda por data específica — dia inválido para o mês pede pra tentar de novo", async () => {
  const { handleMessage, etapas } = criarContexto({ eventos: [] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Culto Extra");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "7");
  await enviar(handleMessage, NUMERO_LIDER, "2"); // Fevereiro
  await enviar(handleMessage, NUMERO_LIDER, "1");

  const diaResp = await enviar(handleMessage, NUMERO_LIDER, "30"); // fevereiro não tem dia 30
  assert.match(diaResp[0], /Dia inválido/);
  assert.equal(etapas[NUMERO_LIDER].etapa, "evento_dia_especifico", "deveria continuar esperando um dia válido");
});

test("opção 6 (líder): agenda por data específica — não deixa escolher um dia que já passou", async () => {
  const { handleMessage, gruposEnviados } = criarContexto({ eventos: [] });
  const ontem = moment.tz("America/Sao_Paulo").subtract(1, "day");

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Culto Extra");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "7");
  await enviar(handleMessage, NUMERO_LIDER, String(ontem.month() + 1));
  await enviar(handleMessage, NUMERO_LIDER, "1"); // já tenho uma data específica

  const diaResp = await enviar(handleMessage, NUMERO_LIDER, String(ontem.date()));
  assert.match(diaResp[diaResp.length - 1], /já passou/);
  assert.match(diaResp[diaResp.length - 1], /a partir de hoje/);
  assert.equal(gruposEnviados.length, 0, "não deveria notificar a secretaria de uma data que já passou");
});

test("opção 6 (líder): secretaria recusa a solicitação ('não marcar') — solicitante é avisado e nada é gravado", async () => {
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosGravados } = criarContexto({ eventos: [] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "Culto de Jovens");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "7");
  await enviar(handleMessage, NUMERO_LIDER, "12");
  await enviar(handleMessage, NUMERO_LIDER, "2"); // busca por dia da semana/horário
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

test("opção 6 (líder): alterar evento existente (texto livre), do início ao fim, com aprovação manual da secretaria", async () => {
  const eventoExistente = {
    id: "evt-culto-mulheres",
    summary: "Culto de Mulheres",
    start: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").format() },
    end: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").add(2, "hours").format() },
  };
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosAlterados, setEventos } = criarContexto({ eventos: [eventoExistente] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "2"); // Alterar evento existente
  setEventos([eventoExistente]);
  const listaResp = await enviar(handleMessage, NUMERO_LIDER, "9"); // Rede de Mulheres
  assert.match(listaResp[1], /Culto de Mulheres/);

  const escolhaResp = await enviar(handleMessage, NUMERO_LIDER, "1");
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
  const eventoExistente = {
    id: "evt-culto-mulheres",
    summary: "Culto de Mulheres",
    start: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").format() },
    end: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").add(2, "hours").format() },
  };
  const { handleMessage, gruposEnviados, diretasEnviadas } = criarContexto({ eventos: [eventoExistente] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "2");
  await enviar(handleMessage, NUMERO_LIDER, "9");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "5"); // Outra alteração (texto livre)
  await enviar(handleMessage, NUMERO_LIDER, "Mudar horário para 20h");

  const recusa = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "não alterar", quotedBody: gruposEnviados[0] });
  await handleMessage(recusa);

  assert.match(diretasEnviadas[0].texto, /não pôde ser aprovada/);
  assert.match(recusa.respostas[0], /recusa da alteração/);
});

test("opção 6 (líder): alterar horário de evento existente, aplicado automaticamente na aprovação", async () => {
  const eventoExistente = {
    id: "evt-culto-jovens",
    summary: "Culto de Jovens",
    start: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").set({ hour: 19, minute: 0 }).format() },
    end: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").set({ hour: 21, minute: 0 }).format() },
  };
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosAlterados, setEventos } = criarContexto({ eventos: [eventoExistente] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "2");
  setEventos([eventoExistente]);
  await enviar(handleMessage, NUMERO_LIDER, "7"); // Rede de Homens
  await enviar(handleMessage, NUMERO_LIDER, "1"); // seleciona o evento

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

test("opção 6 (líder): cancelar evento existente — aprovado pela secretaria remove da agenda", async () => {
  const eventoExistente = {
    id: "evt-retiro",
    summary: "Retiro Espiritual",
    start: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").format() },
    end: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").add(2, "hours").format() },
  };
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosCancelados, setEventos } = criarContexto({ eventos: [eventoExistente] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "3"); // Cancelar evento existente
  setEventos([eventoExistente]);
  const listaResp = await enviar(handleMessage, NUMERO_LIDER, "1"); // Evangelismo
  assert.match(listaResp[1], /Retiro Espiritual/);

  const confirmarResp = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(confirmarResp[0], /certeza.*cancelar/is);

  const finalResp = await enviar(handleMessage, NUMERO_LIDER, "SIM");
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
  const eventoExistente = {
    id: "evt-retiro-2",
    summary: "Retiro Espiritual",
    start: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").format() },
    end: { dateTime: moment.tz("America/Sao_Paulo").add(10, "days").add(2, "hours").format() },
  };
  const { handleMessage, gruposEnviados, diretasEnviadas, eventosCancelados } = criarContexto({ eventos: [eventoExistente] });

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "3");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "SIM");

  const negativa = criarMsgGrupo({ nomeGrupo: "Mensagens Secretaria", body: "manter evento", quotedBody: gruposEnviados[0] });
  await handleMessage(negativa);

  assert.equal(eventosCancelados.length, 0);
  assert.match(diretasEnviadas[0].texto, /Evento Mantido/);
  assert.match(negativa.respostas[0], /evento foi mantido/);
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

test("opção 7 (líder): resumo do comunicado também usa o nome cadastrado no painel de líderes", async () => {
  const { handleMessage, gruposEnviados } = criarContexto({
    lideresCadastrados: [{ nome: "Pastor Marcos", telefone: "5511999999999" }],
  });

  await enviar(handleMessage, NUMERO_LIDER, "7");
  await enviar(handleMessage, NUMERO_LIDER, "Não haverá culto no dia 20.", { pushname: "celular do Pastor" });

  assert.match(gruposEnviados[0], /Solicitante:\* Pastor Marcos/);
  assert.doesNotMatch(gruposEnviados[0], /celular do Pastor/);
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
