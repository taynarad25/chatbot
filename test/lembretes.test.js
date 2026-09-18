const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-lembretes-test-"));
process.env.DB_PATH = path.join(tmpDir, "lembretes.db");

const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const db = require("../db");
const {
  montarMensagemLembrete,
  formatarDataBrasil,
  formatarHoraBrasil,
  formatarJidWhatsApp,
  buscarLembreteEnviado,
  registrarLembreteEnviado,
  processarLembretesEventos,
} = require("../bot/lembretes");
const { salvarFormularioEvento } = require("../bot/formularioEvento");
const { addLider, listLideres, obterLideresPorDepartamento } = require("../web/lideres");
const { createMessageHandler } = require("../bot/messageHandler");

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

test("formatarDataBrasil formata datas ISO ou YYYY-MM-DD para DD/MM/AAAA", () => {
  assert.equal(formatarDataBrasil("2026-09-23"), "23/09/2026");
  assert.equal(formatarDataBrasil("2026-09-23T19:30:00-03:00"), "23/09/2026");
  assert.equal(formatarDataBrasil(""), "");
});

test("formatarJidWhatsApp limpa caracteres e garante sufixo @c.us", () => {
  assert.equal(formatarJidWhatsApp("+55 (11) 98888-7777"), "5511988887777@c.us");
  assert.equal(formatarJidWhatsApp("5511988887777@c.us"), "5511988887777@c.us");
  assert.equal(formatarJidWhatsApp(""), "");
});

test("montarMensagemLembrete inclui aviso de 5 dias, dados do evento, perguntas e link do doc", () => {
  const msg = montarMensagemLembrete({
    nomeLider: "Gabriel",
    evento: "Culto de Jovens Epifania",
    data: "2026-09-23",
    horario: "19:30",
    local: "Templo Sede",
    departamento: "Epifania",
    docUrl: "https://docs.google.com/document/d/12345/edit",
    diasRestantes: 5,
  });

  assert.match(msg, /🔔 \*Lembrete de Evento Se Aproximando!\*/);
  assert.match(msg, /Olá, \*Gabriel\*!/);
  assert.match(msg, /Faltam \*5 dias\*/);
  assert.match(msg, /📅 \*Evento:\* Culto de Jovens Epifania/);
  assert.match(msg, /🏢 \*Departamento\/Ministério:\* Epifania/);
  assert.match(msg, /📆 \*Data:\* 23\/09\/2026/);
  assert.match(msg, /⏰ \*Horário:\* 19:30/);
  assert.match(msg, /📍 \*Local:\* Templo Sede/);
  assert.match(msg, /Está tudo certo com os preparativos e alinhamentos\?/);
  assert.match(msg, /Gostaria de adicionar mais alguma informação ao evento ou realizar alguma alteração\?/);
  assert.match(msg, /📄 \*Formulário de Agendamento Preenchido:\*/);
  assert.match(msg, /https:\/\/docs\.google\.com\/document\/d\/12345\/edit/);
});

test("montarMensagemLembrete omite seção de formulário quando docUrl não existe", () => {
  const msg = montarMensagemLembrete({
    nomeLider: "Líder Ana",
    evento: "Ensaio de Louvor",
    data: "2026-09-23",
    horario: "20:00",
    departamento: "Rede Ruach",
    docUrl: "",
    diasRestantes: 5,
  });

  assert.match(msg, /Faltam \*5 dias\*/);
  assert.match(msg, /Rede Ruach/);
  assert.doesNotMatch(msg, /Formulário de Agendamento Preenchido/);
});

test("registrarLembreteEnviado e buscarLembreteEnviado garantem idempotência", () => {
  const eventoId = "ev-teste-123";
  const tipo = "5_dias_antes";

  assert.equal(buscarLembreteEnviado(eventoId, tipo), undefined);

  const res1 = registrarLembreteEnviado(eventoId, tipo, "5511999990001");
  assert.equal(res1, true);

  const salvo = buscarLembreteEnviado(eventoId, tipo);
  assert.ok(salvo);
  assert.equal(salvo.eventoId, eventoId);
  assert.equal(salvo.tipo, tipo);
  assert.equal(salvo.destinatario, "5511999990001");

  // Inserção duplicada deve falhar sem quebrar
  const res2 = registrarLembreteEnviado(eventoId, tipo, "5511999990001");
  assert.equal(res2, false);
});

