const test = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");

const {
  gerarDescricaoEvento,
  salvarDescricaoEvento,
  buscarDescricaoEvento,
  listarDescricoesEventos
} = require("../bot/descricaoEvento");
const { createMessageHandler } = require("../bot/messageHandler");

const NUMERO_LIDER = "5511999999999@c.us";
const JID_GRUPO_SECRETARIA = "111111111111111@g.us";

function criarContexto({ eventos = [] } = {}) {
  const etapas = {};
  const gruposEnviados = [];
  const diretasEnviadas = [];
  const eventosGravados = [];

  const mockClient = {
    sendMessage: async (jid, texto) => {
      gruposEnviados.push({ jid, texto });
      return { id: { _serialized: "mid-1" } };
    },
    getChatById: async () => ({
      name: "Mensagens Secretaria",
      isGroup: true,
      sendMessage: async (texto) => {
        gruposEnviados.push({ jid: "grupo-secretaria", texto });
      }
    }),
    getChats: async () => [
      { id: { _serialized: JID_GRUPO_SECRETARIA }, name: "Mensagens Secretaria", isGroup: true, sendMessage: async (t) => gruposEnviados.push({ jid: JID_GRUPO_SECRETARIA, texto: t }) }
    ]
  };

  const mockCalendar = {
    events: {
      insert: async ({ calendarId, resource }) => {
        eventosGravados.push({ calendarId, resource });
        return { data: { id: "evt-gravado-" + Date.now(), ...resource } };
      }
    }
  };

  const handleMessage = createMessageHandler({
    client: mockClient,
    calendar: mockCalendar,
    agendasParaLer: ["agenda-evangelismo-id", "agenda-jovens-id", "agenda-kids-id", "agenda-mulheres-id", "agenda-homens-id", "agenda-casais-id", "agenda-geral-id"],
    lideres: [NUMERO_LIDER],
    etapas,
    buscarEventos: async () => eventos,
    listLideres: () => [{ telefone: "5511999999999", nome: "Líder de Teste", cargos: ["lider"], departamentos: ["Evangelismo"] }]
  });

  return { handleMessage, gruposEnviados, diretasEnviadas, eventosGravados };
}

async function enviar(handleMessage, from, body) {
  const respostas = [];
  const msgMock = {
    from,
    fromMe: false,
    body,
    reply: async (texto) => {
      respostas.push(texto);
      return texto;
    },
    getContact: async () => ({ id: { _serialized: from }, pushname: "Líder", name: "Líder" }),
    respostas
  };
  await handleMessage(msgMock);
  return respostas;
}

test("gerarDescricaoEvento: gera descrição rica e acolhedora para evento de 1 dia", () => {
  const desc = gerarDescricaoEvento({
    evento: "Vigília de Avivamento",
    tipoDuracao: "unico",
    horarios: [{ data: "20/11/2026", inicio: "22:00", fim: "05:00" }],
    departamento: "Rede Ruach",
    local: "Comunidade Cristã Curados - Templo"
  });

  assert.match(desc, /VIGÍLIA DE AVIVAMENTO/);
  assert.match(desc, /Rede Ruach/);
  assert.match(desc, /22:00/);
  assert.match(desc, /Comunidade Cristã Curados/);
  assert.match(desc, /Chegue com antecedência/i);
});

test("gerarDescricaoEvento: gera descrição para evento consecutivo", () => {
  const desc = gerarDescricaoEvento({
    evento: "Retiro de Jovens Ruach",
    tipoDuracao: "consecutivo",
    horarios: {
      dataInicio: "15/11/2026",
      horaInicio: "18:00",
      dataFim: "17/11/2026",
      horaFim: "16:00"
    },
    departamento: "Rede Ruach",
    local: "Sítio Betel - Ibiúna"
  });

  assert.match(desc, /RETIRO DE JOVENS RUACH/);
  assert.match(desc, /Início/);
  assert.match(desc, /Término/);
  assert.match(desc, /18:00/);
  assert.match(desc, /16:00/);
});

