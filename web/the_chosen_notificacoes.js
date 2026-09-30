const moment = require('moment-timezone');
const theChosen = require('./the_chosen');
const { notificarSecretaria } = require('../bot/secretaria');
const {
  verificarEnvioRemoto,
  registrarEnvioRemoto,
} = require('../bot/logsEnvioSheet');

function formatarJidWhatsApp(telefone) {
  if (!telefone) return '';
  let limpo = String(telefone).replace(/@.*$/, '').replace(/\D/g, '');
  if (!limpo) return '';
  if ((limpo.length === 10 || limpo.length === 11) && !limpo.startsWith('55')) {
    limpo = `55${limpo}`;
  }
  return `${limpo}@c.us`;
}

async function enviarMensagemConfirmacaoInscricao(client, inscricao, { fetchFn = globalThis.fetch } = {}) {
  if (!client || !inscricao || !inscricao.telefone) {
    return { ok: false, reason: 'CLIENT_OU_DADOS_AUSENTES' };
  }

  const telLimpo = String(inscricao.telefone || '').replace(/\D/g, '');
  const tipo = 'confirmacao_inscricao_the_chosen';
  const destinatario = `${inscricao.titular || 'Inscrito'} (${telLimpo})`;
  const periodo = String(inscricao.codigo || telLimpo);

  // 1. ANTES de enviar: verifica na planilha se já foi enviado
  const jaEnviadoRemoto = await verificarEnvioRemoto({
    tipo,
    destinatario,
    periodo,
    fetchFn,
  });

  if (jaEnviadoRemoto === true) {
    console.log(`[The Chosen] Confirmação já enviada anteriormente para ${destinatario} (${periodo}) via planilha. Pulando.`);
    return { ok: true, jaEnviado: true };
  }

  const jid = formatarJidWhatsApp(inscricao.telefone);
  if (!jid) return { ok: false, reason: 'TELEFONE_INVALIDO' };

  const nomesFormatados = (inscricao.participantes || [inscricao.titular])
    .map((nome, idx) => `  ${idx + 1}. ${nome}`)
    .join('\n');

  const texto = 
`🎬 *Inscrição Confirmada - The Chosen*

Olá, *${inscricao.titular}*! Sua inscrição foi confirmada com sucesso.

📅 *Data:* Sábado, 03/10/2026
⏰ *Horário:* 19:00

🎟️ *Entrada:* No dia do evento, basta apresentar o seu nome na recepção.
🍿 *Aviso:* Chegue cedo para garantir um bom lugar e não perder nada!

Te esperamos lá! 🙏`;

  try {
    await client.sendMessage(jid, texto);
    console.log(`[The Chosen] WhatsApp de confirmação enviado para ${inscricao.telefone} (${inscricao.codigo})`);

    // Atualiza status no banco/arquivo local
    const inscricoes = theChosen.carregarInscricoes();
    const item = inscricoes.find(i => i.id === inscricao.id || i.codigo === inscricao.codigo);
    if (item) {
      item.whatsappConfirmacaoEnviado = true;
      theChosen.salvarInscricoes(inscricoes);
    }

    // 2. LOGO APÓS envio bem-sucedido: registra na planilha
    await registrarEnvioRemoto({
      tipo,
      destinatario,
      periodo,
      detalhes: {
        codigo: inscricao.codigo,
        quantidade: inscricao.quantidade,
      },
      fetchFn,
    });

    return { ok: true };
  } catch (err) {
    console.error(`[The Chosen] Erro ao enviar WhatsApp para ${inscricao.telefone}:`, err.message);
    return { ok: false, error: err.message };
  }
}

