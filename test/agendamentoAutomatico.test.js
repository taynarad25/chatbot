process.env.TZ = "America/Sao_Paulo";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { montarResourceEvento } = require("../bot/agendamentoAutomatico");

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