test("gerarDescricaoEvento: gera descrição para evento de múltiplos blocos", () => {
  const desc = gerarDescricaoEvento({
    evento: "Conferência Águas Profundas",
    tipoDuracao: "multiplo",
    horarios: [
      { data: "06/11/2026", inicio: "19:30", fim: "22:00", titulo: "Abertura" },
      { data: "07/11/2026", inicio: "18:00", fim: "21:30", titulo: "Sessão 2" },
      { data: "08/11/2026", inicio: "18:00", fim: "21:00", titulo: "Encerramento" }
    ],
    departamento: "Comunidade Cristã Curados",
    local: "Auditório Central"
  });

  assert.match(desc, /CONFERÊNCIA ÁGUAS PROFUNDAS/);
  assert.match(desc, /Programação por Sessão/);
  assert.match(desc, /1ª Sessão/);
  assert.match(desc, /2ª Sessão/);
  assert.match(desc, /3ª Sessão/);
});

test("salvarDescricaoEvento e buscarDescricaoEvento: persiste e recupera por busca similar", () => {
  const eventoNome = "Culto Especial de Teste " + Date.now();
  const descTexto = "Texto único da descrição para teste unitário";

  salvarDescricaoEvento({
    evento: eventoNome,
    departamento: "Louvor",
    local: "Templo",
    tipoDuracao: "unico",
    horarios: [{ data: "12/12/2026", inicio: "19:00", fim: "21:00" }],
    descricao: descTexto
  });

  const buscado = buscarDescricaoEvento(eventoNome);
  assert.ok(buscado, "Deve encontrar registro");
  assert.equal(buscado.descricao, descTexto);

  // Busca parcial/sem case
  const buscaParcial = buscarDescricaoEvento(eventoNome.toLowerCase().slice(0, 15));
  assert.ok(buscaParcial, "Deve encontrar por busca parcial");
});

test("bot chat: responde com a descrição da IA quando usuário pergunta por mais informações sobre o evento", async () => {
  const eventoNome = "Encontro de Mulheres Preciosas";
  salvarDescricaoEvento({
    evento: eventoNome,
    departamento: "Rede de Mulheres",
    local: "Salão Principal",
    tipoDuracao: "unico",
    horarios: [{ data: "28/11/2026", inicio: "16:00", fim: "19:00" }],
    descricao: "✨ *COMUNIDADE CRISTÃ CURADOS • ENCONTRO DE MULHERES PRECIOSAS*\nVenha participar deste chá da tarde com ministrações especiais!"
  });

  const { handleMessage } = criarContexto();

  // Usuário pergunta "informações sobre o evento encontro de mulheres preciosas"
  const resp1 = await enviar(handleMessage, "5511988887777@c.us", "informações sobre o evento Encontro de Mulheres Preciosas");
  assert.ok(resp1.length > 0, "Deve haver resposta");
  assert.match(resp1[0], /ENCONTRO DE MULHERES PRECIOSAS/);
  assert.match(resp1[0], /chá da tarde com ministrações especiais/);

  // Usuário pergunta "detalhes do evento Encontro de Mulheres Preciosas"
  const resp2 = await enviar(handleMessage, "5511988887777@c.us", "detalhes do evento Encontro de Mulheres Preciosas");
  assert.match(resp2[0], /ENCONTRO DE MULHERES PRECIOSAS/);
});

test("bot agendamento: Formato 1 (1 dia) pergunta se já tem data específica ou quer ver disponibilidade", async () => {
  const { handleMessage } = criarContexto();

  await enviar(handleMessage, NUMERO_LIDER, "7"); // Área do Líder
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendamentos
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendar Evento
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Confirmar ciência de regras
  await enviar(handleMessage, NUMERO_LIDER, "Culto da Família");
  await enviar(handleMessage, NUMERO_LIDER, "Templo Principal");
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Depto Evangelismo
  await enviar(handleMessage, NUMERO_LIDER, "11"); // Novembro
  const respModo = await enviar(handleMessage, NUMERO_LIDER, "1"); // Opção 1: Evento de 1 dia

  assert.match(respModo[0], /Sobre a data do evento/i);
  assert.match(respModo[0], /1 - Já tenho uma data específica/i);
  assert.match(respModo[0], /2 - Quero ver de acordo com a disponibilidade/i);

  // Escolhe 1: data específica
  const respDataEsp = await enviar(handleMessage, NUMERO_LIDER, "1");
  assert.match(respDataEsp[0], /Qual o dia do mês\?/i);
});

