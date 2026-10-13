const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

let db;
try {
  db = require('../db');
} catch (err) {
  console.warn('[Eventos Gerenciador] Não foi possível carregar db.js:', err.message);
}

// Inicializa tabelas se ainda não existirem
if (db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS painel_eventos (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        titulo TEXT NOT NULL,
        descricao TEXT,
        dataEvento TEXT,
        horario TEXT,
        local TEXT,
        tipoInscricao TEXT NOT NULL,
        bannerUrl TEXT,
        bannerMobileUrl TEXT,
        whatsappContato TEXT,
        whatsappMensagem TEXT,
        linkExterno TEXT,
        linkPlanilha TEXT,
        perguntas TEXT NOT NULL DEFAULT '[]',
        ativo INTEGER NOT NULL DEFAULT 1,
        criadoEm TEXT NOT NULL,
        atualizadoEm TEXT NOT NULL
      );

      try {
        db.exec('ALTER TABLE painel_eventos ADD COLUMN bannerMobileUrl TEXT;');
      } catch (_) {}

      CREATE TABLE IF NOT EXISTS painel_eventos_inscricoes (
        id TEXT PRIMARY KEY,
        eventoId TEXT NOT NULL,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        email TEXT,
        respostas TEXT NOT NULL DEFAULT '{}',
        whatsappConfirmacaoEnviado INTEGER NOT NULL DEFAULT 0,
        criadoEm TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_painel_eventos_slug ON painel_eventos(slug);
      CREATE INDEX IF NOT EXISTS idx_painel_inscricoes_evento ON painel_eventos_inscricoes(eventoId);
    `);
  } catch (errInit) {
    console.error('[Eventos Gerenciador] Erro ao inicializar tabelas:', errInit.message);
  }
}

function gerarSlug(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function normalizarTelefone(tel) {
  return String(tel || '').replace(/\D/g, '');
}

/**
 * Lista todos os eventos cadastrados
 */
function listarEventosPainel({ apenasAtivos = false } = {}) {
  if (!db) return [];
  const query = apenasAtivos
    ? 'SELECT * FROM painel_eventos WHERE ativo = 1 ORDER BY criadoEm DESC'
    : 'SELECT * FROM painel_eventos ORDER BY criadoEm DESC';
  const rows = db.prepare(query).all();
  return rows.map(r => {
    let perguntas = [];
    try {
      perguntas = JSON.parse(r.perguntas || '[]');
    } catch {}

    const totalInscritos = db
      .prepare('SELECT COUNT(*) as count FROM painel_eventos_inscricoes WHERE eventoId = ?')
      .get(r.id)?.count || 0;

    return {
      ...r,
      ativo: Boolean(r.ativo),
      perguntas,
      totalInscritos,
    };
  });
}

/**
 * Busca evento por ID
 */
function buscarEventoPainelPorId(id) {
  if (!db || !id) return null;
  const row = db.prepare('SELECT * FROM painel_eventos WHERE id = ?').get(String(id));
  if (!row) return null;
  let perguntas = [];
  try {
    perguntas = JSON.parse(row.perguntas || '[]');
  } catch {}
  return {
    ...row,
    ativo: Boolean(row.ativo),
    perguntas,
  };
}

/**
 * Busca evento por Slug
 */
function buscarEventoPainelPorSlug(slug) {
  if (!db || !slug) return null;
  const row = db.prepare('SELECT * FROM painel_eventos WHERE slug = ?').get(String(slug));
  if (!row) return null;
  let perguntas = [];
  try {
    perguntas = JSON.parse(row.perguntas || '[]');
  } catch {}
  return {
    ...row,
    ativo: Boolean(row.ativo),
    perguntas,
  };
}

/**
 * Salva ou atualiza um evento
 */
function salvarEventoPainel({
  id = null,
  titulo,
  descricao = '',
  dataEvento = '',
  horario = '',
  local = 'Comunidade Cristã Curados',
  tipoInscricao = 'formulario', // 'formulario', 'whatsapp', 'externo'
  bannerUrl = '',
  bannerMobileUrl = '',
  whatsappContato = '11942685501',
  whatsappMensagem = '',
  linkExterno = '',
  linkPlanilha = '',
  perguntas = [],
  ativo = 1,
} = {}) {
  if (!db) throw new Error('Banco de dados indisponível.');

  const tituloLimpo = String(titulo || '').trim();
  if (!tituloLimpo) throw new Error('O título do evento é obrigatório.');

  const agora = new Date().toISOString();
  let eventoId = id;
  let slugBase = gerarSlug(tituloLimpo);
  if (!slugBase) slugBase = 'evento-' + Date.now();

  let slugFinal = slugBase;

  if (!eventoId) {
    eventoId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

    // Verifica unicidade do slug para novos
    const existe = db.prepare('SELECT id FROM painel_eventos WHERE slug = ?').get(slugFinal);
    if (existe) {
      slugFinal = `${slugBase}-${Date.now().toString().slice(-4)}`;
    }

    const stmt = db.prepare(`
      INSERT INTO painel_eventos (
        id, slug, titulo, descricao, dataEvento, horario, local,
        tipoInscricao, bannerUrl, bannerMobileUrl, whatsappContato, whatsappMensagem,
        linkExterno, linkPlanilha, perguntas, ativo, criadoEm, atualizadoEm
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      eventoId,
      slugFinal,
      tituloLimpo,
      String(descricao || '').trim(),
      String(dataEvento || '').trim(),
      String(horario || '').trim(),
      String(local || '').trim(),
      String(tipoInscricao || 'formulario').trim(),
      String(bannerUrl || '').trim(),
      String(bannerMobileUrl || '').trim(),
      normalizarTelefone(whatsappContato) || '11942685501',
      String(whatsappMensagem || '').trim(),
      String(linkExterno || '').trim(),
      String(linkPlanilha || '').trim(),
      JSON.stringify(Array.isArray(perguntas) ? perguntas : []),
      ativo ? 1 : 0,
      agora,
      agora
    );
  } else {
    // Atualização
    const stmt = db.prepare(`
      UPDATE painel_eventos SET
        titulo = ?,
        descricao = ?,
        dataEvento = ?,
        horario = ?,
        local = ?,
        tipoInscricao = ?,
        bannerUrl = ?,
        bannerMobileUrl = ?,
        whatsappContato = ?,
        whatsappMensagem = ?,
        linkExterno = ?,
        linkPlanilha = ?,
        perguntas = ?,
        ativo = ?,
        atualizadoEm = ?
      WHERE id = ?
    `);

    stmt.run(
      tituloLimpo,
      String(descricao || '').trim(),
      String(dataEvento || '').trim(),
      String(horario || '').trim(),
      String(local || '').trim(),
      String(tipoInscricao || 'formulario').trim(),
      String(bannerUrl || '').trim(),
      String(bannerMobileUrl || '').trim(),
      normalizarTelefone(whatsappContato) || '11942685501',
      String(whatsappMensagem || '').trim(),
      String(linkExterno || '').trim(),
      String(linkPlanilha || '').trim(),
      JSON.stringify(Array.isArray(perguntas) ? perguntas : []),
      ativo ? 1 : 0,
      agora,
      String(eventoId)
    );
  }

  return buscarEventoPainelPorId(eventoId);
}

