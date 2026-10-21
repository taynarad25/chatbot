const { test } = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const {
  interpretarMesesRecorrencia,
  interpretarDiaSemana,
  gerarDatasRecorrentes,
  removerDatasRecorrentes,
  formatarListaDatasInterativa,
} = require("../bot/recorrencia");

test("interpretarMesesRecorrencia: reconhece múltiplos meses numéricos e por extenso", () => {
  const ref = moment.tz("2026-10-21", "America/Sao_Paulo");
  
  // "11 e 1" -> Novembro 2026 e Janeiro 2027
  const r1 = interpretarMesesRecorrencia("11 e 1", ref);
  assert.equal(r1.length, 2);
  assert.deepEqual(r1[0], { mes: 11, ano: 2026 });
  assert.deepEqual(r1[1], { mes: 1, ano: 2027 });

  // "novembro e janeiro"
  const r2 = interpretarMesesRecorrencia("novembro e janeiro", ref);
  assert.equal(r2.length, 2);
  assert.deepEqual(r2[0], { mes: 11, ano: 2026 });
  assert.deepEqual(r2[1], { mes: 1, ano: 2027 });

  // "11 a 1" -> Novembro, Dezembro 2026 e Janeiro 2027
  const r3 = interpretarMesesRecorrencia("11 a 1", ref);
  assert.equal(r3.length, 3);
  assert.deepEqual(r3[0], { mes: 11, ano: 2026 });
  assert.deepEqual(r3[1], { mes: 12, ano: 2026 });
  assert.deepEqual(r3[2], { mes: 1, ano: 2027 });

  // Apenas "11"
  const r4 = interpretarMesesRecorrencia("11", ref);
  assert.equal(r4.length, 1);
  assert.deepEqual(r4[0], { mes: 11, ano: 2026 });
});

test("gerarDatasRecorrentes: gera todos os domingos de Novembro/2026 e Janeiro/2027", () => {
  const mesesInfo = [
    { mes: 11, ano: 2026 },
    { mes: 1, ano: 2027 },
  ];

  // diaSemana 0 = Domingo
  const datas = gerarDatasRecorrentes({ diaSemana: 0, mesesInfo });

  // Novembro/2026: 01, 08, 15, 22, 29 (5 domingos)
  // Janeiro/2027: 03, 10, 17, 24, 31 (5 domingos)
  assert.equal(datas.length, 10);
  assert.equal(datas[0].dataFmtCurta, "01/11");
  assert.equal(datas[0].ordemNoMes, 1);
  assert.equal(datas[4].dataFmtCurta, "29/11");
  assert.equal(datas[5].dataFmtCurta, "03/01");
  assert.equal(datas[5].ordemNoMes, 1);
  assert.equal(datas[9].dataFmtCurta, "31/01");
});

test("removerDatasRecorrentes: remove datas por índices '1, 6' com perfeição", () => {
  const mesesInfo = [
    { mes: 11, ano: 2026 },
    { mes: 1, ano: 2027 },
  ];
  const datas = gerarDatasRecorrentes({ diaSemana: 0, mesesInfo });

  // Remove data 1 (01/11) e data 6 (03/01)
  const { listaAtualizada, removidas } = removerDatasRecorrentes(datas, "1, 6");
  assert.equal(removidas.length, 2);
  assert.equal(removidas[0].dataFmtCurta, "01/11");
  assert.equal(removidas[1].dataFmtCurta, "03/01");

  assert.equal(listaAtualizada.length, 8);
  assert.equal(listaAtualizada[0].dataFmtCurta, "08/11");
  assert.equal(listaAtualizada[4].dataFmtCurta, "10/01");
});

test("removerDatasRecorrentes: aceita texto 'primeiro domingo'", () => {
  const mesesInfo = [
    { mes: 11, ano: 2026 },
    { mes: 1, ano: 2027 },
  ];
  const datas = gerarDatasRecorrentes({ diaSemana: 0, mesesInfo });

  const { listaAtualizada, removidas } = removerDatasRecorrentes(datas, "exceto primeiro domingo");
  assert.equal(removidas.length, 2);
  assert.equal(removidas[0].dataFmtCurta, "01/11");
  assert.equal(removidas[1].dataFmtCurta, "03/01");
  assert.equal(listaAtualizada.length, 8);
});
