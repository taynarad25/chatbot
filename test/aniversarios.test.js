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

  const msgsAniversariantes = mensagensEnviadas.filter((m) => m.texto.includes("Comunidade Cristã Curados"));
  const msgsSec = mensagensEnviadas.filter((m) => m.texto.includes("Aniversariante do Dia!"));

  assert.equal(msgsAniversariantes.length, 2);
  assert.equal(msgsSec.length, 2);

  assert.match(msgsAniversariantes[0].jid, /5511999990011/);
  assert.match(msgsAniversariantes[0].texto, /Aniversariante Hoje 1/);

  assert.match(msgsAniversariantes[1].jid, /5511999990022/);
  assert.match(msgsAniversariantes[1].texto, /Aniversariante Hoje 2/);

  // 2. Segunda execução no mesmo dia/ano: não deve reenviar (idempotência anual)
  const resultado2 = await processarAniversariantesDoDia({
    client: clientMock,
    dataBase,
    listLideresFn: () => membros,
  });

  assert.equal(resultado2.aniversariantes, 2);
  assert.equal(resultado2.enviados, 0);
  assert.equal(mensagensEnviadas.length, 4); // Nenhuma nova mensagem enviada
});

test("processarAniversariantesDoDia: notifica secretaria e integra com planilha remota", async () => {
  const tel = "5511999990044";
  const dataBase = new Date(2026, 8, 25, 8, 0, 0); // 25/09/2026
  const membros = [
    { nome: "Lucas Aniversário", telefone: tel, dataNascimento: "25/09", cargos: "Líder" },
  ];

  try {
    db.prepare("DELETE FROM lembretes_enviados WHERE eventoId LIKE 'aniversario_%'").run();
  } catch {}

  const postPayloads = [];
  const mockFetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    postPayloads.push(body);
    if (body.action === "verificar_envio") {
      return {
        ok: true,
        json: async () => ({ enviado: false }),
      };
    }
    return {
      ok: true,
      json: async () => ({ sucesso: true }),
    };
  };

  const msgsSecretaria = [];
  const fakeNotificarSecretaria = async (c, txt) => {
    msgsSecretaria.push(txt);
  };

  const resultado = await processarAniversariantesDoDia({
    client: {},
    dataBase,
    listLideresFn: () => membros,
    notificarSecretariaFn: fakeNotificarSecretaria,
    fetchFn: mockFetch,
  });

  assert.equal(resultado.enviados, 1);
  // Notificou secretaria
  assert.equal(msgsSecretaria.length, 1);
  assert.match(msgsSecretaria[0], /Aniversariante do Dia!/);
  assert.match(msgsSecretaria[0], /Lucas Aniversário/);

  // Verificou e registrou na planilha
  const verificaReq = postPayloads.find((p) => p.action === "verificar_envio");
  const registraReq = postPayloads.find((p) => p.action === "registrar_envio");
  assert.ok(verificaReq, "deve ter chamado verificar_envio na planilha");
  assert.equal(verificaReq.tipo, "aniversario");
  assert.equal(verificaReq.periodo, "2026-09-25");
  assert.ok(registraReq, "deve ter chamado registrar_envio na planilha");
  assert.equal(registraReq.tipo, "aniversario");
  assert.equal(registraReq.periodo, "2026-09-25");

  // Se a planilha responder enviado: true, ignora o envio
  const mockFetchJaEnviado = async (url, opts) => {
    return {
      ok: true,
      json: async () => ({ enviado: true }),
    };
  };

  try {
    db.prepare("DELETE FROM lembretes_enviados WHERE eventoId LIKE 'aniversario_%'").run();
  } catch {}

  const msgsSec2 = [];
  const resPulado = await processarAniversariantesDoDia({
    client: {},
    dataBase,
    listLideresFn: () => membros,
    notificarSecretariaFn: async (c, t) => msgsSec2.push(t),
    fetchFn: mockFetchJaEnviado,
  });

  assert.equal(resPulado.enviados, 0, "deve pular envio quando planilha retornar enviado: true");
  assert.equal(msgsSec2.length, 0, "não deve notificar secretaria se pulado");
});
