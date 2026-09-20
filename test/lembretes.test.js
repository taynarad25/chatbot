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
  montarMensagemLembreteMultimidia,
  montarMensagemConfirmacaoAtendimento,
  montarMensagemConfirmacaoReuniao,
  montarMensagemAgendaQuinzenalSecretarias,
  ehEnsaio,
  ehReuniao,
  ehAtendimentoPastoral,
  formatarDataBrasil,
  formatarHoraBrasil,
  formatarJidWhatsApp,
  buscarLembreteEnviado,
  registrarLembreteEnviado,
  processarLembretesEventos,
  processarLembretesDivulgacaoMultimidia,
  processarEnvioAgendaSecretarias,
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

test("montarMensagemLembreteMultimidia formata detalhes de demanda e contatos de líder para a equipe de multimídia", () => {
  const msg = montarMensagemLembreteMultimidia({
    evento: "Retiro de Jovens Epifania",
    departamento: "Epifania",
    dataEvento: "2026-10-25",
    horario: "19:00 às 22:00",
    local: "Acampamento Betel",
    dataDivulgacao: "2026-10-15",
    diasRestantes: 5,
    nomeLider: "Lucas Santos",
    telefoneLider: "5511999991111",
    tema: "Firmes na Rocha",
    versiculo: "1 Co 15:58",
    cores: "Azul marinho e dourado",
    midias: "Flyer feed, stories e vídeo teaser",
    canais: "Instagram e Telão do culto",
    docUrl: "https://docs.google.com/document/d/doc-retiro-123",
  });

  assert.match(msg, /LEMBRETE DE DIVULGAÇÃO - MULTIMÍDIAS/);
  assert.match(msg, /Faltam \*5 dias\* para a data máxima de início da divulgação do evento!/);
  assert.match(msg, /Retiro de Jovens Epifania/);
  assert.match(msg, /Epifania/);
  assert.match(msg, /25\/10\/2026/);
  assert.match(msg, /15\/10\/2026/);
  assert.match(msg, /Lucas Santos \(5511999991111\)/);
  assert.match(msg, /Firmes na Rocha/);
  assert.match(msg, /1 Co 15:58/);
  assert.match(msg, /Azul marinho e dourado/);
  assert.match(msg, /Flyer feed, stories e vídeo teaser/);
  assert.match(msg, /Instagram e Telão do culto/);
  assert.match(msg, /https:\/\/docs\.google\.com\/document\/d\/doc-retiro-123/);
});

test("processarLembretesDivulgacaoMultimidia: envia lembrete ao grupo MULTIMÍDIAS com 5 dias e 3 dias antes", async () => {
  const dataEvento = "2026-11-20";
  const dataDivulgacao = "2026-11-10";

  salvarFormularioEvento({
    evento: "Noite de Louvor e Adoração",
    departamento: "Rede Ruach",
    data: "20/11/2026",
    dataMaximaDivulgacao: dataDivulgacao,
    solicitanteId: "5511988882222",
    payload: {
      nome_lider: "Renata Louvor",
      departamento: "Rede Ruach",
      data: "20/11/2026",
      horario_inicio: "19:30",
      horario_termino: "22:00",
      tema: "Mais Perto de Ti",
      estilo: "Flyer stories",
      prazo_imagem: "Instagram",
      data_maxima_divulgacao: "10/11/2026",
    },
    docUrl: "https://docs.google.com/document/d/louvor-doc",
  });

  const mensagensMultimidia = [];
  const fakeNotificar = async (client, msg) => {
    mensagensMultimidia.push(msg);
  };

  // 1. Teste de 5 dias antes (data base: 2026-11-05)
  const dataBase5 = new Date("2026-11-05T12:00:00.000Z");
  const res5 = await processarLembretesDivulgacaoMultimidia({
    client: {},
    diasAntecedencia: 5,
    dataBase: dataBase5,
    notificarFn: fakeNotificar,
  });

  assert.equal(res5.enviados, 1);
  assert.equal(mensagensMultimidia.length, 1);
  assert.match(mensagensMultimidia[0], /Faltam \*5 dias\*/);
  assert.match(mensagensMultimidia[0], /Noite de Louvor e Adoração/);
  assert.match(mensagensMultimidia[0], /Renata Louvor/);
  assert.match(mensagensMultimidia[0], /Mais Perto de Ti/);

  // Idempotência para 5 dias
  const res5Dup = await processarLembretesDivulgacaoMultimidia({
    client: {},
    diasAntecedencia: 5,
    dataBase: dataBase5,
    notificarFn: fakeNotificar,
  });
  assert.equal(res5Dup.enviados, 0, "não deve enviar novamente o lembrete de 5 dias");
  assert.equal(mensagensMultimidia.length, 1);

  // 2. Teste de 3 dias antes (data base: 2026-11-07)
  const dataBase3 = new Date("2026-11-07T12:00:00.000Z");
  const res3 = await processarLembretesDivulgacaoMultimidia({
    client: {},
    diasAntecedencia: 3,
    dataBase: dataBase3,
    notificarFn: fakeNotificar,
  });

  assert.equal(res3.enviados, 1);
  assert.equal(mensagensMultimidia.length, 2);
  assert.match(mensagensMultimidia[1], /Faltam \*3 dias\*/);
  assert.match(mensagensMultimidia[1], /Noite de Louvor e Adoração/);

  // Idempotência para 3 dias
  const res3Dup = await processarLembretesDivulgacaoMultimidia({
    client: {},
    diasAntecedencia: 3,
    dataBase: dataBase3,
    notificarFn: fakeNotificar,
  });
  assert.equal(res3Dup.enviados, 0, "não deve enviar novamente o lembrete de 3 dias");
  assert.equal(mensagensMultimidia.length, 2);
});

