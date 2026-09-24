const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let db;
try {
  db = require('../db');
} catch (err) {
  console.warn('[The Chosen] Não foi possível carregar db.js:', err.message);
}

let theChosenSheets;
try {
  theChosenSheets = require('./the_chosen_sheets');
} catch (err) {
  console.warn('[The Chosen] Não foi possível carregar the_chosen_sheets:', err.message);
}

function getDataFile() {
  return process.env.THE_CHOSEN_DATA_PATH || path.join(__dirname, '..', 'the_chosen_inscricoes.json');
}

function getFallbackDataFile() {
  return path.join(__dirname, '..', 'temp', 'the_chosen_inscricoes.backup.json');
}

function isRealFile(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isRealDir(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function tentarRemoverDiretorioInvalido(dirPath) {
  try {
    if (isRealDir(dirPath)) {
      console.warn(`[The Chosen] Aviso: '${dirPath}' foi criado como diretório em vez de arquivo. Tentando remover...`);
      const files = fs.readdirSync(dirPath);
      if (files.length === 0) {
        fs.rmdirSync(dirPath);
        console.log(`[The Chosen] Diretório vazio '${dirPath}' removido com sucesso.`);
        return true;
      }
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`[The Chosen] Diretório '${dirPath}' removido com sucesso.`);
      return true;
    }
  } catch (err) {
    console.warn(`[The Chosen] Não foi possível remover o diretório '${dirPath}' (${err.message}). Pode ser um volume Docker montado pelo host.`);
  }
  return false;
}

const LIMITE_VAGAS = parseInt(process.env.THE_CHOSEN_LIMITE_VAGAS || '100', 10);
const DATA_EXPIRACAO = new Date('2026-10-04T00:00:00-03:00');

function formatarInscricaoDoBanco(row) {
  let participantes = [];
  try {
    participantes = typeof row.participantes === 'string' ? JSON.parse(row.participantes) : row.participantes;
    if (!Array.isArray(participantes)) participantes = [row.titular];
  } catch {
    participantes = [row.titular];
  }

  return {
    id: row.id,
    codigo: row.codigo,
    quantidade: Number(row.quantidade) || 1,
    participantes,
    titular: row.titular,
    telefone: row.telefone,
    email: row.email,
    evento: row.evento,
    dataEvento: row.dataEvento,
    statusConfirmacao: row.statusConfirmacao || 'pendente',
    confirmadoEm: row.confirmadoEm || null,
    lembrete3DiasEnviado: Boolean(row.lembrete3DiasEnviado),
    dataLembrete3Dias: row.dataLembrete3Dias || null,
    lembreteDiaEventoEnviado: Boolean(row.lembreteDiaEventoEnviado),
    dataLembreteDiaEvento: row.dataLembreteDiaEvento || null,
    whatsappConfirmacaoEnviado: Boolean(row.whatsappConfirmacaoEnviado),
    criadoEm: row.criadoEm
  };
}

function normalizarInscricao(item) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || crypto.randomUUID());
  const codigo = String(item.codigo || `TC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`);
  const quantidade = Number(item.quantidade) || 1;
  let participantes = [];
  if (Array.isArray(item.participantes)) {
    participantes = item.participantes.map(p => String(p || '').trim()).filter(Boolean);
  } else if (typeof item.participantes === 'string') {
    try {
      const parsed = JSON.parse(item.participantes);
      participantes = Array.isArray(parsed) ? parsed.map(p => String(p || '').trim()).filter(Boolean) : [item.participantes];
    } catch {
      participantes = [item.participantes];
    }
  }
  const titular = String(item.titular || (participantes.length > 0 ? participantes[0] : 'Participante'));
  if (participantes.length === 0) {
    participantes = [titular];
  }

  return {
    id,
    codigo,
    quantidade,
    participantes,
    titular,
    telefone: String(item.telefone || ''),
    email: String(item.email || ''),
    evento: String(item.evento || 'Pré-estreia The Chosen - Temporada 6'),
    dataEvento: String(item.dataEvento || '03/10/2026 19:00'),
    statusConfirmacao: String(item.statusConfirmacao || 'pendente'),
    confirmadoEm: item.confirmadoEm ? String(item.confirmadoEm) : null,
    lembrete3DiasEnviado: Boolean(item.lembrete3DiasEnviado),
    dataLembrete3Dias: item.dataLembrete3Dias ? String(item.dataLembrete3Dias) : null,
    lembreteDiaEventoEnviado: Boolean(item.lembreteDiaEventoEnviado),
    dataLembreteDiaEvento: item.dataLembreteDiaEvento ? String(item.dataLembreteDiaEvento) : null,
    whatsappConfirmacaoEnviado: Boolean(item.whatsappConfirmacaoEnviado),
    criadoEm: String(item.criadoEm || new Date().toISOString())
  };
}

