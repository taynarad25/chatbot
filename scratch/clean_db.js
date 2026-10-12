const db = require('../db.js');

const res1 = db.prepare("UPDATE saude_mulher_inscricoes SET cirurgiaDetalhes = '' WHERE cirurgia = 'Não' OR LOWER(cirurgiaDetalhes) = 'não' OR LOWER(cirurgiaDetalhes) = 'nao'").run();
const res2 = db.prepare("UPDATE saude_mulher_inscricoes SET lesaoDorDetalhes = '' WHERE lesaoDor = 'Não' OR LOWER(lesaoDorDetalhes) = 'não' OR LOWER(lesaoDorDetalhes) = 'nao'").run();
const res3 = db.prepare("UPDATE saude_mulher_inscricoes SET limitacaoDetalhes = '' WHERE limitacao = 'Não' OR LOWER(limitacaoDetalhes) = 'não' OR LOWER(limitacaoDetalhes) = 'nao'").run();
const res4 = db.prepare("UPDATE saude_mulher_inscricoes SET atividadeFisicaDetalhes = '' WHERE atividadeFisica = 'Não' OR LOWER(atividadeFisicaDetalhes) = 'não' OR LOWER(atividadeFisicaDetalhes) = 'nao'").run();

console.log('Registros limpos:', {
  cirurgia: res1.changes,
  lesao: res2.changes,
  limitacao: res3.changes,
  atividade: res4.changes
});

const sm = require('../web/saude_mulher');
console.log('Estatísticas atuais:', sm.obterEstatisticasSaudeMulher());
console.log('Inscritas:', sm.listarInscricoesSaudeMulher().map(x => ({
  nome: x.nome,
  cirurgia: x.cirurgia,
  cirurgiaDetalhes: x.cirurgiaDetalhes,
  lesaoDor: x.lesaoDor,
  lesaoDorDetalhes: x.lesaoDorDetalhes
})));