test("processarLembretesEventos: envia lembrete de confirmação de evento ao líder faltando 3 dias", async () => {
  const NUMERO_LIDER_3DIAS = "5511977770003";
  addLider({
    nome: "Tiago Líder",
    telefone: NUMERO_LIDER_3DIAS,
    cargos: ["lider"],
    departamento: "Rede de Homens",
  });

  salvarFormularioEvento({
    evento: "Café com Deus Homens",
    departamento: "Rede de Homens",
    data: "23/09/2026",
    solicitanteId: NUMERO_LIDER_3DIAS,
    payload: {
      nome_lider: "Tiago Líder",
      departamento: "Rede de Homens",
    },
  });

  const dataBase = new Date("2026-09-20T10:00:00.000Z");
  // Faltando 3 dias: 2026-09-23
  const eventosAgenda = [
    {
      id: "ev-homens-3dias",
      summary: "Café com Deus Homens",
      start: { dateTime: "2026-09-23T08:00:00-03:00" },
      calendarId: "agenda-homens",
    },
  ];

  const mensagensLider = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagensLider.push({ to, txt });
    },
  };

  const res = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventosAgenda,
    agendasParaLer: [],
    diasAntecedencia: 3,
    dataBase,
  });

  assert.equal(res.enviados, 1);
  assert.equal(mensagensLider.length, 1);
  assert.equal(mensagensLider[0].to, `${NUMERO_LIDER_3DIAS}@c.us`);
  assert.match(mensagensLider[0].txt, /Faltam \*3 dias\* para a realização do seu evento:/);
  assert.match(mensagensLider[0].txt, /Café com Deus Homens/);
});