function carregarInscricoesDoBanco(banco = db) {
  if (!banco) return [];
  try {
    const rows = banco.prepare('SELECT * FROM the_chosen_inscricoes ORDER BY criadoEm ASC').all();
    return (rows || []).map(formatarInscricaoDoBanco);
  } catch (err) {
    console.error('[The Chosen] Erro ao ler the_chosen_inscricoes no banco:', err.message);
    return [];
  }
}

function salvarInscricoesNoBanco(inscricoes, banco = db) {
  if (!banco) return false;
  try {
    const normalizadas = (inscricoes || []).map(normalizarInscricao).filter(Boolean);

    const upsertStmt = banco.prepare(`
      INSERT INTO the_chosen_inscricoes (
        id, codigo, quantidade, participantes, titular, telefone, email, evento, dataEvento,
        statusConfirmacao, confirmadoEm, lembrete3DiasEnviado, dataLembrete3Dias,
        lembreteDiaEventoEnviado, dataLembreteDiaEvento, whatsappConfirmacaoEnviado, criadoEm
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        codigo = excluded.codigo,
        quantidade = excluded.quantidade,
        participantes = excluded.participantes,
        titular = excluded.titular,
        telefone = excluded.telefone,
        email = excluded.email,
        evento = excluded.evento,
        dataEvento = excluded.dataEvento,
        statusConfirmacao = excluded.statusConfirmacao,
        confirmadoEm = excluded.confirmadoEm,
        lembrete3DiasEnviado = excluded.lembrete3DiasEnviado,
        dataLembrete3Dias = excluded.dataLembrete3Dias,
        lembreteDiaEventoEnviado = excluded.lembreteDiaEventoEnviado,
        dataLembreteDiaEvento = excluded.dataLembreteDiaEvento,
        whatsappConfirmacaoEnviado = excluded.whatsappConfirmacaoEnviado,
        criadoEm = excluded.criadoEm
    `);

    banco.exec('BEGIN');
    try {
      const ids = normalizadas.map(i => i.id);
      if (ids.length === 0) {
        banco.exec('DELETE FROM the_chosen_inscricoes');
      } else {
        const placeholders = ids.map(() => '?').join(',');
        banco.prepare(`DELETE FROM the_chosen_inscricoes WHERE id NOT IN (${placeholders})`).run(...ids);
      }

      for (const item of normalizadas) {
        upsertStmt.run(
          item.id,
          item.codigo,
          item.quantidade,
          JSON.stringify(item.participantes),
          item.titular,
          item.telefone,
          item.email,
          item.evento,
          item.dataEvento,
          item.statusConfirmacao,
          item.confirmadoEm,
          item.lembrete3DiasEnviado ? 1 : 0,
          item.dataLembrete3Dias,
          item.lembreteDiaEventoEnviado ? 1 : 0,
          item.dataLembreteDiaEvento,
          item.whatsappConfirmacaoEnviado ? 1 : 0,
          item.criadoEm
        );
      }
      banco.exec('COMMIT');
      return true;
    } catch (txErr) {
      try { banco.exec('ROLLBACK'); } catch {}
      throw txErr;
    }
  } catch (err) {
    console.error('[The Chosen] Erro ao salvar inscrições no SQLite:', err.message);
    return false;
  }
}

