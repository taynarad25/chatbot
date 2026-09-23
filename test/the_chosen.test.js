const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Define arquivo de dados isolado para os testes
const TEST_DATA_FILE = path.join(__dirname, 'the_chosen_test.json');
process.env.THE_CHOSEN_DATA_PATH = TEST_DATA_FILE;
process.env.THE_CHOSEN_LIMITE_VAGAS = '100';

const theChosen = require('../web/the_chosen');
const theChosenSheets = require('../web/the_chosen_sheets');
const theChosenNotificacoes = require('../web/the_chosen_notificacoes');

// Limpar arquivo de teste antes e depois
function cleanup() {
  if (fs.existsSync(TEST_DATA_FILE)) {
    try { fs.unlinkSync(TEST_DATA_FILE); } catch {}
  }
  theChosenSheets.limparCacheParaTestes();
}

before(() => cleanup());
after(() => cleanup());

test('The Chosen: capacidade inicial configurada para 100 vagas', () => {
  cleanup();
  const status = theChosen.obterStatusVagas();
  assert.equal(status.total, 100);
  assert.equal(status.preenchidas, 0);
  assert.equal(status.restantes, 100);
  assert.equal(status.esgotado, false);
});

test('The Chosen: validações de formulário rejeitam entradas inválidas', async () => {
  cleanup();
  // Quantidade inválida
  let res = await theChosen.realizarInscricao({ quantidade: 0, participantes: [], telefone: '11999999999', email: 'teste@email.com' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'QUANTIDADE_INVALIDA');

  // Participantes não correspondem à quantidade
  res = await theChosen.realizarInscricao({ quantidade: 2, participantes: ['João'], telefone: '11999999999', email: 'teste@email.com' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'PARTICIPANTES_INVALIDOS');

  // Nome muito curto ou vazio
  res = await theChosen.realizarInscricao({ quantidade: 1, participantes: ['Jo'], telefone: '11999999999', email: 'teste@email.com' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'NOMES_INVALIDOS');

  // Telefone inválido
  res = await theChosen.realizarInscricao({ quantidade: 1, participantes: ['João Silva'], telefone: '123', email: 'teste@email.com' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'TELEFONE_INVALIDO');

  // Email inválido
  res = await theChosen.realizarInscricao({ quantidade: 1, participantes: ['João Silva'], telefone: '11999999999', email: 'email-invalido' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'EMAIL_INVALIDO');
});

test('The Chosen: realiza inscrição com sucesso e decrementa estoque de 100 vagas', async () => {
  cleanup();
  const res = await theChosen.realizarInscricao({
    quantidade: 3,
    participantes: ['Ana Paula Silva', 'Carlos Eduardo Silva', 'Mariana Silva'],
    telefone: '+55 (11) 94268-5501',
    email: 'anapaula@exemplo.com'
  });

  assert.equal(res.ok, true);
  assert.ok(res.inscricao.codigo.startsWith('TC-'));
  assert.equal(res.inscricao.quantidade, 3);
  assert.equal(res.inscricao.participantes.length, 3);
  assert.equal(res.inscricao.statusConfirmacao, 'pendente');
  assert.equal(res.vagasRestantes, 97);

  const status = theChosen.obterStatusVagas();
  assert.equal(status.preenchidas, 3);
  assert.equal(status.restantes, 97);
});

test('The Chosen: confirmação de presença e busca por código/telefone', async () => {
  cleanup();
  const insc = await theChosen.realizarInscricao({
    quantidade: 2,
    participantes: ['Gabriel Diniz', 'Taynara Diniz'],
    telefone: '11999998888',
    email: 'gabriel@exemplo.com'
  });

  assert.equal(insc.ok, true);
  const cod = insc.inscricao.codigo;

  // Busca por código
  const porCod = theChosen.buscarInscricaoPorTelefoneOuCodigo(cod);
  assert.ok(porCod);
  assert.equal(porCod.titular, 'Gabriel Diniz');

  // Busca por telefone
  const porTel = theChosen.buscarInscricaoPorTelefoneOuCodigo('5511999998888');
  assert.ok(porTel);
  assert.equal(porTel.codigo, cod);

  // Confirma presença
  const confRes = theChosen.confirmarPresenca(cod, 'confirmado');
  assert.equal(confRes.ok, true);
  assert.equal(confRes.inscricao.statusConfirmacao, 'confirmado');
  assert.ok(confRes.inscricao.confirmadoEm);

  // Estatísticas refletem confirmação
  const stats = theChosen.obterEstatisticasConfirmacao();
  assert.equal(stats.totalInscricoes, 1);
  assert.equal(stats.totalIngressos, 2);
  assert.equal(stats.confirmados, 1);
  assert.equal(stats.ingressosConfirmados, 2);
  assert.equal(stats.restantes, 98);
});

test('The Chosen: rejeita inscrição quando quantidade solicitada ultrapassa vagas disponíveis (100 vagas)', async () => {
  cleanup();
  // Inscreve 98 vagas (em lotes de 10)
  const partes = [];
  for (let i = 0; i < 98; i++) partes.push(`Participante ${i + 1}`);
  while (partes.length > 0) {
    const chunk = partes.splice(0, Math.min(10, partes.length));
    await theChosen.realizarInscricao({
      quantidade: chunk.length,
      participantes: chunk,
      telefone: '11999999999',
      email: 'teste@exemplo.com'
    });
  }

  const status = theChosen.obterStatusVagas();
  assert.equal(status.restantes, 2);

  // Tenta inscrever 3 vagas quando só restam 2
  const res = await theChosen.realizarInscricao({
    quantidade: 3,
    participantes: ['P1 Sobrando', 'P2 Sobrando', 'P3 Sobrando'],
    telefone: '11999999999',
    email: 'teste@exemplo.com'
  });

  assert.equal(res.ok, false);
  assert.equal(res.code, 'VAGAS_INSUFICIENTES');

  // Preenche as 2 restantes
  const resFinal = await theChosen.realizarInscricao({
    quantidade: 2,
    participantes: ['P1 Final', 'P2 Final'],
    telefone: '11999999999',
    email: 'teste@exemplo.com'
  });
  assert.equal(resFinal.ok, true);

  // Agora está esgotado (0 vagas de 100)
  const statusEsgotado = theChosen.obterStatusVagas();
  assert.equal(statusEsgotado.restantes, 0);
  assert.equal(statusEsgotado.esgotado, true);

  // Tentativa com 0 vagas retorna ESGOTADO
  const resEsgotado = await theChosen.realizarInscricao({
    quantidade: 1,
    participantes: ['Tarde Demais'],
    telefone: '11999999999',
    email: 'teste@exemplo.com'
  });
  assert.equal(resEsgotado.ok, false);
  assert.equal(resEsgotado.code, 'ESGOTADO');
});

test('The Chosen: renderização da folha de presença em PDF contém participantes e métricas de 100 vagas', async () => {
  cleanup();
  await theChosen.realizarInscricao({
    quantidade: 2,
    participantes: ['Marcos Silva', 'Luciana Silva'],
    telefone: '11988887777',
    email: 'marcos@exemplo.com'
  });

  const html = theChosen.renderTheChosenPdfHtml();
  assert.ok(html.includes('Lista Oficial de Portaria & Presença'));
  assert.ok(html.includes('Marcos Silva'));
  assert.ok(html.includes('Luciana Silva'));
  assert.ok(html.includes('100 vagas'));
  assert.ok(html.includes('window.print()'));
});

test('The Chosen: notificações WhatsApp simulam envio com sucesso para cliente mock', async () => {
  cleanup();
  const reg = await theChosen.realizarInscricao({
    quantidade: 1,
    participantes: ['Sara Teste'],
    telefone: '11977776666',
    email: 'sara@exemplo.com'
  });

  const mensagensEnviadas = [];
  const mockClient = {
    sendMessage: async (jid, text) => {
      mensagensEnviadas.push({ jid, text });
      return true;
    }
  };

  // Envio imediato da confirmação
  const envioRes = await theChosenNotificacoes.enviarMensagemConfirmacaoInscricao(mockClient, reg.inscricao);
  assert.equal(envioRes.ok, true);
  assert.equal(mensagensEnviadas.length, 1);
  assert.ok(mensagensEnviadas[0].jid.includes('5511977776666'));
  assert.ok(mensagensEnviadas[0].text.includes(reg.inscricao.titular));
  assert.ok(mensagensEnviadas[0].text.includes('pipoca e suco'));

  // Lembrete de 3 dias
  const lembreteRes = await theChosenNotificacoes.enviarLembreteConfirmacao3Dias(mockClient);
  assert.equal(lembreteRes.ok, true);
  assert.equal(lembreteRes.enviados, 1);
  assert.ok(mensagensEnviadas[1].text.includes('Lembrete & Confirmação de Presença'));
});

test('The Chosen: persistência durável no SQLite sobrevive a reinicializações', () => {
  const { DatabaseSync } = require('node:sqlite');
  const testDb = new DatabaseSync(':memory:');
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS the_chosen_inscricoes (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      quantidade INTEGER NOT NULL,
      participantes TEXT NOT NULL,
      titular TEXT NOT NULL,
      telefone TEXT NOT NULL,
      email TEXT NOT NULL,
      evento TEXT NOT NULL,
      dataEvento TEXT NOT NULL,
      statusConfirmacao TEXT NOT NULL DEFAULT 'pendente',
      confirmadoEm TEXT,
      lembrete3DiasEnviado INTEGER NOT NULL DEFAULT 0,
      dataLembrete3Dias TEXT,
      lembreteDiaEventoEnviado INTEGER NOT NULL DEFAULT 0,
      dataLembreteDiaEvento TEXT,
      whatsappConfirmacaoEnviado INTEGER NOT NULL DEFAULT 0,
      criadoEm TEXT NOT NULL
    );
  `);
  
  const inscricaoTeste = {
    id: 'test-uuid-sqlite-123',
    codigo: 'TC-SQLTEST1',
    quantidade: 2,
    participantes: ['Pedro Rocha', 'Mariana Rocha'],
    titular: 'Pedro Rocha',
    telefone: '11988887777',
    email: 'pedro@rocha.com',
    evento: 'Pré-estreia The Chosen - Temporada 6',
    dataEvento: '03/10/2026 19:00',
    statusConfirmacao: 'pendente',
    confirmadoEm: null,
    lembrete3DiasEnviado: false,
    dataLembrete3Dias: null,
    lembreteDiaEventoEnviado: false,
    dataLembreteDiaEvento: null,
    whatsappConfirmacaoEnviado: false,
    criadoEm: new Date().toISOString()
  };

  // 1. Salva no SQLite isolado
  const okSalvar = theChosen.salvarInscricoesNoBanco([inscricaoTeste], testDb);
  assert.equal(okSalvar, true);

  // 2. Lê do SQLite simulando um novo carregamento (reboot)
  const doBanco = theChosen.carregarInscricoesDoBanco(testDb);
  const itemRecuperado = doBanco.find(i => i.id === 'test-uuid-sqlite-123');
  assert.ok(itemRecuperado, 'Deveria recuperar o registro persistido no SQLite');
  assert.equal(itemRecuperado.codigo, 'TC-SQLTEST1');
  assert.equal(itemRecuperado.quantidade, 2);
  assert.deepEqual(itemRecuperado.participantes, ['Pedro Rocha', 'Mariana Rocha']);
  assert.equal(itemRecuperado.titular, 'Pedro Rocha');
  assert.equal(itemRecuperado.telefone, '11988887777');
  assert.equal(itemRecuperado.statusConfirmacao, 'pendente');

  // 3. Atualiza status no banco e verifica consistência
  itemRecuperado.statusConfirmacao = 'confirmado';
  itemRecuperado.confirmadoEm = new Date().toISOString();
  itemRecuperado.lembrete3DiasEnviado = true;
  theChosen.salvarInscricoesNoBanco([itemRecuperado], testDb);

  const reloaded = theChosen.carregarInscricoesDoBanco(testDb).find(i => i.id === 'test-uuid-sqlite-123');
  assert.equal(reloaded.statusConfirmacao, 'confirmado');
  assert.equal(reloaded.lembrete3DiasEnviado, true);
  assert.ok(reloaded.confirmadoEm);
});

test('The Chosen: excluirInscricao e limparInscricoesTeste removem registros e liberam vagas', async () => {
  cleanup();

  // Cria 2 inscrições (uma de teste e uma normal)
  const ins1 = await theChosen.realizarInscricao({
    quantidade: 2,
    participantes: ['Fulano Teste', 'Amigo Teste'],
    telefone: '11911112222',
    email: 'teste@email.com'
  });
  assert.equal(ins1.ok, true);

  const ins2 = await theChosen.realizarInscricao({
    quantidade: 3,
    participantes: ['Ana Maria', 'Lucas Silva', 'Julia Silva'],
    telefone: '11933334444',
    email: 'ana@email.com'
  });
  assert.equal(ins2.ok, true);

  let status = theChosen.obterStatusVagas();
  assert.equal(status.preenchidas, 5);
  assert.equal(status.restantes, 95);

  // 1. Exclui individualmente a inscrição 2
  const resExcluir = theChosen.excluirInscricao(ins2.inscricao.id);
  assert.equal(resExcluir.ok, true);
  assert.equal(resExcluir.inscricao.id, ins2.inscricao.id);

  status = theChosen.obterStatusVagas();
  assert.equal(status.preenchidas, 2);
  assert.equal(status.restantes, 98);

  // 2. Limpa inscrições de teste (remove ins1 que tem 'teste' no nome/email)
  const resLimpar = theChosen.limparInscricoesTeste();
  assert.equal(resLimpar.ok, true);
  assert.equal(resLimpar.removidas, 1);

  status = theChosen.obterStatusVagas();
  assert.equal(status.preenchidas, 0);
  assert.equal(status.restantes, 100);
});

test('Google Sheets: adiciona linha formatada e consulta contagem com mock do Sheets API', async () => {
  cleanup();
  const linhasMock = [
    ['Nome Completo', 'Telefone', 'E-mail', 'Quantidade de Ingressos', 'Data/Hora', 'Código', 'Participantes']
  ];
  let appendChamado = false;

  const mockSheets = {
    spreadsheets: {
      values: {
        get: async ({ range }) => {
          return { data: { values: linhasMock } };
        },
        append: async ({ requestBody }) => {
          appendChamado = true;
          linhasMock.push(requestBody.values[0]);
          return { data: { updates: { updatedRange: 'Inscrições!A2:G2' } } };
        },
        update: async () => {
          return { data: {} };
        }
      }
    }
  };

  theChosenSheets.setSheetsClientForTest(mockSheets);
  theChosenSheets.setSpreadsheetIdForTest('test-sheet-id-123');

  // 1. Total inicial da planilha
  const totalInicial = await theChosenSheets.obterTotalIngressosPlanilha(true);
  assert.equal(totalInicial, 0);

  // 2. Adiciona inscrição na planilha
  const resAppend = await theChosenSheets.adicionarInscricaoPlanilha({
    titular: 'Renata Alencar',
    participantes: ['Renata Alencar', 'Marcos Alencar'],
    telefone: '11987654321',
    email: 'renata@exemplo.com',
    quantidade: 2,
    codigo: 'TC-TESTSHEET'
  });

  assert.equal(resAppend.ok, true);
  assert.equal(appendChamado, true);
  assert.equal(linhasMock.length, 2);
  assert.equal(linhasMock[1][0], 'Renata Alencar');
  assert.equal(linhasMock[1][3], 2);
  assert.equal(linhasMock[1][5], 'TC-TESTSHEET');

  // 3. Total atualizado na planilha
  const totalApos = await theChosenSheets.obterTotalIngressosPlanilha(true);
  assert.equal(totalApos, 2);

  // 4. Status de vagas reflete a contagem da planilha
  const statusAsync = await theChosen.obterStatusVagasAsync();
  assert.equal(statusAsync.total, 100);
  assert.equal(statusAsync.preenchidas, 2);
  assert.equal(statusAsync.restantes, 98);
});
