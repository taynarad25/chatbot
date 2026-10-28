const db = require("../db");
const moment = require("moment-timezone");
const { salvarPendente, buscarPendente, removerPendente } = require("../bot/pendentesAprovacao");
const { salvarFormularioEvento, obterFormularioEvento, formatarResumoEventoGrupo, precisaDeValorDoMinisterio, temConteudoRelevante, isMidiaJaFeita } = require("../bot/formularioEvento");
const { notificarSecretaria, notificarMultimidia } = require("../bot/secretaria");
const { REDES } = require("../bot/redes");
const { loadLideres } = require("./lideres");
const { loadUsers } = require("./users");

const CONTATO_TESOURARIA = "+55 11 99111-7612";
const ENDERECO_IGREJA = "Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi";

/**
 * Determina o perfil e permissões do usuário logado
 */
function obterPerfilGestao(session) {
  if (!session) return null;
  const username = String(session.username || "").toLowerCase().trim();
  const role = String(session.role || "").toLowerCase().trim();

  const pastoralMap = {
    'mauricio': { nome: 'Pr. Maurício Lopes', cargo: 'Pastor', departamento: 'Pastoral' },
    'pr.mauricio': { nome: 'Pr. Maurício Lopes', cargo: 'Pastor', departamento: 'Pastoral' },
    'mauriciolopes': { nome: 'Pr. Maurício Lopes', cargo: 'Pastor', departamento: 'Pastoral' },
    'cintia': { nome: 'Pra. Cíntia Lopes', cargo: 'Pastora', departamento: 'Pastoral' },
    'pra.cintia': { nome: 'Pra. Cíntia Lopes', cargo: 'Pastora', departamento: 'Pastoral' },
    'cintialopes': { nome: 'Pra. Cíntia Lopes', cargo: 'Pastora', departamento: 'Pastoral' },
    'idel': { nome: 'Pr. Idel Nascimento', cargo: 'Pastor', departamento: 'Pastoral' },
    'pr.idel': { nome: 'Pr. Idel Nascimento', cargo: 'Pastor', departamento: 'Pastoral' },
    'idelnascimento': { nome: 'Pr. Idel Nascimento', cargo: 'Pastor', departamento: 'Pastoral' },
    'fernanda': { nome: 'Pra. Fernanda Nascimento', cargo: 'Pastora', departamento: 'Pastoral' },
    'pra.fernanda': { nome: 'Pra. Fernanda Nascimento', cargo: 'Pastora', departamento: 'Pastoral' },
    'fernandanascimento': { nome: 'Pra. Fernanda Nascimento', cargo: 'Pastora', departamento: 'Pastoral' },
  };

  const dadosPastoral = pastoralMap[username] || null;

  // Busca líder correspondente no banco
  let liderEncontrado = null;
  try {
    const lideres = loadLideres();
    for (const l of Object.values(lideres)) {
      const nomeNorm = String(l.nome || "").toLowerCase().trim();
      if (nomeNorm.includes(username) || username.includes(nomeNorm) || l.telefone === username) {
        liderEncontrado = l;
        break;
      }
    }
  } catch (_) {}

  const cargos = liderEncontrado?.cargos || [];
  const isPastor = role === 'pastor' || Boolean(dadosPastoral) || cargos.includes('pastor');
  const isDiretor = role === 'diretor' || cargos.includes('diretor');
  const isAdmin = role === 'admin';
  const isLider = true;

  let perfilTitulo = 'Líder';
  let nivelAcesso = 1;
  if (isAdmin) {
    perfilTitulo = 'Administrador';
    nivelAcesso = 4;
  } else if (isPastor) {
    perfilTitulo = 'Pastor';
    nivelAcesso = 3;
  } else if (isDiretor) {
    perfilTitulo = 'Diretor';
    nivelAcesso = 2;
  }

  const nomeExibicao = dadosPastoral?.nome || liderEncontrado?.nome || session.username;
  const telefone = liderEncontrado?.telefone || '';
  const departamentos = liderEncontrado?.departamentos || (dadosPastoral ? ['Pastoral'] : []);

  return {
    username,
    role,
    nome: nomeExibicao,
    telefone,
    perfilTitulo,
    nivelAcesso,
    isAdmin,
    isPastor,
    isDiretor,
    isLider,
    departamentos,
  };
}

/**
 * Lista eventos unificados para exibir no calendário do site
 */
function listarEventosCalendario() {
  const eventos = [];

  // 1. Eventos com fichas e formulários preenchidos
  try {
    const rowsFormularios = db.prepare(`
      SELECT id, evento, departamento, data, dataMaximaDivulgacao, solicitanteId, payload, docUrl, criadoEm
      FROM formularios_eventos
      ORDER BY id DESC LIMIT 100
    `).all();

    for (const r of rowsFormularios) {
      let payload = {};
      try { payload = JSON.parse(r.payload); } catch (_) {}
      
      const horarioIni = payload.horario_inicio || (payload.horario_inicio_termino ? payload.horario_inicio_termino.split('às')[0].trim() : '19:00');
      const horarioFim = payload.horario_termino || (payload.horario_inicio_termino && payload.horario_inicio_termino.includes('às') ? payload.horario_inicio_termino.split('às')[1].trim() : '21:30');

      eventos.push({
        id: `form_${r.id}`,
        origem: 'formulario',
        titulo: r.evento,
        departamento: r.departamento || payload.departamento || 'Geral',
        data: r.data,
        horarioInicio: horarioIni,
        horarioFim: horarioFim,
        local: payload.local || ENDERECO_IGREJA,
        responsavel: payload.nome_lider || payload.solicitanteNome || '',
        docUrl: r.docUrl || '',
        status: 'aprovado',
        tipo: 'evento',
        payload
      });
    }
  } catch (err) {
    console.error('[Gestão Eventos] Erro ao carregar formularios_eventos:', err.message);
  }

  // 2. Eventos Dinâmicos do Painel da Secretaria (painel_eventos)
  try {
    const rowsPainel = db.prepare(`
      SELECT id, slug, titulo, descricao, dataEvento, horario, local, tipoInscricao, ativo
      FROM painel_eventos
      WHERE ativo = 1
      ORDER BY criadoEm DESC LIMIT 50
    `).all();

    for (const p of rowsPainel) {
      if (!eventos.some(e => e.titulo.toLowerCase().trim() === p.titulo.toLowerCase().trim())) {
        eventos.push({
          id: `painel_${p.id}`,
          origem: 'painel',
          titulo: p.titulo,
          departamento: 'Igreja',
          data: p.dataEvento,
          horarioInicio: p.horario || '19:00',
          horarioFim: '',
          local: p.local || ENDERECO_IGREJA,
          responsavel: 'Secretaria',
          docUrl: '',
          status: 'aprovado',
          tipo: 'evento',
          payload: { descricao: p.descricao, slug: p.slug }
        });
      }
    }
  } catch (errPainel) {
    console.error('[Gestão Eventos] Erro ao carregar painel_eventos:', errPainel.message);
  }

  // 3. Solicitações Pendentes (que estão aguardando aprovação da Secretaria)
  try {
    const rowsPendentes = db.prepare(`
      SELECT codigo, dados, criadoEm FROM pendentes ORDER BY criadoEm DESC
    `).all();

    for (const pend of rowsPendentes) {
      try {
        const d = JSON.parse(pend.dados);
        eventos.push({
          id: `pend_${pend.codigo}`,
          origem: 'pendente',
          codigo: pend.codigo,
          titulo: d.nomeEvento || d.evento || d.nome || 'Evento Solicitado',
          departamento: d.rede || d.departamento || 'Geral',
          data: d.dataFormatada || (d.dia && d.mes && d.ano ? `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}/${d.ano}` : ''),
          horarioInicio: d.horarioInicio || '19:00',
          horarioFim: d.horarioFim || '21:30',
          local: d.local || ENDERECO_IGREJA,
          responsavel: d.solicitanteNome || '',
          status: 'pendente_secretaria',
          tipo: d.tipo || 'evento',
          payload: d
        });
      } catch (_) {}
    }
  } catch (errPend) {
    console.error('[Gestão Eventos] Erro ao carregar pendentes:', errPend.message);
  }

  return eventos;
}

/**
 * Cria a solicitação de evento enviada pelo formulário web
 */