test("processarLembretesEventos envia mensagem ao líder solicitante via formulário e evita duplicatas", async () => {
  // Cadastra líder
  addLider({
    nome: "Marcos Líder",
    telefone: "5511911112222",
    cargos: ["lider"],
    departamento: "Epifania",
  });

  // Salva formulário preenchido
  salvarFormularioEvento({
    evento: "Vigília Jovem Epifania",
    departamento: "Epifania",
    data: "23/09/2026",
    solicitanteId: "5511911112222",
    payload: { nomeSolicitante: "Marcos Líder" },
    docUrl: "https://docs.google.com/doc/vigilia-epifania",
  });

  // Data base do teste: 2026-09-18. 5 dias à frente: 2026-09-23
  const dataBase = new Date("2026-09-18T10:00:00.000Z");

  const eventosFalsos = [
    {
      id: "google-ev-vigilia-01",
      summary: "Vigília Jovem Epifania",
      start: { dateTime: "2026-09-23T22:00:00-03:00" },
      location: "Templo Central",
      calendarId: "cal-epifania",
    },
  ];

  const mensagensEnviadas = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagensEnviadas.push({ to, txt });
    },
  };

  const resultado1 = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventosFalsos,
    agendasParaLer: ["cal-evangelismo", "cal-epifania"],
    diasAntecedencia: 5,
    dataBase,
  });

  assert.equal(resultado1.processados, 1);
  assert.equal(resultado1.enviados, 1);
  assert.equal(mensagensEnviadas.length, 1);

  const msg = mensagensEnviadas[0];
  assert.equal(msg.to, "5511911112222@c.us");
  assert.match(msg.txt, /Vigília Jovem Epifania/);
  assert.match(msg.txt, /Marcos Líder/);
  assert.match(msg.txt, /https:\/\/docs\.google\.com\/doc\/vigilia-epifania/);
  assert.match(msg.txt, /Faltam \*5 dias\*/);

  // Segunda execução para o mesmo evento: NÃO deve enviar novamente (idempotência)
  const resultado2 = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventosFalsos,
    agendasParaLer: ["cal-evangelismo", "cal-epifania"],
    diasAntecedencia: 5,
    dataBase,
  });

  assert.equal(resultado2.enviados, 0);
  assert.equal(mensagensEnviadas.length, 1, "Não deve enviar mensagem duplicada");
});

test("processarLembretesEventos localiza líder por departamento quando não há formulário", async () => {
  // Cadastra líder do departamento Evangelismo
  addLider({
    nome: "Lucas Evangelismo",
    telefone: "5511933334444",
    cargos: ["lider"],
    departamento: "Evangelismo",
  });

  const dataBase = new Date("2026-09-18T10:00:00.000Z");

  // Evento no calendário do Evangelismo (agendaIndex 0)
  const eventosFalsos = [
    {
      id: "google-ev-evangelismo-01",
      summary: "Ação de Evangelismo no Bairro",
      start: { dateTime: "2026-09-23T15:00:00-03:00" },
      location: "Praça Central",
      calendarId: "cal-evangelismo",
    },
  ];

  const mensagensEnviadas = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagensEnviadas.push({ to, txt });
    },
  };

  const resultado = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventosFalsos,
    agendasParaLer: ["cal-evangelismo", "cal-epifania"],
    diasAntecedencia: 5,
    dataBase,
  });

  assert.equal(resultado.enviados, 1);
  assert.equal(mensagensEnviadas.length, 1);
  assert.equal(mensagensEnviadas[0].to, "5511933334444@c.us");
  assert.match(mensagensEnviadas[0].txt, /Lucas Evangelismo/);
  assert.match(mensagensEnviadas[0].txt, /Evangelismo/);
});

