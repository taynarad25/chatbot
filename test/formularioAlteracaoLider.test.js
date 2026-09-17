const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createMessageHandler } = require("../bot/messageHandler");

function criarHarness({ usuarios = [], calendarEvents = [] } = {}) {
  const etapas = {};
  const diretasEnviadas = [];
  const gruposEnviados = [];

  const JID_GRUPO_SECRETARIA = "111111111111111@g.us";
  const JID_GRUPO_PASTORAL = "222222222222222@g.us";

  const client = {
    sendMessage: async (to, content) => {
      const texto = typeof content === "string" ? content : content?.caption || "";
      if (to === JID_GRUPO_SECRETARIA || to === JID_GRUPO_PASTORAL) {
        gruposEnviados.push({ to, texto });
      } else {
        diretasEnviadas.push({ to, texto });
      }
    },
    getChats: async () => [
      { id: { _serialized: JID_GRUPO_SECRETARIA }, isGroup: true, name: "Mensagens Secretaria" },
    ],
  };

  const agendasParaLer = [
    "agenda-0", "agenda-1", "agenda-2", "agenda-3", "agenda-4",
    "agenda-5", "agenda-6", "agenda-7", "agenda-8", "agenda-9",
    "agenda-10",
  ];

  const handleMessage = createMessageHandler({
    client,
    calendar: { events: {} },
    agendasParaLer,
    lideres: usuarios.filter((u) => u.cargos?.includes("lider")).map((u) => u.telefone),
    etapas,
    buscarEventos: async () => calendarEvents,
    listLideres: () => usuarios,
  });

  async function enviar(numero, texto) {
    const respostas = [];
    const msg = {
      from: numero.includes("@c.us") ? numero : `${numero}@c.us`,
      fromMe: false,
      body: texto,
      reply: async (t) => {
        respostas.push(t);
        return t;
      },
      getContact: async () => ({
        id: { _serialized: numero.includes("@c.us") ? numero : `${numero}@c.us` },
        pushname: "Lider",
      }),
      respostas,
    };
    await handleMessage(msg);
    return respostas;
  }

  return { etapas, client, handleMessage, enviar, diretasEnviadas, gruposEnviados };
}

test("Menu Líder: opção 1 exibe submenu de eventos com opção 4 (Alterar formulário)", async () => {
  const NUMERO_LIDER = "5511999993333";
  const harness = criarHarness({
    usuarios: [{ nome: "Líder João", telefone: NUMERO_LIDER, cargos: ["lider"] }],
  });

  await harness.enviar(NUMERO_LIDER, "6"); // Área do Líder
  const [menuEventos] = await harness.enviar(NUMERO_LIDER, "1"); // Menu de Eventos

  assert.match(menuEventos, /📅 \*Menu de Eventos\*/);
  assert.match(menuEventos, /1 - Agendar novo evento/);
  assert.match(menuEventos, /2 - Alterar evento existente/);
  assert.match(menuEventos, /3 - Cancelar evento existente/);
  assert.match(menuEventos, /4 - Alterar ou atualizar dados do formulário do evento/);
});