function carregarInscricoes() {
  const dataFile = getDataFile();

  if (process.env.THE_CHOSEN_DATA_PATH) {
    try {
      if (isRealFile(dataFile)) {
        const raw = fs.readFileSync(dataFile, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) return data.map(normalizarInscricao).filter(Boolean);
      }
    } catch (err) {
      console.error('[The Chosen] Erro ao ler arquivo de teste:', err.message);
    }
    return [];
  }

  // Se o caminho principal for acidentalmente um diretório, tenta remover se possível
  if (isRealDir(dataFile)) {
    tentarRemoverDiretorioInvalido(dataFile);
  }

  if (db) {
    try {
      const doBanco = carregarInscricoesDoBanco(db);
      if (doBanco.length > 0) {
        return doBanco;
      }

      // Migração inicial: se o banco estiver vazio, tenta ler o arquivo principal ou backup em temp/
      const candFiles = [dataFile, getFallbackDataFile()];
      for (const cand of candFiles) {
        if (isRealFile(cand)) {
          try {
            const raw = fs.readFileSync(cand, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data) && data.length > 0) {
              const normalizados = data.map(normalizarInscricao).filter(Boolean);
              if (normalizados.length > 0) {
                console.log(`[The Chosen] Migrando ${normalizados.length} inscrições do arquivo JSON (${cand}) para o banco SQLite...`);
                salvarInscricoesNoBanco(normalizados, db);
                return normalizados;
              }
            }
          } catch (migrErr) {
            console.warn(`[The Chosen] Falha ao processar arquivo '${cand}' para migração:`, migrErr.message);
          }
        }
      }
      return [];
    } catch (err) {
      console.error('[The Chosen] Falha ao consultar SQLite, tentando arquivo JSON:', err.message);
    }
  }

  // Fallback caso db não esteja disponível: tenta ler o JSON principal ou o alternativo
  const candFiles = [dataFile, getFallbackDataFile()];
  for (const cand of candFiles) {
    if (isRealFile(cand)) {
      try {
        const raw = fs.readFileSync(cand, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) return data.map(normalizarInscricao).filter(Boolean);
      } catch (err) {
        console.error(`[The Chosen] Erro ao ler arquivo de inscrições (${cand}):`, err.message);
      }
    }
  }
  return [];
}

