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
  montarMensagemConfirmacaoAtendimento,
  montarMensagemConfirmacaoReuniao,
  ehEnsaio,
  ehReuniao,
  ehAtendimentoPastoral,
  formatarDataBrasil,
  formatarHoraBrasil,
  formatarJidWhatsApp,
  buscarLembreteEnviado,
  registrarLembreteEnviado,
  processarLembretesEventos,
} = require("../bot/lembretes");
const { salvarFormularioEvento } = require("../bot/formularioEvento");
const { addLider, listLideres, obterLideresPorDepartamento, obterUsuarioPorTelefone } = require("../web/lideres");
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
  assert.match(respostas[0], /7️⃣ Área Pastoral/);
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
  assert.match(respostas[0], /7️⃣ Área da Direção/);
  assert.doesNotMatch(respostas[0], /7️⃣ Área do Líder/, "Diretor com função líder não deve ver o menu líder");
  assert.doesNotMatch(respostas[0], /7️⃣ Área Pastoral/);
});

test("Líder de múltiplos departamentos recebe avisos de eventos de qualquer um de seus departamentos", async () => {
  addLider({
    nome: "Sara Multi-Ministério",
    telefone: "5511922223333",
    cargos: ["lider"],
    departamentos: ["Epifania", "Rede Kids", "Intercessão"],
  });

  const usuario = obterUsuarioPorTelefone("5511922223333");
  assert.deepEqual(usuario.departamentos, ["Epifania", "Rede Kids", "Intercessão"]);

  // Deve ser encontrada ao buscar por qualquer um dos três departamentos
  assert.ok(obterLideresPorDepartamento("Epifania").some((l) => l.telefone === "5511922223333"));
  assert.ok(obterLideresPorDepartamento("Rede Kids").some((l) => l.telefone === "5511922223333"));
  assert.ok(obterLideresPorDepartamento("Intercessão").some((l) => l.telefone === "5511922223333"));
  // Não deve ser encontrada em departamento onde não atua
  assert.ok(!obterLideresPorDepartamento("Rede de Homens").some((l) => l.telefone === "5511922223333"));

  // Dispara lembrete para evento da Rede Kids
  const dataBase = new Date("2026-09-18T10:00:00.000Z");
  const eventosKids = [
    {
      id: "google-ev-kids-01",
      summary: "Encontro Especial Rede Kids",
      start: { dateTime: "2026-09-23T14:00:00-03:00" },
      location: "Sala Kids",
      calendarId: "cal-kids",
    },
  ];

  const mensagens = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagens.push({ to, txt });
    },
  };

  await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventosKids,
    agendasParaLer: [],
    diasAntecedencia: 5,
    dataBase,
  });

  assert.equal(mensagens.length, 1);
  assert.equal(mensagens[0].to, "5511922223333@c.us");
  assert.match(mensagens[0].txt, /Sara Multi-Ministério/);
  assert.match(mensagens[0].txt, /Rede Kids/);
});

test("Ensaios: não envia mensagem de lembrete/confirmação para ensaios", async () => {
  const dataBase = new Date("2026-09-18T10:00:00.000Z");
  const eventosEnsaio = [
    {
      id: "google-ev-ensaio-01",
      summary: "Ensaio Geral da Epifania",
      start: { dateTime: "2026-09-23T19:00:00-03:00" },
      calendarId: "fc012c51d15e9b272d4f955f504df24d816277da10194302f0ac1f04ae997e81@group.calendar.google.com",
    },
    {
      id: "google-ev-ensaio-02",
      summary: "Ensaio de Teatro e Dança",
      start: { dateTime: "2026-09-19T15:00:00-03:00" },
      calendarId: "cal-outro",
    },
  ];

  const mensagens = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagens.push({ to, txt });
    },
  };

  // Testa para 5 dias antes
  const res5 = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventosEnsaio,
    agendasParaLer: [],
    diasAntecedencia: 5,
    dataBase,
  });

  // Testa para 1 dia antes
  const res1 = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventosEnsaio,
    agendasParaLer: [],
    diasAntecedencia: 1,
    dataBase,
  });

  assert.equal(res5.enviados, 0, "Não deve enviar mensagem para ensaio de 5 dias");
  assert.equal(res1.enviados, 0, "Não deve enviar mensagem para ensaio de 1 dia");
  assert.equal(mensagens.length, 0, "Nenhuma mensagem deve ser enviada para ensaios");
});

