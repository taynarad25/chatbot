process.env.TZ = "America/Sao_Paulo";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db");
const {
  REGEX_A_DEFINIR,
  montarMensagemItensADefinir,
  processarLembretesItensADefinir,
} = require("../bot/lembretes");
const { salvarFormularioEvento } = require("../bot/formularioEvento");

test("REGEX_A_DEFINIR: detecta variações de respostas pendentes de definição", () => {
  const positivos = [
    "a definir",
    "A DEFINIR",
    "A definir",
    "em definição",
    "será definido",
    "sera definido",
    "vai definir",
    "ainda não definido",
    "ainda nao definido",
    "não definido",
    "indefinido",
    "a confirmar",
    "pendente",
    "ainda vamos definir",
  ];

  for (const pos of positivos) {
    assert.ok(REGEX_A_DEFINIR.test(pos), `deve reconhecer "${pos}" como a definir`);
  }

  const negativos = [
    "Salão Principal",
    "Pr. Maurício",
    "Rede de Casais",
    "Culto de Celebração",
    "19:30",
  ];

  for (const neg of negativos) {
    assert.ok(!REGEX_A_DEFINIR.test(neg), `não deve reconhecer "${neg}" como a definir`);
  }
});

test("montarMensagemItensADefinir: formata texto com itens marcados a definir e aviso de 7 dias", () => {
  const msg = montarMensagemItensADefinir({
    nome: "Pr. Maurício",
    evento: "Encontro de Liderança",
    data: "2026-10-15",
    itens: [
      { campo: "Preletor(a)", valor: "a definir" },
      { campo: "Equipe de Louvor", valor: "em definição" },
    ],
  });

  assert.match(msg, /Pr\. Maurício/);
  assert.match(msg, /Faltam apenas \*7 dias\*/);
  assert.match(msg, /Encontro de Liderança/);
  assert.match(msg, /Preletor\(a\):/);
  assert.match(msg, /Equipe de Louvor:/);
  assert.match(msg, /Eles já foram definidos\?/);
});

test("processarLembretesItensADefinir: envia lembrete 7 dias antes para itens a definir e evita duplicatas", async () => {
  const tituloEvento = "Conferência Vinde 2026";
  const solicitanteTel = "5511977771234";

  // Data base: 01 de Outubro de 2026
  // Evento em 7 dias: 08 de Outubro de 2026
  const dataBase = new Date(2026, 9, 1, 8, 0, 0); // Outubro
  const dataEventoIso = "2026-10-08";

  // Salva formulário com respostas "a definir"
  salvarFormularioEvento({
    evento: tituloEvento,
    departamento: "Geral",
    data: "08/10/2026",
    solicitanteId: solicitanteTel,
    payload: {
      nomeSolicitante: "Líder Marcos",
      preletor: "a definir",
      copa: "será definido",
      local: "Templo Sede", // já definido
    },
  });

  // Limpa lembretes anteriores
  try {
    db.prepare("DELETE FROM lembretes_enviados WHERE tipo = '7_dias_itens_a_definir'").run();
  } catch {}

  const mockEventos = [
    {
      id: "ev-conferencia-1",
      summary: tituloEvento,
      start: { dateTime: `${dataEventoIso}T19:00:00-03:00` },
      description: `Agendado via Bot\nSolicitante: Líder Marcos\nTelefone: ${solicitanteTel}`,
    },
  ];

  const mensagensEnviadas = [];
  const clientMock = {
    sendMessage: async (jid, texto) => {
      mensagensEnviadas.push({ jid, texto });
      return { id: "msg-it-1" };
    },
  };

  // 1. Primeira execução: deve detectar os itens a definir e enviar mensagem
  const res1 = await processarLembretesItensADefinir({
    client: clientMock,
    buscarEventos: async () => mockEventos,
    dataBase,
    diasAntecedencia: 7,
  });

  assert.equal(res1.enviados, 1);
  assert.equal(mensagensEnviadas.length, 1);
  assert.match(mensagensEnviadas[0].jid, /5511977771234/);
  assert.match(mensagensEnviadas[0].texto, /Conferência Vinde 2026/);
  assert.match(mensagensEnviadas[0].texto, /Preletor\(a\):/);
  assert.match(mensagensEnviadas[0].texto, /Copa \/ Recepção:/);

  // 2. Segunda execução: não deve reenviar
  const res2 = await processarLembretesItensADefinir({
    client: clientMock,
    buscarEventos: async () => mockEventos,
    dataBase,
    diasAntecedencia: 7,
  });

  assert.equal(res2.enviados, 0);
  assert.equal(mensagensEnviadas.length, 1);
});