test("processarLembretesEventos: faltando 5 dias inclui docUrl e envia cópia à secretaria; faltando 3 dias não inclui docUrl e envia cópia à secretaria", async () => {
  const NUMERO_LIDER_COMPARACAO = "5511977770099";
  addLider({
    nome: "Lucas Lider",
    telefone: NUMERO_LIDER_COMPARACAO,
    cargos: ["lider"],
    departamento: "Rede de Jovens",
  });

  salvarFormularioEvento({
    evento: "Luau da Juventude",
    departamento: "Rede de Jovens",
    data: "25/09/2026",
    solicitanteId: NUMERO_LIDER_COMPARACAO,
    docUrl: "https://docs.google.com/document/d/luau-doc-123/edit",
    payload: {
      nome_lider: "Lucas Lider",
      departamento: "Rede de Jovens",
    },
  });

  const eventosAgenda = [
    {
      id: "ev-luau-5dias",
      summary: "Luau da Juventude",
      start: { dateTime: "2026-09-25T19:00:00-03:00" },
      calendarId: "agenda-jovens",
    },
  ];

  const enviadasLider5d = [];
  const avisosSecretaria5d = [];
  const fakeClient5d = {
    sendMessage: async (to, txt) => {
      enviadasLider5d.push({ to, txt });
    },
  };
  const fakeNotificarSecretaria5d = async (c, txt) => {
    avisosSecretaria5d.push(txt);
  };

  // Teste 1: Faltando 5 dias (dataBase: 2026-09-20 -> evento: 2026-09-25)
  await processarLembretesEventos({
    client: fakeClient5d,
    buscarEventos: async () => eventosAgenda,
    agendasParaLer: [],
    diasAntecedencia: 5,
    dataBase: new Date("2026-09-20T10:00:00.000Z"),
    notificarSecretariaFn: fakeNotificarSecretaria5d,
  });

  assert.equal(enviadasLider5d.length, 1);
  assert.match(enviadasLider5d[0].txt, /Faltam \*5 dias\*/);
  assert.match(enviadasLider5d[0].txt, /Formulário de Agendamento Preenchido/);
  assert.match(enviadasLider5d[0].txt, /https:\/\/docs\.google\.com\/document\/d\/luau-doc-123\/edit/);
  assert.equal(avisosSecretaria5d.length, 1);
  assert.match(avisosSecretaria5d[0], /Aviso à Secretaria - Lembrete de Evento/);
  assert.match(avisosSecretaria5d[0], /Formulário Anexado:/);

  // Teste 2: Faltando 3 dias (dataBase: 2026-09-22 -> evento: 2026-09-25)
  const enviadasLider3d = [];
  const avisosSecretaria3d = [];
  const fakeClient3d = {
    sendMessage: async (to, txt) => {
      enviadasLider3d.push({ to, txt });
    },
  };
  const fakeNotificarSecretaria3d = async (c, txt) => {
    avisosSecretaria3d.push(txt);
  };

  await processarLembretesEventos({
    client: fakeClient3d,
    buscarEventos: async () => eventosAgenda,
    agendasParaLer: [],
    diasAntecedencia: 3,
    dataBase: new Date("2026-09-22T10:00:00.000Z"),
    notificarSecretariaFn: fakeNotificarSecretaria3d,
  });

  assert.equal(enviadasLider3d.length, 1);
  assert.match(enviadasLider3d[0].txt, /Faltam \*3 dias\*/);
  assert.doesNotMatch(enviadasLider3d[0].txt, /Formulário de Agendamento Preenchido/);
  assert.doesNotMatch(enviadasLider3d[0].txt, /https:\/\/docs\.google\.com\/document\/d\/luau-doc-123\/edit/);
  assert.equal(avisosSecretaria3d.length, 1);
  assert.match(avisosSecretaria3d[0], /Aviso à Secretaria - Lembrete de Evento/);
  assert.doesNotMatch(avisosSecretaria3d[0], /Formulário Anexado:/);
});

test("processarLembretesEventos: reuniões enviam cópia à secretaria, mas atendimento pastoral NUNCA envia à secretaria", async () => {
  const eventosMistos = [
    {
      id: "ev-reuniao-depto-sec",
      summary: "Reunião de Alinhamento - Rede de Homens",
      start: { dateTime: "2026-09-21T20:00:00-03:00" },
      calendarId: "agenda-reunioes",
    },
    {
      id: "ev-atendimento-confidencial-sec",
      summary: "Atendimento Pastoral - Roberto Teste",
      start: { dateTime: "2026-09-21T15:00:00-03:00" },
      calendarId: "agenda-atendimentos",
    },
  ];

  addLider({
    nome: "Pastor Silvano",
    telefone: "5511999997788",
    cargos: ["pastor"],
    departamento: "Geral",
  });

  const avisosSecretaria = [];
  const fakeClient = {
    sendMessage: async () => {},
  };
  const fakeNotificarSecretaria = async (c, txt) => {
    avisosSecretaria.push(txt);
  };

  await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventosMistos,
    agendasParaLer: [],
    diasAntecedencia: 1,
    dataBase: new Date("2026-09-20T10:00:00.000Z"),
    notificarSecretariaFn: fakeNotificarSecretaria,
  });

  // Apenas a reunião deve gerar aviso na secretaria
  assert.ok(avisosSecretaria.length >= 1);
  assert.ok(avisosSecretaria.some((msg) => msg.includes("Reunião de Alinhamento - Rede de Homens")));
  // Atendimento pastoral nunca pode estar na secretaria
  assert.ok(!avisosSecretaria.some((msg) => msg.includes("Atendimento Pastoral") || msg.includes("Roberto Teste")));
});

