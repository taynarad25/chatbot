process.env.TZ = "America/Sao_Paulo";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db");
const { normalizarDataNascimento, addLider, updateLider, removeLider, listLideres } = require("../web/lideres");
const { montarMensagemAniversario, processarAniversariantesDoDia } = require("../bot/lembretes");

test("normalizarDataNascimento: formata datas válidas e rejeita inválidas", () => {
  assert.equal(normalizarDataNascimento("25/12/1990"), "25/12/1990");
  assert.equal(normalizarDataNascimento("5/3/1995"), "05/03/1995");
  assert.equal(normalizarDataNascimento("05/03"), "05/03");
  assert.equal(normalizarDataNascimento("5/3"), "05/03");
  assert.equal(normalizarDataNascimento("1990-12-25"), "25/12/1990");
  assert.equal(normalizarDataNascimento("1995-03-05"), "05/03/1995");

  // Inválidos
  assert.equal(normalizarDataNascimento(""), "");
  assert.equal(normalizarDataNascimento("invalido"), "");
  assert.equal(normalizarDataNascimento("32/01"), "");
  assert.equal(normalizarDataNascimento("15/13"), "");
  assert.equal(normalizarDataNascimento(null), "");
});

test("montarMensagemAniversario: contém saudação carinhosa e assinatura da Comunidade Cristã Curados", () => {
  const msg = montarMensagemAniversario({ nome: "Maria Silva" });
  assert.match(msg, /Olá, \*Maria Silva\*!/);
  assert.match(msg, /Hoje é um dia muito especial/);
  assert.match(msg, /Comunidade Cristã Curados/);
  assert.match(msg, /Números 6:24-26/);
});

test("Banco / Web: addLider e updateLider salvam e atualizam dataNascimento", () => {
  const tel = "5511999990001";
  try {
    removeLider(tel);
  } catch {}

  addLider({
    nome: "Aniversariante Teste",
    telefone: tel,
    cargos: ["membro"],
    departamentos: ["Geral"],
    dataNascimento: "15/08/1992",
  });

  const lideres = listLideres();
  const encontrado = lideres.find((l) => l.telefone === tel);
  assert.ok(encontrado, "deve encontrar o membro cadastrado");
  assert.equal(encontrado.dataNascimento, "15/08/1992");

  // Atualiza data de nascimento
  updateLider(tel, {
    nome: "Aniversariante Teste",
    telefone: tel,
    cargos: ["membro"],
    departamentos: ["Geral"],
    dataNascimento: "20/09",
  });

  const atualizado = listLideres().find((l) => l.telefone === tel);
  assert.equal(atualizado.dataNascimento, "20/09");

  removeLider(tel);
});

test("processarAniversariantesDoDia: dispara mensagem para aniversariantes do dia e evita duplicatas", async () => {
  const tel1 = "5511999990011";
  const tel2 = "5511999990022";
  const tel3 = "5511999990033";

  // Data base de teste: 21 de Setembro de 2026
  const dataBase = new Date(2026, 8, 21, 8, 0, 0); // Mês 8 = Setembro

  const membros = [
    { nome: "Aniversariante Hoje 1", telefone: tel1, dataNascimento: "21/09/1985" },
    { nome: "Aniversariante Hoje 2", telefone: tel2, dataNascimento: "21/09" },
    { nome: "Outro Dia", telefone: tel3, dataNascimento: "22/09/1990" },
  ];

  // Limpa registros anteriores de teste
  try {
    db.prepare("DELETE FROM lembretes_enviados WHERE eventoId LIKE 'aniversario_%'").run();
  } catch {}

  const mensagensEnviadas = [];
  const clientMock = {
    sendMessage: async (jid, texto) => {
      mensagensEnviadas.push({ jid, texto });
      return { id: "msg-123" };
    },
  };

  // 1. Primeira execução: deve disparar para os 2 aniversariantes de hoje
  const resultado1 = await processarAniversariantesDoDia({
    client: clientMock,
    dataBase,
    listLideresFn: () => membros,
  });

  assert.equal(resultado1.aniversariantes, 2);
  assert.equal(resultado1.enviados, 2);
  assert.equal(mensagensEnviadas.length, 2);

  assert.match(mensagensEnviadas[0].jid, /5511999990011/);
  assert.match(mensagensEnviadas[0].texto, /Aniversariante Hoje 1/);
  assert.match(mensagensEnviadas[0].texto, /Comunidade Cristã Curados/);

  assert.match(mensagensEnviadas[1].jid, /5511999990022/);
  assert.match(mensagensEnviadas[1].texto, /Aniversariante Hoje 2/);
  assert.match(mensagensEnviadas[1].texto, /Comunidade Cristã Curados/);

  // 2. Segunda execução no mesmo dia/ano: não deve reenviar (idempotência anual)
  const resultado2 = await processarAniversariantesDoDia({
    client: clientMock,
    dataBase,
    listLideresFn: () => membros,
  });

  assert.equal(resultado2.aniversariantes, 2);
  assert.equal(resultado2.enviados, 0);
  assert.equal(mensagensEnviadas.length, 2); // Nenhuma nova mensagem enviada
});
