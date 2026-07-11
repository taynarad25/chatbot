const { test } = require("node:test");
const assert = require("node:assert/strict");
const { REDES, montarListaRedes, obterRedePorNumero, mapearRedeParaAgendaIndex } = require("../redes");

test("REDES: tem exatamente 10 entradas com números únicos de 1 a 10", () => {
  assert.equal(REDES.length, 10);
  const numeros = REDES.map((r) => r.numero).sort((a, b) => Number(a) - Number(b));
  assert.deepEqual(numeros, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
});

test("montarListaRedes: gera a lista numerada na ordem esperada", () => {
  const lista = montarListaRedes();
  assert.equal(
    lista,
    "1 - Evangelismo\n2 - Epifania\n3 - Intercessão\n4 - Projeto Social Seeds\n5 - Rede Ruach\n6 - Rede de Casais\n7 - Rede de Homens\n8 - Rede de Mulheres\n9 - Rede Kids\n10 - Outros"
  );
});

test("obterRedePorNumero: retorna a rede correta pelo número do menu", () => {
  assert.equal(obterRedePorNumero("6").nome, "Rede de Casais");
  assert.equal(obterRedePorNumero("10").nome, "Outros");
});

test("obterRedePorNumero: aceita número com espaços em volta (ex: msg.body com \\n)", () => {
  assert.equal(obterRedePorNumero(" 3 ").nome, "Intercessão");
});

test("obterRedePorNumero: retorna null para número fora da lista", () => {
  assert.equal(obterRedePorNumero("11"), null);
  assert.equal(obterRedePorNumero("0"), null);
  assert.equal(obterRedePorNumero("abc"), null);
});

test("mapearRedeParaAgendaIndex: identifica a rede por substring, case-insensitive", () => {
  assert.equal(mapearRedeParaAgendaIndex("Rede Ruach"), 5);
  assert.equal(mapearRedeParaAgendaIndex("RUACH"), 5);
  assert.equal(mapearRedeParaAgendaIndex("intercessão"), 2);
  assert.equal(mapearRedeParaAgendaIndex("Intercessao"), 2); // sem acento também funciona
});

test("mapearRedeParaAgendaIndex: cai em 'Outros' quando não reconhece a rede", () => {
  const indexOutros = REDES.find((r) => r.nome === "Outros").agendaIndex;
  assert.equal(mapearRedeParaAgendaIndex("Rede que não existe"), indexOutros);
  assert.equal(mapearRedeParaAgendaIndex(""), indexOutros);
  assert.equal(mapearRedeParaAgendaIndex(undefined), indexOutros);
});

test("mapearRedeParaAgendaIndex e obterRedePorNumero concordam entre si para a mesma rede", () => {
  const porNumero = obterRedePorNumero("7"); // Rede de Homens
  const porNome = mapearRedeParaAgendaIndex(porNumero.nome);
  assert.equal(porNumero.agendaIndex, porNome);
});