/**
 * Exclui evento e suas inscrições
 */
function excluirEventoPainel(id) {
  if (!db || !id) return false;
  db.prepare('DELETE FROM painel_eventos_inscricoes WHERE eventoId = ?').run(String(id));
  const res = db.prepare('DELETE FROM painel_eventos WHERE id = ?').run(String(id));
  return res.changes > 0;
}

/**
 * Ativa / Pausa evento
 */
function alternarStatusEventoPainel(id) {
  if (!db || !id) return false;
  const evento = buscarEventoPainelPorId(id);
  if (!evento) return false;
  const novoStatus = evento.ativo ? 0 : 1;
  const res = db.prepare('UPDATE painel_eventos SET ativo = ?, atualizadoEm = ? WHERE id = ?').run(
    novoStatus,
    new Date().toISOString(),
    String(id)
  );
  return res.changes > 0;
}

/**
 * Lista inscrições de um evento
 */
function listarInscricoesEventoPainel(eventoId) {
  if (!db || !eventoId) return [];
  const rows = db
    .prepare('SELECT * FROM painel_eventos_inscricoes WHERE eventoId = ? ORDER BY criadoEm DESC')
    .all(String(eventoId));
  return rows.map(r => {
    let respostas = {};
    try {
      respostas = JSON.parse(r.respostas || '{}');
    } catch {}
    return {
      ...r,
      whatsappConfirmacaoEnviado: Boolean(r.whatsappConfirmacaoEnviado),
      respostas,
    };
  });
}

