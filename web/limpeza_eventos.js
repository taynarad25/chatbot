const moment = require('moment-timezone');

/**
 * Normaliza e extrai a data de término de um evento.
 * Suporta formatos:
 * - 'YYYY-MM-DD' ou 'YYYY-MM-DD HH:mm'
 * - 'DD/MM/YYYY' ou 'DD/MM/YYYY HH:mm'
 * - 'DD/MM' (assume ano corrente)
 * - Faixas com ' a ' ou ' até ': ex: '2026-10-24 a 2026-10-26' ou '24/10 a 26/10'
 */
function extrairDataTerminoEvento(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return null;
  const s = dataStr.trim();
  if (!s || s.toLowerCase() === 'não' || s.toLowerCase() === 'nao') return null;

  // Se houver faixa de datas (" a " ou " até " ou " - "), pega a data final
  let parteFinal = s;
  if (/\s+(?:a|at[eé]|-)\s+/i.test(s)) {
    const partes = s.split(/\s+(?:a|at[eé]|-)\s+/i);
    parteFinal = partes[partes.length - 1].trim();
  }

  // Formato DD de Mês de YYYY (ex: "26 de Outubro de 2026")
  const matchExtenso = parteFinal.match(/(\d{1,2})\s+de\s+([a-zA-Zç]+)\s+de\s+(\d{4})/i);
  if (matchExtenso) {
    const dia = parseInt(matchExtenso[1], 10);
    const meses = {
      janeiro: 0, fevereiro: 1, marco: 2, março: 2, abril: 3, maio: 4, junho: 5,
      julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11
    };
    const mesNome = matchExtenso[2].toLowerCase();
    if (meses[mesNome] !== undefined) {
      const ano = parseInt(matchExtenso[3], 10);
      return moment.tz([ano, meses[mesNome], dia, 23, 59, 59, 999], 'America/Sao_Paulo');
    }
  }

  // Formato DD/MM/YYYY (ex: "31/10/2026 às 15h" ou "24/10/2026")
  const matchBr = parteFinal.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (matchBr) {
    const dia = parseInt(matchBr[1], 10);
    const mes = parseInt(matchBr[2], 10) - 1;
    const ano = parseInt(matchBr[3], 10);
    return moment.tz([ano, mes, dia, 23, 59, 59, 999], 'America/Sao_Paulo');
  }

  // Formato YYYY-MM-DD
  const matchIso = parteFinal.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (matchIso) {
    const ano = parseInt(matchIso[1], 10);
    const mes = parseInt(matchIso[2], 10) - 1;
    const dia = parseInt(matchIso[3], 10);
    return moment.tz([ano, mes, dia, 23, 59, 59, 999], 'America/Sao_Paulo');
  }

  // Formato DD/MM
  const matchBrSemAno = parteFinal.match(/(\d{1,2})\/(\d{1,2})/);
  if (matchBrSemAno) {
    const dia = parseInt(matchBrSemAno[1], 10);
    const mes = parseInt(matchBrSemAno[2], 10) - 1;
    const ano = moment.tz('America/Sao_Paulo').year();
    return moment.tz([ano, mes, dia, 23, 59, 59, 999], 'America/Sao_Paulo');
  }

  return null;
}

/**
 * Verifica se um evento deve ser excluído / expirou.
 * REGRA OBRIGATÓRIA: Todo evento deve ser excluído totalmente no próximo dia após a execução.
 * Exemplo: Evento executado em 31/10 às 15h.
 * Durante 31/10: permanece visível.
 * Em 01/11 00:00:00 (próximo dia após a execução): deve ser excluído totalmente.
 */
function isEventoExpiradoData(dataStr, dataReferencia = new Date()) {
  const mTermino = extrairDataTerminoEvento(dataStr);
  if (!mTermino || !mTermino.isValid()) return false;

  const agora = moment.tz(dataReferencia, 'America/Sao_Paulo');
  // Se 'agora' já passou do fim do dia da execução do evento (23:59:59.999),
  // estamos no próximo dia ou posterior: DEVE SER EXCLUÍDO.
  return agora.isAfter(mTermino);
}

/**
 * Remove do banco SQLite todos os eventos passados das tabelas:
 * 1. painel_eventos (+ painel_eventos_inscricoes)
 * 2. formularios_eventos
 * 3. descricoes_eventos
 */