test("Menu Líder: fluxo completo de alteração de campo do formulário com solicitação de verba notifica secretaria e tesouraria (+55 11 99111-7612)", async () => {
  const NUMERO_LIDER = "5511999993333";
  const eventoCafe = {
    id: "evento-cafe-1",
    summary: "Café com Deus",
    start: { dateTime: "2026-11-15T08:00:00-03:00" },
    end: { dateTime: "2026-11-15T11:00:00-03:00" },
    location: "Igreja",
  };

  const harness = criarHarness({
    usuarios: [{ nome: "Líder João", telefone: NUMERO_LIDER, cargos: ["lider"] }],
    calendarEvents: [eventoCafe],
  });

  // 1. Entra no menu de eventos
  await harness.enviar(NUMERO_LIDER, "6");
  await harness.enviar(NUMERO_LIDER, "1");

  // 2. Escolhe opção 4 (Alterar formulário)
  const [rDepto] = await harness.enviar(NUMERO_LIDER, "4");
  assert.match(rDepto, /De qual departamento é o evento que você deseja alterar o formulário\?/);

  // 3. Escolhe departamento 7 (Rede de Homens)
  const [rBusca, rEventos] = await harness.enviar(NUMERO_LIDER, "7");
  assert.match(rEventos || rBusca, /Café com Deus/);

  // 4. Seleciona o evento 1
  const [rCampos] = await harness.enviar(NUMERO_LIDER, "1");
  assert.match(rCampos, /Atualizar Formulário do Evento: Café com Deus/);
  assert.match(rCampos, /4 - Verba do ministério \/ apoio da tesouraria/);

  // 5. Escolhe campo 4 (Verba do ministério)
  const [rPrompt] = await harness.enviar(NUMERO_LIDER, "4");
  assert.match(rPrompt, /O evento precisará de verba do ministério\?/);

  // 6. Responde SIM com detalhes da verba
  const [rFinal] = await harness.enviar(NUMERO_LIDER, "Sim, precisaremos de R$ 300 para o café da manhã");
  assert.match(rFinal, /Formulário Atualizado com Sucesso!/);
  assert.match(rFinal, /Café com Deus/);
  assert.match(rFinal, /Verba do ministério \/ tesouraria/);
  assert.match(rFinal, /\+55 11 99111-7612/);

  // Notificação para a secretaria
  const msgSec = harness.gruposEnviados.find((g) => g.texto.includes("ATUALIZAÇÃO DE FORMULÁRIO DE EVENTO"));
  assert.ok(msgSec, "deve notificar o grupo da secretaria");
  assert.match(msgSec.texto, /Café com Deus/);
  assert.match(msgSec.texto, /Verba do ministério \/ tesouraria/);
  assert.match(msgSec.texto, /\+55 11 99111-7612/);

  // Notificação direta para a tesouraria
  const msgTes = harness.diretasEnviadas.find((d) => d.to && d.to.includes("5511991117612"));
  assert.ok(msgTes, "deve notificar o número da tesouraria diretamente");
  assert.match(msgTes.texto, /AVISO DE EVENTO - DEMANDA DA TESOURARIA/);
  assert.match(msgTes.texto, /Café com Deus/);

  // Sessão limpa
  assert.equal(harness.etapas[`${NUMERO_LIDER}@c.us`], undefined);
});

test("Menu Líder: opção 14 permite reiniciar e preencher novamente o formulário completo", async () => {
  const NUMERO_LIDER = "5511999993333";
  const eventoLuau = {
    id: "evento-luau-1",
    summary: "Luau da Juventude",
    start: { dateTime: "2026-12-10T19:00:00-03:00" },
    end: { dateTime: "2026-12-10T22:00:00-03:00" },
    location: "Praia",
  };

  const harness = criarHarness({
    usuarios: [{ nome: "Líder Amanda", telefone: NUMERO_LIDER, cargos: ["lider"] }],
    calendarEvents: [eventoLuau],
  });

  await harness.enviar(NUMERO_LIDER, "6");
  await harness.enviar(NUMERO_LIDER, "1");
  await harness.enviar(NUMERO_LIDER, "4"); // Atualizar formulário
  await harness.enviar(NUMERO_LIDER, "5"); // Rede Ruach
  await harness.enviar(NUMERO_LIDER, "1"); // Seleciona evento 1

  // Escolhe 14 (Preencher novamente o formulário completo)
  const [rReiniciar] = await harness.enviar(NUMERO_LIDER, "14");
  assert.match(rReiniciar, /Reiniciando o formulário para este evento/);

  // Deve ter iniciado o fluxo formulario_evento com primeira pergunta
  const etapaAtual = harness.etapas[`${NUMERO_LIDER}@c.us`];
  assert.ok(etapaAtual);
  assert.equal(etapaAtual.fluxo, "formulario_evento");
  assert.equal(etapaAtual.dadosIniciais.evento, "Luau da Juventude");
});
