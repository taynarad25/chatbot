const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Define arquivo de dados isolado para os testes
const TEST_DATA_FILE = path.join(__dirname, 'the_chosen_test.json');
process.env.THE_CHOSEN_DATA_PATH = TEST_DATA_FILE;

const theChosen = require('../web/the_chosen');

// Limpar arquivo de teste antes e depois
function cleanup() {
  if (fs.existsSync(TEST_DATA_FILE)) {
    try { fs.unlinkSync(TEST_DATA_FILE); } catch {}
  }
}

before(() => cleanup());
after(() => cleanup());

test('The Chosen: capacidade inicial configurada para 75 vagas', () => {
  cleanup();
  const status = theChosen.obterStatusVagas();
  assert.equal(status.total, 75);
  assert.equal(status.preenchidas, 0);
  assert.equal(status.restantes, 75);
  assert.equal(status.esgotado, false);
});

test('The Chosen: validações de formulário rejeitam entradas inválidas', () => {
  cleanup();
  // Quantidade inválida
  let res = theChosen.realizarInscricao({ quantidade: 0, participantes: [], telefone: '11999999999', email: 'teste@email.com' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'QUANTIDADE_INVALIDA');

  // Participantes não correspondem à quantidade
  res = theChosen.realizarInscricao({ quantidade: 2, participantes: ['João'], telefone: '11999999999', email: 'teste@email.com' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'PARTICIPANTES_INVALIDOS');

  // Nome muito curto ou vazio
  res = theChosen.realizarInscricao({ quantidade: 1, participantes: ['Jo'], telefone: '11999999999', email: 'teste@email.com' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'NOMES_INVALIDOS');

  // Telefone inválido
  res = theChosen.realizarInscricao({ quantidade: 1, participantes: ['João Silva'], telefone: '123', email: 'teste@email.com' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'TELEFONE_INVALIDO');

  // Email inválido
  res = theChosen.realizarInscricao({ quantidade: 1, participantes: ['João Silva'], telefone: '11999999999', email: 'email-invalido' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'EMAIL_INVALIDO');
});

test('The Chosen: realiza inscrição com sucesso e decrementa estoque de 75 vagas', () => {
  cleanup();
  const res = theChosen.realizarInscricao({
    quantidade: 3,
    participantes: ['Ana Paula Silva', 'Carlos Eduardo Silva', 'Mariana Silva'],
    telefone: '+55 (11) 94268-5501',
    email: 'anapaula@exemplo.com'
  });

  assert.equal(res.ok, true);
  assert.ok(res.inscricao.codigo.startsWith('TC-'));
  assert.equal(res.inscricao.quantidade, 3);
  assert.equal(res.inscricao.participantes.length, 3);
  assert.equal(res.vagasRestantes, 72);

  const status = theChosen.obterStatusVagas();
  assert.equal(status.preenchidas, 3);
  assert.equal(status.restantes, 72);
});

test('The Chosen: rejeita inscrição quando quantidade solicitada ultrapassa vagas disponíveis', () => {
  cleanup();
  // Inscreve 73 vagas
  const partes = [];
  for (let i = 0; i < 73; i++) partes.push(`Participante ${i + 1}`);
  // Inscreve em lotes de 10
  while (partes.length > 0) {
    const chunk = partes.splice(0, Math.min(10, partes.length));
    theChosen.realizarInscricao({
      quantidade: chunk.length,
      participantes: chunk,
      telefone: '11999999999',
      email: 'teste@exemplo.com'
    });
  }

  const status = theChosen.obterStatusVagas();
  assert.equal(status.restantes, 2);

  // Tenta inscrever 3 vagas quando só restam 2
  const res = theChosen.realizarInscricao({
    quantidade: 3,
    participantes: ['P1 Sobrando', 'P2 Sobrando', 'P3 Sobrando'],
    telefone: '11999999999',
    email: 'teste@exemplo.com'
  });

  assert.equal(res.ok, false);
  assert.equal(res.code, 'VAGAS_INSUFICIENTES');

  // Preenche as 2 restantes
  const resFinal = theChosen.realizarInscricao({
    quantidade: 2,
    participantes: ['P1 Final', 'P2 Final'],
    telefone: '11999999999',
    email: 'teste@exemplo.com'
  });
  assert.equal(resFinal.ok, true);

  // Agora está esgotado (0 vagas)
  const statusEsgotado = theChosen.obterStatusVagas();
  assert.equal(statusEsgotado.restantes, 0);
  assert.equal(statusEsgotado.esgotado, true);

  // Tentativa com 0 vagas retorna ESGOTADO
  const resEsgotado = theChosen.realizarInscricao({
    quantidade: 1,
    participantes: ['Tarde Demais'],
    telefone: '11999999999',
    email: 'teste@exemplo.com'
  });
  assert.equal(resEsgotado.ok, false);
  assert.equal(resEsgotado.code, 'ESGOTADO');
});

test('The Chosen: expiração automática a partir de 04/10/2026 encerra inscrições', () => {
  cleanup();
  const antes = new Date('2026-10-03T23:59:59-03:00');
  assert.equal(theChosen.estaExpirado(antes), false);

  const dia4 = new Date('2026-10-04T00:00:00-03:00');
  assert.equal(theChosen.estaExpirado(dia4), true);

  const res = theChosen.realizarInscricao({
    quantidade: 1,
    participantes: ['Tentativa Atrasada'],
    telefone: '11999999999',
    email: 'teste@exemplo.com'
  }, dia4);

  assert.equal(res.ok, false);
  assert.equal(res.code, 'EVENTO_EXPIRADO');
});