async function criarSolicitacaoEventoWeb(corpo, usuarioLogado, getClient = () => null) {
  const {
    nome_lider,
    telefone_lider,
    nome_evento,
    departamento,
    data_evento,
    horario_inicio,
    horario_termino,
    precisa_salao_antes,
    salao_detalhes,
    local,
    publico,
    responsavel_geral,
    convidado,
    louvor,
    decoracao,
    alimentacao,
    equipe,
    materiais,
    cronograma,
    midia_ja_feita,
    paleta,
    estilo,
    prazo_imagem,
    data_maxima_divulgacao,
    valor_inscricao,
    precisa_valor_ministerio,
    tema,
    versiculo,
    objetivo_espiritual,
    observacoes
  } = corpo;

  if (!nome_evento || !nome_evento.trim()) {
    throw new Error('O nome do evento é obrigatório.');
  }
  if (!data_evento) {
    throw new Error('A data do evento é obrigatória.');
  }
  if (!horario_inicio || !horario_termino) {
    throw new Error('Os horários de início e término são obrigatórios.');
  }

  // Normalização de data (aceita DD/MM/AAAA ou AAAA-MM-DD)
  let diaNum, mesNum, anoNum, dataFormatada;
  if (data_evento.includes('-')) {
    const [a, m, d] = data_evento.split('-').map(Number);
    anoNum = a; mesNum = m; diaNum = d;
    dataFormatada = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
  } else {
    const partes = data_evento.split('/').map(Number);
    diaNum = partes[0]; mesNum = partes[1]; anoNum = partes[2] || new Date().getFullYear();
    dataFormatada = `${String(diaNum).padStart(2, '0')}/${String(mesNum).padStart(2, '0')}/${anoNum}`;
  }

  const localFinal = (local && local.trim()) ? local.trim() : ENDERECO_IGREJA;
  const liderFinal = nome_lider?.trim() || usuarioLogado?.nome || usuarioLogado?.username || 'Líder';
  const deptoFinal = departamento?.trim() || 'Outros';

  const horarioTotalTexto = (precisa_salao_antes === 'sim' || precisa_salao_antes === true)
    ? (salao_detalhes?.trim() || 'Sim, necessita uso prévio/posterior do salão.')
    : 'Não';

  const payloadCompleto = {
    nome_lider: liderFinal,
    telefone_lider: telefone_lider || usuarioLogado?.telefone || '',
    nome_evento: nome_evento.trim(),
    departamento: deptoFinal,
    data: dataFormatada,
    data_solicitada: dataFormatada,
    horario_inicio,
    horario_termino,
    horario_inicio_termino: `${horario_inicio} às ${horario_termino}`,
    horario_total: horarioTotalTexto,
    local: localFinal,
    publico: publico?.trim() || 'Toda a igreja',
    responsavel_geral: responsavel_geral?.trim() || liderFinal,
    convidado: convidado?.trim() || 'Não',
    louvor: louvor?.trim() || 'A definir',
    decoracao: decoracao?.trim() || 'Simples',
    alimentacao: alimentacao?.trim() || 'Não',
    equipe: equipe?.trim() || 'Equipe local',
    materiais: materiais?.trim() || 'Nenhum',
    cronograma: cronograma?.trim() || `${horario_inicio} Início, ${horario_termino} Término`,
    midia_ja_feita: (midia_ja_feita === 'sim' || midia_ja_feita === true) ? 'Sim' : 'Não',
    paleta: paleta?.trim() || 'A definir',
    estilo: estilo?.trim() || 'Digital padrão',
    prazo_imagem: prazo_imagem?.trim() || 'Conforme cronograma',
    data_maxima_divulgacao: data_maxima_divulgacao?.trim() || '',
    valor_inscricao: valor_inscricao?.trim() || 'Gratuito',
    precisa_valor_ministerio: (precisa_valor_ministerio === 'sim' || precisa_valor_ministerio === true) ? 'Sim' : 'Não',
    tema: tema?.trim() || 'A definir',
    versiculo: versiculo?.trim() || 'Não',
    objetivo_espiritual: objetivo_espiritual?.trim() || 'Edificação da comunidade e salvação de vidas',
    observacoes: observacoes?.trim() || 'Nenhuma',
    criadoVia: 'painel_web',
    criadoPor: usuarioLogado?.username || 'web'
  };

  const dadosAgendamento = {
    tipo: 'evento',
    nomeEvento: nome_evento.trim(),
    evento: nome_evento.trim(),
    nome: nome_evento.trim(),
    rede: deptoFinal,
    departamento: deptoFinal,
    local: localFinal,
    dia: diaNum,
    mes: mesNum,
    ano: anoNum,
    dataFormatada,
    horarioInicio: horario_inicio,
    horarioFim: horario_termino,
    solicitanteNome: liderFinal,
    solicitanteId: telefone_lider || usuarioLogado?.telefone || '',
    tipoDuracao: 'unico',
    payload: payloadCompleto,
    criadoEm: new Date().toISOString()
  };

  // 1. Salva na tabela pendentes gerando o código único de 4 dígitos
  const codigo = salvarPendente(dadosAgendamento);

  // 2. Registra o formulário no banco
  salvarFormularioEvento({
    evento: nome_evento.trim(),
    departamento: deptoFinal,
    data: dataFormatada,
    dataMaximaDivulgacao: data_maxima_divulgacao || null,
    solicitanteId: telefone_lider || usuarioLogado?.username,
    payload: payloadCompleto,
    docUrl: ''
  });

  // 3. Notificação no WhatsApp da Secretaria
  const querTesouraria = precisa_valor_ministerio === 'sim' || precisa_valor_ministerio === true;
  const tagTesouraria = querTesouraria
    ? `\n\n💰 *Aviso da Tesouraria:* O líder informou que precisará de verba do ministério. Contato da tesouraria: *${CONTATO_TESOURARIA}*`
    : '';

  const avisoGrupo =
    `🎪 *NOVO EVENTO SOLICITADO VIA PAINEL WEB*\n\n` +
    `👤 *Líder Responsável:* ${liderFinal} (${telefone_lider || usuarioLogado?.username})\n` +
    `📅 *Evento:* ${nome_evento.trim()}\n` +
    `🏢 *Departamento:* ${deptoFinal}\n` +
    `📆 *Data:* ${dataFormatada}\n` +
    `⏰ *Horário:* ${horario_inicio} às ${horario_termino}\n` +
    (horarioTotalTexto !== 'Não' ? `⏱️ *Uso do Salão:* ${horarioTotalTexto}\n` : '') +
    `📍 *Local:* ${localFinal}\n` +
    `🎯 *Público:* ${payloadCompleto.publico}\n` +
    (tema ? `✨ *Tema:* ${tema}\n` : '') +
    (versiculo ? `📖 *Versículo:* ${versiculo}\n` : '') +
    `🎨 *Mídia Prévia:* ${payloadCompleto.midia_ja_feita}\n` +
    `💰 *Inscrição:* ${payloadCompleto.valor_inscricao}${tagTesouraria}\n\n` +
    `_Responda a este resumo com "marcar evento" ou "não marcar" para realizar o agendamento automático._\n\n` +
    `_Código: ${codigo}_`;

  let disparadoWhatsApp = false;
  try {
    const client = typeof getClient === 'function' ? getClient() : null;
    if (client && client.info) {
      await notificarSecretaria(client, avisoGrupo);
      disparadoWhatsApp = true;
      console.log(`[Gestão Web] Notificação enviada para a Secretaria via WhatsApp. Código: ${codigo}`);
    } else {
      console.warn(`[Gestão Web] Bot WhatsApp não conectado. Notificação salva com código ${codigo}.`);
    }
  } catch (errZap) {
    console.error(`[Gestão Web] Erro ao disparar mensagem para o WhatsApp da Secretaria:`, errZap.message);
  }

  return {
    ok: true,
    codigo,
    disparadoWhatsApp,
    evento: nome_evento.trim(),
    data: dataFormatada,
    message: `Solicitação registrada com sucesso! A Secretaria foi notificada (Código: ${codigo}).`
  };
}

/**
 * Renderiza o HTML da tela de Gestão de Eventos (/gestao)
 * TEMA: Cinza Claro (Fundo suave #f4f6f8 como o site institucional)
 * OTIMIZADO: Mobile-first (perfeito para celulares de líderes)
 */