/**
 * Salva uma nova inscrição para o evento
 */
async function salvarInscricaoEventoPainel({
  eventoId,
  nome,
  telefone,
  email = '',
  respostas = {},
} = {}) {
  if (!db) throw new Error('Banco de dados indisponível.');

  const evento = buscarEventoPainelPorId(eventoId);
  if (!evento) throw new Error('Evento não encontrado.');

  const nomeLimpo = String(nome || '').trim();
  if (!nomeLimpo) throw new Error('Nome é obrigatório.');

  const telNorm = String(telefone || '').trim();
  if (!telNorm) throw new Error('Telefone é obrigatório.');

  const agora = new Date().toISOString();
  const inscricaoId = crypto
    .createHash('md5')
    .update(`${eventoId}|${nomeLimpo.toLowerCase()}|${normalizarTelefone(telNorm)}`)
    .digest('hex');

  const stmt = db.prepare(`
    INSERT INTO painel_eventos_inscricoes (
      id, eventoId, nome, telefone, email, respostas, whatsappConfirmacaoEnviado, criadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(id) DO UPDATE SET
      nome = excluded.nome,
      telefone = excluded.telefone,
      email = excluded.email,
      respostas = excluded.respostas
  `);

  stmt.run(
    inscricaoId,
    String(eventoId),
    nomeLimpo,
    telNorm,
    String(email || '').trim(),
    JSON.stringify(respostas || {}),
    agora
  );

  const dadosInscricao = {
    id: inscricaoId,
    eventoId,
    eventoTitulo: evento.titulo,
    nome: nomeLimpo,
    telefone: telNorm,
    email: String(email || '').trim(),
    respostas,
    criadoEm: agora,
  };

  // Se o evento possui URL da planilha do Google Apps Script configurada, envia automaticamente
  if (evento.linkPlanilha && evento.linkPlanilha.startsWith('http')) {
    try {
      enviarInscricaoParaPlanilhaGoogle(dadosInscricao, evento.linkPlanilha).catch(err => {
        console.warn(`[Eventos Gerenciador] Falha ao enviar para planilha Google (${evento.titulo}):`, err.message);
      });
    } catch (errSync) {
      console.warn('[Eventos Gerenciador] Erro no disparo assíncrono para planilha:', errSync.message);
    }
  }

  return dadosInscricao;
}

/**
 * Exclui inscrição do evento
 */
function excluirInscricaoEventoPainel(id) {
  if (!db || !id) return false;
  const res = db.prepare('DELETE FROM painel_eventos_inscricoes WHERE id = ?').run(String(id));
  return res.changes > 0;
}

/**
 * Envia dados da inscrição para o Google Apps Script (Web App)
 */