function salvarInscricoes(inscricoes) {
  const dataFile = getDataFile();
  const normalizadas = (inscricoes || []).map(normalizarInscricao).filter(Boolean);

  if (process.env.THE_CHOSEN_DATA_PATH) {
    try {
      fs.writeFileSync(dataFile, JSON.stringify(normalizadas, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('[The Chosen] Erro ao salvar arquivo de teste:', err.message);
      return false;
    }
  }

  let salvoBanco = false;
  if (db) {
    salvoBanco = salvarInscricoesNoBanco(normalizadas, db);
  }

  let salvoArquivo = false;
  try {
    if (isRealDir(dataFile)) {
      tentarRemoverDiretorioInvalido(dataFile);
    }

    if (isRealDir(dataFile)) {
      throw Object.assign(new Error(`O caminho '${dataFile}' é um diretório montado pelo Docker.`), { code: 'EISDIR' });
    }

    fs.writeFileSync(dataFile, JSON.stringify(normalizadas, null, 2), { encoding: 'utf8', mode: 0o666 });
    salvoArquivo = true;
  } catch (err) {
    console.error('[The Chosen] Erro ao sincronizar arquivo JSON de inscrições:', err.message);

    // Se houver erro de permissão (EACCES) ou diretório (EISDIR/EPERM/EBUSY),
    // salva no diretório temp com permissões totais para o usuário node
    if (err.code === 'EACCES' || err.code === 'EISDIR' || err.code === 'EPERM' || err.code === 'EBUSY') {
      try {
        const fallbackPath = getFallbackDataFile();
        fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
        fs.writeFileSync(fallbackPath, JSON.stringify(normalizadas, null, 2), { encoding: 'utf8', mode: 0o666 });
        salvoArquivo = true;
        console.log(`[The Chosen] Inscrições sincronizadas no arquivo de backup alternativo: ${fallbackPath}`);
      } catch (fallbackErr) {
        console.error('[The Chosen] Falha também ao sincronizar no arquivo alternativo:', fallbackErr.message);
      }
    }
  }

  return salvoBanco || salvoArquivo;
}

function estaExpirado(dataReferencia = new Date()) {
  return dataReferencia.getTime() >= DATA_EXPIRACAO.getTime();
}

function obterStatusVagas(dataReferencia = new Date()) {
  const inscricoes = carregarInscricoes();
  let preenchidas = inscricoes.reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0);
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

async function obterStatusVagasAsync(dataReferencia = new Date()) {
  const inscricoes = carregarInscricoes();
  let preenchidas = inscricoes.reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0);
  if (theChosenSheets) {
    try {
      const qtdPlanilha = await theChosenSheets.obterTotalIngressosPlanilha();
      if (typeof qtdPlanilha === 'number' && !isNaN(qtdPlanilha)) {
        preenchidas = Math.max(preenchidas, qtdPlanilha);
      }
    } catch (err) {
      console.warn('[The Chosen] Aviso ao sincronizar vagas com Google Sheets:', err.message);
    }
  }
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

async function realizarInscricao({ quantidade, participantes, telefone, email }, dataReferencia = new Date()) {
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
    return { ok: false, code: 'EMAIL_INVALIDO', message: 'Informe um e-mail válido para contato.' };
  }

  // Trava de concorrência e estoque (valida diretamente contra Google Sheets se disponível)
  const inscricoes = carregarInscricoes();
  let preenchidas = inscricoes.reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0);
  if (theChosenSheets) {
    try {
      const qtdPlanilha = await theChosenSheets.obterTotalIngressosPlanilha();
      if (typeof qtdPlanilha === 'number' && !isNaN(qtdPlanilha)) {
        preenchidas = Math.max(preenchidas, qtdPlanilha);
      }
    } catch (err) {
      console.warn('[The Chosen] Aviso ao sincronizar vagas antes da inscrição:', err.message);
    }
  }

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
    statusConfirmacao: 'pendente', // 'pendente' | 'confirmado' | 'cancelado'
    confirmadoEm: null,
    lembrete3DiasEnviado: false,
    lembreteDiaEventoEnviado: false,
    whatsappConfirmacaoEnviado: false,
    criadoEm: new Date().toISOString()
  };

  inscricoes.push(novaInscricao);
  const salvo = salvarInscricoes(inscricoes);

  if (!salvo) {
    return { ok: false, code: 'ERRO_SALVAMENTO', message: 'Ocorreu um erro interno ao registrar sua inscrição. Tente novamente.' };
  }

  // Integração direta com Google Sheets (adiciona linha na planilha)
  if (theChosenSheets) {
    try {
      await theChosenSheets.adicionarInscricaoPlanilha(novaInscricao);
    } catch (sheetErr) {
      console.error('[The Chosen] Erro ao adicionar linha na planilha do Google Sheets:', sheetErr.message);
    }
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

function normalizarTelefone(tel) {
  let limpo = String(tel || '').replace(/\D/g, '');
  if (limpo.startsWith('55') && limpo.length >= 12) {
    limpo = limpo.slice(2);
  }
  return limpo;
}

function buscarInscricaoPorTelefoneOuCodigo(termo) {
  if (!termo) return null;
  const inscricoes = carregarInscricoes();
  const termoLimpo = String(termo).trim().toUpperCase();
  const telBusca = normalizarTelefone(termo);

  // Busca por código exato (ex: TC-XXXXXX)
  let achou = inscricoes.find(i => i.codigo && i.codigo.toUpperCase() === termoLimpo);
  if (achou) return achou;

  // Busca por ID
  achou = inscricoes.find(i => i.id === termo);
  if (achou) return achou;

  // Busca por telefone (comparando últimos 8 ou 9 dígitos para tolerar DDD e 9 extra)
  if (telBusca.length >= 8) {
    achou = inscricoes.find(i => {
      const iTel = normalizarTelefone(i.telefone);
      return iTel.endsWith(telBusca) || telBusca.endsWith(iTel);
    });
  }

  return achou || null;
}

function confirmarPresenca(termo, status = 'confirmado') {
  const inscricoes = carregarInscricoes();
  const termoLimpo = String(termo || '').trim().toUpperCase();
  const telBusca = normalizarTelefone(termo);

  let idx = inscricoes.findIndex(i => i.codigo && i.codigo.toUpperCase() === termoLimpo);
  if (idx === -1) {
    idx = inscricoes.findIndex(i => i.id === termo);
  }
  if (idx === -1 && telBusca.length >= 8) {
    idx = inscricoes.findIndex(i => {
      const iTel = normalizarTelefone(i.telefone);
      return iTel.endsWith(telBusca) || telBusca.endsWith(iTel);
    });
  }

  if (idx === -1) {
    return { ok: false, message: 'Inscrição não encontrada para confirmação.' };
  }

  inscricoes[idx].statusConfirmacao = status; // 'confirmado' | 'cancelado' | 'pendente'
  inscricoes[idx].confirmadoEm = new Date().toISOString();
  salvarInscricoes(inscricoes);

  return { ok: true, inscricao: inscricoes[idx] };
}

function excluirInscricao(termo) {
  if (!termo) return { ok: false, message: 'Identificador da inscrição não informado.' };

  const inscricoes = carregarInscricoes();
  const termoLimpo = String(termo || '').trim().toUpperCase();
  const telBusca = normalizarTelefone(termo);

  let idx = inscricoes.findIndex(i => i.codigo && i.codigo.toUpperCase() === termoLimpo);
  if (idx === -1) {
    idx = inscricoes.findIndex(i => i.id === termo);
  }
  if (idx === -1 && telBusca.length >= 8) {
    idx = inscricoes.findIndex(i => {
      const iTel = normalizarTelefone(i.telefone);
      return iTel.endsWith(telBusca) || telBusca.endsWith(iTel);
    });
  }

  if (idx === -1) {
    return { ok: false, message: 'Inscrição não encontrada para exclusão.' };
  }

  const [removida] = inscricoes.splice(idx, 1);
  salvarInscricoes(inscricoes);

  return { ok: true, message: 'Inscrição excluída com sucesso!', inscricao: removida };
}

function limparInscricoesTeste() {
  let inscricoes = carregarInscricoes();
  const antes = inscricoes.length;
  inscricoes = inscricoes.filter(i => {
    const tit = String(i.titular || '').toLowerCase();
    const mail = String(i.email || '').toLowerCase();
    const parts = (i.participantes || []).join(' ').toLowerCase();
    const isTeste = tit.includes('teste') || mail.includes('teste') || parts.includes('teste');
    return !isTeste;
  });

  const removidas = antes - inscricoes.length;
  salvarInscricoes(inscricoes);
  return { ok: true, removidas, totalAtual: inscricoes.length };
}

function obterEstatisticasConfirmacao() {
  const inscricoes = carregarInscricoes();
  let totalInscricoes = inscricoes.length;
  let totalIngressos = 0;
  let confirmados = 0;
  let ingressosConfirmados = 0;
  let cancelados = 0;
  let ingressosCancelados = 0;
  let pendentes = 0;
  let ingressosPendentes = 0;

  for (const i of inscricoes) {
    const qtd = Number(i.quantidade) || 1;
    totalIngressos += qtd;
    if (i.statusConfirmacao === 'confirmado') {
      confirmados++;
      ingressosConfirmados += qtd;
    } else if (i.statusConfirmacao === 'cancelado') {
      cancelados++;
      ingressosCancelados += qtd;
    } else {
      pendentes++;
      ingressosPendentes += qtd;
    }
  }

  return {
    limite: LIMITE_VAGAS,
    totalInscricoes,
    totalIngressos,
    restantes: Math.max(0, LIMITE_VAGAS - totalIngressos),
    confirmados,
    ingressosConfirmados,
    cancelados,
    ingressosCancelados,
    pendentes,
    ingressosPendentes
  };
}

function renderTheChosenPdfHtml() {
  const inscricoes = carregarInscricoes();
  const stats = obterEstatisticasConfirmacao();
  
  const linhasTabela = inscricoes.map((i, idx) => {
    const participantes = (i.participantes || [i.titular]).join(', ');
    const statusLabel = i.statusConfirmacao === 'confirmado' ? '✅ Confirmado' : (i.statusConfirmacao === 'cancelado' ? '❌ Cancelado' : '⏳ Pendente');
    const telFormatado = i.telefone ? i.telefone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : '-';

    return `
      <tr>
        <td style="text-align:center; width: 40px;"><div style="width: 18px; height: 18px; border: 2px solid #333; margin: 0 auto; border-radius: 3px;"></div></td>
        <td style="font-family: monospace; font-weight: bold; font-size: 0.85rem;">${i.codigo || '-'}</td>
        <td><strong>${i.titular || '-'}</strong></td>
        <td style="text-align: center; font-weight: bold;">${i.quantidade || 1}</td>
        <td style="font-size: 0.85rem;">${participantes}</td>
        <td style="font-size: 0.85rem;">${telFormatado}</td>
        <td style="font-size: 0.82rem; text-align: center;">${statusLabel}</td>
        <td style="border-bottom: 1px solid #ddd; width: 100px;"></td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Lista de Presença - Pré-estreia The Chosen</title>
    <style>
      @page { size: A4; margin: 1.2cm; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; margin: 0; padding: 20px; font-size: 11pt; }
      .no-print {
        background: #1e1e24; color: #fff; padding: 14px 20px; border-radius: 8px; margin-bottom: 24px;
        display: flex; align-items: center; justify-content: space-between;
      }
      .no-print button {
        background: #00bcd4; color: #fff; border: none; padding: 10px 20px; border-radius: 6px;
        font-weight: bold; font-size: 14px; cursor: pointer;
      }
      @media print {
        .no-print { display: none !important; }
        body { padding: 0; }
      }
      .header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 18px; }
      .header h1 { margin: 0 0 4px; font-size: 1.4rem; letter-spacing: 1px; text-transform: uppercase; }
      .header h2 { margin: 0 0 6px; font-size: 1.1rem; color: #444; font-weight: 600; }
      .header-meta { font-size: 0.88rem; color: #555; }
      .summary-cards { display: flex; gap: 15px; margin-bottom: 18px; }
      .summary-box { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 8px 12px; text-align: center; }
      .summary-box .val { font-size: 1.3rem; font-weight: bold; margin-bottom: 2px; }
      .summary-box .lbl { font-size: 0.75rem; text-transform: uppercase; color: #666; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9pt; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: middle; }
      th { background-color: #f3f4f6; font-weight: bold; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.5px; }
      tr:nth-child(even) { background-color: #fafafa; }
      .footer-note { margin-top: 24px; font-size: 8pt; color: #777; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
    </style>
  </head>
  <body>
    <div class="no-print">
      <div>
        <strong>📄 Visualização de Impressão / PDF</strong>
        <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.85;">Clique no botão ao lado ou pressione Ctrl+P para salvar como PDF ou imprimir a folha de presença.</p>
      </div>
      <button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
    </div>

    <div class="header">
      <h1>Comunidade Cristã Curados • Secretaria</h1>
      <h2>Lista Oficial de Portaria & Presença • Pré-estreia The Chosen (Temporada 6)</h2>
      <div class="header-meta">
        <strong>Data do Evento:</strong> Sábado, 03/10/2026 às 19:00 &nbsp;|&nbsp; 
        <strong>Local:</strong> Auditório Principal &nbsp;|&nbsp; 
        <strong>Capacidade:</strong> ${stats.limite || LIMITE_VAGAS} vagas &nbsp;|&nbsp;
        <strong>Gerado em:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>

    <div class="summary-cards">
      <div class="summary-box">
        <div class="val">${stats.totalInscricoes}</div>
        <div class="lbl">Inscrições</div>
      </div>
      <div class="summary-box">
        <div class="val" style="color: #0284c7;">${stats.totalIngressos} / ${stats.limite}</div>
        <div class="lbl">Ingressos Reservados</div>
      </div>
      <div class="summary-box">
        <div class="val" style="color: #16a34a;">${stats.ingressosConfirmados}</div>
        <div class="lbl">Confirmados</div>
      </div>
      <div class="summary-box">
        <div class="val" style="color: #ea580c;">${stats.ingressosPendentes}</div>
        <div class="lbl">Pendentes</div>
      </div>
      <div class="summary-box">
        <div class="val" style="color: #dc2626;">${stats.ingressosCancelados}</div>
        <div class="lbl">Cancelados</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: center;">Visto</th>
          <th>Código</th>
          <th>Titular</th>
          <th style="text-align: center;">Qtd</th>
          <th>Participantes</th>
          <th>Telefone</th>
          <th style="text-align: center;">Status</th>
          <th>Assinatura / Portaria</th>
        </tr>
      </thead>
      <tbody>
        ${linhasTabela || '<tr><td colspan="8" style="text-align:center; padding: 20px;">Nenhuma inscrição realizada até o momento.</td></tr>'}
      </tbody>
    </table>

    <div class="footer-note">
      Comunidade Cristã Curados • R. Benedicto de Abreu Júnior, 40 - Jardim Nova Itapevi, Itapevi - SP • Documento Interno de Gestão
    </div>
  </body>
  </html>`;
}

module.exports = {
  LIMITE_VAGAS,
  DATA_EXPIRACAO,
  estaExpirado,
  obterStatusVagas,
  obterStatusVagasAsync,
  realizarInscricao,
  listarInscricoes,
  carregarInscricoes,
  salvarInscricoes,
  carregarInscricoesDoBanco,
  salvarInscricoesNoBanco,
  formatarInscricaoDoBanco,
  buscarInscricaoPorTelefoneOuCodigo,
  confirmarPresenca,
  excluirInscricao,
  limparInscricoesTeste,
  obterEstatisticasConfirmacao,
  renderTheChosenPdfHtml
};