async function enviarLembreteConfirmacao3Dias(client, { fetchFn = globalThis.fetch } = {}) {
  if (!client) return { ok: false, reason: 'CLIENT_OFFLINE' };

  const inscricoes = theChosen.carregarInscricoes();
  let enviados = 0;
  const periodo = '2026-09-30';
  const tipo = 'lembrete_inscricao_the_chosen_3dias';

  for (const inscricao of inscricoes) {
    if (inscricao.lembrete3DiasEnviado || inscricao.statusConfirmacao === 'cancelado') {
      continue;
    }

    const telLimpo = String(inscricao.telefone || '').replace(/\D/g, '');
    const destinatario = `${inscricao.titular || 'Inscrito'} (${telLimpo})`;

    // 1. ANTES de enviar: verifica na planilha se já foi enviado
    const jaEnviadoRemoto = await verificarEnvioRemoto({
      tipo,
      destinatario,
      periodo,
      fetchFn,
    });

    if (jaEnviadoRemoto === true) {
      inscricao.lembrete3DiasEnviado = true;
      continue;
    }

    const jid = formatarJidWhatsApp(inscricao.telefone);
    if (!jid) continue;

    const nomesFormatados = (inscricao.participantes || [inscricao.titular])
      .map((nome, idx) => `  ${idx + 1}. ${nome}`)
      .join('\n');

    const texto =
`🎬 *Lembrete & Confirmação de Presença - The Chosen* 🙏✨

Olá, *${inscricao.titular}*! A nossa *Pré-estreia The Chosen (Temporada 6)* está muito próxima: é neste sábado, *03/10 às 19:00*!

Você possui *${inscricao.quantidade} ingresso(s)* reservados para:
${nomesFormatados}

Para que possamos preparar todos os detalhes e assentos da igreja com muito carinho e organização:
👉 *Responda com 1 ou SIM para CONFIRMAR sua presença*
👉 *Responda com 2 ou NÃO caso tenha algum imprevisto e não possa vir*

Caso precise cancelar, sua resposta libera o lugar para outra família da nossa comunidade.
Contamos com você! Deus abençoe! ✨`;

    try {
      await client.sendMessage(jid, texto);
      inscricao.lembrete3DiasEnviado = true;
      inscricao.dataLembrete3Dias = new Date().toISOString();
      enviados++;

      // 2. LOGO APÓS envio bem-sucedido: registra na planilha
      await registrarEnvioRemoto({
        tipo,
        destinatario,
        periodo,
        detalhes: { codigo: inscricao.codigo },
        fetchFn,
      });

      // Pequeno delay preventivo entre disparos
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`[The Chosen] Falha ao enviar lembrete de 3 dias para ${inscricao.telefone}:`, err.message);
    }
  }

  if (enviados > 0) {
    theChosen.salvarInscricoes(inscricoes);
    console.log(`[The Chosen] ${enviados} lembretes de confirmação (3 dias antes) foram enviados.`);
  }

  return { ok: true, enviados };
}

async function enviarResumoSecretaria1Dia(client, { fetchFn = globalThis.fetch } = {}) {
  if (!client) return { ok: false, reason: 'CLIENT_OFFLINE' };

  const tipo = 'resumo_secretaria_the_chosen_1dia';
  const destinatario = 'Secretaria';
  const periodo = '2026-10-01';

  // 1. ANTES de enviar: verifica na planilha
  const jaEnviadoRemoto = await verificarEnvioRemoto({
    tipo,
    destinatario,
    periodo,
    fetchFn,
  });

  if (jaEnviadoRemoto === true) {
    console.log(`[The Chosen] Resumo de 1 dia para secretaria (${periodo}) já enviado anteriormente via planilha.`);
    return { ok: true, pulado: true };
  }

  const stats = theChosen.obterEstatisticasConfirmacao();

  const texto =
`📊 *[Secretaria] Relatório de Confirmação de Presença - The Chosen*
📅 Data: 01/10/2026 (Faltam 2 dias)
🎬 Evento: Pré-estreia The Chosen (03/10 às 19:00)

👥 *Status Geral dos Ingressos:*
• Capacidade total: *${stats.limite} vagas*
• Ingressos reservados: *${stats.totalIngressos}* (${stats.totalInscricoes} cadastros)
• Vagas restantes: *${stats.restantes}*

📋 *Confirmações de Presença:*
• ✅ Confirmados: *${stats.ingressosConfirmados} ingressos* (${stats.confirmados} titulares)
• ⏳ Aguardando confirmação: *${stats.ingressosPendentes} ingressos* (${stats.pendentes} titulares)
• ❌ Cancelados/Desistiram: *${stats.ingressosCancelados} ingressos* (${stats.cancelados} titulares)

📄 A lista nominal atualizada de todos os participantes e a folha de presença em PDF estão disponíveis na aba *Eventos* do painel da Secretaria.`;

  try {
    const enviado = await notificarSecretaria(client, texto);
    if (enviado) {
      await registrarEnvioRemoto({
        tipo,
        destinatario,
        periodo,
        detalhes: { confirmados: stats.confirmados, total: stats.totalIngressos },
        fetchFn,
      });
    }
    return { ok: enviado };
  } catch (err) {
    console.error('[The Chosen] Erro ao enviar resumo de 1 dia para secretaria:', err.message);
    return { ok: false, error: err.message };
  }
}