test("montarMensagemAgendaQuinzenalSecretarias: unifica horários de preparação/limpeza e agrupa por dia", () => {
  const eventos = [
    {
      summary: "Conferência Águas Profundas",
      start: { dateTime: "2026-09-22T19:00:00-03:00" },
      location: "Templo Sede",
    },
    {
      summary: "[Preparação/Decoração] Conferência Águas Profundas",
      start: { dateTime: "2026-09-22T17:00:00-03:00" },
    },
    {
      summary: "[Limpeza] Conferência Águas Profundas",
      start: { dateTime: "2026-09-22T22:00:00-03:00" },
    },
  ];

  const msg = montarMensagemAgendaQuinzenalSecretarias(eventos, "2026-09-21", "2026-10-05");

  assert.match(msg, /AGENDA QUINZENAL DAS SECRETÁRIAS/);
  assert.match(msg, /21\/09\/2026\* a \*05\/10\/2026/);
  assert.match(msg, /Conferência Águas Profundas/);
  assert.match(msg, /17:00/);
  assert.match(msg, /horário para preparação e limpeza/);
  // Não deve aparecer itens avulsos repetidos
  assert.doesNotMatch(msg, /• \*\[Preparação\/Decoração\]/);
});

test("processarEnvioAgendaSecretarias: envia na segunda-feira para Isabelly e Gabriela e previne reenvio", async () => {
  addLider({
    nome: "Isabelly Lacerda",
    telefone: "5511988880001",
    cargos: ["secretaria", "lider"],
    departamento: "Secretaria",
  });
  addLider({
    nome: "Gabriela Diniz",
    telefone: "5511988880002",
    cargos: ["secretaria", "lider"],
    departamento: "Secretaria",
  });

  const eventosMock = [
    {
      summary: "Culto de Domingo",
      start: { dateTime: "2026-09-27T18:00:00-03:00" },
      location: "Templo",
    },
  ];

  const mensagensEnviadas = [];
  const fakeClient = {
    sendMessage: async (to, txt) => {
      mensagensEnviadas.push({ to, txt });
    },
  };

  // 1. Em dia que NÃO é segunda-feira (ex: domingo 2026-09-20), não deve enviar
  const resDomingo = await processarEnvioAgendaSecretarias({
    client: fakeClient,
    buscarEventos: async () => eventosMock,
    dataBase: new Date("2026-09-20T10:00:00.000Z"), // Domingo
  });
  assert.equal(resDomingo.pulado, true);
  assert.equal(mensagensEnviadas.length, 0);

  // 2. Em uma segunda-feira (2026-09-21), deve enviar para Isabelly e Gabriela
  const resSegunda = await processarEnvioAgendaSecretarias({
    client: fakeClient,
    buscarEventos: async () => eventosMock,
    dataBase: new Date("2026-09-21T10:00:00.000Z"), // Segunda-feira
  });
  assert.equal(resSegunda.enviados, 2);
  assert.equal(mensagensEnviadas.length, 2);
  assert.ok(mensagensEnviadas.some((m) => m.to === "5511988880001@c.us"));
  assert.ok(mensagensEnviadas.some((m) => m.to === "5511988880002@c.us"));
  assert.match(mensagensEnviadas[0].txt, /AGENDA QUINZENAL DAS SECRETÁRIAS/);
  assert.match(mensagensEnviadas[0].txt, /Culto de Domingo/);

  // 3. Reexecução no mesmo dia não deve duplicar (idempotência)
  const resSegundaNovamente = await processarEnvioAgendaSecretarias({
    client: fakeClient,
    buscarEventos: async () => eventosMock,
    dataBase: new Date("2026-09-21T14:00:00.000Z"), // Mesma segunda-feira
  });
  assert.equal(resSegundaNovamente.pulado, true);
  assert.equal(mensagensEnviadas.length, 2); // Não aumentou
});
