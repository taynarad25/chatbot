const os = require("os");
const path = require("path");
const fs = require("fs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-intencoes-test-"));
process.env.DB_PATH = path.join(tmpDir, "dados.db");
process.env.NODE_ENV = "test";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const { createMessageHandler } = require("../bot/messageHandler");

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

const AGENDAS = [
  "cal-evangelismo", "cal-epifania", "cal-intercessao", "cal-outros",
  "cal-seeds", "cal-ruach", "cal-casais", "cal-homens", "cal-mulheres", "cal-kids",
  "cal-externos",
  "cal-reunioes", "cal-atendimento", "cal-limpeza", "cal-ensaios",
  "cal-uso-salao",
  "cal-artes",
];

const LIDERES = ["5511999999999"];
const NUMERO_LIDER = "5511999999999@c.us";
const NUMERO_COMUM = "5511888888888@c.us";

function criarContexto({ lideresCadastrados = [], tempoEsperaSaudacaoMs = 50 } = {}) {
  const etapas = {};
  const gruposEnviados = [];
  const diretasEnviadas = [];

  const client = {
    sendMessage: async (to, texto) => {
      diretasEnviadas.push({ to, texto });
    },
    getChats: async () => [],
  };

  const handleMessage = createMessageHandler({
    client,
    calendar: { events: { insert: async () => ({}), patch: async () => ({}), delete: async () => ({}) } },
    agendasParaLer: AGENDAS,
    lideres: LIDERES,
    etapas,
    buscarEventos: async () => [],
    listLideres: () => lideresCadastrados,
    tempoEsperaSaudacaoMs,
    notificarSecretaria: async (c, msg) => {
      gruposEnviados.push(msg);
    },
  });

  return { handleMessage, etapas, gruposEnviados, diretasEnviadas };
}

function criarMsg(body, from = NUMERO_COMUM) {
  const respostas = [];
  return {
    msg: {
      body,
      from,
      fromMe: false,
      reply: async (texto) => {
        respostas.push(texto);
        return texto;
      },
      getContact: async () => ({ id: { _serialized: from }, pushname: "Teste", name: "Teste" }),
    },
    respostas,
  };
}

async function enviar(handleMessage, from, body) {
  const { msg, respostas } = criarMsg(body, from);
  await handleMessage(msg);
  return respostas;
}

test("Intenções Diretas: 'inscrições treinamento de intercessão' retorna link direto", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "inscrições treinamento de intercessão");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /Treinamento de Intercessão: O Chamado das Sentinelas/i);
  assert.match(respostas[0], /comunidadecristacurados\.com\.br\/treinamento-de-intercessao/);
  assert.match(respostas[0], /14\/11/);
});

test("Intenções Diretas: 'evento a mesa' retorna orientações da Rede de Mulheres", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "evento a mesa");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /Encontro Rede de Mulheres — À Mesa/i);
  assert.match(respostas[0], /Gisa.*Gl[aá]ucia/i);
});

test("Intenções Diretas: 'agendar novo evento' inicia fluxo de agendamento para líder", async () => {
  const { handleMessage, etapas } = criarContexto({
    lideresCadastrados: [{ nome: "Líder João", telefone: NUMERO_LIDER, departamento: "Epifania", cargos: ["lider"] }],
  });
  const respostas = await enviar(handleMessage, NUMERO_LIDER, "agendar novo evento");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /Novo Agendamento/i);
  assert.equal(etapas[NUMERO_LIDER]?.fluxo, "agendamento");
  assert.equal(etapas[NUMERO_LIDER]?.etapa, "evento_nome");
});

test("Intenções Diretas: 'agendar novo evento' inicia fluxo de uso do salão para membro", async () => {
  const { handleMessage, etapas } = criarContexto({
    lideresCadastrados: [{ nome: "Membro Maria", telefone: NUMERO_COMUM, departamento: "", cargos: ["membro"] }],
  });
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "agendar novo evento");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /Solicitação de Uso do Salão/i);
  assert.equal(etapas[NUMERO_COMUM]?.fluxo, "uso_salao");
  assert.equal(etapas[NUMERO_COMUM]?.etapa, "uso_salao_data");
});

