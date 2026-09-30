let db;
try {
  db = require('../db');
} catch (err) {
  console.warn('[Mulheres Notificações] Não foi possível carregar db.js:', err.message);
}

const {
  obterEstatisticasMulheres,
  marcarConfirmacaoMulheresEnviada,
  montarMensagemConfirmacaoMulheres,
} = require('./culto_mulheres');

const { obterLideresPorDepartamento, listLideres } = require('./lideres');

function formatarJidWhatsApp(telefone) {
  if (!telefone) return '';
  let limpo = String(telefone).replace(/@.*$/, '').replace(/\D/g, '');
  if (!limpo) return '';
  if ((limpo.length === 10 || limpo.length === 11) && !limpo.startsWith('55')) {
    limpo = `55${limpo}`;
  }
  return `${limpo}@c.us`;
}

function obterUltimaExecucao(nomeRotina) {
  if (!db) return null;
  const row = db.prepare('SELECT ultimaData FROM rotinas_executadas WHERE nome = ?').get(nomeRotina);
  return row ? row.ultimaData : null;
}

function registrarExecucao(nomeRotina, dataRef) {
  if (!db) return;
  const agora = new Date().toISOString();
  db.prepare(`
    INSERT INTO rotinas_executadas (nome, ultimaData, executadoEm)
    VALUES (?, ?, ?)
    ON CONFLICT(nome) DO UPDATE SET
      ultimaData = excluded.ultimaData,
      executadoEm = excluded.executadoEm
  `).run(nomeRotina, dataRef, agora);
}

/**
 * Envia WhatsApp de confirmação de inscrição para a participante recém-inscrita.
 */
async function enviarMensagemConfirmacaoInscricaoMulheres(client, { nome, telefone, email } = {}) {
  if (!client || !telefone) {
    return { ok: false, reason: 'CLIENT_OU_TELEFONE_AUSENTE' };
  }

  const jid = formatarJidWhatsApp(telefone);
  if (!jid) return { ok: false, reason: 'JID_INVALIDO' };

  const texto = montarMensagemConfirmacaoMulheres({ nome });

  try {
    await client.sendMessage(jid, texto);
    if (email) {
      marcarConfirmacaoMulheresEnviada(email);
    }
    console.log(`[Culto Mulheres] Confirmação enviada via WhatsApp para ${telefone} (${nome})`);
    return { ok: true };
  } catch (err) {
    console.error(`[Culto Mulheres] Erro ao enviar confirmação WhatsApp para ${telefone}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Notifica as líderes da Rede de Mulheres sobre a quantidade de inscritas
 * quando faltarem exatamente 10 dias (14/10), 5 dias (19/10) e 3 dias (21/10) para o evento de 24/10/2026.
 */
async function processarNotificacoesRedeMulheres({
  client,
  dataBase = new Date(),
  dataEventoStr = '2026-10-24',
} = {}) {
  // Converte data base e data evento para meia-noite UTC/local para contagem precisa de dias
  const [evAno, evMes, evDia] = dataEventoStr.split('-').map(Number);
  const dataEvento = new Date(evAno, evMes - 1, evDia);

  const baseAno = dataBase.getFullYear();
  const baseMes = dataBase.getMonth();
  const baseDia = dataBase.getDate();
  const dataHoje = new Date(baseAno, baseMes, baseDia);

  const diffMs = dataEvento.getTime() - dataHoje.getTime();
  const diasRestantes = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // Marcos solicitados: 10 dias, 5 dias e 3 dias
  const marcos = [10, 5, 3];
  if (!marcos.includes(diasRestantes)) {
    return { executado: false, reason: `Hoje faltam ${diasRestantes} dias (marcos são 10, 5 e 3 dias).` };
  }

  const diaHojeIso = `${baseAno}-${String(baseMes + 1).padStart(2, '0')}-${String(baseDia).padStart(2, '0')}`;
  const rotinaId = `mulheres_notif_${diasRestantes}_dias`;

  const ultimaData = obterUltimaExecucao(rotinaId);
  if (ultimaData === diaHojeIso) {
    return { executado: false, reason: `Notificação de ${diasRestantes} dias já enviada hoje (${diaHojeIso}).` };
  }

  // Buscar líderes da Rede de Mulheres
  let lideresMulheres = obterLideresPorDepartamento('Rede de Mulheres');
  if (!lideresMulheres || lideresMulheres.length === 0) {
    lideresMulheres = obterLideresPorDepartamento('Mulheres');
  }

  if (!lideresMulheres || lideresMulheres.length === 0) {
    const todos = listLideres();
    lideresMulheres = todos.filter((l) => {
      const depto = (l.departamento || '').toLowerCase();
      return depto.includes('mulher');
    });
  }

  const stats = obterEstatisticasMulheres();
  const totalInscritas = stats.total;

  console.log(
    `[Culto Mulheres] Disparando atualização de ${diasRestantes} dias para líderes da Rede de Mulheres. Total de inscritas: ${totalInscritas}`
  );

  let enviados = 0;
  const erros = [];

  for (const lider of lideresMulheres) {
    const jid = formatarJidWhatsApp(lider.telefone);
    if (!jid) continue;

    const primeiroNome = String(lider.nome || '').trim().split(' ')[0] || 'Líder';
    const texto =
      `🌸 *Atualização de Inscrições - Culto de Mulheres*\n\n` +
      `Olá, *${primeiroNome}*!\n` +
      `Faltam apenas *${diasRestantes} dias* para o nosso *Culto de Mulheres: O Vaso e o Oleiro* (Sábado, 24/10 às 16h)! ✨\n\n` +
      `📊 *Total de inscritas até o momento:* *${totalInscritas} participante(s)*\n\n` +
      `Seguimos em oração e na expectativa de tudo o que Deus irá fazer! 🙏❤️`;

    if (client && typeof client.sendMessage === 'function') {
      try {
        await client.sendMessage(jid, texto);
        enviados++;
        console.log(`[Culto Mulheres] Notificação de ${diasRestantes} dias enviada para ${lider.nome} (${lider.telefone})`);
      } catch (err) {
        console.error(`[Culto Mulheres] Falha ao enviar para ${lider.telefone}:`, err.message);
        erros.push({ telefone: lider.telefone, erro: err.message });
      }
    }
  }

  registrarExecucao(rotinaId, diaHojeIso);

  return {
    executado: true,
    diasRestantes,
    totalInscritas,
    lideresNotificados: lideresMulheres.length,
    enviados,
    erros,
  };
}

module.exports = {
  formatarJidWhatsApp,
  enviarMensagemConfirmacaoInscricaoMulheres,
  processarNotificacoesRedeMulheres,
};
