const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = process.env.THE_CHOSEN_DATA_PATH || path.join(__dirname, '..', 'the_chosen_inscricoes.json');
const LIMITE_VAGAS = 75;
const DATA_EXPIRACAO = new Date('2026-10-04T00:00:00-03:00');

function carregarInscricoes() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.error('[The Chosen] Erro ao ler arquivo de inscrições:', err.message);
  }
  return [];
}

function salvarInscricoes(inscricoes) {
  try {
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(inscricoes, null, 2), 'utf8');
    fs.renameSync(tmpFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error('[The Chosen] Erro ao salvar inscrições:', err.message);
    return false;
  }
}

function estaExpirado(dataReferencia = new Date()) {
  return dataReferencia.getTime() >= DATA_EXPIRACAO.getTime();
}

function obterStatusVagas(dataReferencia = new Date()) {
  const inscricoes = carregarInscricoes();
  const preenchidas = inscricoes.reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0);
  const restantes = Math.max(0, LIMITE_VAGAS - preenchidas);
  const expirado = estaExpirado(dataReferencia);

  return {
    total: LIMITE_VAGAS,
    preenchidas,
    restantes,
    esgotado: restantes <= 0,
    expirado,
    dataEvento: '03/10/2026 às 19:00',
    dataExpiracao: DATA_EXPIRACAO.toISOString()
  };
}

function realizarInscricao({ quantidade, participantes, telefone, email }, dataReferencia = new Date()) {
  if (estaExpirado(dataReferencia)) {
    return { ok: false, code: 'EVENTO_EXPIRADO', message: 'As inscrições para este evento foram encerradas no dia 04/10.' };
  }

  const qtd = parseInt(quantidade, 10);
  if (isNaN(qtd) || qtd < 1) {
    return { ok: false, code: 'QUANTIDADE_INVALIDA', message: 'Selecione ao menos 1 ingresso.' };
  }
  if (qtd > 10) {
    return { ok: false, code: 'QUANTIDADE_EXCEDIDA', message: 'O limite máximo por inscrição é de 10 ingressos.' };
  }

  if (!Array.isArray(participantes) || participantes.length !== qtd) {
    return { ok: false, code: 'PARTICIPANTES_INVALIDOS', message: `Informe o nome de todos os ${qtd} participantes.` };
  }

  const nomesLimpos = participantes.map(p => String(p || '').trim()).filter(Boolean);
  if (nomesLimpos.length !== qtd || nomesLimpos.some(n => n.length < 3)) {
    return { ok: false, code: 'NOMES_INVALIDOS', message: 'Cada participante deve ter um nome completo válido (mínimo de 3 letras).' };
  }

  const telLimpo = String(telefone || '').replace(/\D/g, '');
  if (telLimpo.length < 10 || telLimpo.length > 13) {
    return { ok: false, code: 'TELEFONE_INVALIDO', message: 'Informe um número de telefone/WhatsApp válido com DDD.' };
  }

  const emailLimpo = String(email || '').trim().toLowerCase();
  const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regexEmail.test(emailLimpo)) {
    return { ok: false, code: 'EMAIL_INVALIDO', message: 'Informe um e-mail válido para receber a confirmação.' };
  }

  // Trava de concorrência e estoque
  const inscricoes = carregarInscricoes();
  const preenchidas = inscricoes.reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0);
  const restantes = Math.max(0, LIMITE_VAGAS - preenchidas);

  if (qtd > restantes) {
    if (restantes <= 0) {
      return { ok: false, code: 'ESGOTADO', message: 'Desculpe, as vagas para este evento já estão esgotadas!' };
    }
    return {
      ok: false,
      code: 'VAGAS_INSUFICIENTES',
      message: `Restam apenas ${restantes} vaga(s) disponível(is). Por favor, ajuste a quantidade selecionada.`
    };
  }

  const codigo = `TC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const novaInscricao = {
    id: crypto.randomUUID(),
    codigo,
    quantidade: qtd,
    participantes: nomesLimpos,
    titular: nomesLimpos[0],
    telefone: telLimpo,
    email: emailLimpo,
    evento: 'Pré-estreia The Chosen - Temporada 6',
    dataEvento: '03/10/2026 19:00',
    criadoEm: new Date().toISOString()
  };

  inscricoes.push(novaInscricao);
  const salvo = salvarInscricoes(inscricoes);

  if (!salvo) {
    return { ok: false, code: 'ERRO_SALVAMENTO', message: 'Ocorreu um erro interno ao registrar sua inscrição. Tente novamente.' };
  }

  return {
    ok: true,
    message: 'Inscrição confirmada com sucesso!',
    inscricao: novaInscricao,
    vagasRestantes: restantes - qtd
  };
}

function listarInscricoes() {
  return carregarInscricoes();
}

module.exports = {
  LIMITE_VAGAS,
  DATA_EXPIRACAO,
  estaExpirado,
  obterStatusVagas,
  realizarInscricao,
  listarInscricoes,
  carregarInscricoes
};