async function enviarLembreteDiaEvento(client, { fetchFn = globalThis.fetch } = {}) {
  if (!client) return { ok: false, reason: 'CLIENT_OFFLINE' };

  const inscricoes = theChosen.carregarInscricoes();
  let enviados = 0;
  const periodo = '2026-10-03';
  const tipo = 'lembrete_dia_evento_the_chosen';

  for (const inscricao of inscricoes) {
    if (inscricao.lembreteDiaEventoEnviado || inscricao.statusConfirmacao === 'cancelado') {
      continue;
    }

    const telLimpo = String(inscricao.telefone || '').replace(/\D/g, '');
    const destinatario = `${inscricao.titular || 'Inscrito'} (${telLimpo})`;

    // 1. ANTES de enviar: verifica na planilha
    const jaEnviadoRemoto = await verificarEnvioRemoto({
      tipo,
      destinatario,
      periodo,
      fetchFn,
    });

    if (jaEnviadoRemoto === true) {
      inscricao.lembreteDiaEventoEnviado = true;
      continue;
    }

    const jid = formatarJidWhatsApp(inscricao.telefone);
    if (!jid) continue;

    const texto =
`🍿 *É HOJE! Pré-estreia The Chosen - Temporada 6* ✨🎬

Olá, *${inscricao.titular}*! Chegou o grande dia da nossa sessão especial de The Chosen!

⏰ *Horário:* 19:00
📍 *Local:* Comunidade Cristã Curados
📌 *Endereço:* Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi
👥 *Sua Reserva:* ${inscricao.quantidade} ingresso(s) em nome de *${inscricao.titular}*

⏰ *Aviso:* Chegue cedo para garantir um bom lugar e não perder nada!
🍿 Teremos pipoca e suco à vontade! Na portaria, basta informar seu nome completo.

Venha com o coração aberto para viver uma noite de comunhão e edificação.
Até logo mais! 🙌`;

    try {
      await client.sendMessage(jid, texto);
      inscricao.lembreteDiaEventoEnviado = true;
      inscricao.dataLembreteDiaEvento = new Date().toISOString();
      enviados++;

      // 2. LOGO APÓS envio bem-sucedido: registra na planilha
      await registrarEnvioRemoto({
        tipo,
        destinatario,
        periodo,
        detalhes: { codigo: inscricao.codigo },
        fetchFn,
      });

      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`[The Chosen] Falha ao enviar lembrete do dia do evento para ${inscricao.telefone}:`, err.message);
    }
  }

  if (enviados > 0) {
    theChosen.salvarInscricoes(inscricoes);
    console.log(`[The Chosen] ${enviados} lembretes do dia do evento foram enviados.`);
  }

  return { ok: true, enviados };
}