test("Pastor com cargo adicional 'lider' recebe lembretes ministeriais, mas não vê menu líder", async () => {
  // Cadastra pastor que também é líder do departamento Seeds
  addLider({
    nome: "Pr. André Seeds",
    telefone: "5511955556666",
    cargos: ["pastor", "lider"],
    departamento: "Projeto Social Seeds",
  });

  // 1. Verifica busca por departamento para lembretes
  const lideresSeeds = obterLideresPorDepartamento("Projeto Social Seeds");
  assert.ok(lideresSeeds.some((l) => l.telefone === "5511955556666"));

  // 2. Disparo de lembrete para evento Seeds
  const dataBase = new Date("2026-09-18T10:00:00.000Z");
  const eventosFalsos = [
    {
      id: "google-ev-seeds-01",
      summary: "Distribuição de Alimentos Seeds",
      start: { dateTime: "2026-09-23T09:00:00-03:00" },
      location: "Sede",
      calendarId: "cal-seeds",
    },
  ];

  const mensagensEnviadas = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagensEnviadas.push({ to, txt });
    },
  };

  // Agenda index de Seeds é 4: REDES[3].agendaIndex = 4
  const agendas = ["c0", "c1", "c2", "c3", "cal-seeds"];
  await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventosFalsos,
    agendasParaLer: agendas,
    diasAntecedencia: 5,
    dataBase,
  });

  assert.equal(mensagensEnviadas.length, 1);
  assert.equal(mensagensEnviadas[0].to, "5511955556666@c.us");
  assert.match(mensagensEnviadas[0].txt, /Pr\. André Seeds/);

  // 3. No bot do WhatsApp, Pr. André NÃO deve ver opção 7 (Área do Líder)
  const respostas = [];
  const handleMessage = createMessageHandler({
    client: fakeClient,
    calendar: {},
    agendasParaLer: agendas,
    lideres: [],
    etapas: {},
    buscarEventos: async () => [],
    listLideres: () => listLideres(),
  });

  await handleMessage({
    from: "5511955556666@c.us",
    body: "olá",
    id: { _serialized: "msg-pastor-lider" },
    getContact: async () => ({ id: { _serialized: "5511955556666@c.us" }, pushname: "Pr. André" }),
    reply: async (txt) => {
      respostas.push(txt);
      return txt;
    },
  });

  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /8️⃣ Área Pastoral/);
  assert.doesNotMatch(respostas[0], /7️⃣ Área do Líder/, "Pastor com função líder não deve ver o menu líder");
});

test("Diretor com cargo adicional 'lider' recebe lembretes, mas só vê opção 9 (Área da Direção)", async () => {
  addLider({
    nome: "Diretor Fernando",
    telefone: "5511944443333",
    cargos: ["diretor", "lider"],
    departamento: "Rede de Homens",
  });

  const lideresHomens = obterLideresPorDepartamento("Rede de Homens");
  assert.ok(lideresHomens.some((l) => l.telefone === "5511944443333"));

  const respostas = [];
  const handleMessage = createMessageHandler({
    client: {},
    calendar: {},
    agendasParaLer: [],
    lideres: [],
    etapas: {},
    buscarEventos: async () => [],
    listLideres: () => listLideres(),
  });

  await handleMessage({
    from: "5511944443333@c.us",
    body: "paz",
    id: { _serialized: "msg-diretor-lider" },
    getContact: async () => ({ id: { _serialized: "5511944443333@c.us" }, pushname: "Fernando" }),
    reply: async (txt) => {
      respostas.push(txt);
      return txt;
    },
  });

  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /9️⃣ Área da Direção/);
  assert.doesNotMatch(respostas[0], /7️⃣ Área do Líder/, "Diretor com função líder não deve ver o menu líder");
  assert.doesNotMatch(respostas[0], /8️⃣ Área Pastoral/);
});