function renderGestaoHtml({ user }) {
  const perfil = obterPerfilGestao(user);
  const jsonPerfil = JSON.stringify(perfil || {});

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Gestão de Eventos — Comunidade Cristã Curados</title>
  <link rel="icon" type="image/png" href="/images/logo.png" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --cor-roxo: #7A2BE2;
      --cor-roxo-hover: #6922c4;
      --cor-ciano: #00B7D9;
      --cor-verde: #10b981;
      --cor-amarelo: #f59e0b;
      --cor-vermelho: #ef4444;
      --cor-azul: #2563eb;

      /* PALETA CLARA (Igual ao site principal: #f4f6f8 / #f8f9fa) */
      --cor-fundo: #f4f6f8;
      --cor-card: #ffffff;
      --cor-borda: #e2e8f0;
      --cor-input: #ffffff;
      --cor-input-borda: #cbd5e1;
      --cor-texto: #1e293b;
      --cor-subtexto: #64748b;
      --cor-cinza-suave: #f1f5f9;
      --sombra-card: 0 4px 16px rgba(0, 0, 0, 0.06);
    }

    * { 
      box-sizing: border-box; 
      margin: 0; 
      padding: 0; 
      font-family: 'Montserrat', sans-serif;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background-color: var(--cor-fundo);
      color: var(--cor-texto);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.5;
    }

    /* TOPBAR COMPACTA & RESPONSIVA */
    .topbar {
      background: #121214;
      color: #ffffff;
      padding: 10px 16px;
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 10px rgba(0,0,0,0.15);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: #ffffff;
    }

    .brand img {
      width: 36px;
      height: 36px;
      object-fit: contain;
    }

    .brand-text h1 {
      font-size: 0.95rem;
      font-weight: 800;
      line-height: 1.2;
    }

    .brand-text span {
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--cor-ciano);
      text-transform: uppercase;
      letter-spacing: 1px;
      display: block;
    }

    .user-pill {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .user-name {
      font-size: 0.78rem;
      font-weight: 700;
      color: #f1f5f9;
      max-width: 110px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-badge {
      display: inline-block;
      font-size: 0.62rem;
      font-weight: 800;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--cor-roxo);
      color: #fff;
    }
    .user-badge.pastor { background: var(--cor-azul); }
    .user-badge.diretor { background: var(--cor-ciano); color: #000; }
    .user-badge.admin { background: var(--cor-vermelho); }

    .btn-sair {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #cbd5e1;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 6px 10px;
      border-radius: 6px;
    }

    /* CONTAINER PRINCIPAL (MOBILE FIRST) */
    .main-container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 12px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* BARRA DE AÇÃO RÁPIDA SUPERIOR */
    .quick-bar {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      border-radius: 16px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: var(--sombra-card);
    }
    @media (min-width: 640px) {
      .quick-bar {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
    }

    .quick-bar-title h2 {
      font-size: 1.15rem;
      font-weight: 800;
      color: var(--cor-texto);
    }
    .quick-bar-title p {
      font-size: 0.78rem;
      color: var(--cor-subtexto);
      margin-top: 2px;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--cor-roxo), #9d4edd);
      color: #ffffff;
      border: none;
      padding: 12px 18px;
      border-radius: 12px;
      font-size: 0.92rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 14px rgba(122, 43, 226, 0.3);
      width: 100%;
      min-height: 46px;
    }
    @media (min-width: 640px) {
      .btn-primary {
        width: auto;
      }
    }

    .btn-secondary {
      background: var(--cor-cinza-suave);
      color: var(--cor-texto);
      border: 1px solid var(--cor-borda);
      padding: 10px 16px;
      border-radius: 10px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 42px;
    }

    /* ABAS DE NAVEGAÇÃO */
    .tabs-nav {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
    }

    .tab-btn {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      color: var(--cor-subtexto);
      padding: 9px 14px;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .tab-btn.active {
      color: #ffffff;
      background: var(--cor-roxo);
      border-color: var(--cor-roxo);
      box-shadow: 0 2px 8px rgba(122, 43, 226, 0.3);
    }

    .tab-pane {
      display: none;
    }
    .tab-pane.active {
      display: block;
    }

    /* LAYOUT DO CALENDÁRIO */
    .calendar-layout {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    @media (min-width: 900px) {
      .calendar-layout {
        display: grid;
        grid-template-columns: 1fr 340px;
      }
    }

    .calendar-card {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      border-radius: 18px;
      padding: 14px;
      box-shadow: var(--sombra-card);
    }

    .calendar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .cal-month-year {
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--cor-texto);
      text-transform: capitalize;
    }

    .cal-nav-btn {
      background: var(--cor-cinza-suave);
      border: 1px solid var(--cor-borda);
      color: var(--cor-texto);
      width: 38px;
      height: 38px;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      font-weight: 700;
    }

    .cal-filters {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    @media (max-width: 480px) {
      .cal-filters {
        grid-template-columns: 1fr;
      }
    }

    .select-filtro {
      background: #ffffff;
      border: 1px solid var(--cor-input-borda);
      color: var(--cor-texto);
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 600;
      width: 100%;
      outline: none;
    }

    /* GRID DIAS DA SEMANA */
    .cal-grid-header {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      text-align: center;
      font-weight: 800;
      font-size: 0.72rem;
      color: var(--cor-subtexto);
      text-transform: uppercase;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--cor-borda);
      margin-bottom: 6px;
    }

    .cal-grid-days {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 5px;
    }

    .cal-day {
      min-height: 52px;
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      border-radius: 10px;
      padding: 4px;
      display: flex;
      flex-direction: column;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .cal-day:hover {
      border-color: var(--cor-roxo);
      background: #faf5ff;
    }
    .cal-day.outro-mes {
      background: #f8fafc;
      opacity: 0.35;
    }
    .cal-day.hoje {
      border: 2px solid var(--cor-ciano);
      background: #f0fdfa;
    }
    .cal-day.selecionado {
      border: 2px solid var(--cor-roxo);
      background: #f5f3ff;
      box-shadow: 0 0 0 2px rgba(122, 43, 226, 0.2);
    }

    .day-num {
      font-size: 0.78rem;
      font-weight: 800;
      color: var(--cor-texto);
      text-align: right;
    }
    .cal-day.hoje .day-num {
      color: #0d9488;
    }

    .day-events {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 2px;
      overflow: hidden;
    }

    .event-chip {
      font-size: 0.6rem;
      font-weight: 700;
      padding: 2px 4px;
      border-radius: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      line-height: 1.2;
    }
    .event-chip.aprovado {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #bbf7d0;
    }
    .event-chip.pendente {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
    }
    .event-chip.pastoral {
      background: #dbeafe;
      color: #1e40af;
      border: 1px solid #bfdbfe;
    }

    /* PAINEL LATERAL DO DIA */
    .day-details-panel {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      border-radius: 18px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: var(--sombra-card);
    }

    .day-details-header {
      border-bottom: 1px solid var(--cor-borda);
      padding-bottom: 8px;
    }
    .day-details-header h3 {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--cor-texto);
    }
    .day-details-header p {
      font-size: 0.78rem;
      color: var(--cor-subtexto);
    }

    .day-event-card {
      background: var(--cor-cinza-suave);
      border: 1px solid var(--cor-borda);
      border-radius: 12px;
      padding: 10px;
      margin-bottom: 8px;
    }
    .day-event-card .title {
      font-size: 0.88rem;
      font-weight: 800;
      color: var(--cor-texto);
    }
    .day-event-card .meta {
      font-size: 0.75rem;
      color: var(--cor-subtexto);
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .cal-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 10px;
      font-size: 0.72rem;
      color: var(--cor-subtexto);
      font-weight: 600;
    }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot-verde { background: var(--cor-verde); }
    .dot-amarelo { background: var(--cor-amarelo); }
    .dot-azul { background: var(--cor-azul); }

    /* TABELA / CARDS DE SOLICITAÇÕES */
    .solicitacoes-table-card {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      border-radius: 18px;
      padding: 14px;
      box-shadow: var(--sombra-card);
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
      min-width: 650px;
    }
    th {
      color: var(--cor-subtexto);
      font-weight: 800;
      padding: 10px 12px;
      border-bottom: 1px solid var(--cor-borda);
      text-transform: uppercase;
      font-size: 0.7rem;
      letter-spacing: 0.5px;
      text-align: left;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #f1f5f9;
      color: var(--cor-texto);
    }

    .badge-status {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 800;
    }
    .badge-status.pendente {
      background: #fef3c7;
      color: #92400e;
    }
    .badge-status.aprovado {
      background: #dcfce7;
      color: #166534;
    }

    .badge-codigo {
      font-family: monospace;
      font-size: 0.75rem;
      font-weight: 800;
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      color: var(--cor-roxo);
    }

    /* MODAL DO WIZARD */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 8px;
    }
    .modal-overlay.active {
      display: flex;
    }

    .modal-content {
      background: #ffffff;
      border-radius: 20px;
      width: 100%;
      max-width: 680px;
      max-height: 94vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
      overflow: hidden;
    }

    .modal-header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--cor-borda);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #ffffff;
    }
    .modal-header h3 {
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--cor-texto);
    }

    .modal-close-btn {
      background: var(--cor-cinza-suave);
      border: none;
      color: var(--cor-texto);
      width: 34px;
      height: 34px;
      border-radius: 50%;
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* STEPPER COMPACTO MOBILE */
    .wizard-stepper {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      padding: 8px 12px;
      background: var(--cor-cinza-suave);
      border-bottom: 1px solid var(--cor-borda);
      gap: 4px;
    }

    .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--cor-subtexto);
      text-align: center;
    }
    .step-item.active { color: var(--cor-roxo); }
    .step-item.concluido { color: var(--cor-verde); }

    .step-badge {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #cbd5e1;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      margin-bottom: 2px;
    }
    .step-item.active .step-badge {
      background: var(--cor-roxo);
    }
    .step-item.concluido .step-badge {
      background: var(--cor-verde);
    }

    .modal-body {
      padding: 14px 18px;
      overflow-y: auto;
      flex: 1;
    }

    .form-step { display: none; }
    .form-step.active { display: block; }

    .form-group {
      margin-bottom: 12px;
    }
    .form-group label {
      display: block;
      font-size: 0.82rem;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--cor-texto);
    }
    .form-group .hint {
      font-size: 0.72rem;
      color: var(--cor-subtexto);
      margin-top: 3px;
    }

    .form-control {
      width: 100%;
      padding: 11px 14px;
      background: #ffffff;
      border: 1.5px solid var(--cor-input-borda);
      border-radius: 10px;
      color: var(--cor-texto);
      font-size: 16px; /* Evita auto-zoom no iPhone */
      outline: none;
    }
    .form-control:focus {
      border-color: var(--cor-roxo);
      box-shadow: 0 0 0 3px rgba(122, 43, 226, 0.15);
    }

    textarea.form-control {
      min-height: 70px;
      resize: vertical;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    @media (min-width: 540px) {
      .form-row {
        grid-template-columns: 1fr 1fr;
      }
    }

    .radio-tiles {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .radio-tile {
      background: var(--cor-cinza-suave);
      border: 1.5px solid var(--cor-borda);
      border-radius: 10px;
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--cor-texto);
    }
    .radio-tile.selected {
      border-color: var(--cor-roxo);
      background: #faf5ff;
      color: var(--cor-roxo);
    }

    .modal-footer {
      padding: 12px 18px;
      border-top: 1px solid var(--cor-borda);
      display: flex;
      gap: 8px;
      background: #ffffff;
    }

    .alerta-caixa {
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 0.78rem;
      line-height: 1.4;
      margin-top: 8px;
    }
    .alerta-amarelo {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
    }
    .alerta-verde {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
    }

    /* TOAST */
    #toast-msg {
      position: fixed;
      bottom: 20px;
      left: 16px;
      right: 16px;
      max-width: 400px;
      margin: 0 auto;
      background: #1e293b;
      color: #ffffff;
      padding: 12px 18px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 2000;
      display: none;
      font-size: 0.85rem;
      font-weight: 700;
      text-align: center;
    }
  </style>
