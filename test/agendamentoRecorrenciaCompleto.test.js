const test = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const { createMessageHandler } = require("../bot/messageHandler");
const { AGENDAS } = require("../bot/redes");

const NUMERO_LIDER = "5511999990001";
const JID_GRUPO_SECRETARIA = "111111111111111@g.us";

function criarContexto() {
  const etapas = {};
  const diretasEnviadas = [];
  const gruposEnviados = [];
  const eventosGravados = [];

  const client = {
    sendMessage: async (to, content) => {
      if (to.endsWith("@g.us")) {
        gruposEnviados.push({ to, texto: typeof content === "string" ? content : (content?.caption || "") });
      } else {
        diretasEnviadas.push({ to, texto: typeof content === "string" ? content : (content?.caption || "") });
      }
      return { id: { _serialized: `msg-${Date.now()}` } };
    },
    getChats: async () => [
      { id: { _serialized: JID_GRUPO_SECRETARIA }, name: "Mensagens Secretaria", isGroup: true }
    ],
  };

  const calendar = {
    events: {
      insert: async ({ calendarId, resource }) => {
        eventosGravados.push({ calendarId, resource });
        return { data: { id: `event-${Date.now()}-${Math.random()}` } };
      },
      list: async () => ({ data: { items: [] } })
    }
  };

  const buscarEventos = async () => [];

  const handleMessage = createMessageHandler({
    client,
    calendar,
    agendasParaLer: AGENDAS,
    lideres: [NUMERO_LIDER],
    etapas,
    buscarEventos,
    listLideres: () => [{ nome: "Líder Teste", telefone: NUMERO_LIDER, departamento: "Evangelismo" }]
  });

  return { handleMessage, etapas, diretasEnviadas, gruposEnviados, eventosGravados };
}

async function enviar(handleMessage, numero, texto) {
  const respostas = [];
  const msg = {
    from: `${numero}@c.us`,
    fromMe: false,
    body: texto,
    hasQuotedMsg: false,
    reply: async (txt) => {
      respostas.push(txt);
      return { id: { _serialized: `resp-${Date.now()}` } };
    },
    getChat: async () => ({ isGroup: false }),
    getContact: async () => ({ pushname: "Líder Teste" }),
  };
  await handleMessage(msg);
  return respostas;
}

test("Bot: Agendamento de evento recorrente em todos os domingos de Nov e Jan exceto os primeiros domingos", async () => {
  const { handleMessage, gruposEnviados } = criarContexto();

  // 1. Entra na Área do Líder -> Agenda e Eventos -> Gestão de Eventos -> Novo Agendamento
  await enviar(handleMessage, NUMERO_LIDER, "7"); // Área do Líder
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agenda e Eventos
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Gestão de Eventos
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendar novo evento
  await enviar(handleMessage, NUMERO_LIDER, "Culto da Família Especial"); // Nome
  await enviar(handleMessage, NUMERO_LIDER, "igreja"); // Local
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Departamento Evangelismo

  // 2. Informa os meses com recorrência diretamente: "11 e 1" (Novembro e Janeiro)
  const rMes = await enviar(handleMessage, NUMERO_LIDER, "11 e 1");
  assert.match(rMes[0], /Evento que se repete/i);
  assert.match(rMes[0], /Qual é a frequência/i);

  // 3. Frequência: responde "todo domingo"
  const rFreq = await enviar(handleMessage, NUMERO_LIDER, "todo domingo");
  assert.match(rFreq[0], /Datas encontradas para o evento/i);
  assert.match(rFreq[0], /Tem alguma data em que NÃO vai ter evento\?/i);
  // Deve conter 10 domingos (5 em novembro/2026 e 5 em janeiro/2027)
  assert.match(rFreq[0], /01\/11\/2026/);
  assert.match(rFreq[0], /03\/01\/2027/);

  // 4. Exclusão dos primeiros domingos (sessão 1 e sessão 6 da lista)
  const rExcluir = await enviar(handleMessage, NUMERO_LIDER, "1, 6");
  assert.match(rExcluir[0], /removida\(s\) com sucesso/i);
  assert.match(rExcluir[0], /8 sessões/i);
  assert.doesNotMatch(rExcluir[0], /01\/11\/2026/); // 1º domingo de Nov removido!
  assert.doesNotMatch(rExcluir[0], /03\/01\/2027/); // 1º domingo de Jan removido!
  assert.match(rExcluir[0], /08\/11\/2026/); // 2º domingo mantido
  assert.match(rExcluir[0], /10\/01\/2027/); // 2º domingo mantido

  // 5. Confirma a lista
  const rConfirmar = await enviar(handleMessage, NUMERO_LIDER, "confirmar");
  assert.match(rConfirmar[0], /horário de início/i);

  // 6. Horário de início e término às 16h
  const rHoraIni = await enviar(handleMessage, NUMERO_LIDER, "16:00");
  assert.match(rHoraIni[0], /horário de término/i);

  const rHoraFim = await enviar(handleMessage, NUMERO_LIDER, "18:00");
  assert.match(rHoraFim[0], /Solicitação de Agendamento Enviada/i);
  assert.match(rHoraFim[0], /Sessões Agendadas/i);

  // 7. Notificação para a Secretaria enviada
  assert.ok(gruposEnviados.length > 0);
  const ultMsgSec = gruposEnviados[gruposEnviados.length - 1].texto;
  assert.match(ultMsgSec, /Culto da Família Especial/);
  assert.match(ultMsgSec, /08\/11\/2026 \(16:00 às 18:00\)/);
  assert.match(ultMsgSec, /31\/01\/2027 \(16:00 às 18:00\)/);
});

test("Bot: Menu de Agenda enxuto unifica Inscrições & Fichas sem duplicidades", async () => {
  const { handleMessage } = criarContexto();

  await enviar(handleMessage, NUMERO_LIDER, "7"); // Área do Líder
  const rAgenda = await enviar(handleMessage, NUMERO_LIDER, "1"); // Agenda e Eventos

  // Verifica que o submenu do líder possui 4 opções claras e enxutas
  assert.match(rAgenda[0], /1️⃣ 🎪 \*Gestão de Eventos\*/);
  assert.match(rAgenda[0], /2️⃣ 🤝 \*Reuniões de Liderança\*/);
  assert.match(rAgenda[0], /3️⃣ 🔍 \*Consultar Disponibilidade\*/);
  assert.match(rAgenda[0], /4️⃣ 📋 \*Inscrições & Fichas\*/);
  // Não tem montagem duplicada no menu da agenda (fica em Gestão de Eventos)
  assert.doesNotMatch(rAgenda[0], /5️⃣ 🏢 Montagem/);

  // Escolhe a opção 4: Inscrições & Fichas
  const rInscFichas = await enviar(handleMessage, NUMERO_LIDER, "4");
  assert.match(rInscFichas[0], /Inscrições & Fichas de Eventos/i);
  assert.match(rInscFichas[0], /1️⃣ 👥 \*Lista de Inscritos\*/);
  assert.match(rInscFichas[0], /2️⃣ 📄 \*Fichas dos Eventos\*/);
});