test("bot agendamento: Formato 2 (Consecutivo) solicita início e término e agenda com sucesso", async () => {
  const { handleMessage, gruposEnviados } = criarContexto();

  await enviar(handleMessage, NUMERO_LIDER, "7"); // Área do Líder
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendamentos
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendar Evento
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Confirmar ciência de regras
  await enviar(handleMessage, NUMERO_LIDER, "Acampamento de Jovens 2026");
  await enviar(handleMessage, NUMERO_LIDER, "Sítio Primavera");
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Depto Evangelismo
  await enviar(handleMessage, NUMERO_LIDER, "11"); // Novembro
  await enviar(handleMessage, NUMERO_LIDER, "2"); // Opção 2: Consecutivo de vários dias

  // Data de início
  const respDataIni = await enviar(handleMessage, NUMERO_LIDER, "14/11/2026");
  assert.match(respDataIni[0], /horário de início/i);

  // Horário de início
  const respHoraIni = await enviar(handleMessage, NUMERO_LIDER, "18:00");
  assert.match(respHoraIni[0], /data de término/i);

  // Data de término
  const respDataFim = await enviar(handleMessage, NUMERO_LIDER, "16/11/2026");
  assert.match(respDataFim[0], /horário de término/i);

  // Horário de término
  const respFim = await enviar(handleMessage, NUMERO_LIDER, "16:00");
  assert.match(respFim[respFim.length - 1], /Solicitação de Agendamento Enviada/);
  // Não envia descrição para o líder
  assert.doesNotMatch(respFim[respFim.length - 1], /Descrição do Evento \(Gerada por IA\)/i);

  // Verifica notificação enviada à secretaria
  assert.ok(gruposEnviados.length > 0);
  const ultNotif = gruposEnviados[gruposEnviados.length - 1].texto;
  assert.match(ultNotif, /Acampamento de Jovens 2026/);
  assert.match(ultNotif, /14\/11\/2026 às 18:00 até 16\/11\/2026 às 16:00/);
  // Não envia descrição para o grupo da secretaria
  assert.doesNotMatch(ultNotif, /Descrição Gerada \(IA\)/i);
});

test("bot agendamento: Formato 3 (Múltiplos Blocos) cadastra sessões intercaladas e conclui", async () => {
  const { handleMessage, gruposEnviados } = criarContexto();

  await enviar(handleMessage, NUMERO_LIDER, "7"); // Área do Líder
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendamentos
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendar Evento
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Confirmar ciência de regras
  await enviar(handleMessage, NUMERO_LIDER, "Conferência Ministerial");
  await enviar(handleMessage, NUMERO_LIDER, "Templo Sede");
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Depto Evangelismo
  await enviar(handleMessage, NUMERO_LIDER, "11"); // Novembro
  await enviar(handleMessage, NUMERO_LIDER, "3"); // Opção 3: Múltiplos blocos espalhados

  // Bloco 1: Data
  const respB1Data = await enviar(handleMessage, NUMERO_LIDER, "20/11/2026");
  assert.match(respB1Data[0], /horário de início/i);

  // Bloco 1: Início
  const respB1Ini = await enviar(handleMessage, NUMERO_LIDER, "19:30");
  assert.match(respB1Ini[0], /horário de término/i);

  // Bloco 1: Fim
  const respB1Fim = await enviar(handleMessage, NUMERO_LIDER, "22:00");
  assert.match(respB1Fim[0], /Deseja adicionar mais um dia/i);

  // Adicionar Bloco 2
  await enviar(handleMessage, NUMERO_LIDER, "1");
  await enviar(handleMessage, NUMERO_LIDER, "21/11/2026");
  await enviar(handleMessage, NUMERO_LIDER, "18:00");
  const respB2Fim = await enviar(handleMessage, NUMERO_LIDER, "21:30");
  assert.match(respB2Fim[0], /Deseja adicionar mais um dia/i);

  // Concluir agendamento (Opção 2)
  const respConcluir = await enviar(handleMessage, NUMERO_LIDER, "2");
  assert.match(respConcluir[respConcluir.length - 1], /Solicitação de Agendamento Enviada/);
  assert.match(respConcluir[respConcluir.length - 1], /Sessão 1/);
  assert.match(respConcluir[respConcluir.length - 1], /Sessão 2/);
});

