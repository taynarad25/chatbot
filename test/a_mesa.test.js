const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const eventoAMesa = require('../web/evento_a_mesa');
const { isEventoExpiradoData, filtrarHtmlEventosExpirados } = require('../web/limpeza_eventos');

test('Evento À Mesa - Inscrição e Listagem', async (t) => {
  await t.test('Deve validar campos obrigatórios', () => {
    assert.throws(() => {
      eventoAMesa.salvarInscricaoAMesa({ nome: '', telefone: '11999999999' });
    }, /informe seu nome completo/i);

    assert.throws(() => {
      eventoAMesa.salvarInscricaoAMesa({ nome: 'Ana Maria', telefone: '' });
    }, /informe seu número de telefone/i);

    assert.throws(() => {
      eventoAMesa.salvarInscricaoAMesa({ nome: 'Ana Maria', telefone: '123' });
    }, /telefone inválido/i);
  });

  await t.test('Deve salvar nova inscrição com sucesso e formatar telefone', () => {
    const telUnico = '11988' + Math.floor(100000 + Math.random() * 900000);
    const resultado = eventoAMesa.salvarInscricaoAMesa({
      nome: 'Débora Rodrigues dos Santos',
      telefone: telUnico,
    });

    assert.ok(resultado.id > 0);
    assert.equal(resultado.nome, 'Débora Rodrigues dos Santos');
    assert.equal(resultado.jaInscrita, false);

    // Evita duplicidade para o mesmo telefone
    const duplicada = eventoAMesa.salvarInscricaoAMesa({
      nome: 'Débora Rodrigues',
      telefone: telUnico,
    });
    assert.equal(duplicada.jaInscrita, true);
  });

  await t.test('Deve listar inscrições ativas e obter estatísticas', () => {
    const lista = eventoAMesa.listarInscricoesAMesa();
    assert.ok(Array.isArray(lista));

    const stats = eventoAMesa.obterEstatisticasAMesa();
    assert.ok(stats.totalInscritas >= 1);
    assert.equal(stats.dataEvento, '12/12/2026 às 16h');
  });
});

test('Auto-Limpeza dos Eventos no Dia Seguinte', async (t) => {
  await t.test('Sala de Oração (28/11/2026): visível até 28/11 23:59 e expira em 29/11 00:00:00', () => {
    // Durante o dia 28/11/2026: NÃO expira
    assert.equal(isEventoExpiradoData('2026-11-28', new Date('2026-11-28T22:00:00-03:00')), false);
    // No dia seguinte 29/11/2026 às 00:00:01: EXPIRA e sai do site
    assert.equal(isEventoExpiradoData('2026-11-28', new Date('2026-11-29T00:00:01-03:00')), true);
  });

  await t.test('À Mesa (12/12/2026): visível até 12/12 23:59 e expira em 13/12 00:00:00', () => {
    // Durante o dia 12/12/2026: NÃO expira
    assert.equal(isEventoExpiradoData('2026-12-12', new Date('2026-12-12T18:00:00-03:00')), false);
    // No dia seguinte 13/12/2026: EXPIRA e sai do site
    assert.equal(isEventoExpiradoData('2026-12-12', new Date('2026-12-13T00:00:01-03:00')), true);
  });

  await t.test('Culto de Natal (13/12/2026): visível até 13/12 23:59 e expira em 14/12 00:00:00', () => {
    // Durante o dia 13/12/2026: NÃO expira
    assert.equal(isEventoExpiradoData('2026-12-13', new Date('2026-12-13T20:00:00-03:00')), false);
    // No dia seguinte 14/12/2026: EXPIRA e sai do site
    assert.equal(isEventoExpiradoData('2026-12-13', new Date('2026-12-14T00:00:01-03:00')), true);
  });

  await t.test('filtrarHtmlEventosExpirados deve expurgar cards no dia seguinte', () => {
    const htmlExemplo = `
      <div class="card-sala-oracao" data-event-date="2026-11-28">Sala de Oração</div>
      <div class="card-a-mesa" data-event-date="2026-12-12">À Mesa</div>
      <div class="card-natal" data-event-date="2026-12-13">Natal</div>
    `;

    // Em 29/11/2026: Sala de Oração é removida, À Mesa e Natal continuam
    const html29Nov = filtrarHtmlEventosExpirados(htmlExemplo, new Date('2026-11-29T10:00:00-03:00'));
    assert.ok(!html29Nov.includes('Sala de Oração'));
    assert.ok(html29Nov.includes('À Mesa'));
    assert.ok(html29Nov.includes('Natal'));

    // Em 13/12/2026: À Mesa expirou também, Natal continua
    const html13Dez = filtrarHtmlEventosExpirados(htmlExemplo, new Date('2026-12-13T08:00:00-03:00'));
    assert.ok(!html13Dez.includes('À Mesa'));
    assert.ok(html13Dez.includes('Natal'));

    // Em 14/12/2026: Natal também é removido
    const html14Dez = filtrarHtmlEventosExpirados(htmlExemplo, new Date('2026-12-14T08:00:00-03:00'));
    assert.ok(!html14Dez.includes('Natal'));
  });
});

test('Verificação dos Cards em home.html', () => {
  const homeHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'home.html'), 'utf8');

  // Sala de Oração com Saiba Mais (WhatsApp)
  assert.ok(homeHtml.includes('card-sala-oracao'));
  assert.ok(homeHtml.includes('data-event-date="2026-11-28"'));
  assert.ok(homeHtml.includes('Sala de Oração • Lâmpada e Luz'));
  assert.ok(homeHtml.includes('Clique aqui para saber mais'));

  // À Mesa com link de inscrição /a-mesa e adendo das líderes Gisa e Gláucia
  assert.ok(homeHtml.includes('card-a-mesa'));
  assert.ok(homeHtml.includes('data-event-date="2026-12-12"'));
  assert.ok(homeHtml.includes('/a-mesa'));
  assert.ok(homeHtml.includes('Garantir Minha Vaga (Inscrição Gratuita)'));
  assert.ok(homeHtml.includes('Gisa') && homeHtml.includes('Gláucia'));

  // Culto de Natal com Saiba Mais (WhatsApp)
  assert.ok(homeHtml.includes('card-natal'));
  assert.ok(homeHtml.includes('data-event-date="2026-12-13"'));
  assert.ok(homeHtml.includes('Culto Especial de Natal'));

  // Página dedicada de À Mesa existe
  const aMesaHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'a-mesa.html'), 'utf8');
  assert.ok(aMesaHtml.includes('À Mesa'));
  assert.ok(aMesaHtml.includes('Gisa'));
  assert.ok(aMesaHtml.includes('Gláucia'));
  assert.ok(aMesaHtml.includes('campoNome'));
  assert.ok(aMesaHtml.includes('campoTelefone'));
  assert.ok(aMesaHtml.includes('Inscrição Individual'));
});