test("Intenções Diretas: 'alterar evento' inicia departamento para líder", async () => {
  const { handleMessage, etapas } = criarContexto({
    lideresCadastrados: [{ nome: "Líder João", telefone: NUMERO_LIDER, departamento: "Epifania", cargos: ["lider"] }],
  });
  const respostas = await enviar(handleMessage, NUMERO_LIDER, "alterar evento");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /De qual departamento é o evento que deseja alterar/i);
  assert.equal(etapas[NUMERO_LIDER]?.fluxo, "agendamento");
  assert.equal(etapas[NUMERO_LIDER]?.acaoEvento, "alterar");
});

test("Intenções Diretas: 'cancelar evento' inicia cancelamento para líder", async () => {
  const { handleMessage, etapas } = criarContexto({
    lideresCadastrados: [{ nome: "Líder João", telefone: NUMERO_LIDER, departamento: "Epifania", cargos: ["lider"] }],
  });
  const respostas = await enviar(handleMessage, NUMERO_LIDER, "cancelar evento");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /De qual departamento é o evento que deseja cancelar/i);
  assert.equal(etapas[NUMERO_LIDER]?.fluxo, "agendamento");
  assert.equal(etapas[NUMERO_LIDER]?.acaoEvento, "cancelar");
});

test("Intenções Diretas: 'sala de oração' responde dados da vigília Lâmpada e Luz", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "sala de oração");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /Sala de Oração — Lâmpada e Luz/i);
  assert.match(respostas[0], /28 de Novembro/i);
  assert.match(respostas[0], /22h/);
});

test("Intenções Diretas: 'culto de natal' responde informações do Culto Especial de Natal", async () => {
  const { handleMessage } = criarContexto();
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "culto de natal");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /Culto Especial de Natal/i);
  assert.match(respostas[0], /20 de Dezembro/i);
  assert.match(respostas[0], /18:00/);
});

test("Intenções Diretas: 'chave pix' e 'dízimo' retornam dados financeiros da igreja", async () => {
  const { handleMessage } = criarContexto();
  const rPix = await enviar(handleMessage, NUMERO_COMUM, "chave pix");
  assert.equal(rPix.length, 1);
  assert.match(rPix[0], /financeiro@comunidadecristacurados\.com\.br/i);
  assert.match(rPix[0], /Banco Cora SCD/i);

  const rDizimo = await enviar(handleMessage, NUMERO_COMUM, "dízimo");
  assert.equal(rDizimo.length, 1);
  assert.match(rDizimo[0], /financeiro@comunidadecristacurados\.com\.br/i);
});

test("Intenções Diretas: 'endereço' e 'onde fica' respondem localização", async () => {
  const { handleMessage } = criarContexto();
  const rOndeFica = await enviar(handleMessage, NUMERO_COMUM, "onde fica a igreja");
  assert.equal(rOndeFica.length, 1);
  assert.match(rOndeFica[0], /Rua Benedicto de Abreu Júnior, 40/i);
  assert.match(rOndeFica[0], /Google Maps/i);
});

test("Intenções Diretas: 'atendimento pastoral' inicia fluxo pastoral", async () => {
  const { handleMessage, etapas } = criarContexto();
  const rPastoral = await enviar(handleMessage, NUMERO_COMUM, "atendimento pastoral");
  assert.equal(rPastoral.length, 1);
  assert.match(rPastoral[0], /Qual é o seu \*nome\*\?/i);
  assert.equal(etapas[NUMERO_COMUM]?.fluxo, "pastoral");
});

test("Intenções Diretas: após saudação 'oi', mensagem com intenção é respondida diretamente sem silenciar", async () => {
  const { handleMessage } = criarContexto({ tempoEsperaSaudacaoMs: 1000 });
  // Envia saudação (entra no timer pendente)
  await enviar(handleMessage, NUMERO_COMUM, "oi");
  // Antes de expirar, manda a intenção direta
  const respostas = await enviar(handleMessage, NUMERO_COMUM, "inscrições treinamento de intercessão");
  assert.equal(respostas.length, 1);
  assert.match(respostas[0], /Treinamento de Intercessão/i);
  assert.match(respostas[0], /comunidadecristacurados\.com\.br\/treinamento-de-intercessao/);
});