</head>
<body>

  <!-- TOPBAR -->
  <header class="topbar">
    <a href="/home" class="brand">
      <img src="/logo.png" alt="Logo Curados" />
      <div class="brand-text">
        <h1>Comunidade Cristã Curados</h1>
        <span>Gestão de Eventos</span>
      </div>
    </a>

    <div class="user-pill">
      <div style="text-align: right;">
        <div class="user-name">${perfil?.nome || 'Usuário'}</div>
        <span class="user-badge ${perfil?.role}">${perfil?.perfilTitulo || 'Líder'}</span>
      </div>
      <button class="btn-sair" onclick="window.location.href='/secretaria/login'">Sair</button>
    </div>
  </header>

  <!-- CONTAINER PRINCIPAL -->
  <main class="main-container">

    <!-- BARRA RÁPIDA / NOVO AGENDAMENTO -->
    <section class="quick-bar">
      <div class="quick-bar-title">
        <h2>🎪 Agendamentos da Igreja</h2>
        <p>Agende eventos para o seu ministério. A aprovação é solicitada diretamente à Secretaria pelo WhatsApp.</p>
      </div>
      <div>
        <button class="btn-primary" onclick="abrirModalAgendamento()">
          <span>➕</span> Novo Agendamento
        </button>
      </div>
    </section>

    <!-- NAVEGAÇÃO DE ABAS -->
    <nav class="tabs-nav">
      <button class="tab-btn active" id="btn-tab-calendario" onclick="trocarAba('calendario')">
        📅 Calendário
      </button>
      <button class="tab-btn" id="btn-tab-solicitacoes" onclick="trocarAba('solicitacoes')">
        📋 Solicitações <span id="badge-total-solicitacoes" style="background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:999px; font-size:0.7rem;">0</span>
      </button>
      <button class="tab-btn" id="btn-tab-fichas" onclick="trocarAba('fichas')">
        📄 Fichas
      </button>
      ${(perfil?.isPastor || perfil?.isAdmin || perfil?.isDiretor) ? `
      <button class="tab-btn" id="btn-tab-pastoral" onclick="trocarAba('pastoral')">
        🤝 Pastoral
      </button>` : ''}
    </nav>

    <!-- ABA 1: CALENDÁRIO -->
    <section id="pane-calendario" class="tab-pane active">
      <div class="calendar-layout">
        
        <!-- CALENDÁRIO GRID -->
        <div class="calendar-card">
          <div class="calendar-header">
            <span id="cal-mes-ano" class="cal-month-year">Carregando mês...</span>
            <div style="display: flex; gap: 6px;">
              <button class="cal-nav-btn" onclick="mudarMes(-1)">‹</button>
              <button class="cal-nav-btn" onclick="irParaHoje()" style="font-size:0.75rem; width:auto; padding:0 8px;">Hoje</button>
              <button class="cal-nav-btn" onclick="mudarMes(1)">›</button>
            </div>
          </div>

          <!-- FILTROS -->
          <div class="cal-filters">
            <select id="filtro-depto" class="select-filtro" onchange="renderizarCalendario()">
              <option value="">🏢 Todos os Ministérios</option>
              ${REDES.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('')}
            </select>

            <select id="filtro-status" class="select-filtro" onchange="renderizarCalendario()">
              <option value="">Status: Todos</option>
              <option value="aprovado">Apenas Confirmados</option>
              <option value="pendente_secretaria">Apenas Pendentes</option>
            </select>
          </div>

          <!-- DIAS DA SEMANA -->
          <div class="cal-grid-header">
            <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
          </div>

          <!-- GRADE DOS DIAS -->
          <div id="cal-grid-dias" class="cal-grid-days">
            <!-- Gerado via JS -->
          </div>

          <!-- LEGENDA -->
          <div class="cal-legend">
            <div class="legend-item"><span class="legend-dot dot-verde"></span> Confirmado</div>
            <div class="legend-item"><span class="legend-dot dot-amarelo"></span> Aguardando Secretaria</div>
            <div class="legend-item"><span class="legend-dot dot-azul"></span> Pastoral</div>
          </div>
        </div>

        <!-- DETALHES DO DIA SELECIONADO -->
        <aside class="day-details-panel">
          <div class="day-details-header">
            <h3 id="panel-data-selecionada">Data Selecionada</h3>
            <p id="panel-dia-semana">Toque em qualquer dia no calendário</p>
          </div>

          <div id="panel-eventos-dia" style="flex: 1; max-height: 280px; overflow-y: auto;">
            <div style="text-align: center; padding: 1.5rem 0; color: var(--cor-subtexto); font-size: 0.82rem;">
              Nenhum evento registrado nesta data.<br><br>💡 Salão <b>livre</b>!
            </div>
          </div>

          <button id="btn-agendar-neste-dia" class="btn-primary" onclick="abrirModalComDataSelecionada()">
            ➕ Agendar neste Dia
          </button>
        </aside>

      </div>
    </section>

    <!-- ABA 2: MINHAS SOLICITAÇÕES -->
    <section id="pane-solicitacoes" class="tab-pane">
      <div class="solicitacoes-table-card">
        <h3 style="margin-bottom: 10px; font-size: 1.05rem; font-weight: 800;">Histórico de Solicitações</h3>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Evento</th>
              <th>Ministério</th>
              <th>Data</th>
              <th>Horário</th>
              <th>Responsável</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="tabela-solicitacoes-corpo">
            <tr>
              <td colspan="8" style="text-align: center; padding: 1.5rem; color: var(--cor-subtexto);">
                Carregando solicitações...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ABA 3: FICHAS DE EVENTOS -->
    <section id="pane-fichas" class="tab-pane">
      <div class="solicitacoes-table-card">
        <h3 style="margin-bottom: 8px; font-size: 1.05rem; font-weight: 800;">Fichas e Documentos dos Eventos</h3>
        <p style="color: var(--cor-subtexto); font-size: 0.8rem; margin-bottom: 12px;">
          Consulte o formulário com todas as respostas e o link oficial do Google Docs.
        </p>
        <div id="lista-fichas-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;">
          <!-- Carregado via JS -->
        </div>
      </div>
    </section>

    <!-- ABA 4: ÁREA PASTORAL -->
    ${(perfil?.isPastor || perfil?.isAdmin || perfil?.isDiretor) ? `
    <section id="pane-pastoral" class="tab-pane">
      <div class="solicitacoes-table-card">
        <h3 style="margin-bottom: 6px; font-size: 1.05rem; font-weight: 800;">Área Pastoral & Atendimentos</h3>
        <p style="color: var(--cor-subtexto); font-size: 0.8rem; margin-bottom: 12px;">
          Visão unificada dos atendimentos pastorais, discípulos e autorizações de salão.
        </p>
        <div id="lista-atendimentos-pastorais" style="display: flex; flex-direction: column; gap: 8px;">
          <div style="color: var(--cor-subtexto); font-size: 0.82rem; padding: 1rem 0;">Nenhum atendimento pendente de autorização.</div>
        </div>
      </div>
    </section>` : ''}

  </main>

  <!-- MODAL DE NOVO AGENDAMENTO (WIZARD 4 ETAPAS) -->
  <div id="modal-agendamento" class="modal-overlay">
    <div class="modal-content">

      <!-- CABEÇALHO MODAL -->
      <div class="modal-header">
        <div>
          <h3>Novo Agendamento de Evento</h3>
          <p style="font-size: 0.72rem; color: var(--cor-subtexto);">Formulário guiado enviado diretamente à Secretaria</p>
        </div>
        <button class="modal-close-btn" onclick="fecharModalAgendamento()">✕</button>
      </div>

      <!-- STEPPER -->
      <div class="wizard-stepper">
        <div class="step-item active" id="step-ind-1">
          <span class="step-badge">1</span>
          <span>Data/Hora</span>
        </div>
        <div class="step-item" id="step-ind-2">
          <span class="step-badge">2</span>
          <span>Estrutura</span>
        </div>
        <div class="step-item" id="step-ind-3">
          <span class="step-badge">3</span>
          <span>Mídia</span>
        </div>
        <div class="step-item" id="step-ind-4">
          <span class="step-badge">4</span>
          <span>Propósito</span>
        </div>
      </div>

      <!-- CORPO DO FORMULÁRIO -->
      <form id="form-novo-evento" onsubmit="event.preventDefault(); submeterFormularioEvento();">
        <div class="modal-body">

          <!-- ETAPA 1: DATA E HORÁRIO -->
          <div id="step-1" class="form-step active">
            <div class="form-row">
              <div class="form-group">
                <label>👤 Nome do Líder Responsável *</label>
                <input type="text" id="f-nome-lider" class="form-control" value="${perfil?.nome || ''}" required placeholder="Seu nome completo" />
              </div>
              <div class="form-group">
                <label>📱 WhatsApp do Líder *</label>
                <input type="tel" id="f-telefone-lider" class="form-control" value="${perfil?.telefone || ''}" required placeholder="(11) 99999-9999" />
              </div>
            </div>

            <div class="form-group">
              <label>📅 Nome Oficial do Evento *</label>
              <input type="text" id="f-nome-evento" class="form-control" required placeholder="Ex: Culto de Mulheres: O Vaso e o Oleiro" />
            </div>

            <div class="form-group">
              <label>🏢 Departamento / Ministério *</label>
              <select id="f-departamento" class="form-control" required>
                <option value="">Selecione o departamento...</option>
                ${REDES.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('')}
              </select>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>📆 Data do Evento *</label>
                <input type="date" id="f-data-evento" class="form-control" required />
              </div>
              <div class="form-group" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <div>
                  <label>⏰ Início *</label>
                  <input type="time" id="f-horario-inicio" class="form-control" value="19:00" required />
                </div>
                <div>
                  <label>⏰ Término *</label>
                  <input type="time" id="f-horario-termino" class="form-control" value="21:30" required />
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>🏛️ Uso do salão antes, depois ou no dia anterior?</label>
              <div class="radio-tiles">
                <label class="radio-tile selected" id="tile-salao-nao" onclick="toggleUsoSalao('nao')">
                  <input type="radio" name="r-salao" value="nao" checked style="display:none;" />
                  <span>❌ Não precisa</span>
                </label>
                <label class="radio-tile" id="tile-salao-sim" onclick="toggleUsoSalao('sim')">
                  <input type="radio" name="r-salao" value="sim" style="display:none;" />
                  <span>🛠️ Sim (Montagem)</span>
                </label>
              </div>
              <div id="campo-salao-detalhes" style="display:none; margin-top:8px;">
                <input type="text" id="f-salao-detalhes" class="form-control" placeholder="Ex: Dia anterior das 18h às 21h e no dia a partir das 17h" />
                <div class="hint">Especifique os horários exatos para reserva e preparação do espaço.</div>
              </div>
            </div>
          </div>

          <!-- ETAPA 2: ESTRUTURA E LOCAL -->
          <div id="step-2" class="form-step">
            <div class="form-group">
              <label>📍 Local do Evento *</label>
              <input type="text" id="f-local" class="form-control" value="${ENDERECO_IGREJA}" required />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>🎯 Público-Alvo *</label>
                <input type="text" id="f-publico" class="form-control" placeholder="Ex: Mulheres, Jovens, Toda a Igreja" required />
              </div>
              <div class="form-group">
                <label>👔 Responsável Geral no Dia</label>
                <input type="text" id="f-responsavel-geral" class="form-control" placeholder="Quem coordenará no dia do evento" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>🎤 Haverá convidado especial?</label>
                <input type="text" id="f-convidado" class="form-control" placeholder="Banda, pregador ou 'Não'" />
              </div>
              <div class="form-group">
                <label>🎵 Louvor Definido?</label>
                <input type="text" id="f-louvor" class="form-control" placeholder="Equipe local / A definir" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>🎈 Decoração</label>
                <input type="text" id="f-decoracao" class="form-control" placeholder="Simples / Flores / Responsável" />
              </div>
              <div class="form-group">
                <label>☕ Haverá Alimentação?</label>
                <input type="text" id="f-alimentacao" class="form-control" placeholder="Coffee break / Lanche / Não" />
              </div>
            </div>

            <div class="form-group">
              <label>👥 Equipe de Apoio (Pré, Durante e Limpeza Pós-evento)</label>
              <input type="text" id="f-equipe" class="form-control" placeholder="Como será dividida a equipe de apoio" />
            </div>

            <div class="form-group">
              <label>📦 Materiais e Equipamentos Necessários</label>
              <input type="text" id="f-materiais" class="form-control" placeholder="Ex: Som, microfones, projetor, mesas" />
            </div>

            <div class="form-group">
              <label>⏱️ Cronograma Previsto</label>
              <textarea id="f-cronograma" class="form-control" placeholder="Ex: 19h Abertura, 19h30 Louvor, 20h Palavra, 21h30 Término"></textarea>
            </div>
          </div>

          <!-- ETAPA 3: MÍDIA E DIVULGAÇÃO -->
          <div id="step-3" class="form-step">
            <div class="form-group">
              <label>🎨 A arte/mídia já foi feita previamente com a equipe? *</label>
              <div class="radio-tiles">
                <label class="radio-tile selected" id="tile-midia-nao" onclick="toggleMidiaPrevia('nao')">
                  <input type="radio" name="r-midia" value="nao" checked style="display:none;" />
                  <span>📢 Não (Preciso de artes)</span>
                </label>
                <label class="radio-tile" id="tile-midia-sim" onclick="toggleMidiaPrevia('sim')">
                  <input type="radio" name="r-midia" value="sim" style="display:none;" />
                  <span>✅ Sim (Arte já pronta)</span>
                </label>
              </div>
            </div>

            <div id="secao-campos-midia">
              <div class="form-group">
                <label>🎨 Paleta de Cores (Identidade Visual)</label>
                <input type="text" id="f-paleta" class="form-control" placeholder="Ex: Dourado, branco e azul marinho" />
              </div>

              <div class="form-group">
                <label>📱 Mídias e Estilo Visual Desejado</label>
                <textarea id="f-estilo" class="form-control" placeholder="Ex: Flyer feed/stories, telão; estilo elegante. Se houver banner impresso, informe medidas"></textarea>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>📢 Prazo para as Artes Prontas</label>
                  <input type="text" id="f-prazo-imagem" class="form-control" placeholder="Ex: Até 10 dias antes do evento" />
                </div>
                <div class="form-group">
                  <label>🗓️ Data Máxima para Início da Divulgação</label>
                  <input type="text" id="f-data-maxima-divulgacao" class="form-control" placeholder="Ex: DD/MM/AAAA ou 'Não haverá'" />
                </div>
              </div>
            </div>
          </div>

          <!-- ETAPA 4: TESOURARIA & PROPÓSITO ESPIRITUAL -->
          <div id="step-4" class="form-step">
            <div class="form-row">
              <div class="form-group">
                <label>💰 Cobrança de Inscrição ou Taxa? *</label>
                <input type="text" id="f-valor-inscricao" class="form-control" value="Gratuito" placeholder="Gratuito ou R$ 30,00" required />
              </div>
              <div class="form-group">
                <label>🏛️ Vai precisar de valor/verba do ministério? *</label>
                <select id="f-precisa-valor-ministerio" class="form-control" onchange="toggleAlertaTesouraria(this.value)">
                  <option value="nao">Não</option>
                  <option value="sim">Sim (Solicita investimento)</option>
                </select>
              </div>
            </div>

            <div id="alerta-tesouraria" class="alerta-caixa alerta-amarelo" style="display:none;">
              ⚠️ <b>Aviso:</b> Como o evento precisará de verba, alinhe os valores diretamente com a Tesouraria pelo WhatsApp: <b>${CONTATO_TESOURARIA}</b>.
            </div>

            <div class="form-row" style="margin-top: 8px;">
              <div class="form-group">
                <label>✨ Tema Oficial do Evento</label>
                <input type="text" id="f-tema" class="form-control" placeholder="Ex: O Poder da Oração" />
              </div>
              <div class="form-group">
                <label>📖 Versículo Base</label>
                <input type="text" id="f-versiculo" class="form-control" placeholder="Ex: Jeremias 33:3" />
              </div>
            </div>

            <div class="form-group">
              <label>🙏 Objetivo Espiritual do Evento *</label>
              <textarea id="f-objetivo-espiritual" class="form-control" placeholder="Propósito principal do evento e o impacto esperado na vida das pessoas..." required></textarea>
            </div>

            <div class="form-group">
              <label>📝 Observações Gerais</label>
              <input type="text" id="f-observacoes" class="form-control" placeholder="Detalhes extras importantes" />
            </div>

            <div class="alerta-caixa alerta-verde">
              🧹 <b>Lembrete de Entrega do Salão:</b> As dependências devem ser entregues limpas e organizadas, exatamente da forma como foram encontradas.
            </div>
          </div>

        </div>

        <!-- RODAPÉ MODAL -->
        <div class="modal-footer">
          <button type="button" id="btn-wizard-anterior" class="btn-secondary" onclick="navegarEtapa(-1)" style="display:none;">
            ← Voltar
          </button>
          <div style="flex:1;"></div>
          <button type="button" id="btn-wizard-proximo" class="btn-primary" onclick="navegarEtapa(1)">
            Avançar →
          </button>
          <button type="submit" id="btn-wizard-concluir" class="btn-primary" style="display:none; background: linear-gradient(135deg, var(--cor-verde), #059669);">
            🚀 Enviar para Secretaria
          </button>
        </div>
      </form>

    </div>
  </div>

  <!-- MODAL DE DETALHES DA FICHA -->
  <div id="modal-ficha-detalhe" class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="ficha-detalhe-titulo">Ficha do Evento</h3>
        <button class="modal-close-btn" onclick="fecharModalFicha()">✕</button>
      </div>
      <div class="modal-body" id="ficha-detalhe-conteudo" style="font-size:0.85rem; line-height:1.6;">
        <!-- Preenchido via JS -->
      </div>
    </div>
  </div>

  <!-- TOAST NOTIFICAÇÃO -->
  <div id="toast-msg"></div>

  <script>
    // DADOS INICIAIS
    const PERFIL_ATUAL = ${jsonPerfil};

    let mesAtual = new Date().getMonth();
    let anoAtual = new Date().getFullYear();
    let dataSelecionadaIso = '';
    let etapaWizardAtual = 1;

    let todosEventos = [];
    let todasSolicitacoes = [];

    // EXECUTA IMEDIATAMENTE (NÃO DEPENDE EXCLUSIVAMENTE DE DOMContentLoaded)
    function iniciarPainel() {
      renderizarCalendario();
      carregarEventosServidor();
      carregarSolicitacoesServidor();
      carregarFichasServidor();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', iniciarPainel);
    } else {
      iniciarPainel();
    }

    // CONTROLE DE ABAS
    function trocarAba(nomeAba) {
      document.querySelectorAll('.tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
      document.querySelectorAll('.tab-pane').forEach(function(pane) { pane.classList.remove('active'); });

      const btnAlvo = document.getElementById('btn-tab-' + nomeAba);
      if (btnAlvo) btnAlvo.classList.add('active');

      const paneAlvo = document.getElementById('pane-' + nomeAba);
      if (paneAlvo) paneAlvo.classList.add('active');
    }

    // CARREGAR DADOS DO SERVIDOR
    async function carregarEventosServidor() {
      try {
        const res = await fetch('/gestao/api/eventos');
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.eventos)) {
          todosEventos = data.eventos;
          renderizarCalendario();
        }
      } catch (err) {
        console.warn('Aviso ao carregar eventos:', err);
      }
    }

    async function carregarSolicitacoesServidor() {
      try {
        const res = await fetch('/gestao/api/solicitacoes');
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.solicitacoes)) {
          todasSolicitacoes = data.solicitacoes;
          renderizarTabelaSol();
        }
      } catch (err) {
        console.warn('Aviso ao carregar solicitações:', err);
      }
    }

    async function carregarFichasServidor() {
      try {
        const res = await fetch('/gestao/api/fichas');
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.fichas)) {
          renderizarFichas(data.fichas);
        }
      } catch (err) {
        console.warn('Aviso ao carregar fichas:', err);
      }
    }

    // RENDERIZAR CALENDÁRIO
    function renderizarCalendario() {
      const elMesAno = document.getElementById('cal-mes-ano');
      const elGridDias = document.getElementById('cal-grid-dias');
      if (!elMesAno || !elGridDias) return;

      const filtroDepto = (document.getElementById('filtro-depto')?.value || '').toLowerCase().trim();
      const filtroStatus = document.getElementById('filtro-status')?.value || '';

      const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      elMesAno.textContent = nomesMeses[mesAtual] + ' de ' + anoAtual;

      elGridDias.innerHTML = '';

      const primeiroDiaSemana = new Date(anoAtual, mesAtual, 1).getDay();
      const totalDiasMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
      const totalDiasMesAnterior = new Date(anoAtual, mesAtual, 0).getDate();

      const hoje = new Date();
      const hojeDia = hoje.getDate();
      const hojeMes = hoje.getMonth();
      const hojeAno = hoje.getFullYear();

      // Dias do mês anterior
      for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
        const diaNum = totalDiasMesAnterior - i;
        const cell = document.createElement('div');
        cell.className = 'cal-day outro-mes';
        cell.innerHTML = '<span class="day-num">' + diaNum + '</span>';
        elGridDias.appendChild(cell);
      }

      // Dias do mês atual
      for (let d = 1; d <= totalDiasMes; d++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day';
        
        const isHoje = (d === hojeDia && mesAtual === hojeMes && anoAtual === hojeAno);
        if (isHoje) cell.classList.add('hoje');

        const diaFormatado = String(d).padStart(2, '0') + '/' + String(mesAtual + 1).padStart(2, '0') + '/' + anoAtual;
        const diaIso = anoAtual + '-' + String(mesAtual + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');

        if (diaIso === dataSelecionadaIso) {
          cell.classList.add('selecionado');
        }

        // Filtra eventos do dia
        const eventosDoDia = todosEventos.filter(function(ev) {
          let bateData = false;
          if (ev.data) {
            const dataLimpa = String(ev.data).trim();
            if (dataLimpa.includes('/')) {
              bateData = dataLimpa.startsWith(String(d).padStart(2, '0') + '/' + String(mesAtual + 1).padStart(2, '0'));
            } else if (dataLimpa.includes('-')) {
              bateData = dataLimpa.startsWith(diaIso);
            }
          }
          if (!bateData) return false;
          if (filtroDepto && !String(ev.departamento || '').toLowerCase().includes(filtroDepto)) return false;
          if (filtroStatus && ev.status !== filtroStatus) return false;
          return true;
        });

        let chipsHtml = '';
        eventosDoDia.slice(0, 2).forEach(function(ev) {
          const classeChip = ev.status === 'pendente_secretaria' ? 'pendente' : (ev.tipo === 'pastoral' ? 'pastoral' : 'aprovado');
          chipsHtml += '<span class="event-chip ' + classeChip + '">' + (ev.horarioInicio ? ev.horarioInicio + ' ' : '') + ev.titulo + '</span>';
        });

        if (eventosDoDia.length > 2) {
          chipsHtml += '<span style="font-size:0.58rem; color:var(--cor-subtexto); font-weight:700;">+' + (eventosDoDia.length - 2) + ' mais</span>';
        }

        cell.innerHTML = '<span class="day-num">' + d + '</span><div class="day-events">' + chipsHtml + '</div>';

        // Anexa listener diretamente ao elemento (zero risco de aspas escapadas)
        (function(diaCapturado, diaIsoCapturado, evsCapturados) {
          cell.addEventListener('click', function() {
            selecionarDia(diaCapturado, mesAtual, anoAtual, diaIsoCapturado, evsCapturados);
          });
        })(d, diaIso, eventosDoDia);

        elGridDias.appendChild(cell);
      }

      // Se não havia dia selecionado, seleciona o dia de hoje
      if (!dataSelecionadaIso) {
        const diaPadrao = isHojeNoMes() ? hojeDia : 1;
        const diaIsoPadrao = anoAtual + '-' + String(mesAtual + 1).padStart(2, '0') + '-' + String(diaPadrao).padStart(2, '0');
        const eventosPadrao = todosEventos.filter(function(e) {
          return e.data && (e.data.includes(diaIsoPadrao) || e.data.startsWith(String(diaPadrao).padStart(2, '0') + '/' + String(mesAtual + 1).padStart(2, '0')));
        });
        selecionarDia(diaPadrao, mesAtual, anoAtual, diaIsoPadrao, eventosPadrao);
      }
    }

    function isHojeNoMes() {
      const h = new Date();
      return h.getMonth() === mesAtual && h.getFullYear() === anoAtual;
    }

    function mudarMes(delta) {
      mesAtual += delta;
      if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual++;
      } else if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual--;
      }
      dataSelecionadaIso = '';
      renderizarCalendario();
    }

    function irParaHoje() {
      const h = new Date();
      mesAtual = h.getMonth();
      anoAtual = h.getFullYear();
      dataSelecionadaIso = '';
      renderizarCalendario();
    }

    // CLIQUE NO DIA DO CALENDÁRIO
    function selecionarDia(dia, mes, ano, diaIso, eventos) {
      dataSelecionadaIso = diaIso;

      document.querySelectorAll('.cal-day').forEach(function(el) { el.classList.remove('selecionado'); });
      const diaCells = document.querySelectorAll('.cal-day:not(.outro-mes)');
      if (diaCells[dia - 1]) diaCells[dia - 1].classList.add('selecionado');

      const dataFmt = String(dia).padStart(2, '0') + '/' + String(mes + 1).padStart(2, '0') + '/' + ano;
      const dataObj = new Date(ano, mes, dia);
      const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

      const elDataSel = document.getElementById('panel-data-selecionada');
      const elSemana = document.getElementById('panel-dia-semana');
      if (elDataSel) elDataSel.textContent = dataFmt;
      if (elSemana) elSemana.textContent = diasSemana[dataObj.getDay()];

      const containerEventos = document.getElementById('panel-eventos-dia');
      if (!containerEventos) return;
      containerEventos.innerHTML = '';

      if (!eventos || eventos.length === 0) {
        containerEventos.innerHTML = '<div style="text-align: center; padding: 1.5rem 0; color: var(--cor-subtexto); font-size: 0.82rem;">Nenhum evento registrado nesta data.<br><br>💡 Salão <b>disponível</b>!</div>';
        return;
      }

      eventos.forEach(function(ev) {
        const card = document.createElement('div');
        card.className = 'day-event-card';
        const statusTexto = ev.status === 'pendente_secretaria' ? '⏳ Aguardando Aprovação' : '✅ Confirmado';
        const statusCor = ev.status === 'pendente_secretaria' ? '#d97706' : '#16a34a';

        card.innerHTML = 
          '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">' +
            '<div class="title">' + ev.titulo + '</div>' +
            '<span style="font-size:0.68rem; font-weight:800; color:' + statusCor + ';">' + statusTexto + '</span>' +
          '</div>' +
          '<div class="meta">' +
            '<div>🏢 <b>Ministério:</b> ' + (ev.departamento || 'Geral') + '</div>' +
            '<div>⏰ <b>Horário:</b> ' + (ev.horarioInicio || '') + (ev.horarioFim ? ' às ' + ev.horarioFim : '') + '</div>' +
            '<div>📍 <b>Local:</b> ' + (ev.local || 'Igreja') + '</div>' +
            (ev.responsavel ? '<div>👤 <b>Responsável:</b> ' + ev.responsavel + '</div>' : '') +
          '</div>';
        containerEventos.appendChild(card);
      });
    }

    function abrirModalComDataSelecionada() {
      abrirModalAgendamento(dataSelecionadaIso);
    }

    // TABELA DE SOLICITAÇÕES
    function renderizarTabelaSol() {
      const tbody = document.getElementById('tabela-solicitacoes-corpo');
      const badge = document.getElementById('badge-total-solicitacoes');
      if (badge) badge.textContent = todasSolicitacoes.length;
      if (!tbody) return;

      if (!todasSolicitacoes || todasSolicitacoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.5rem; color:var(--cor-subtexto);">Nenhuma solicitação encontrada no momento.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      todasSolicitacoes.forEach(function(sol) {
        const tr = document.createElement('tr');
        const statusClass = sol.status === 'aprovado' ? 'aprovado' : 'pendente';
        const statusLabel = sol.status === 'aprovado' ? '✅ Aprovado' : '⏳ Aguardando Secretaria';

        const tdCod = document.createElement('td');
        tdCod.innerHTML = '<span class="badge-codigo">' + (sol.codigo || '—') + '</span>';
        tr.appendChild(tdCod);

        const tdTit = document.createElement('td');
        tdTit.style.fontWeight = '800';
        tdTit.textContent = sol.titulo;
        tr.appendChild(tdTit);

        const tdDep = document.createElement('td');
        tdDep.textContent = sol.departamento || 'Geral';
        tr.appendChild(tdDep);

        const tdDat = document.createElement('td');
        tdDat.textContent = sol.data || '—';
        tr.appendChild(tdDat);

        const tdHor = document.createElement('td');
        tdHor.textContent = (sol.horarioInicio || '') + (sol.horarioFim ? ' às ' + sol.horarioFim : '');
        tr.appendChild(tdHor);

        const tdResp = document.createElement('td');
        tdResp.textContent = sol.responsavel || '—';
        tr.appendChild(tdResp);

        const tdStatus = document.createElement('td');
        tdStatus.innerHTML = '<span class="badge-status ' + statusClass + '">' + statusLabel + '</span>';
        tr.appendChild(tdStatus);

        const tdAcoes = document.createElement('td');
        const btnVer = document.createElement('button');
        btnVer.className = 'btn-secondary';
        btnVer.style.padding = '4px 10px';
        btnVer.style.fontSize = '0.72rem';
        btnVer.style.minHeight = 'auto';
        btnVer.textContent = 'Ver Ficha';
        btnVer.addEventListener('click', function() {
          visualizarDetalhesSolicitacao(sol);
        });
        tdAcoes.appendChild(btnVer);
        tr.appendChild(tdAcoes);

        tbody.appendChild(tr);
      });
    }

    // FICHAS DOS EVENTOS
    function renderizarFichas(fichas) {
      const container = document.getElementById('lista-fichas-container');
      if (!container) return;

      if (!fichas || fichas.length === 0) {
        container.innerHTML = '<div style="color:var(--cor-subtexto); font-size:0.85rem;">Nenhuma ficha preenchida até o momento.</div>';
        return;
      }
      container.innerHTML = '';
      fichas.forEach(function(f) {
        const card = document.createElement('div');
        card.className = 'day-event-card';
        card.style.padding = '14px';

        card.innerHTML = 
          '<div style="font-size:0.95rem; font-weight:800; color:var(--cor-texto); margin-bottom:4px;">' + f.evento + '</div>' +
          '<div class="meta" style="font-size:0.75rem; margin-bottom:10px;">' +
            '<div>🏢 <b>Departamento:</b> ' + (f.departamento || 'Geral') + '</div>' +
            '<div>📆 <b>Data:</b> ' + (f.data || '—') + '</div>' +
            (f.docUrl ? '<div>🔗 <a href="' + f.docUrl + '" target="_blank" style="color:var(--cor-roxo); font-weight:700;">Abrir no Google Docs ↗</a></div>' : '') +
          '</div>';

        const btnDetalhe = document.createElement('button');
        btnDetalhe.className = 'btn-secondary';
        btnDetalhe.style.width = '100%';
        btnDetalhe.style.fontSize = '0.75rem';
        btnDetalhe.style.minHeight = '34px';
        btnDetalhe.textContent = '📄 Ver Respostas Completas';
        btnDetalhe.addEventListener('click', function() {
          abrirFichaDetalhe(f);
        });

        card.appendChild(btnDetalhe);
        container.appendChild(card);
      });
    }

    // MODAL DE DETALHES DA FICHA
    function abrirFichaDetalhe(ficha) {
      const modal = document.getElementById('modal-ficha-detalhe');
      const titulo = document.getElementById('ficha-detalhe-titulo');
      const conteudo = document.getElementById('ficha-detalhe-conteudo');
      if (!modal || !conteudo) return;

      titulo.textContent = ficha.evento || 'Detalhes do Evento';

      let p = ficha.payload || {};
      if (typeof p === 'string') {
        try { p = JSON.parse(p); } catch(_) {}
      }

      conteudo.innerHTML = 
        '<div style="margin-bottom:12px; padding:10px; background:#f8fafc; border-radius:10px;">' +
          '<div><b>📅 Evento:</b> ' + (ficha.evento || p.nome_evento || '—') + '</div>' +
          '<div><b>🏢 Departamento:</b> ' + (ficha.departamento || p.departamento || '—') + '</div>' +
          '<div><b>📆 Data:</b> ' + (ficha.data || p.data || '—') + '</div>' +
          '<div><b>⏰ Horário:</b> ' + (p.horario_inicio_termino || p.horario || '—') + '</div>' +
          '<div><b>👤 Líder:</b> ' + (p.nome_lider || p.solicitanteNome || '—') + '</div>' +
          '<div><b>📍 Local:</b> ' + (p.local || '—') + '</div>' +
          '<div><b>🎯 Público:</b> ' + (p.publico || '—') + '</div>' +
          '<div><b>🎤 Convidado:</b> ' + (p.convidado || 'Não') + '</div>' +
          '<div><b>🎵 Louvor:</b> ' + (p.louvor || '—') + '</div>' +
          '<div><b>🎨 Paleta de Cores:</b> ' + (p.paleta || p.cores || '—') + '</div>' +
          '<div><b>📱 Mídias e Estilo:</b> ' + (p.estilo || p.midias || '—') + '</div>' +
          '<div><b>💰 Inscrição:</b> ' + (p.valor_inscricao || 'Gratuito') + '</div>' +
          '<div><b>🏛️ Verba Ministério:</b> ' + (p.precisa_valor_ministerio || 'Não') + '</div>' +
          '<div><b>✨ Tema:</b> ' + (p.tema || '—') + '</div>' +
          '<div><b>📖 Versículo:</b> ' + (p.versiculo || '—') + '</div>' +
          '<div><b>🙏 Propósito:</b> ' + (p.objetivo_espiritual || '—') + '</div>' +
          (ficha.docUrl ? '<div style="margin-top:8px;"><b>🔗 Google Docs:</b> <a href="' + ficha.docUrl + '" target="_blank" style="color:var(--cor-roxo); font-weight:700;">Acessar Documento Oficial</a></div>' : '') +
        '</div>';

      modal.classList.add('active');
    }

    function fecharModalFicha() {
      const modal = document.getElementById('modal-ficha-detalhe');
      if (modal) modal.classList.remove('active');
    }

    function visualizarDetalhesSolicitacao(sol) {
      abrirFichaDetalhe(sol);
    }

    // MODAL DO WIZARD
    function abrirModalAgendamento(dataPrevia) {
      const modal = document.getElementById('modal-agendamento');
      if (!modal) return;
      modal.classList.add('active');
      etapaWizardAtual = 1;
      atualizarPassosWizard();

      const campoData = document.getElementById('f-data-evento');
      if (campoData) {
        if (dataPrevia) {
          campoData.value = dataPrevia;
        } else if (!campoData.value) {
          campoData.value = new Date().toISOString().split('T')[0];
        }
      }
    }

    function fecharModalAgendamento() {
      const modal = document.getElementById('modal-agendamento');
      if (modal) modal.classList.remove('active');
    }

    function navegarEtapa(delta) {
      if (delta > 0 && !validarEtapaAtual(etapaWizardAtual)) {
        return;
      }

      etapaWizardAtual += delta;
      if (etapaWizardAtual < 1) etapaWizardAtual = 1;
      if (etapaWizardAtual > 4) etapaWizardAtual = 4;

      atualizarPassosWizard();
    }

    function atualizarPassosWizard() {
      for (let i = 1; i <= 4; i++) {
        const elStep = document.getElementById('step-' + i);
        const elInd = document.getElementById('step-ind-' + i);
        if (elStep) elStep.classList.toggle('active', i === etapaWizardAtual);
        if (elInd) {
          elInd.classList.toggle('active', i === etapaWizardAtual);
          elInd.classList.toggle('concluido', i < etapaWizardAtual);
        }
      }

      const btnAnt = document.getElementById('btn-wizard-anterior');
      const btnProx = document.getElementById('btn-wizard-proximo');
      const btnConc = document.getElementById('btn-wizard-concluir');

      if (btnAnt) btnAnt.style.display = etapaWizardAtual > 1 ? 'inline-flex' : 'none';
      if (btnProx) btnProx.style.display = etapaWizardAtual < 4 ? 'inline-flex' : 'none';
      if (btnConc) btnConc.style.display = etapaWizardAtual === 4 ? 'inline-flex' : 'none';
    }

    function validarEtapaAtual(etapa) {
      if (etapa === 1) {
        const lider = (document.getElementById('f-nome-lider')?.value || '').trim();
        const zap = (document.getElementById('f-telefone-lider')?.value || '').trim();
        const evento = (document.getElementById('f-nome-evento')?.value || '').trim();
        const depto = document.getElementById('f-departamento')?.value || '';
        const data = document.getElementById('f-data-evento')?.value || '';

        if (!lider || !zap || !evento || !depto || !data) {
          mostrarToast('⚠️ Preencha os campos obrigatórios da Etapa 1.');
          return false;
        }
      } else if (etapa === 2) {
        const publico = (document.getElementById('f-publico')?.value || '').trim();
        if (!publico) {
          mostrarToast('⚠️ Informe o público-alvo do evento.');
          return false;
        }
      }
      return true;
    }

    function toggleUsoSalao(valor) {
      const tileNao = document.getElementById('tile-salao-nao');
      const tileSim = document.getElementById('tile-salao-sim');
      const campoDet = document.getElementById('campo-salao-detalhes');

      if (valor === 'sim') {
        tileSim.classList.add('selected');
        tileNao.classList.remove('selected');
        tileSim.querySelector('input').checked = true;
        if (campoDet) campoDet.style.display = 'block';
      } else {
        tileNao.classList.add('selected');
        tileSim.classList.remove('selected');
        tileNao.querySelector('input').checked = true;
        if (campoDet) campoDet.style.display = 'none';
      }
    }

    function toggleMidiaPrevia(valor) {
      const tileNao = document.getElementById('tile-midia-nao');
      const tileSim = document.getElementById('tile-midia-sim');
      const camposMidia = document.getElementById('secao-campos-midia');

      if (valor === 'sim') {
        tileSim.classList.add('selected');
        tileNao.classList.remove('selected');
        tileSim.querySelector('input').checked = true;
        if (camposMidia) camposMidia.style.display = 'none';
      } else {
        tileNao.classList.add('selected');
        tileSim.classList.remove('selected');
        tileNao.querySelector('input').checked = true;
        if (camposMidia) camposMidia.style.display = 'block';
      }
    }

    function toggleAlertaTesouraria(valor) {
      const alerta = document.getElementById('alerta-tesouraria');
      if (alerta) alerta.style.display = (valor === 'sim') ? 'block' : 'none';
    }

    // SUBMISSÃO DO FORMULÁRIO DE EVENTO
    async function submeterFormularioEvento() {
      const btnConcluir = document.getElementById('btn-wizard-concluir');
      if (btnConcluir) {
        btnConcluir.disabled = true;
        btnConcluir.textContent = 'Enviando...';
      }

      const payload = {
        nome_lider: document.getElementById('f-nome-lider')?.value || '',
        telefone_lider: document.getElementById('f-telefone-lider')?.value || '',
        nome_evento: document.getElementById('f-nome-evento')?.value || '',
        departamento: document.getElementById('f-departamento')?.value || '',
        data_evento: document.getElementById('f-data-evento')?.value || '',
        horario_inicio: document.getElementById('f-horario-inicio')?.value || '',
        horario_termino: document.getElementById('f-horario-termino')?.value || '',
        precisa_salao_antes: document.querySelector('input[name="r-salao"]:checked')?.value || 'nao',
        salao_detalhes: document.getElementById('f-salao-detalhes')?.value || '',
        local: document.getElementById('f-local')?.value || '',
        publico: document.getElementById('f-publico')?.value || '',
        responsavel_geral: document.getElementById('f-responsavel-geral')?.value || '',
        convidado: document.getElementById('f-convidado')?.value || '',
        louvor: document.getElementById('f-louvor')?.value || '',
        decoracao: document.getElementById('f-decoracao')?.value || '',
        alimentacao: document.getElementById('f-alimentacao')?.value || '',
        equipe: document.getElementById('f-equipe')?.value || '',
        materiais: document.getElementById('f-materiais')?.value || '',
        cronograma: document.getElementById('f-cronograma')?.value || '',
        midia_ja_feita: document.querySelector('input[name="r-midia"]:checked')?.value || 'nao',
        paleta: document.getElementById('f-paleta')?.value || '',
        estilo: document.getElementById('f-estilo')?.value || '',
        prazo_imagem: document.getElementById('f-prazo-imagem')?.value || '',
        data_maxima_divulgacao: document.getElementById('f-data-maxima-divulgacao')?.value || '',
        valor_inscricao: document.getElementById('f-valor-inscricao')?.value || '',
        precisa_valor_ministerio: document.getElementById('f-precisa-valor-ministerio')?.value || 'nao',
        tema: document.getElementById('f-tema')?.value || '',
        versiculo: document.getElementById('f-versiculo')?.value || '',
        objetivo_espiritual: document.getElementById('f-objetivo-espiritual')?.value || '',
        observacoes: document.getElementById('f-observacoes')?.value || ''
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data && data.ok) {
          fecharModalAgendamento();
          mostrarToast('🎉 Evento solicitado com sucesso! Código: ' + data.codigo);
          carregarEventosServidor();
          carregarSolicitacoesServidor();
          carregarFichasServidor();
          trocarAba('solicitacoes');
        } else {
          alert('Erro ao enviar solicitação: ' + (data.message || 'Falha no servidor.'));
        }
      } catch (err) {
        console.error('Erro na submissão:', err);
        alert('Erro ao comunicar com o servidor. Tente novamente.');
      } finally {
        if (btnConcluir) {
          btnConcluir.disabled = false;
          btnConcluir.textContent = '🚀 Enviar para Secretaria';
        }
      }
    }

    function mostrarToast(mensagem) {
      const toast = document.getElementById('toast-msg');
      if (!toast) return;
      toast.textContent = mensagem;
      toast.style.display = 'block';
      setTimeout(function() { toast.style.display = 'none'; }, 5500);
    }
  </script>
</body>
</html>`;
}

module.exports = {
  obterPerfilGestao,
  listarEventosCalendario,
  criarSolicitacaoEventoWeb,
  renderGestaoHtml
};
