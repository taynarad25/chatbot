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
  const lideres = loadLideres();
  let liderEncontrado = null;
  for (const l of Object.values(lideres)) {
    const nomeNorm = String(l.nome || "").toLowerCase().trim();
    if (nomeNorm.includes(username) || username.includes(nomeNorm) || l.telefone === username) {
      liderEncontrado = l;
      break;
    }
  }

  const cargos = liderEncontrado?.cargos || [];
  const isPastor = role === 'pastor' || Boolean(dadosPastoral) || cargos.includes('pastor');
  const isDiretor = role === 'diretor' || cargos.includes('diretor');
  const isAdmin = role === 'admin';
  const isLider = true; // Todo usuário autenticado nessa área tem ao menos nível de líder

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
      // Evita duplicatas se já veio de formularios_eventos
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

  // Estrutura para fila de aprovação da secretaria (compatível com bot/pendentesAprovacao)
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

  // 2. Registra o formulário no banco (para histórico e consulta)
  salvarFormularioEvento({
    evento: nome_evento.trim(),
    departamento: deptoFinal,
    data: dataFormatada,
    dataMaximaDivulgacao: data_maxima_divulgacao || null,
    solicitanteId: telefone_lider || usuarioLogado?.username,
    payload: payloadCompleto,
    docUrl: ''
  });

  // 3. Monta e dispara a notificação no WhatsApp da Secretaria
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
      console.warn(`[Gestão Web] Bot WhatsApp não está conectado no momento. Notificação ficará salva no banco com código ${codigo}.`);
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
 */