async function enviarResumoFinalSecretaria(client, { fetchFn = globalThis.fetch } = {}) {
  if (!client) return { ok: false, reason: 'CLIENT_OFFLINE' };

  const tipo = 'resumo_final_secretaria_the_chosen';
  const destinatario = 'Secretaria';
  const periodo = '2026-10-03';

  // 1. ANTES de enviar: verifica na planilha
  const jaEnviadoRemoto = await verificarEnvioRemoto({
    tipo,
    destinatario,
    periodo,
    fetchFn,
  });

  if (jaEnviadoRemoto === true) {
    console.log(`[The Chosen] Resumo final para secretaria (${periodo}) já enviado anteriormente via planilha.`);
    return { ok: true, pulado: true };
  }

  const stats = theChosen.obterEstatisticasConfirmacao();

  const texto =
`🍿 *[Secretaria] Relatório Final do Dia do Evento - The Chosen* ✨
📅 Data: 03/10/2026 (HOJE às 19:00)
🎬 Pré-estreia The Chosen - Temporada 6 (Episódio 1)

👥 *Quadro Geral da Portaria/Recepção:*
• Vagas Preenchidas: *${stats.totalIngressos} de ${stats.limite}*
• ✅ Presenças Confirmadas: *${stats.ingressosConfirmados} ingressos* (${stats.confirmados} titulares)
• ⏳ Pendentes de confirmação: *${stats.ingressosPendentes} ingressos* (${stats.pendentes} titulares)
• ❌ Desistências: *${stats.ingressosCancelados} ingressos* (${stats.cancelados} titulares)

📄 *Atenção:* Lembre-se de abrir o painel da Secretaria na aba *Eventos* e clicar em *Exportar como PDF* para imprimir a folha de presença da recepção!`;

  try {
    const enviado = await notificarSecretaria(client, texto);
    if (enviado) {
      await registrarEnvioRemoto({
        tipo,
        destinatario,
        periodo,
        detalhes: { ingressosConfirmados: stats.ingressosConfirmados },
        fetchFn,
      });
    }
    return { ok: enviado };
  } catch (err) {
    console.error('[The Chosen] Erro ao enviar resumo final para secretaria:', err.message);
    return { ok: false, error: err.message };
  }
}

// Orquestrador diário chamado pelo cron/agendador
// Conforme solicitado: as mensagens de 3 dias já foram disparadas em 30/09.
// Mantém apenas o lembrete no dia do evento (03/10/2026) às 09:00 (só lembrando, sem confirmação).
async function processarRotinaTheChosen({
  client,
  dataReferencia = new Date(),
  horaMinima = 9,
  forcar = false,
  fetchFn = globalThis.fetch,
} = {}) {
  if (!client) return { ok: false, reason: 'CLIENT_OFFLINE' };

  const dataSP = moment(dataReferencia).tz('America/Sao_Paulo');
  const diaMes = dataSP.format('YYYY-MM-DD');
  const hora = dataSP.hour();

  // Apenas no dia do evento -> Dia 03/10/2026 às 09:00
  if (diaMes === '2026-10-03') {
    if (!forcar && hora < horaMinima) {
      console.log(`[The Chosen Cron] Dia do evento (03/10), aguardando horário das ${horaMinima}h (hora atual: ${hora}h).`);
      return { ok: true, aguardandoHorario: true };
    }

    console.log('[The Chosen Cron] Enviando lembrete matinal do dia do evento (03/10 às 09:00)...');
    const resLembrete = await enviarLembreteDiaEvento(client, { fetchFn });
    const resResumo = await enviarResumoFinalSecretaria(client, { fetchFn });
    return { ok: true, lembrete: resLembrete, resumo: resResumo };
  }

  return { ok: true, pulado: true, motivo: 'Nao e dia do evento' };
}

module.exports = {
  formatarJidWhatsApp,
  enviarMensagemConfirmacaoInscricao,
  enviarLembreteConfirmacao3Dias,
  enviarResumoSecretaria1Dia,
  enviarLembreteDiaEvento,
  enviarResumoFinalSecretaria,
  processarRotinaTheChosen
};
