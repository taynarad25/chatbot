const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";

const {
  CATALOGO_EVENTOS,
  obterEventosInscricaoParaUsuario,
  gerarResumoCultoMulheres,
  gerarResumoTheChosen,
  gerarPdfEvento,
  iniciarFluxoConsultaInscricoes,
  processarFluxoConsultaInscricoes,
} = require("../bot/consultaInscricoes");

test("Consulta Inscrições: regras de acesso por cargo e departamento", () => {
  // 1. Pastor tem acesso a todos os eventos
  const eventosPastor = obterEventosInscricaoParaUsuario({
    usuario: { nome: "Pr. Gabriel", cargos: ["pastor"], departamentos: [] },
    isPastor: true,
  });
  assert.equal(eventosPastor.length, 2);
  assert.ok(eventosPastor.some((e) => e.id === "culto_mulheres"));
  assert.ok(eventosPastor.some((e) => e.id === "dia_das_criancas"));
  assert.ok(!eventosPastor.some((e) => e.id === "the_chosen"));

  // 2. Diretor tem acesso a todos os eventos
  const eventosDiretor = obterEventosInscricaoParaUsuario({
    usuario: { nome: "Dir. Fernando", cargos: ["diretor"], departamentos: [] },
    isDiretor: true,
  });
  assert.equal(eventosDiretor.length, 2);

  // 3. Líder da Rede de Mulheres tem acesso SOMENTE ao Culto de Mulheres
  const eventosLiderMulheres = obterEventosInscricaoParaUsuario({
    usuario: {
      nome: "Líder Ana",
      cargos: ["lider"],
      departamentos: ["Rede de Mulheres"],
    },
    isLider: true,
  });
  assert.equal(eventosLiderMulheres.length, 1);
  assert.equal(eventosLiderMulheres[0].id, "culto_mulheres");

  // 4. Líder da Rede de Homens NÃO tem acesso a eventos de Mulheres
  const eventosLiderHomens = obterEventosInscricaoParaUsuario({
    usuario: {
      nome: "Líder Carlos",
      cargos: ["lider"],
      departamentos: ["Rede de Homens"],
    },
    isLider: true,
  });
  assert.equal(eventosLiderHomens.length, 0);

  // 5. Líder com múltiplos departamentos (ex: Mulheres e Intercessão)
  const eventosMultiplos = obterEventosInscricaoParaUsuario({
    usuario: {
      nome: "Pra. Lígia",
      cargos: ["lider"],
      departamentos: ["Intercessão", "Rede de Mulheres"],
    },
    isLider: true,
  });
  assert.equal(eventosMultiplos.length, 1);
  assert.equal(eventosMultiplos[0].id, "culto_mulheres");
});

test("Consulta Inscrições: geração de resumos em texto", () => {
  const resumoMulheres = gerarResumoCultoMulheres();
  assert.ok(resumoMulheres.includes("Culto de Mulheres: O Vaso e o Oleiro"));
  assert.ok(resumoMulheres.includes("Estatísticas"));
});

test("Consulta Inscrições: geração de PDF com Puppeteer", async () => {
  const resultadoMulheres = await gerarPdfEvento({ eventoId: "culto_mulheres" });
  assert.equal(resultadoMulheres.ok, true);
  assert.ok(resultadoMulheres.buffer instanceof Buffer);
  assert.ok(resultadoMulheres.buffer.length > 1000);
  assert.equal(resultadoMulheres.filename, "Lista_Inscricoes_Culto_Mulheres.pdf");

  const resultadoChosen = await gerarPdfEvento({ eventoId: "the_chosen" });
  assert.equal(resultadoChosen.ok, false);
});

test("Consulta Inscrições: fluxo para líder de mulheres entrega relatório direto", async () => {
  const etapas = {};
  const replies = [];
  const fakeMsg = {
    body: "3",
    reply: (txt) => {
      replies.push(txt);
      return Promise.resolve();
    },
  };
  const fakeClient = {
    sendMessage: () => Promise.resolve(),
  };

  await iniciarFluxoConsultaInscricoes({
    msg: fakeMsg,
    numero: "5511999990001@c.us",
    etapas,
    usuario: {
      nome: "Líder Mulheres",
      cargos: ["lider"],
      departamentos: ["Rede de Mulheres"],
    },
    isLider: true,
    client: fakeClient,
    origem: "lider",
  });

  // O líder de mulheres tem apenas 1 evento, então entra direto em visualizando_evento
  assert.equal(etapas["5511999990001@c.us"].fluxo, "consulta_inscricoes");
  assert.equal(etapas["5511999990001@c.us"].etapa, "visualizando_evento");
  assert.equal(etapas["5511999990001@c.us"].eventoSelecionado, "culto_mulheres");
  assert.ok(replies.length >= 1);
  assert.ok(replies[0].includes("Culto de Mulheres"));
});

test("Consulta Inscrições: fluxo para pastor lista os eventos disponíveis", async () => {
  const etapas = {};
  const replies = [];
  const fakeMsg = {
    body: "4",
    reply: (txt) => {
      replies.push(txt);
      return Promise.resolve();
    },
  };
  const fakeClient = {
    sendMessage: () => Promise.resolve(),
  };

  await iniciarFluxoConsultaInscricoes({
    msg: fakeMsg,
    numero: "5511999990002@c.us",
    etapas,
    usuario: {
      nome: "Pastor",
      cargos: ["pastor"],
      departamentos: [],
    },
    isPastor: true,
    client: fakeClient,
    origem: "pastoral",
  });

  assert.equal(etapas["5511999990002@c.us"].fluxo, "consulta_inscricoes");
  assert.equal(etapas["5511999990002@c.us"].etapa, "escolher_evento");
  assert.ok(replies.length >= 1);
  assert.ok(replies[0].includes("Culto de Mulheres"));
  assert.ok(replies[0].includes("Dia das Crianças"));
  assert.ok(!replies[0].includes("The Chosen"));

  // Pastor seleciona a opção 1 (Culto de Mulheres)
  const repliesEscolha = [];
  const fakeMsgEscolha = {
    body: "1",
    reply: (txt) => {
      repliesEscolha.push(txt);
      return Promise.resolve();
    },
  };

  await processarFluxoConsultaInscricoes({
    msg: fakeMsgEscolha,
    numero: "5511999990002@c.us",
    info: etapas["5511999990002@c.us"],
    client: fakeClient,
    etapas,
    usuario: { nome: "Pastor", cargos: ["pastor"] },
    isPastor: true,
  });

  assert.equal(etapas["5511999990002@c.us"].etapa, "visualizando_evento");
  assert.equal(etapas["5511999990002@c.us"].eventoSelecionado, "culto_mulheres");
  assert.ok(repliesEscolha[0].includes("Culto de Mulheres"));
});

test("Consulta Inscrições: líder sem eventos no departamento recebe mensagem explicativa", async () => {
  const etapas = {};
  const replies = [];
  const fakeMsg = {
    body: "3",
    reply: (txt) => {
      replies.push(txt);
      return Promise.resolve();
    },
  };

  await iniciarFluxoConsultaInscricoes({
    msg: fakeMsg,
    numero: "5511999990003@c.us",
    etapas,
    usuario: {
      nome: "Líder Diaconia",
      cargos: ["lider"],
      departamentos: ["Diaconia"],
    },
    isLider: true,
  });

  assert.ok(replies.length >= 1);
  assert.ok(replies[0].includes("No momento não há eventos com inscrições ativas"));
  assert.ok(replies[0].includes("Diaconia"));
});