function renderGestaoHtml({ user }) {
  const perfil = obterPerfilGestao(user);
  const jsonPerfil = JSON.stringify(perfil || {});

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gestão de Eventos — Comunidade Cristã Curados</title>
  <link rel="icon" type="image/png" href="/images/logo.png" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --cor-ciano: #00bcd4;
      --cor-roxo: #7b2cbf;
      --cor-roxo-claro: #9d4edd;
      --cor-laranja: #ff7d00;
      --cor-verde: #10b981;
      --cor-amarelo: #f59e0b;
      --cor-vermelho: #ef4444;
      --cor-azul: #3b82f6;
      --cor-fundo: #0d0d12;
      --cor-card: #16161f;
      --cor-card-hover: #1e1e2b;
      --cor-input: #21212e;
      --cor-borda: rgba(255, 255, 255, 0.09);
      --cor-texto: #f3f4f6;
      --cor-subtexto: #9ca3af;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Montserrat', sans-serif; }

    body {
      background-color: var(--cor-fundo);
      background-image: 
        radial-gradient(at 0% 0%, rgba(123, 44, 191, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(0, 188, 212, 0.12) 0px, transparent 50%);
      color: var(--cor-texto);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* TOPBAR */
    .topbar {
      background: rgba(22, 22, 31, 0.85);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--cor-borda);
      padding: 0.9rem 1.5rem;
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: #fff;
    }

    .brand img {
      width: 42px;
      height: 42px;
      object-fit: contain;
      filter: drop-shadow(0 0 10px rgba(0, 188, 212, 0.4));
    }

    .brand-text h1 {
      font-size: 1.05rem;
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    .brand-text span {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--cor-ciano);
      text-transform: uppercase;
      letter-spacing: 1.5px;
      display: block;
    }

    .user-pill {
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(255, 255, 255, 0.05);
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid var(--cor-borda);
    }

    .user-info {
      text-align: right;
    }

    .user-name {
      font-size: 0.82rem;
      font-weight: 700;
      color: #fff;
    }

    .user-badge {
      display: inline-block;
      font-size: 0.65rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      padding: 2px 7px;
      border-radius: 6px;
      background: linear-gradient(135deg, var(--cor-roxo), var(--cor-roxo-claro));
      color: #fff;
    }

    .user-badge.pastor {
      background: linear-gradient(135deg, #1d4ed8, #3b82f6);
    }
    .user-badge.diretor {
      background: linear-gradient(135deg, #0d9488, #00bcd4);
    }
    .user-badge.admin {
      background: linear-gradient(135deg, #b91c1c, #ef4444);
    }

    .btn-sair {
      background: transparent;
      border: none;
      color: var(--cor-subtexto);
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 6px 10px;
      border-radius: 8px;
      transition: all 0.2s;
    }
    .btn-sair:hover {
      color: var(--cor-vermelho);
      background: rgba(239, 68, 68, 0.1);
    }

    /* CONTAINER PRINCIPAL */
    .main-container {
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      padding: 1.5rem;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* CABEÇALHO DA PÁGINA COM AÇÕES */
    .page-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      background: var(--cor-card);
      border: 1px solid var(--cor-borda);
      border-radius: 20px;
      padding: 1.4rem 1.8rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }

    .page-title h2 {
      font-size: 1.45rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .page-title p {
      color: var(--cor-subtexto);
      font-size: 0.85rem;
      margin-top: 4px;
    }

    .header-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--cor-roxo), var(--cor-roxo-claro));
      color: #fff;
      border: none;
      padding: 0.85rem 1.6rem;
      border-radius: 12px;
      font-size: 0.92rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 6px 20px rgba(123, 44, 191, 0.4);
      transition: all 0.25s ease;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(123, 44, 191, 0.6);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--cor-texto);
      border: 1px solid var(--cor-borda);
      padding: 0.85rem 1.4rem;
      border-radius: 12px;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    /* ABAS DE NAVEGAÇÃO */
    .tabs-nav {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--cor-borda);
      padding-bottom: 0.5rem;
      overflow-x: auto;
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--cor-subtexto);
      padding: 0.75rem 1.3rem;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .tab-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.04);
    }
    .tab-btn.active {
      color: var(--cor-ciano);
      background: rgba(0, 188, 212, 0.12);
      border-bottom: 2px solid var(--cor-ciano);
    }

    /* CONTEÚDO DAS ABAS */
    .tab-pane {
      display: none;
    }
    .tab-pane.active {
      display: block;
    }

    /* GRID DO CALENDÁRIO */
    .calendar-layout {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 1.5rem;
    }
    @media (max-width: 1024px) {
      .calendar-layout {
        grid-template-columns: 1fr;
      }
    }

    .calendar-card {
      background: var(--cor-card);
      border: 1px solid var(--cor-borda);
      border-radius: 20px;
      padding: 1.5rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }

    .calendar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.2rem;
    }

    .cal-title-wrapper {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .cal-month-year {
      font-size: 1.3rem;
      font-weight: 800;
      text-transform: capitalize;
    }

    .cal-nav-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--cor-borda);
      color: #fff;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      transition: all 0.2s;
    }
    .cal-nav-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--cor-ciano);
    }

    .cal-filters {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .select-filtro {
      background: var(--cor-input);
      border: 1px solid var(--cor-borda);
      color: var(--cor-texto);
      padding: 0.55rem 0.9rem;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 600;
      outline: none;
    }

    /* GRID DIAS DO MÊS */
    .cal-grid-header {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      text-align: center;
      font-weight: 700;
      font-size: 0.78rem;
      color: var(--cor-subtexto);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .cal-grid-days {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 8px;
    }

    .cal-day {
      aspect-ratio: 1;
      min-height: 85px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 14px;
      padding: 6px;
      display: flex;
      flex-direction: column;
      position: relative;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .cal-day:hover {
      background: rgba(0, 188, 212, 0.08);
      border-color: rgba(0, 188, 212, 0.3);
      transform: translateY(-2px);
    }
    .cal-day.outro-mes {
      opacity: 0.3;
    }
    .cal-day.hoje {
      border: 2px solid var(--cor-ciano);
      background: rgba(0, 188, 212, 0.06);
    }
    .cal-day.selecionado {
      border: 2px solid var(--cor-roxo-claro);
      box-shadow: 0 0 15px rgba(157, 78, 221, 0.4);
    }

    .day-num {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--cor-subtexto);
      margin-bottom: 4px;
    }
    .cal-day.hoje .day-num {
      color: var(--cor-ciano);
      font-weight: 800;
    }

    .day-events {
      display: flex;
      flex-direction: column;
      gap: 3px;
      overflow: hidden;
      flex: 1;
    }

    .event-chip {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 2px 5px;
      border-radius: 5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #fff;
    }
    .event-chip.aprovado {
      background: rgba(16, 185, 129, 0.25);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
    }
    .event-chip.pendente {
      background: rgba(245, 158, 11, 0.25);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fbbf24;
    }
    .event-chip.pastoral {
      background: rgba(59, 130, 246, 0.25);
      border: 1px solid rgba(59, 130, 246, 0.4);
      color: #60a5fa;
    }

    /* PAINEL LATERAL DE DETALHES DO DIA */
    .day-details-panel {
      background: var(--cor-card);
      border: 1px solid var(--cor-borda);
      border-radius: 20px;
      padding: 1.4rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      height: fit-content;
    }

    .day-details-header {
      border-bottom: 1px solid var(--cor-borda);
      padding-bottom: 0.8rem;
    }
    .day-details-header h3 {
      font-size: 1.1rem;
      font-weight: 800;
    }
    .day-details-header p {
      font-size: 0.8rem;
      color: var(--cor-subtexto);
    }

    .events-list-empty {
      text-align: center;
      padding: 2rem 1rem;
      color: var(--cor-subtexto);
      font-size: 0.85rem;
    }

    .day-event-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--cor-borda);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 10px;
      transition: all 0.2s;
    }
    .day-event-card:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(0, 188, 212, 0.3);
    }
    .day-event-card .title {
      font-size: 0.9rem;
      font-weight: 700;
      color: #fff;
    }
    .day-event-card .meta {
      font-size: 0.75rem;
      color: var(--cor-subtexto);
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    /* LEGENDA DO CALENDÁRIO */
    .cal-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 1rem;
      font-size: 0.78rem;
      color: var(--cor-subtexto);
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .dot-verde { background: var(--cor-verde); }
    .dot-amarelo { background: var(--cor-amarelo); }
    .dot-azul { background: var(--cor-azul); }

    /* TABELA / CARDS DE SOLICITAÇÕES */
    .solicitacoes-table-card {
      background: var(--cor-card);
      border: 1px solid var(--cor-borda);
      border-radius: 20px;
      padding: 1.5rem;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.85rem;
    }

    th {
      color: var(--cor-subtexto);
      font-weight: 700;
      padding: 12px 14px;
      border-bottom: 1px solid var(--cor-borda);
      text-transform: uppercase;
      font-size: 0.72rem;
      letter-spacing: 1px;
    }

    td {
      padding: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--cor-texto);
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    .badge-status {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .badge-status.pendente {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .badge-status.aprovado {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .badge-codigo {
      font-family: monospace;
      font-size: 0.78rem;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.07);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--cor-ciano);
    }

    /* MODAL DO FORMULÁRIO (WIZARD DE 4 ETAPAS) */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.82);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .modal-overlay.active {
      display: flex;
    }

    .modal-content {
      background: #181824;
      border: 1px solid var(--cor-borda);
      border-radius: 24px;
      width: 100%;
      max-width: 760px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
      position: relative;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      padding: 1.5rem 1.8rem;
      border-bottom: 1px solid var(--cor-borda);
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      background: #181824;
      z-index: 10;
    }

    .modal-header h3 {
      font-size: 1.25rem;
      font-weight: 800;
    }

    .modal-close-btn {
      background: transparent;
      border: none;
      color: var(--cor-subtexto);
      font-size: 1.5rem;
      cursor: pointer;
      line-height: 1;
      padding: 4px 8px;
      border-radius: 8px;
    }
    .modal-close-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
    }

    /* STEPPER */
    .wizard-stepper {
      display: flex;
      justify-content: space-between;
      padding: 1.2rem 1.8rem;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--cor-borda);
    }

    .step-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--cor-subtexto);
    }
    .step-item.active {
      color: var(--cor-ciano);
    }
    .step-item.concluido {
      color: var(--cor-verde);
    }

    .step-badge {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
    }
    .step-item.active .step-badge {
      background: var(--cor-ciano);
      color: #000;
    }
    .step-item.concluido .step-badge {
      background: var(--cor-verde);
      color: #000;
    }

    .modal-body {
      padding: 1.8rem;
      flex: 1;
    }

    .form-step {
      display: none;
    }
    .form-step.active {
      display: block;
    }

    .form-group {
      margin-bottom: 1.2rem;
    }

    .form-group label {
      display: block;
      font-size: 0.82rem;
      font-weight: 700;
      margin-bottom: 6px;
      color: #e5e7eb;
    }
    .form-group .hint {
      font-size: 0.72rem;
      color: var(--cor-subtexto);
      margin-top: 4px;
    }

    .form-control {
      width: 100%;
      padding: 0.85rem 1.1rem;
      background: var(--cor-input);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      color: #fff;
      font-size: 0.9rem;
      outline: none;
      transition: all 0.2s;
    }
    .form-control:focus {
      border-color: var(--cor-ciano);
      box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.2);
    }

    textarea.form-control {
      min-height: 80px;
      resize: vertical;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    @media (max-width: 600px) {
      .form-row {
        grid-template-columns: 1fr;
      }
    }

    /* RADIO TILES */
    .radio-tiles {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .radio-tile {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--cor-borda);
      border-radius: 12px;
      padding: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      transition: all 0.2s;
    }
    .radio-tile:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .radio-tile.selected {
      border-color: var(--cor-ciano);
      background: rgba(0, 188, 212, 0.1);
      color: var(--cor-ciano);
    }

    .modal-footer {
      padding: 1.2rem 1.8rem;
      border-top: 1px solid var(--cor-borda);
      display: flex;
      justify-content: space-between;
      position: sticky;
      bottom: 0;
      background: #181824;
      z-index: 10;
    }

    .alerta-caixa {
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 0.82rem;
      line-height: 1.4;
      margin-top: 10px;
    }
    .alerta-amarelo {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fde68a;
    }
    .alerta-verde {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #a7f3d0;
    }

    /* TOAST */
    #toast-msg {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1f2937;
      color: #fff;
      padding: 14px 20px;
      border-radius: 12px;
      border: 1px solid var(--cor-borda);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      z-index: 2000;
      display: none;
      font-size: 0.88rem;
      font-weight: 600;
      align-items: center;
      gap: 10px;
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

    <div style="display: flex; align-items: center; gap: 12px;">
      <div class="user-pill">
        <div class="user-info">
          <div class="user-name">${perfil?.nome || 'Usuário'}</div>
          <span class="user-badge ${perfil?.role}">${perfil?.perfilTitulo || 'Líder'}</span>
        </div>
      </div>
      <button class="btn-sair" onclick="window.location.href='/secretaria/login'">Sair</button>
    </div>
  </header>

  <!-- MAIN -->
  <main class="main-container">

    <!-- HEADER DA PÁGINA -->
    <section class="page-header">
      <div class="page-title">
        <h2>🎪 Painel de Eventos e Agendamentos</h2>
        <p>Agende eventos para o seu ministério com envio automático para aprovação da Secretaria no WhatsApp.</p>
      </div>

      <div class="header-actions">
        <button class="btn-primary" onclick="abrirModalAgendamento()">
          <span>➕</span> Novo Agendamento
        </button>
      </div>
    </section>

    <!-- NAVEGAÇÃO POR ABAS -->
    <nav class="tabs-nav">
      <button class="tab-btn active" onclick="trocarAba('calendario')">
        📅 Calendário & Disponibilidade
      </button>
      <button class="tab-btn" onclick="trocarAba('solicitacoes')">
        📋 Minhas Solicitações <span id="badge-total-solicitacoes" style="background:rgba(255,255,255,0.1); padding:2px 7px; border-radius:999px; font-size:0.75rem;">...</span>
      </button>
      <button class="tab-btn" onclick="trocarAba('fichas')">
        📄 Fichas de Eventos
      </button>
      ${(perfil?.isPastor || perfil?.isAdmin || perfil?.isDiretor) ? `
      <button class="tab-btn" onclick="trocarAba('pastoral')">
        🤝 Área Pastoral
      </button>` : ''}
    </nav>

    <!-- ABA 1: CALENDÁRIO -->
    <section id="pane-calendario" class="tab-pane active">
      <div class="calendar-layout">
        
        <!-- CALENDÁRIO GRID -->
        <div class="calendar-card">
          <div class="calendar-header">
            <div class="cal-title-wrapper">
              <span id="cal-mes-ano" class="cal-month-year">Carregando...</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="cal-nav-btn" onclick="mudarMes(-1)">‹</button>
              <button class="cal-nav-btn" onclick="irParaHoje()" style="font-size:0.75rem; width:auto; padding:0 10px; font-weight:700;">Hoje</button>
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
              <option value="aprovado">Apenas Confirmados (Verde)</option>
              <option value="pendente_secretaria">Apenas Pendentes (Amarelo)</option>
            </select>
          </div>

          <!-- DIAS DA SEMANA -->
          <div class="cal-grid-header">
            <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
          </div>

          <!-- DIAS DO MÊS -->
          <div id="cal-grid-dias" class="cal-grid-days">
            <!-- Gerado via JS -->
          </div>

          <!-- LEGENDA -->
          <div class="cal-legend">
            <div class="legend-item"><span class="legend-dot dot-verde"></span> Evento Confirmado</div>
            <div class="legend-item"><span class="legend-dot dot-amarelo"></span> Aguardando Secretaria (WhatsApp)</div>
            <div class="legend-item"><span class="legend-dot dot-azul"></span> Atendimento Pastoral</div>
          </div>
        </div>

        <!-- PAINEL LATERAL DO DIA SELECIONADO -->
        <aside class="day-details-panel">
          <div class="day-details-header">
            <h3 id="panel-data-selecionada">Selecione um dia</h3>
            <p id="panel-dia-semana">Clique em uma data no calendário</p>
          </div>

          <div id="panel-eventos-dia" style="flex: 1; overflow-y: auto; max-height: 480px;">
            <div class="events-list-empty">
              Nenhum evento neste dia.
            </div>
          </div>

          <button id="btn-agendar-neste-dia" class="btn-primary" style="width: 100%; justify-content: center;" onclick="abrirModalComDataSelecionada()">
            ➕ Agendar neste Dia
          </button>
        </aside>

      </div>
    </section>

    <!-- ABA 2: MINHAS SOLICITAÇÕES -->
    <section id="pane-solicitacoes" class="tab-pane">
      <div class="solicitacoes-table-card">
        <h3 style="margin-bottom: 1rem; font-size: 1.15rem; font-weight: 800;">Histórico de Solicitações</h3>
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
              <td colspan="8" style="text-align: center; padding: 2rem; color: var(--cor-subtexto);">
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
        <h3 style="margin-bottom: 1rem; font-size: 1.15rem; font-weight: 800;">Fichas e Documentos Oficiais dos Eventos</h3>
        <p style="color: var(--cor-subtexto); font-size: 0.85rem; margin-bottom: 1.2rem;">
          Consulte o formulário detalhado preenchido pelos líderes e o link do documento oficial do Google Docs.
        </p>
        <div id="lista-fichas-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem;">
          <!-- Carregado via JS -->
        </div>
      </div>
    </section>

    <!-- ABA 4: ÁREA PASTORAL -->
    ${(perfil?.isPastor || perfil?.isAdmin || perfil?.isDiretor) ? `
    <section id="pane-pastoral" class="tab-pane">
      <div class="solicitacoes-table-card">
        <h3 style="margin-bottom: 0.5rem; font-size: 1.15rem; font-weight: 800;">Área Pastoral & Atendimentos</h3>
        <p style="color: var(--cor-subtexto); font-size: 0.85rem; margin-bottom: 1.2rem;">
          Visão unificada dos atendimentos pastorais, orientações e autorizações de salão.
        </p>
        <div id="lista-atendimentos-pastorais" style="display: flex; flex-direction: column; gap: 10px;">
          <!-- Carregado via JS -->
        </div>
      </div>
    </section>` : ''}

  </main>

  <!-- MODAL DE NOVO AGENDAMENTO (4 ETAPAS) -->
  <div id="modal-agendamento" class="modal-overlay">
    <div class="modal-content">

      <!-- CABEÇALHO DO MODAL -->
      <div class="modal-header">
        <div>
          <h3>Novo Agendamento de Evento</h3>
          <p style="font-size: 0.78rem; color: var(--cor-subtexto);">Preenchimento guiado com notificação direta para a Secretaria</p>
        </div>
        <button class="modal-close-btn" onclick="fecharModalAgendamento()">✕</button>
      </div>

      <!-- STEPPER INDICADOR -->
      <div class="wizard-stepper">
        <div class="step-item active" id="step-ind-1">
          <span class="step-badge">1</span>
          <span>Data & Horário</span>
        </div>
        <div class="step-item" id="step-ind-2">
          <span class="step-badge">2</span>
          <span>Estrutura & Local</span>
        </div>
        <div class="step-item" id="step-ind-3">
          <span class="step-badge">3</span>
          <span>Mídia & Artes</span>
        </div>
        <div class="step-item" id="step-ind-4">
          <span class="step-badge">4</span>
          <span>Tesouraria & Propósito</span>
        </div>
      </div>

      <!-- CORPO DO FORMULÁRIO -->
      <form id="form-novo-evento" onsubmit="event.preventDefault(); submeterFormularioEvento();">
        <div class="modal-body">

          <!-- ETAPA 1: DADOS BÁSICOS & DATA -->
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
                <label class="radio-tile selected" onclick="toggleUsoSalao('nao', this)">
                  <input type="radio" name="r-salao" value="nao" checked style="display:none;" />
                  <span>❌ Não precisa de horário extra</span>
                </label>
                <label class="radio-tile" onclick="toggleUsoSalao('sim', this)">
                  <input type="radio" name="r-salao" value="sim" style="display:none;" />
                  <span>🛠️ Sim (Montagem / Decoração)</span>
                </label>
              </div>
              <div id="campo-salao-detalhes" style="display:none; margin-top:10px;">
                <input type="text" id="f-salao-detalhes" class="form-control" placeholder="Ex: Dia anterior das 18h às 21h e no dia das 17h às 19h" />
                <div class="hint">Especifique os horários exatos para reserva e preparação do espaço.</div>
              </div>
            </div>
          </div>

          <!-- ETAPA 2: ESTRUTURA, LOCAL & PROGRAMAÇÃO -->
          <div id="step-2" class="form-step">
            <div class="form-group">
              <label>📍 Local do Evento *</label>
              <input type="text" id="f-local" class="form-control" value="${ENDERECO_IGREJA}" required />
              <div class="hint">Padrão da igreja: ${ENDERECO_IGREJA}</div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>🎯 Público-Alvo *</label>
                <input type="text" id="f-publico" class="form-control" placeholder="Ex: Mulheres, Jovens, Toda a Igreja" required />
              </div>
              <div class="form-group">
                <label>👔 Responsável Geral no Dia *</label>
                <input type="text" id="f-responsavel-geral" class="form-control" placeholder="Quem coordenará no dia do evento" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>🎤 Haverá convidado especial (banda, pregador)?</label>
                <input type="text" id="f-convidado" class="form-control" placeholder="Nome do convidado ou 'Não'" />
              </div>
              <div class="form-group">
                <label>🎵 Louvor Definido?</label>
                <input type="text" id="f-louvor" class="form-control" placeholder="Ex: Equipe local / A definir" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>🎈 Decoração</label>
                <input type="text" id="f-decoracao" class="form-control" placeholder="Ex: Simples / Flores / Responsável" />
              </div>
              <div class="form-group">
                <label>☕ Haverá Alimentação?</label>
                <input type="text" id="f-alimentacao" class="form-control" placeholder="Ex: Coffee break / Lanche / Não" />
              </div>
            </div>

            <div class="form-group">
              <label>👥 Equipe de Apoio (Pré, Durante e Pós-evento / Limpeza)</label>
              <input type="text" id="f-equipe" class="form-control" placeholder="Como será dividida a equipe de montagem e limpeza" />
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

          <!-- ETAPA 3: MÍDIA & DIVULGAÇÃO -->
          <div id="step-3" class="form-step">
            <div class="form-group">
              <label>🎨 A arte/mídia já foi feita previamente com a equipe de multimídia? *</label>
              <div class="radio-tiles">
                <label class="radio-tile selected" onclick="toggleMidiaPrevia('nao', this)">
                  <input type="radio" name="r-midia" value="nao" checked style="display:none;" />
                  <span>📢 Não (Preciso de artes/divulgação)</span>
                </label>
                <label class="radio-tile" onclick="toggleMidiaPrevia('sim', this)">
                  <input type="radio" name="r-midia" value="sim" style="display:none;" />
                  <span>✅ Sim (Já está pronta/alinhada)</span>
                </label>
              </div>
            </div>

            <!-- CAMPOS DINÂMICOS DE MÍDIA -->
            <div id="secao-campos-midia">
              <div class="form-group">
                <label>🎨 Paleta de Cores (Identidade Visual)</label>
                <input type="text" id="f-paleta" class="form-control" placeholder="Ex: Dourado, branco e azul marinho" />
              </div>

              <div class="form-group">
                <label>📱 Mídias e Estilo Visual Desejado</label>
                <textarea id="f-estilo" class="form-control" placeholder="Ex: Flyer feed/stories, telão; estilo jovem e minimalista. Se houver banner impresso, informe medidas (ex: 1x2m)"></textarea>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>📢 Prazo Desejado para as Artes Prontas</label>
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
                <input type="text" id="f-valor-inscricao" class="form-control" value="Gratuito" placeholder="Ex: Gratuito ou R$ 30,00" required />
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
              ⚠️ <b>Atenção:</b> Como o evento precisará de verba, lembre-se de alinhar os valores e necessidades diretamente com a Tesouraria pelo WhatsApp: <b>${CONTATO_TESOURARIA}</b>.
            </div>

            <div class="form-row" style="margin-top: 1rem;">
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
              <textarea id="f-objetivo-espiritual" class="form-control" placeholder="Descreva o propósito principal do evento e o impacto esperado na vida das pessoas..." required></textarea>
            </div>

            <div class="form-group">
              <label>📝 Observações Gerais / Necessidades Extras</label>
              <input type="text" id="f-observacoes" class="form-control" placeholder="Detalhes extras importantes" />
            </div>

            <div class="alerta-caixa alerta-verde">
              🧹 <b>Lembrete de Entrega do Salão:</b> As dependências da igreja devem ser entregues após o evento limpas e organizadas, exatamente da forma como foram encontradas.
            </div>
          </div>

        </div>

        <!-- RODAPÉ DO WIZARD -->
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

  <!-- TOAST NOTIFICAÇÃO -->
  <div id="toast-msg"></div>

  <script>
    // DADOS INICIAIS INJETADOS
    const PERFIL_ATUAL = ${jsonPerfil};

    let mesAtual = new Date().getMonth();
    let anoAtual = new Date().getFullYear();
    let dataSelecionadaIso = '';
    let etapaWizardAtual = 1;

    let todosEventos = [];
    let todasSolicitacoes = [];

    // INICIALIZAÇÃO
    document.addEventListener('DOMContentLoaded', () => {
      carregarEventosServidor();
      carregarSolicitacoesServidor();
      carregarFichasServidor();
    });

    // CONTROLE DE ABAS
    function trocarAba(nomeAba) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

      const btnAlvo = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(nomeAba));
      if (btnAlvo) btnAlvo.classList.add('active');

      const paneAlvo = document.getElementById('pane-' + nomeAba);
      if (paneAlvo) paneAlvo.classList.add('active');
    }

    // CARREGAR DADOS DO SERVIDOR
    async function carregarEventosServidor() {
      try {
        const res = await fetch('/gestao/api/eventos');
        const data = await res.json();
        if (data.ok && Array.isArray(data.eventos)) {
          todosEventos = data.eventos;
          renderizarCalendario();
        }
      } catch (err) {
        console.error('Erro ao buscar eventos:', err);
      }
    }

    async function carregarSolicitacoesServidor() {
      try {
        const res = await fetch('/gestao/api/solicitacoes');
        const data = await res.json();
        if (data.ok && Array.isArray(data.solicitacoes)) {
          todasSolicitacoes = data.solicitacoes;
          renderizarTabelaSol();
        }
      } catch (err) {
        console.error('Erro ao buscar solicitações:', err);
      }
    }

    async function carregarFichasServidor() {
      try {
        const res = await fetch('/gestao/api/fichas');
        const data = await res.json();
        if (data.ok && Array.isArray(data.fichas)) {
          renderizarFichas(data.fichas);
        }
      } catch (err) {
        console.error('Erro ao buscar fichas:', err);
      }
    }

    // RENDERIZAR CALENDÁRIO
    function renderizarCalendario() {
      const elMesAno = document.getElementById('cal-mes-ano');
      const elGridDias = document.getElementById('cal-grid-dias');
      const filtroDepto = document.getElementById('filtro-depto').value.toLowerCase().trim();
      const filtroStatus = document.getElementById('filtro-status').value;

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

      // Dias do mês anterior (padding)
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

        // Filtra eventos deste dia
        const eventosDoDia = todosEventos.filter(ev => {
          let bateData = false;
          if (ev.data) {
            const dataLimpa = ev.data.trim();
            if (dataLimpa.includes('/')) {
              bateData = dataLimpa.startsWith(String(d).padStart(2, '0') + '/' + String(mesAtual + 1).padStart(2, '0'));
            } else if (dataLimpa.includes('-')) {
              bateData = dataLimpa.startsWith(diaIso);
            }
          }

          if (!bateData) return false;

          // Filtro por departamento
          if (filtroDepto && !String(ev.departamento || '').toLowerCase().includes(filtroDepto)) {
            return false;
          }

          // Filtro por status
          if (filtroStatus && ev.status !== filtroStatus) {
            return false;
          }

          return true;
        });

        let chipsHtml = '';
        eventosDoDia.slice(0, 3).forEach(ev => {
          const classeChip = ev.status === 'pendente_secretaria' ? 'pendente' : (ev.tipo === 'pastoral' ? 'pastoral' : 'aprovado');
          chipsHtml += '<span class="event-chip ' + classeChip + '" title="' + ev.titulo + ' (' + ev.horarioInicio + ')">' + (ev.horarioInicio ? ev.horarioInicio + ' ' : '') + ev.titulo + '</span>';
        });

        if (eventosDoDia.length > 3) {
          chipsHtml += '<span style="font-size:0.6rem; color:var(--cor-subtexto); font-weight:700;">+' + (eventosDoDia.length - 3) + ' mais</span>';
        }

        cell.innerHTML = '<span class="day-num">' + d + '</span><div class="day-events">' + chipsHtml + '</div>';

        cell.onclick = () => selecionarDia(d, mesAtual, anoAtual, diaIso, eventosDoDia);
        elGridDias.appendChild(cell);
      }

      // Se não havia dia selecionado, seleciona o dia de hoje
      if (!dataSelecionadaIso) {
        const diaPadrao = isHojeNoMes() ? hojeDia : 1;
        const diaIsoPadrao = anoAtual + '-' + String(mesAtual + 1).padStart(2, '0') + '-' + String(diaPadrao).padStart(2, '0');
        const eventosPadrao = todosEventos.filter(e => e.data && (e.data.includes(diaIsoPadrao) || e.data.startsWith(String(diaPadrao).padStart(2, '0') + '/' + String(mesAtual + 1).padStart(2, '0'))));
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

    // CLIQUE NO DIA
    function selecionarDia(dia, mes, ano, diaIso, eventos) {
      dataSelecionadaIso = diaIso;

      // Destaca na grade
      document.querySelectorAll('.cal-day').forEach(el => el.classList.remove('selecionado'));
      const diaCells = document.querySelectorAll('.cal-day:not(.outro-mes)');
      if (diaCells[dia - 1]) diaCells[dia - 1].classList.add('selecionado');

      const dataFmt = String(dia).padStart(2, '0') + '/' + String(mes + 1).padStart(2, '0') + '/' + ano;
      const dataObj = new Date(ano, mes, dia);
      const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

      document.getElementById('panel-data-selecionada').textContent = dataFmt;
      document.getElementById('panel-dia-semana').textContent = diasSemana[dataObj.getDay()];

      const containerEventos = document.getElementById('panel-eventos-dia');
      containerEventos.innerHTML = '';

      if (!eventos || eventos.length === 0) {
        containerEventos.innerHTML = '<div class="events-list-empty">Nenhum evento registrado nesta data.<br><br>💡 O salão está <b>disponível</b>!</div>';
        return;
      }

      eventos.forEach(ev => {
        const card = document.createElement('div');
        card.className = 'day-event-card';
        const statusTexto = ev.status === 'pendente_secretaria' ? '⏳ Aguardando Aprovação' : '✅ Confirmado';
        const statusCor = ev.status === 'pendente_secretaria' ? '#fbbf24' : '#34d399';

        card.innerHTML = 
          '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">' +
            '<div class="title">' + ev.titulo + '</div>' +
            '<span style="font-size:0.68rem; font-weight:700; color:' + statusCor + ';">' + statusTexto + '</span>' +
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
      badge.textContent = todasSolicitacoes.length;

      if (!todasSolicitacoes || todasSolicitacoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--cor-subtexto);">Nenhuma solicitação encontrada no momento.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      todasSolicitacoes.forEach(sol => {
        const tr = document.createElement('tr');
        const statusClass = sol.status === 'aprovado' ? 'aprovado' : 'pendente';
        const statusLabel = sol.status === 'aprovado' ? '✅ Aprovado' : '⏳ Aguardando Secretaria';

        tr.innerHTML = 
          '<td><span class="badge-codigo">' + (sol.codigo || '—') + '</span></td>' +
          '<td style="font-weight:700;">' + sol.titulo + '</td>' +
          '<td>' + (sol.departamento || 'Geral') + '</td>' +
          '<td>' + (sol.data || '—') + '</td>' +
          '<td>' + (sol.horarioInicio || '') + (sol.horarioFim ? ' às ' + sol.horarioFim : '') + '</td>' +
          '<td>' + (sol.responsavel || '—') + '</td>' +
          '<td><span class="badge-status ' + statusClass + '">' + statusLabel + '</span></td>' +
          '<td>' +
            '<button class="btn-secondary" style="padding:4px 10px; font-size:0.75rem;" onclick="visualizarDetalhesSolicitacao(\'' + sol.id + '\')">Ver Ficha</button>' +
          '</td>';
        tbody.appendChild(tr);
      });
    }

    // FICHAS DOS EVENTOS
    function renderizarFichas(fichas) {
      const container = document.getElementById('lista-fichas-container');
      if (!fichas || fichas.length === 0) {
        container.innerHTML = '<div style="color:var(--cor-subtexto);">Nenhuma ficha preenchida até o momento.</div>';
        return;
      }
      container.innerHTML = '';
      fichas.forEach(f => {
        const card = document.createElement('div');
        card.className = 'day-event-card';
        card.style.padding = '16px';

        card.innerHTML = 
          '<div style="font-size:1rem; font-weight:800; color:#fff; margin-bottom:6px;">' + f.evento + '</div>' +
          '<div class="meta" style="font-size:0.8rem; margin-bottom:12px;">' +
            '<div>🏢 <b>Departamento:</b> ' + (f.departamento || 'Geral') + '</div>' +
            '<div>📆 <b>Data:</b> ' + (f.data || '—') + '</div>' +
            (f.docUrl ? '<div>🔗 <a href="' + f.docUrl + '" target="_blank" style="color:var(--cor-ciano); font-weight:700;">Abrir no Google Docs ↗</a></div>' : '') +
          '</div>' +
          '<button class="btn-secondary" style="width:100%; justify-content:center; font-size:0.8rem;" onclick="abrirFichaDetalhe(\'' + encodeURIComponent(JSON.stringify(f)) + '\')">📄 Ver Respostas Completas</button>';
        container.appendChild(card);
      });
    }

    // MODAL DO WIZARD
    function abrirModalAgendamento(dataPrevia = '') {
      document.getElementById('modal-agendamento').classList.add('active');
      etapaWizardAtual = 1;
      atualizarPassosWizard();

      if (dataPrevia) {
        document.getElementById('f-data-evento').value = dataPrevia;
      } else if (!document.getElementById('f-data-evento').value) {
        const h = new Date();
        document.getElementById('f-data-evento').value = h.toISOString().split('T')[0];
      }
    }

    function fecharModalAgendamento() {
      document.getElementById('modal-agendamento').classList.remove('active');
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
      // Abas de formulário
      for (let i = 1; i <= 4; i++) {
        const elStep = document.getElementById('step-' + i);
        const elInd = document.getElementById('step-ind-' + i);
        if (elStep) elStep.classList.toggle('active', i === etapaWizardAtual);
        if (elInd) {
          elInd.classList.toggle('active', i === etapaWizardAtual);
          elInd.classList.toggle('concluido', i < etapaWizardAtual);
        }
      }

      // Botões do footer
      document.getElementById('btn-wizard-anterior').style.display = etapaWizardAtual > 1 ? 'inline-flex' : 'none';
      document.getElementById('btn-wizard-proximo').style.display = etapaWizardAtual < 4 ? 'inline-flex' : 'none';
      document.getElementById('btn-wizard-concluir').style.display = etapaWizardAtual === 4 ? 'inline-flex' : 'none';
    }

    function validarEtapaAtual(etapa) {
      if (etapa === 1) {
        const lider = document.getElementById('f-nome-lider').value.trim();
        const zap = document.getElementById('f-telefone-lider').value.trim();
        const evento = document.getElementById('f-nome-evento').value.trim();
        const depto = document.getElementById('f-departamento').value;
        const data = document.getElementById('f-data-evento').value;

        if (!lider || !zap || !evento || !depto || !data) {
          mostrarToast('⚠️ Por favor preencha todos os campos obrigatórios da Etapa 1.');
          return false;
        }
      } else if (etapa === 2) {
        const publico = document.getElementById('f-publico').value.trim();
        if (!publico) {
          mostrarToast('⚠️ Por favor informe o público-alvo do evento.');
          return false;
        }
      }
      return true;
    }

    function toggleUsoSalao(valor, el) {
      document.querySelectorAll('input[name="r-salao"]').forEach(r => r.parentElement.classList.remove('selected'));
      el.classList.add('selected');
      document.getElementById('campo-salao-detalhes').style.display = (valor === 'sim') ? 'block' : 'none';
    }

    function toggleMidiaPrevia(valor, el) {
      document.querySelectorAll('input[name="r-midia"]').forEach(r => r.parentElement.classList.remove('selected'));
      el.classList.add('selected');
      document.getElementById('secao-campos-midia').style.display = (valor === 'nao') ? 'block' : 'none';
    }

    function toggleAlertaTesouraria(valor) {
      document.getElementById('alerta-tesouraria').style.display = (valor === 'sim') ? 'block' : 'none';
    }

    // SUBMISSÃO DO FORMULÁRIO DE EVENTO
    async function submeterFormularioEvento() {
      const btnConcluir = document.getElementById('btn-wizard-concluir');
      btnConcluir.disabled = true;
      btnConcluir.textContent = 'Enviando para Secretaria...';

      const payload = {
        nome_lider: document.getElementById('f-nome-lider').value,
        telefone_lider: document.getElementById('f-telefone-lider').value,
        nome_evento: document.getElementById('f-nome-evento').value,
        departamento: document.getElementById('f-departamento').value,
        data_evento: document.getElementById('f-data-evento').value,
        horario_inicio: document.getElementById('f-horario-inicio').value,
        horario_termino: document.getElementById('f-horario-termino').value,
        precisa_salao_antes: document.querySelector('input[name="r-salao"]:checked')?.value || 'nao',
        salao_detalhes: document.getElementById('f-salao-detalhes')?.value || '',
        local: document.getElementById('f-local').value,
        publico: document.getElementById('f-publico').value,
        responsavel_geral: document.getElementById('f-responsavel-geral').value,
        convidado: document.getElementById('f-convidado').value,
        louvor: document.getElementById('f-louvor').value,
        decoracao: document.getElementById('f-decoracao').value,
        alimentacao: document.getElementById('f-alimentacao').value,
        equipe: document.getElementById('f-equipe').value,
        materiais: document.getElementById('f-materiais').value,
        cronograma: document.getElementById('f-cronograma').value,
        midia_ja_feita: document.querySelector('input[name="r-midia"]:checked')?.value || 'nao',
        paleta: document.getElementById('f-paleta')?.value || '',
        estilo: document.getElementById('f-estilo')?.value || '',
        prazo_imagem: document.getElementById('f-prazo-imagem')?.value || '',
        data_maxima_divulgacao: document.getElementById('f-data-maxima-divulgacao')?.value || '',
        valor_inscricao: document.getElementById('f-valor-inscricao').value,
        precisa_valor_ministerio: document.getElementById('f-precisa-valor-ministerio').value,
        tema: document.getElementById('f-tema').value,
        versiculo: document.getElementById('f-versiculo').value,
        objetivo_espiritual: document.getElementById('f-objetivo-espiritual').value,
        observacoes: document.getElementById('f-observacoes').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.ok) {
          fecharModalAgendamento();
          mostrarToast('🎉 Evento solicitado com sucesso! Código gerado: ' + data.codigo);
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
        btnConcluir.disabled = false;
        btnConcluir.textContent = '🚀 Enviar para Secretaria';
      }
    }

    function mostrarToast(mensagem) {
      const toast = document.getElementById('toast-msg');
      toast.textContent = mensagem;
      toast.style.display = 'flex';
      setTimeout(() => { toast.style.display = 'none'; }, 5500);
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