test("web API: /secretaria/api/eventos/gerar-descricao gera descrição rica via endpoint", async () => {
  const { startWebServer } = require("../web");
  const { sessions } = require("../web/auth");
  sessions["sess-evento-teste"] = { username: "admin", role: "admin", status: "active", createdAt: Date.now() };

  const getStatus = () => ({ connected: false });
  const noop = async () => ({ ok: true });
  const server = startWebServer({ getStatus, startClient: noop, cancelQr: noop, disconnectClient: noop, port: 0 });
  await new Promise(resolve => server.once("listening", resolve));
  const port = server.address().port;

  try {
    const payload = JSON.stringify({
      evento: "Seminário de Liderança Cristã",
      tipoDuracao: "unico",
      horarios: [{ data: "05/12/2026", inicio: "09:00", fim: "13:00" }],
      departamento: "Diretoria",
      local: "Auditório Principal"
    });

    const resp = await fetch(`http://127.0.0.1:${port}/secretaria/api/eventos/gerar-descricao`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Cookie": "whatsapp_control_session=sess-evento-teste"
      },
      body: payload
    });

    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.ok(data.ok);
    assert.match(data.descricao, /SEMINÁRIO DE LIDERANÇA CRISTÃ/);
    assert.match(data.descricao, /09:00/);
    assert.match(data.descricao, /Diretoria/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("web API: /secretaria/api/eventos cadastra evento e rejeita início genérico", async () => {
  const { startWebServer } = require("../web");
  const { sessions } = require("../web/auth");
  sessions["sess-evento-teste"] = { username: "admin", role: "admin", status: "active", createdAt: Date.now() };

  const getStatus = () => ({ connected: false });
  const noop = async () => ({ ok: true });
  const server = startWebServer({ getStatus, startClient: noop, cancelQr: noop, disconnectClient: noop, port: 0 });
  await new Promise(resolve => server.once("listening", resolve));
  const port = server.address().port;

  try {
    // 1. Rejeição de 'dia todo'
    const payloadRejeicao = JSON.stringify({
      evento: "Retiro Geral",
      tipoDuracao: "unico",
      horarios: [{ data: "05/12/2026", inicio: "DIA TODO", fim: "22:00" }]
    });

    const respRejeicao = await fetch(`http://127.0.0.1:${port}/secretaria/api/eventos`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Cookie": "whatsapp_control_session=sess-evento-teste"
      },
      body: payloadRejeicao
    });
    assert.equal(respRejeicao.status, 400);
    const jsonRejeicao = await respRejeicao.json();
    assert.match(jsonRejeicao.message, /horário de início é obrigatório/i);

    // 2. Cadastro válido
    const payloadValido = JSON.stringify({
      evento: "Congresso de Missões 2026",
      tipoDuracao: "consecutivo",
      horarios: { dataInicio: "10/12/2026", horaInicio: "19:00", dataFim: "12/12/2026", horaFim: "21:30" },
      departamento: "Evangelismo",
      local: "Templo Principal"
    });

    const respValido = await fetch(`http://127.0.0.1:${port}/secretaria/api/eventos`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Cookie": "whatsapp_control_session=sess-evento-teste"
      },
      body: payloadValido
    });
    assert.equal(respValido.status, 200);
    const jsonValido = await respValido.json();
    assert.ok(jsonValido.ok);
    assert.ok(jsonValido.id);

    // 3. Listagem de eventos cadastrados
    const respListagem = await fetch(`http://127.0.0.1:${port}/secretaria/api/eventos`, {
      headers: {
        "Cookie": "whatsapp_control_session=sess-evento-teste"
      }
    });
    assert.equal(respListagem.status, 200);
    const jsonListagem = await respListagem.json();
    assert.ok(jsonListagem.ok);
    const encontrado = jsonListagem.eventos.find(e => e.evento === "Congresso de Missões 2026");
    assert.ok(encontrado, "Evento cadastrado deve constar na listagem");
    assert.equal(encontrado.tipoDuracao, "consecutivo");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