async function enviarInscricaoParaPlanilhaGoogle(dados, urlWebapp, fetchFn = global.fetch) {
  if (!urlWebapp) return { ok: false, message: 'URL não configurada' };

  try {
    const payload = {
      action: 'inscrever',
      evento: dados.eventoTitulo,
      eventoId: dados.eventoId,
      nome: dados.nome,
      telefone: dados.telefone,
      email: dados.email || '',
      dataHora: dados.criadoEm || new Date().toISOString(),
      ...dados.respostas,
    };

    const res = await fetchFn(urlWebapp, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const texto = await res.text();
    let jsonResp = null;
    try {
      jsonResp = JSON.parse(texto);
    } catch {}

    return {
      ok: res.ok,
      status: res.status,
      data: jsonResp || texto,
    };
  } catch (err) {
    return {
      ok: false,
      message: err.message,
    };
  }
}

/**
 * Renderiza página pública do evento (/evento/:slug)
 */
function renderPaginaEventoHtml(evento) {
  let banner = '';
  if (evento.bannerUrl || evento.bannerMobileUrl) {
    banner = `
      <div class="event-hero-banner">
        <picture>
          ${evento.bannerMobileUrl ? `<source media="(max-width: 680px)" srcset="${evento.bannerMobileUrl}">` : ''}
          <img src="${evento.bannerUrl || evento.bannerMobileUrl}" alt="${evento.titulo}" />
        </picture>
      </div>
    `;
  }

  const dataFmt = evento.dataEvento || 'A definir';
  const horarioFmt = evento.horario ? ` às ${evento.horario}` : '';
  const localFmt = evento.local || 'Comunidade Cristã Curados';

  let acaoHtml = '';

  if (evento.tipoInscricao === 'whatsapp') {
    const msgPadrao = encodeURIComponent(
      evento.whatsappMensagem ||
      `Olá! Gostaria de mais informações sobre o evento "${evento.titulo}".`
    );
    const linkWhats = `https://wa.me/55${evento.whatsappContato || '11942685501'}?text=${msgPadrao}`;

    acaoHtml = `
      <div class="action-card whatsapp-action">
        <div class="action-icon">💬</div>
        <h3>Deseja participar ou saber mais?</h3>
        <p>Este evento não exige inscrição prévia por formulário! Fale diretamente com nossa equipe no WhatsApp para tirar dúvidas ou confirmar presença.</p>
        <a href="${linkWhats}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-action">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.288.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.173.086.275.072.376-.043.101-.116.433-.506.549-.68.116-.173.231-.145.39-.086s1.011.477 1.184.564.289.13.332.202c.043.073.043.42-.101.825z"/></svg>
          Falar no WhatsApp Oficial
        </a>
      </div>
    `;
  } else if (evento.tipoInscricao === 'externo') {
    acaoHtml = `
      <div class="action-card external-action">
        <div class="action-icon">🔗</div>
        <h3>Inscrições Abertas</h3>
        <p>Acesse o formulário oficial de inscrição através do link externo abaixo:</p>
        <a href="${evento.linkExterno || '#'}" target="_blank" rel="noopener noreferrer" class="btn-external-action">
          Preencher Formulário de Inscrição ➔
        </a>
      </div>
    `;
  } else {
    // Formulário dinâmico no próprio site
    const perguntas = evento.perguntas || [];
    let camposHtml = '';

    perguntas.forEach((p, idx) => {
      const campoId = `perg_${p.id || idx}`;
      const obrigatorio = p.obrigatorio ? 'required' : '';
      const asterisco = p.obrigatorio ? '<span class="req">*</span>' : '';

      if (p.tipo === 'sim_nao') {
        const detalheBoxId = `box_det_${campoId}`;
        const inputDetId = `det_${campoId}`;
        camposHtml += `
          <div class="form-group">
            <label class="form-label">${p.label || 'Pergunta'} ${asterisco}</label>
            <div class="radio-options">
              <label class="radio-label">
                <input type="radio" name="${campoId}" value="Não" checked onchange="document.getElementById('${detalheBoxId}').style.display='none'; document.getElementById('${inputDetId}').value='';" />
                <span>Não</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="${campoId}" value="Sim" ${obrigatorio} onchange="document.getElementById('${detalheBoxId}').style.display='block'; document.getElementById('${inputDetId}').focus();" />
                <span>Sim</span>
              </label>
            </div>
            <div id="${detalheBoxId}" style="display:none; margin-top:8px;">
              <input type="text" id="${inputDetId}" name="${campoId}_detalhes" class="form-input" placeholder="${p.detalhePlaceholder || 'Por favor, detalhe...'}" />
            </div>
          </div>
        `;
      } else if (p.tipo === 'sim_nao_simples') {
        camposHtml += `
          <div class="form-group">
            <label class="form-label">${p.label || 'Pergunta'} ${asterisco}</label>
            <div class="radio-options">
              <label class="radio-label">
                <input type="radio" name="${campoId}" value="Não" checked />
                <span>Não</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="${campoId}" value="Sim" ${obrigatorio} />
                <span>Sim</span>
              </label>
            </div>
          </div>
        `;
      } else if (p.tipo === 'escolha' || p.tipo === 'selecao') {
        let opcoesList = [];
        if (Array.isArray(p.opcoes)) {
          opcoesList = p.opcoes;
        } else if (typeof p.opcoes === 'string') {
          opcoesList = p.opcoes.split(',').map(s => s.trim()).filter(Boolean);
        }
        const opts = opcoesList.map(o => `<option value="${o}">${o}</option>`).join('');
        camposHtml += `
          <div class="form-group">
            <label class="form-label" for="${campoId}">${p.label || 'Selecione'} ${asterisco}</label>
            <select id="${campoId}" name="${campoId}" class="form-input" ${obrigatorio}>
              <option value="">Selecione uma opção...</option>
              ${opts}
            </select>
          </div>
        `;
      } else if (p.tipo === 'telefone') {
        camposHtml += `
          <div class="form-group">
            <label class="form-label" for="${campoId}">${p.label || 'Telefone / WhatsApp'} ${asterisco}</label>
            <input type="tel" id="${campoId}" name="${campoId}" class="form-input" placeholder="(11) 99999-9999" ${obrigatorio} />
          </div>
        `;
      } else if (p.tipo === 'texto_longo') {
        camposHtml += `
          <div class="form-group">
            <label class="form-label" for="${campoId}">${p.label || 'Observações'} ${asterisco}</label>
            <textarea id="${campoId}" name="${campoId}" class="form-input" rows="3" placeholder="${p.placeholder || 'Digite sua resposta...'}" ${obrigatorio}></textarea>
          </div>
        `;
      } else if (p.tipo === 'numero') {
        camposHtml += `
          <div class="form-group">
            <label class="form-label" for="${campoId}">${p.label || 'Informe o número'} ${asterisco}</label>
            <input type="number" id="${campoId}" name="${campoId}" class="form-input" placeholder="${p.placeholder || 'Digite o número'}" ${obrigatorio} />
          </div>
        `;
      } else if (p.tipo === 'data') {
        camposHtml += `
          <div class="form-group">
            <label class="form-label" for="${campoId}">${p.label || 'Data'} ${asterisco}</label>
            <input type="date" id="${campoId}" name="${campoId}" class="form-input" ${obrigatorio} />
          </div>
        `;
      } else {
        // Texto padrão
        camposHtml += `
          <div class="form-group">
            <label class="form-label" for="${campoId}">${p.label || 'Resposta'} ${asterisco}</label>
            <input type="text" id="${campoId}" name="${campoId}" class="form-input" placeholder="${p.placeholder || 'Digite sua resposta'}" ${obrigatorio} />
          </div>
        `;
      }
    });

    acaoHtml = `
      <div class="action-card form-action">
        <h3 style="margin-bottom: 0.5rem; color: #fff; font-size: 1.3rem;">📝 Ficha de Inscrição Oficial</h3>
        <p style="color: #94a3b8; font-size: 0.88rem; margin-bottom: 1.5rem;">Preencha os campos abaixo com atenção para garantir sua vaga no evento.</p>
        
        <form id="formEventoDinamico" onsubmit="enviarInscricaoEvento(event)">
          <input type="hidden" id="eventoId" value="${evento.id}" />
          <input type="hidden" id="eventoSlug" value="${evento.slug}" />

          <div class="form-group">
            <label class="form-label" for="inscricaoNome">Nome Completo <span class="req">*</span></label>
            <input type="text" id="inscricaoNome" name="nome" class="form-input" placeholder="Ex: Maria Clara dos Santos" required />
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" for="inscricaoTelefone">WhatsApp / Telefone <span class="req">*</span></label>
              <input type="tel" id="inscricaoTelefone" name="telefone" class="form-input" placeholder="(11) 99999-9999" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="inscricaoEmail">E-mail (opcional)</label>
              <input type="email" id="inscricaoEmail" name="email" class="form-input" placeholder="seuemail@exemplo.com" />
            </div>
          </div>

          ${camposHtml}

          <div id="mensagemFeedback" style="display:none; margin: 1.2rem 0; padding: 12px; border-radius: 10px; font-weight:600; font-size:0.9rem;"></div>

          <button type="submit" id="btnSubmitInscricao" class="btn-submit-action">
            <span>Confirmar Inscrição</span>
          </button>
        </form>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${evento.titulo} — Comunidade Cristã Curados</title>
  <link rel="icon" type="image/png" href="/images/logo.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #141419;
      --card-border: rgba(255, 255, 255, 0.08);
      --cor-primaria: #00bcd4;
      --cor-roxo: #8b5cf6;
      --texto: #f8fafc;
      --texto-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Montserrat', sans-serif; }
    body {
      background-color: var(--bg);
      color: var(--texto);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.5rem 1rem 3rem;
      position: relative;
      overflow-x: hidden;
    }
    body::before {
      content: "";
      position: absolute;
      top: -150px;
      left: 50%;
      transform: translateX(-50%);
      width: 700px;
      height: 450px;
      background: radial-gradient(circle, rgba(0, 188, 212, 0.15) 0%, rgba(139, 92, 246, 0.1) 50%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .page-container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 820px;
    }
    .header-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--card-border);
    }
    .brand-link {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
    }
    .brand-logo {
      width: 40px;
      height: 40px;
      object-fit: contain;
    }
    .brand-title {
      font-weight: 800;
      font-size: 1.15rem;
      letter-spacing: 1px;
    }
    .brand-title span { color: var(--cor-primaria); }
    .event-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }
    .event-hero-banner img {
      width: 100%;
      max-height: 420px;
      object-fit: cover;
      display: block;
    }
    .event-body {
      padding: 2.2rem;
    }
    .badge-tipo {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      padding: 4px 12px;
      border-radius: 999px;
      background: rgba(0, 188, 212, 0.12);
      color: var(--cor-primaria);
      border: 1px solid rgba(0, 188, 212, 0.3);
      margin-bottom: 1rem;
    }
    .event-title {
      font-size: 2rem;
      font-weight: 900;
      color: #fff;
      line-height: 1.25;
      margin-bottom: 1rem;
      letter-spacing: -0.5px;
    }
    .event-meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 1.8rem;
      background: rgba(255, 255, 255, 0.03);
      padding: 1rem 1.2rem;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .event-meta-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9rem;
      color: #cbd5e1;
    }
    .event-desc {
      color: #cbd5e1;
      font-size: 0.98rem;
      line-height: 1.7;
      margin-bottom: 2.2rem;
      white-space: pre-line;
    }
    .action-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 1.8rem;
    }
    .whatsapp-action {
      text-align: center;
      background: linear-gradient(145deg, rgba(37, 211, 102, 0.06), rgba(0, 0, 0, 0.2));
      border-color: rgba(37, 211, 102, 0.25);
    }
    .external-action {
      text-align: center;
    }
    .action-icon {
      font-size: 2.5rem;
      margin-bottom: 0.8rem;
    }
    .action-card h3 {
      font-size: 1.3rem;
      color: #fff;
      margin-bottom: 0.6rem;
    }
    .action-card p {
      color: var(--texto-muted);
      font-size: 0.92rem;
      max-width: 500px;
      margin: 0 auto 1.5rem;
      line-height: 1.5;
    }
    .btn-whatsapp-action {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: #25d366;
      color: #0b141a;
      padding: 14px 28px;
      border-radius: 14px;
      font-weight: 800;
      font-size: 1rem;
      text-decoration: none;
      box-shadow: 0 10px 25px rgba(37, 211, 102, 0.35);
      transition: all 0.2s ease;
    }
    .btn-whatsapp-action:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 30px rgba(37, 211, 102, 0.5);
    }
    .btn-external-action {
      display: inline-block;
      background: linear-gradient(135deg, var(--cor-primaria), var(--cor-roxo));
      color: #fff;
      padding: 14px 28px;
      border-radius: 14px;
      font-weight: 800;
      font-size: 1rem;
      text-decoration: none;
      box-shadow: 0 10px 25px rgba(0, 188, 212, 0.3);
      transition: all 0.2s ease;
    }
    .btn-external-action:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 30px rgba(0, 188, 212, 0.45);
    }
    .form-group {
      margin-bottom: 1.2rem;
    }
    .form-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    @media (max-width: 600px) {
      .form-grid-2 { grid-template-columns: 1fr; }
      .event-title { font-size: 1.6rem; }
      .event-body { padding: 1.5rem; }
    }
    .form-label {
      display: block;
      font-size: 0.86rem;
      font-weight: 700;
      color: #e2e8f0;
      margin-bottom: 6px;
    }
    .req { color: #f43f5e; font-weight: bold; }
    .form-input {
      width: 100%;
      padding: 12px 14px;
      background: #1b1b22;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      color: #fff;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s ease;
    }
    .form-input:focus {
      border-color: var(--cor-primaria);
      box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.15);
    }
    .radio-options {
      display: flex;
      gap: 14px;
    }
    .radio-label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 0.92rem;
      color: #cbd5e1;
      background: #1b1b22;
      padding: 8px 16px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .btn-submit-action {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, var(--cor-primaria), #0891b2);
      border: none;
      border-radius: 12px;
      color: #042f2e;
      font-size: 1.05rem;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0, 188, 212, 0.35);
      transition: all 0.2s ease;
      margin-top: 0.5rem;
    }
    .btn-submit-action:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(0, 188, 212, 0.5);
    }
    .footer-nota {
      text-align: center;
      margin-top: 2rem;
      font-size: 0.8rem;
      color: var(--texto-muted);
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="header-nav">
      <a href="/" class="brand-link">
        <img src="/images/logo.png" alt="Curados" class="brand-logo" />
        <div class="brand-title"><span>CURADOS</span></div>
      </a>
      <span style="font-size: 0.82rem; font-weight: 600; color: var(--texto-muted); text-transform: uppercase;">Evento Oficial</span>
    </div>

    <div class="event-card">
      ${banner}
      <div class="event-body">
        <div class="badge-tipo">${evento.tipoInscricao === 'whatsapp' ? 'Divulgação WhatsApp' : (evento.tipoInscricao === 'externo' ? 'Inscrição Externa' : 'Inscrições Abertas')}</div>
        <h1 class="event-title">${evento.titulo}</h1>

        <div class="event-meta-grid">
          <div class="event-meta-item">
            <span>🗓️</span>
            <div><strong>${dataFmt}</strong>${horarioFmt}</div>
          </div>
          <div class="event-meta-item">
            <span>📍</span>
            <div><strong>${localFmt}</strong></div>
          </div>
        </div>

        ${evento.descricao ? `<div class="event-desc">${evento.descricao}</div>` : ''}

        ${acaoHtml}
      </div>
    </div>

    <div class="footer-nota">
      Comunidade Cristã Curados • Lugar de Encontro com Deus
    </div>
  </div>

  <script>
    // Máscara de Telefone em todos os campos de telefone
    document.querySelectorAll('input[type="tel"]').forEach(function(el) {
      el.addEventListener('input', function(e) {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length > 10) {
          e.target.value = '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7);
        } else if (v.length > 6) {
          e.target.value = '(' + v.slice(0, 2) + ') ' + v.slice(2, 6) + '-' + v.slice(6);
        } else if (v.length > 2) {
          e.target.value = '(' + v.slice(0, 2) + ') ' + v.slice(2);
        } else if (v.length > 0) {
          e.target.value = '(' + v;
        }
      });
    });

    async function enviarInscricaoEvento(e) {
      e.preventDefault();
      const form = document.getElementById('formEventoDinamico');
      const btn = document.getElementById('btnSubmitInscricao');
      const feedback = document.getElementById('mensagemFeedback');
      const eventoId = document.getElementById('eventoId').value;
      const slug = document.getElementById('eventoSlug').value;

      const nome = document.getElementById('inscricaoNome').value.trim();
      const telefone = document.getElementById('inscricaoTelefone').value.trim();
      const email = document.getElementById('inscricaoEmail') ? document.getElementById('inscricaoEmail').value.trim() : '';

      if (!nome || !telefone) {
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(239, 68, 68, 0.15)';
        feedback.style.color = '#fca5a5';
        feedback.textContent = 'Nome e Telefone são obrigatórios.';
        return;
      }

      const respostas = {};
      const inputs = form.querySelectorAll('input:not([type=hidden]):not(#inscricaoNome):not(#inscricaoTelefone):not(#inscricaoEmail), select, textarea');
      inputs.forEach(input => {
        if (input.type === 'radio') {
          if (input.checked) {
            respostas[input.name] = input.value;
          }
        } else {
          if (input.value.trim()) {
            respostas[input.name] = input.value.trim();
          }
        }
      });

      btn.disabled = true;
      btn.innerHTML = '<span>Enviando inscrição...</span>';
      feedback.style.display = 'none';

      try {
        const res = await fetch('/api/eventos/' + slug + '/inscrever', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventoId, nome, telefone, email, respostas })
        });

        const data = await res.json();
        if (res.ok && data.ok) {
          form.innerHTML = '<div style="text-align: center; padding: 2rem 1rem;">' +
            '<div style="font-size: 3.5rem; margin-bottom: 1rem;">🎉</div>' +
            '<h3 style="color: #4ade80; font-size: 1.5rem; margin-bottom: 0.6rem;">Inscrição Confirmada com Sucesso!</h3>' +
            '<p style="color: #cbd5e1; font-size: 0.95rem; margin-bottom: 1.5rem;">Graça e Paz, <strong>' + (nome || '') + '</strong>! Sua vaga foi registrada em nosso sistema.</p>' +
            '<a href="/" style="display: inline-block; padding: 10px 22px; background: rgba(255,255,255,0.08); color: #fff; border-radius: 10px; text-decoration: none; font-weight:600; font-size: 0.9rem;">Voltar ao Início</a>' +
          '</div>';
        } else {
          feedback.style.display = 'block';
          feedback.style.background = 'rgba(239, 68, 68, 0.15)';
          feedback.style.color = '#fca5a5';
          feedback.textContent = data.message || 'Erro ao processar inscrição. Tente novamente.';
          btn.disabled = false;
          btn.innerHTML = '<span>Confirmar Inscrição</span>';
        }
      } catch (err) {
        console.error('Erro ao enviar:', err);
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(239, 68, 68, 0.15)';
        feedback.style.color = '#fca5a5';
        feedback.textContent = 'Erro ao conectar ao servidor. Verifique sua conexão.';
        btn.disabled = false;
        btn.innerHTML = '<span>Confirmar Inscrição</span>';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Renderiza relatório / PDF de inscritos para impressão
 */
function renderPdfInscritosEventoHtml(evento, inscricoes) {
  const dataFmt = evento.dataEvento || 'Data não definida';
  const horarioFmt = evento.horario ? ` às ${evento.horario}` : '';

  const perguntas = evento.perguntas || [];

  const headersPerguntas = perguntas.map(p => `<th>${p.label || 'Pergunta'}</th>`).join('');

  const linhas = inscricoes.map((item, idx) => {
    const telFormatado = item.telefone ? item.telefone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : '-';
    const respostas = item.respostas || {};

    const colunasPerguntas = perguntas.map((p, pIdx) => {
      const campoId = `perg_${p.id || pIdx}`;
      const v = respostas[campoId] || '-';
      const det = respostas[`${campoId}_detalhes`];
      if (det) {
        return `<td>${v}: <small>${det}</small></td>`;
      }
      return `<td>${v}</td>`;
    }).join('');

    return `
      <tr>
        <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
        <td><strong>${item.nome}</strong></td>
        <td>${telFormatado}</td>
        <td>${item.email || '-'}</td>
        ${colunasPerguntas}
        <td style="font-size: 0.8rem; color: #64748b;">${item.criadoEm ? new Date(item.criadoEm).toLocaleDateString('pt-BR') : '-'}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Lista de Inscritos — ${evento.titulo}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 25px; color: #1e293b; }
    .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 14px; margin-bottom: 20px; }
    .header h1 { margin: 0 0 6px; font-size: 1.6rem; color: #0f172a; }
    .header p { margin: 0; color: #64748b; font-size: 0.95rem; }
    .meta-box { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; }
    tr:nth-child(even) { background-color: #f8fafc; }
    @media print {
      .no-print { display: none; }
      body { margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 15px; text-align: right;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <div class="header">
    <h1>${evento.titulo}</h1>
    <p>Comunidade Cristã Curados • Relatório Oficial de Inscritos</p>
  </div>
  <div class="meta-box">
    <div><strong>Data do Evento:</strong> ${dataFmt}${horarioFmt} &nbsp;|&nbsp; <strong>Local:</strong> ${evento.local || 'Comunidade Cristã Curados'}</div>
    <div><strong>Total de Inscritos:</strong> <strong>${inscricoes.length}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 40px; text-align: center;">Nº</th>
        <th>Nome do Participante</th>
        <th>Telefone / WhatsApp</th>
        <th>E-mail</th>
        ${headersPerguntas}
        <th style="width: 100px;">Data Inscrição</th>
      </tr>
    </thead>
    <tbody>
      ${linhas || '<tr><td colspan="' + (5 + perguntas.length) + '" style="text-align: center; padding: 2rem;">Nenhum inscrito registrado até o momento.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}

module.exports = {
  listarEventosPainel,
  buscarEventoPainelPorId,
  buscarEventoPainelPorSlug,
  salvarEventoPainel,
  excluirEventoPainel,
  alternarStatusEventoPainel,
  listarInscricoesEventoPainel,
  salvarInscricaoEventoPainel,
  excluirInscricaoEventoPainel,
  enviarInscricaoParaPlanilhaGoogle,
  renderPaginaEventoHtml,
  renderPdfInscritosEventoHtml,
  gerarSlug,
};