test("Reuniões: envia mensagem de confirmação direta apenas 1 dia antes", async () => {
  addLider({
    nome: "Carlos Homens",
    telefone: "5511977778888",
    cargos: ["lider"],
    departamento: "Rede de Homens",
  });

  const dataBase = new Date("2026-09-18T10:00:00.000Z");
  const eventoReuniao = [
    {
      id: "google-ev-reuniao-01",
      summary: "Reunião de Alinhamento - Rede de Homens",
      start: { dateTime: "2026-09-19T20:00:00-03:00" },
      calendarId: "b8f01bfd149139d388080ec63176c2556e6e1aedce184b84d37671c3d082d238@group.calendar.google.com",
    },
  ];

  const mensagens = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagens.push({ to, txt });
    },
  };

  // Na rodada de 5 dias antes: Reuniões são ignoradas
  const res5 = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventoReuniao,
    agendasParaLer: [],
    diasAntecedencia: 5,
    dataBase,
  });
  assert.equal(res5.enviados, 0);

  // Na rodada de 1 dia antes: Reuniões são enviadas com pergunta direta
  const res1 = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventoReuniao,
    agendasParaLer: [],
    diasAntecedencia: 1,
    dataBase,
  });
  assert.ok(res1.enviados >= 1);
  assert.ok(mensagens.length >= 1);
  assert.match(mensagens[0].txt, /Passando para saber: a sua reunião/);
  assert.match(mensagens[0].txt, /está confirmada\?/);
  assert.doesNotMatch(mensagens[0].txt, /Lembrete de Evento Se Aproximando/);
  assert.doesNotMatch(mensagens[0].txt, /Formulário de Agendamento Preenchido/);
});

test("Atendimento Pastoral: envia mensagem de confirmação direta apenas 1 dia antes", async () => {
  addLider({
    nome: "Renata Membro",
    telefone: "5511966667777",
    cargos: ["membro"],
    departamento: "Geral",
  });

  const dataBase = new Date("2026-09-18T10:00:00.000Z");
  const eventoPastoral = [
    {
      id: "google-ev-pastoral-01",
      summary: "Atendimento Pastoral - Renata Membro",
      start: { dateTime: "2026-09-19T14:30:00-03:00" },
      calendarId: "0a55126694643f39944faf173fe3acd127b2a52074c6ecc9e9ed4dc23edf8b57@group.calendar.google.com",
    },
  ];

  const mensagens = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagens.push({ to, txt });
    },
  };

  // Na rodada de 5 dias antes: Atendimentos são ignorados
  const res5 = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventoPastoral,
    agendasParaLer: [],
    diasAntecedencia: 5,
    dataBase,
  });
  assert.equal(res5.enviados, 0);

  // Na rodada de 1 dia antes: Atendimentos são enviados com mensagem enxuta
  const res1 = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventoPastoral,
    agendasParaLer: [],
    diasAntecedencia: 1,
    dataBase,
  });
  assert.equal(res1.enviados, 1);
  assert.equal(mensagens.length, 1);
  // OBRIGATÓRIO: enviada para o pastor no privado (@c.us), nunca para o grupo (@g.us)
  assert.equal(mensagens[0].to, "5511955556666@c.us");
  assert.doesNotMatch(mensagens[0].to, /@g\.us/);
  assert.match(mensagens[0].txt, /Passando para saber: o atendimento pastoral/);
  assert.match(mensagens[0].txt, /está confirmado\?/);
  assert.doesNotMatch(mensagens[0].txt, /Lembrete de Evento Se Aproximando/);
});

test("Atendimento Pastoral: confirmação é enviada para o pastor que a marcou via banco e nunca no grupo", async () => {
  const { registrarAgendamentoPastoral } = require("../bot/lembretes");
  registrarAgendamentoPastoral({
    eventoId: "ev-pastoral-gabriel",
    pastorTelefone: "5511988887777",
    pastorNome: "Pastor Gabriel",
    discipulo: "Marcos Ferreira",
    dataHora: "19/09 16:00",
  });

  const dataBase = new Date("2026-09-18T10:00:00.000Z");
  const eventoPastoral = [
    {
      id: "ev-pastoral-gabriel",
      summary: "Atendimento Pastoral - Marcos Ferreira",
      start: { dateTime: "2026-09-19T16:00:00-03:00" },
      calendarId: "0a55126694643f39944faf173fe3acd127b2a52074c6ecc9e9ed4dc23edf8b57@group.calendar.google.com",
    },
  ];

  const mensagens = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagens.push({ to, txt });
    },
  };

  const res = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventoPastoral,
    agendasParaLer: [],
    diasAntecedencia: 1,
    dataBase,
  });

  assert.equal(res.enviados, 1);
  assert.equal(mensagens.length, 1);
  assert.equal(mensagens[0].to, "5511988887777@c.us"); // Enviado exclusivamente para o pastor que marcou
  assert.doesNotMatch(mensagens[0].to, /@g\.us/); // NUNCA no grupo
  assert.match(mensagens[0].txt, /Olá, \*Pastor Gabriel\*! Tudo bem\?/);
  assert.match(mensagens[0].txt, /o atendimento pastoral com \*Marcos Ferreira\* agendado para amanhã \(19\/09\/2026 às \*16:00\*\) está confirmado\?/);
});
