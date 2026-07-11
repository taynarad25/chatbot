process.env.TZ = "America/Sao_Paulo";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { codificarDadosAgendamento, decodificarDadosAgendamento, montarResourceEvento } = require("../agendamentoAutomatico");

function dadosExemplo(overrides = {}) {
  return {
    solicitanteId: "5511999999999@c.us",
    evento: "Encontro de Casais",
    rede: "Rede de Casais",
    dia: 18,
    mes: 7,
    horarioInicio: "19:30",
    horarioFim: "21:00",
    isDiaInteiro: false,
    ...overrides,
  };
}

test("codificarDadosAgendamento + decodificarDadosAgendamento: round-trip preserva os dados", () => {
  const dados = dadosExemplo();
  const blob = codificarDadosAgendamento(dados);
  const decodificado = decodificarDadosAgendamento(blob);
  assert.deepEqual(decodificado, dados);
});

test("decodificarDadosAgendamento: funciona mesmo com o blob embutido no meio de texto formatado livremente", () => {
  const dados = dadosExemplo();
  const mensagem = `🔔 *Qualquer formatação nova* 🎉\n\nTexto totalmente diferente do original\n\n_${codificarDadosAgendamento(dados)}_\n\nMais texto depois`;
  assert.deepEqual(decodificarDadosAgendamento(mensagem), dados);
});

test("decodificarDadosAgendamento: retorna null para texto sem o marcador de dados", () => {
  assert.equal(decodificarDadosAgendamento("Uma mensagem qualquer sem dados embutidos"), null);
  assert.equal(decodificarDadosAgendamento(""), null);
  assert.equal(decodificarDadosAgendamento(undefined), null);
});

test("decodificarDadosAgendamento: retorna null (sem lançar) para um blob corrompido", () => {
  assert.equal(decodificarDadosAgendamento("Texto qualquer DADOS:###naoEhBase64Valido###"), null);
});

test("montarResourceEvento: evento com horário", () => {
  const resource = montarResourceEvento(dadosExemplo(), 2026);
  assert.equal(resource.summary, "Encontro de Casais");
  assert.equal(resource.description, "Agendado via Bot - Solicitado pela Rede: Rede de Casais");
  assert.equal(resource.location, "Comunidade Cristã Curados");
  assert.equal(resource.start.dateTime, "2026-07-18T19:30:00-03:00");
  assert.equal(resource.end.dateTime, "2026-07-18T21:00:00-03:00");
  assert.equal(resource.start.timeZone, "America/Sao_Paulo");
});

test("montarResourceEvento: evento de dia inteiro usa 'date' e fim exclusivo (dia seguinte)", () => {
  const resource = montarResourceEvento(dadosExemplo({ isDiaInteiro: true, dia: 18, mes: 7 }), 2026);
  assert.equal(resource.start.date, "2026-07-18");
  assert.equal(resource.end.date, "2026-07-19");
  assert.equal(resource.start.dateTime, undefined);
});

test("montarResourceEvento: usa o ano recebido como parâmetro, não um ano fixo", () => {
  const resource2027 = montarResourceEvento(dadosExemplo(), 2027);
  assert.match(resource2027.start.dateTime, /^2027-07-18/);
});