function limparTodosEventosExpirados({ db = null, dataReferencia = new Date() } = {}) {
  if (!db) {
    try {
      db = require('../db');
    } catch (e) {
      return { totalRemovidos: 0, erro: e.message };
    }
  }
  if (!db) return { totalRemovidos: 0 };

  let removidosPainel = 0;
  let removidosFormularios = 0;
  let removidosDescricoes = 0;

  // 1. Limpeza em painel_eventos
  try {
    const eventos = db.prepare('SELECT id, dataEvento, titulo FROM painel_eventos').all();
    for (const ev of eventos) {
      if (isEventoExpiradoData(ev.dataEvento, dataReferencia)) {
        try {
          db.prepare('DELETE FROM painel_eventos_inscricoes WHERE eventoId = ?').run(String(ev.id));
        } catch (_) {}
        const res = db.prepare('DELETE FROM painel_eventos WHERE id = ?').run(String(ev.id));
        if (res.changes > 0) {
          removidosPainel += res.changes;
          console.log(`[Auto-Limpeza Eventos] Evento do painel '${ev.titulo}' (data: ${ev.dataEvento}) removido automaticamente.`);
        }
      }
    }
  } catch (errPainel) {
    console.warn('[Auto-Limpeza Eventos] Aviso ao limpar painel_eventos:', errPainel.message);
  }

  // 2. Limpeza em formularios_eventos
  try {
    const formularios = db.prepare('SELECT id, data, evento FROM formularios_eventos').all();
    for (const form of formularios) {
      if (isEventoExpiradoData(form.data, dataReferencia)) {
        const res = db.prepare('DELETE FROM formularios_eventos WHERE id = ?').run(form.id);
        if (res.changes > 0) {
          removidosFormularios += res.changes;
          console.log(`[Auto-Limpeza Eventos] Formulário do evento '${form.evento}' (data: ${form.data}) removido automaticamente.`);
        }
      }
    }
  } catch (errForm) {
    console.warn('[Auto-Limpeza Eventos] Aviso ao limpar formularios_eventos:', errForm.message);
  }

  // 3. Limpeza em descricoes_eventos
  try {
    const descricoes = db.prepare('SELECT id, evento, horariosJson FROM descricoes_eventos').all();
    for (const desc of descricoes) {
      let horarios = [];
      try {
        horarios = JSON.parse(desc.horariosJson || '[]');
      } catch (_) {}

      // Se for objeto individual, transforma em array
      if (!Array.isArray(horarios)) {
        horarios = [horarios];
      }

      // Procura a data mais tardia entre os blocos cadastrados
      let todasExpiradas = horarios.length > 0;
      for (const h of horarios) {
        const dStr = h.dataFim || h.data || h.dataInicio || '';
        if (dStr) {
          if (!isEventoExpiradoData(dStr, dataReferencia)) {
            todasExpiradas = false;
            break;
          }
        }
      }

      if (todasExpiradas && horarios.length > 0) {
        const res = db.prepare('DELETE FROM descricoes_eventos WHERE id = ?').run(desc.id);
        if (res.changes > 0) {
          removidosDescricoes += res.changes;
          console.log(`[Auto-Limpeza Eventos] Descrição do evento '${desc.evento}' removida automaticamente.`);
        }
      }
    }
  } catch (errDesc) {
    console.warn('[Auto-Limpeza Eventos] Aviso ao limpar descricoes_eventos:', errDesc.message);
  }

  const totalRemovidos = removidosPainel + removidosFormularios + removidosDescricoes;
  if (totalRemovidos > 0) {
    console.log(`[Auto-Limpeza Eventos] Total de eventos passados expurgados: ${totalRemovidos} (Painel: ${removidosPainel}, Formulários: ${removidosFormularios}, Descrições: ${removidosDescricoes})`);
  }

  return {
    removidosPainel,
    removidosFormularios,
    removidosDescricoes,
    totalRemovidos,
  };
}

let intervaloLimpeza = null;

/**
 * Inicia a rotina contínua de auto-limpeza em background no servidor.
 */
function iniciarRotinaLimpezaAutomatica({ db = null, intervaloMs = 15 * 60 * 1000 } = {}) {
  // Executa uma limpeza inicial imediata
  try {
    limparTodosEventosExpirados({ db });
  } catch (e) {
    console.warn('[Auto-Limpeza Eventos] Erro na limpeza inicial:', e.message);
  }

  if (intervaloLimpeza) {
    clearInterval(intervaloLimpeza);
  }

  intervaloLimpeza = setInterval(() => {
    try {
      limparTodosEventosExpirados({ db });
    } catch (e) {
      console.warn('[Auto-Limpeza Eventos] Erro na limpeza periódica:', e.message);
    }
  }, intervaloMs);

  if (typeof intervaloLimpeza.unref === 'function') {
    intervaloLimpeza.unref();
  }

  return intervaloLimpeza;
}

/**
 * Filtra no HTML renderizado do servidor quaisquer elementos que possuam data-event-date passada.
 * Isso garante que nenhum card ou link de evento expirado seja entregue no HTML,
 * mesmo antes do JavaScript do navegador rodar.
 */
function filtrarHtmlEventosExpirados(html, dataReferencia = new Date()) {
  if (!html || typeof html !== 'string') return html;

  // Regex para encontrar tags com data-event-date="YYYY-MM-DD"
  // Ex: <li data-event-date="2026-10-24">...</li> ou <div class="evento-home-card..." data-event-date="2026-10-24">...</div>
  return html.replace(/<([a-z0-9]+)[^>]*\bdata-event-date=["']([^"']+)["'][^>]*>[\s\S]*?<\/\1>/gi, (match, tag, dateStr) => {
    if (isEventoExpiradoData(dateStr, dataReferencia)) {
      return ''; // Remove completamente o elemento do HTML
    }
    return match;
  });
}

module.exports = {
  extrairDataTerminoEvento,
  isEventoExpiradoData,
  limparTodosEventosExpirados,
  iniciarRotinaLimpezaAutomatica,
  filtrarHtmlEventosExpirados,
};
