const db = require("../db");
const moment = require("moment-timezone");
const path = require("path");
const { salvarPendente, buscarPendente, removerPendente } = require("../bot/pendentesAprovacao");
const {
  salvarFormularioEvento,
  obterFormularioEvento,
  formatarResumoEventoGrupo,
  precisaDeValorDoMinisterio,
  temConteudoRelevante,
  isMidiaJaFeita
} = require("../bot/formularioEvento");
const { notificarSecretaria } = require("../bot/secretaria");
const { REDES } = require("../bot/redes");
const { AGENDAS_INTERNAS } = require("../bot/agendasInternas");
const { loadLideres } = require("./lideres");
const { loadUsers } = require("./users");

const ENDERECO_IGREJA = "Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi";
const CONTATO_TESOURARIA = "11943890204";
const LINK_ATA_REUNIAO = "https://docs.google.com/document/d/1ZtFfD3f3jB1QkL2Y4XvW5T6n8M7a9K0p/edit";

// Mapeamento de agenda index para nome do departamento
const NOMES_AGENDAS_INDEX = [
  "Evangelismo",           // 0
  "Epifania",              // 1
  "Intercessão",           // 2
  "Outros",                // 3
  "Projeto Social Seeds",  // 4
  "Rede Ruach",            // 5
  "Rede de Casais",        // 6
  "Rede de Homens",        // 7
  "Rede de Mulheres",      // 8
  "Rede Kids",             // 9
  "Eventos Externos",      // 10
  "Reuniões",              // 11
  "Atendimento",           // 12
  "Limpeza",               // 13
  "Ensaios",               // 14
  "Uso do Salão",          // 15
  "Departamento de Artes"  // 16
];

let injectedBuscarEventos = null;
let injectedCalendar = null;

function setDependencies({ buscarEventos = null, calendar = null } = {}) {
  if (buscarEventos) injectedBuscarEventos = buscarEventos;
  if (calendar) injectedCalendar = calendar;
}

/**
 * Retorna o perfil completo do usuário logado (Líder, Diretor, Pastor ou Administrador)
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
    'pastor.teste': { nome: 'Pastor de Teste', cargo: 'Pastor', departamento: 'Pastoral' },
    'diretor.teste': { nome: 'Diretor de Teste', cargo: 'Diretor', departamento: 'Diretoria' },
    'lider.teste': { nome: 'Líder de Teste', cargo: 'Líder', departamento: 'Rede de Homens' },
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

  const cargos = (liderEncontrado?.cargos || []).map(c => String(c).toLowerCase().trim());
  const isAdmin = role === 'admin' || username === 'admin' || username === 'gabriela';
  const isPastor = isAdmin || role === 'pastor' || Boolean(dadosPastoral && dadosPastoral.cargo.toLowerCase().includes('pastor')) || cargos.includes('pastor');
  const isDiretor = isPastor || role === 'diretor' || cargos.includes('diretor') || username.includes('diretor');
  const isLider = true; // Todo usuário autenticado tem pelo menos nível líder

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
  const telefone = liderEncontrado?.telefone || session.telefone || '';
  
  let departamentos = [];
  if (liderEncontrado?.departamentos && Array.isArray(liderEncontrado.departamentos)) {
    departamentos = liderEncontrado.departamentos;
  } else if (liderEncontrado?.departamento) {
    departamentos = [liderEncontrado.departamento];
  } else if (dadosPastoral) {
    departamentos = [dadosPastoral.departamento];
  } else if (username === 'lider.teste') {
    departamentos = ['Rede de Homens'];
  } else {
    departamentos = ['Geral'];
  }

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
    departamentoPrincipal: departamentos[0] || 'Geral'
  };
}

/**
 * Extrai departamento provável a partir do título do evento
 */
function inferirDepartamentoDeTitulo(titulo = '') {
  const t = String(titulo).toLowerCase();
  if (t.includes('mulher') || t.includes('chá de mulheres')) return 'Rede de Mulheres';
  if (t.includes('homem') || t.includes('café dos homens') || t.includes('mesa de homens')) return 'Rede de Homens';
  if (t.includes('jovens') || t.includes('ruach') || t.includes('luau')) return 'Rede Ruach';
  if (t.includes('casais') || t.includes('jantar')) return 'Rede de Casais';
  if (t.includes('kids') || t.includes('criança') || t.includes('infantil')) return 'Rede Kids';
  if (t.includes('arte') || t.includes('dança') || t.includes('teatro')) return 'Departamento de Artes';
  if (t.includes('intercess') || t.includes('oração') || t.includes('clamor')) return 'Intercessão';
  if (t.includes('evangelismo') || t.includes('missão') || t.includes('missões')) return 'Evangelismo';
  if (t.includes('seeds') || t.includes('social')) return 'Projeto Social Seeds';
  if (t.includes('epifania')) return 'Epifania';
  if (t.includes('reunião') || t.includes('reuniao')) return 'Liderança';
  if (t.includes('ensaio')) return 'Música';
  if (t.includes('atendimento')) return 'Pastoral';
  return 'Geral';
}

/**
 * Consulta eventos do Google Calendar se as credenciais e APIs estiverem disponíveis
 */
async function buscarEventosGoogleCalendar(inicioIso, fimIso) {
  const eventosGcal = [];
  try {
    // Se foi injetado buscarEventos do chatbot.js
    if (injectedBuscarEventos && typeof injectedBuscarEventos === 'function') {
      const results = await injectedBuscarEventos(inicioIso, fimIso);
      if (Array.isArray(results)) {
        for (const item of results) {
          eventosGcal.push(item);
        }
        return eventosGcal;
      }
    }

    // Caso contrário, tenta usar googleapis se disponível
    let googleapis;
    try { googleapis = require('googleapis').google; } catch (_) {}
    if (googleapis) {
      const keyFile = path.join(process.cwd(), 'credenciais-google.json');
      const auth = new googleapis.auth.GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/calendar']
      });
      const cal = googleapis.calendar({ version: 'v3', auth });

      // Agendas comuns
      const agendasParaBuscar = [
        ...Object.values(AGENDAS_INTERNAS),
        ...REDES.map((r, i) => NOMES_AGENDAS_INDEX[r.agendaIndex] ? r.agendaIndex : i)
      ];

      // Busca na agenda primária e secundárias
      const idsUnicos = Array.from(new Set(Object.values(AGENDAS_INTERNAS)));
      for (const calId of idsUnicos) {
        try {
          const res = await cal.events.list({
            calendarId: calId,
            timeMin: inicioIso,
            timeMax: fimIso,
            singleEvents: true,
            maxResults: 250
          });
          if (res.data?.items) {
            for (const ev of res.data.items) {
              ev.calendarId = calId;
              eventosGcal.push(ev);
            }
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    // Falha silenciosa de rede no Google Agenda (não bloqueia o site)
  }
  return eventosGcal;
}

/**
 * Lista eventos unificados para exibir no calendário do site com filtros de permissão
 */
async function listarEventosCalendario({ user = null, mes = null, ano = null } = {}) {
  const eventos = [];
  const perfil = user?.perfilTitulo ? user : (user ? obterPerfilGestao(user) : null);

  const anoAtual = ano ? parseInt(ano, 10) : moment().tz("America/Sao_Paulo").year();
  const mesAtual = mes ? parseInt(mes, 10) : moment().tz("America/Sao_Paulo").month() + 1;

  // Janela de busca para o mês
  const inicioMes = moment.tz([anoAtual, mesAtual - 1, 1], "America/Sao_Paulo").startOf('month').subtract(7, 'days').startOf('day');
  const fimMes = moment.tz([anoAtual, mesAtual - 1, 1], "America/Sao_Paulo").endOf('month').add(7, 'days').endOf('day');

  // 1. Eventos Gravados em descricoes_eventos (eventos aprovados pelo bot)
  try {
    const rowsDesc = db.prepare(`
      SELECT id, evento, departamento, local, tipoDuracao, horariosJson, descricao, criadoEm
      FROM descricoes_eventos
      ORDER BY id DESC LIMIT 150
    `).all();

    for (const r of rowsDesc) {
      let horarios = [];
      try {
        const parsed = JSON.parse(r.horariosJson);
        if (Array.isArray(parsed)) {
          horarios = parsed;
        } else if (parsed && parsed.dataInicio) {
          horarios = [{
            data: parsed.dataInicio,
            inicio: parsed.horaInicio,
            fim: parsed.horaFim,
            dataFim: parsed.dataFim
          }];
        } else if (parsed && (parsed.inicio || parsed.data)) {
          horarios = [parsed];
        }
      } catch (_) {}

      for (let idx = 0; idx < horarios.length; idx++) {
        const h = horarios[idx];
        const dataEv = h.data || '';
        if (!dataEv) continue;

        eventos.push({
          id: `desc_${r.id}_${idx}`,
          origem: 'descricao',
          titulo: r.evento,
          departamento: r.departamento || inferirDepartamentoDeTitulo(r.evento),
          data: dataEv,
          horarioInicio: h.inicio || '19:00',
          horarioFim: h.fim || '21:30',
          local: r.local || ENDERECO_IGREJA,
          responsavel: '',
          docUrl: '',
          status: 'confirmado',
          tipo: 'evento',
          descricao: r.descricao || ''
        });
      }
    }
  } catch (errDesc) {
    console.error('[Gestão Eventos] Erro ao carregar descricoes_eventos:', errDesc.message);
  }

  // 2. Eventos com fichas e formulários preenchidos (formularios_eventos)
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

      // Verifica se já não foi incluído por descricoes_eventos
      const jaExiste = eventos.some(e => 
        e.data === r.data && 
        e.titulo.toLowerCase().trim() === r.evento.toLowerCase().trim()
      );

      if (!jaExiste) {
        eventos.push({
          id: `form_${r.id}`,
          origem: 'formulario',
          titulo: r.evento,
          departamento: r.departamento || payload.departamento || inferirDepartamentoDeTitulo(r.evento),
          data: r.data,
          horarioInicio: horarioIni,
          horarioFim: horarioFim,
          local: payload.local || ENDERECO_IGREJA,
          responsavel: payload.nome_lider || payload.solicitanteNome || '',
          docUrl: r.docUrl || '',
          status: 'confirmado',
          tipo: r.evento.toLowerCase().includes('reunião') ? 'reuniao' : 'evento',
          payload
        });
      }
    }
  } catch (err) {
    console.error('[Gestão Eventos] Erro ao carregar formularios_eventos:', err.message);
  }

  // 3. Eventos Dinâmicos do Painel da Secretaria (painel_eventos)
  try {
    const rowsPainel = db.prepare(`
      SELECT id, slug, titulo, descricao, dataEvento, horario, local, tipoInscricao, ativo
      FROM painel_eventos
      WHERE ativo = 1
      ORDER BY criadoEm DESC LIMIT 50
    `).all();

    for (const p of rowsPainel) {
      if (!eventos.some(e => e.titulo.toLowerCase().trim() === p.titulo.toLowerCase().trim() && e.data === p.dataEvento)) {
        eventos.push({
          id: `painel_${p.id}`,
          origem: 'painel',
          titulo: p.titulo,
          departamento: inferirDepartamentoDeTitulo(p.titulo),
          data: p.dataEvento,
          horarioInicio: p.horario || '19:00',
          horarioFim: '',
          local: p.local || ENDERECO_IGREJA,
          responsavel: 'Secretaria',
          docUrl: '',
          status: 'confirmado',
          tipo: 'evento',
          payload: { descricao: p.descricao, slug: p.slug }
        });
      }
    }
  } catch (errPainel) {
    console.error('[Gestão Eventos] Erro ao carregar painel_eventos:', errPainel.message);
  }

  // 4. Google Calendar (Reuniões, Ensaios, Atendimentos, Eventos ao Vivo)
  try {
    const gcalEvents = await buscarEventosGoogleCalendar(inicioMes.toISOString(), fimMes.toISOString());
    for (const g of gcalEvents) {
      const summary = g.summary || 'Evento Oficial';
      const startIso = g.start?.dateTime || g.start?.date;
      const endIso = g.end?.dateTime || g.end?.date;
      if (!startIso) continue;

      const mStart = moment.tz(startIso, "America/Sao_Paulo");
      const mEnd = endIso ? moment.tz(endIso, "America/Sao_Paulo") : mStart.clone().add(2, 'hours');
      const dataFormatada = mStart.format('DD/MM/YYYY');
      const hIni = mStart.format('HH:mm');
      const hFim = mEnd.format('HH:mm');

      let tipo = 'evento';
      let depto = inferirDepartamentoDeTitulo(summary);

      if (g.calendarId === AGENDAS_INTERNAS.REUNIOES || summary.toLowerCase().includes('reunião')) {
        tipo = 'reuniao';
      } else if (g.calendarId === AGENDAS_INTERNAS.ENSAIOS || summary.toLowerCase().includes('ensaio')) {
        tipo = 'ensaio';
        depto = 'Música / Louvor';
      } else if (g.calendarId === AGENDAS_INTERNAS.ATENDIMENTO || summary.toLowerCase().includes('atendimento')) {
        tipo = 'atendimento';
        depto = 'Pastoral';
      } else if (g.calendarId === AGENDAS_INTERNAS.USO_SALAO || summary.toLowerCase().includes('uso do salão')) {
        tipo = 'uso_salao';
      }

      // Evita duplicar se já estiver na lista local
      const duplicado = eventos.some(e => e.data === dataFormatada && e.titulo.toLowerCase().trim() === summary.toLowerCase().trim());
      if (!duplicado) {
        eventos.push({
          id: `gcal_${g.id}`,
          origem: 'google',
          titulo: summary,
          departamento: depto,
          data: dataFormatada,
          horarioInicio: hIni,
          horarioFim: hFim,
          local: g.location || ENDERECO_IGREJA,
          responsavel: '',
          status: 'confirmado',
          tipo,
          descricao: g.description || ''
        });
      }
    }
  } catch (errGcal) {
    // Erros de Google Agenda são absorvidos
  }

  // 5. Solicitações Pendentes (que estão aguardando aprovação da Secretaria)
  try {
    const rowsPendentes = db.prepare(`
      SELECT codigo, dados, criadoEm FROM pendentes ORDER BY criadoEm DESC
    `).all();

    for (const pend of rowsPendentes) {
      try {
        const d = JSON.parse(pend.dados);
        const nome = (d.nomeEvento || d.evento || d.nome || d.finalidade || '').trim();
        
        // Ignora mocks e testes óbvios
        if (!nome || /^(teste|test|gabi|gabriela)$/i.test(nome)) continue;

        const dataFormatada = d.dataFormatada || (d.dia && d.mes && d.ano ? `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}/${d.ano}` : '');
        if (!dataFormatada && !d.blocos && !d.dataInicio) continue;

        let tipo = d.tipo || 'evento';
        if (d.tipo === 'uso_salao') tipo = 'uso_salao';
        if (d.tipo === 'reuniao') tipo = 'reuniao';
        if (d.tipo === 'alterar' || d.tipo === 'reuniao_alterar') tipo = 'alteracao';
        if (d.tipo === 'cancelar' || d.tipo === 'cancelar_reuniao') tipo = 'cancelamento';

        eventos.push({
          id: `pend_${pend.codigo}`,
          origem: 'pendente',
          codigo: pend.codigo,
          titulo: nome,
          departamento: d.rede || d.departamento || inferirDepartamentoDeTitulo(nome),
          data: dataFormatada || (d.blocos && d.blocos[0]?.data) || '',
          horarioInicio: d.horarioInicio || (d.blocos && d.blocos[0]?.inicio) || '19:00',
          horarioFim: d.horarioFim || (d.blocos && d.blocos[0]?.fim) || '21:30',
          local: d.local || ENDERECO_IGREJA,
          responsavel: d.solicitanteNome || '',
          status: 'pendente_secretaria',
          tipo,
          payload: d
        });
      } catch (_) {}
    }
  } catch (errPend) {
    console.error('[Gestão Eventos] Erro ao carregar pendentes:', errPend.message);
  }

  // APLICAÇÃO DE REGRAS DE PERMISSÃO / VISIBILIDADE
  // -------------------------------------------------------------
  // Regra Líder:
  // - Vê ensaios, eventos e reuniões SÓ do seu departamento
  // - Se outro ministério ocupar o salão, mostra apenas "Salão Ocupado" para não dar conflito
  // - Não vê atendimento pastoral
  // Regra Diretor:
  // - Vê tudo de todos os departamentos
  // - No atendimento pastoral: máscara o nome do discípulo (mostra apenas "Atendimento Pastoral")
  // Regra Pastor:
  // - Vê tudo de todos os departamentos
  // - No atendimento pastoral: vê o nome completo de quem vai ser atendido
  const resultadoFiltrado = [];

  for (const ev of eventos) {
    const isAtendimento = ev.tipo === 'atendimento' || ev.departamento === 'Pastoral';

    // 1. Caso Atendimento Pastoral
    if (isAtendimento) {
      if (perfil?.isPastor || perfil?.isAdmin) {
        // Pastor vê tudo com nome do discípulo
        resultadoFiltrado.push(ev);
      } else if (perfil?.isDiretor) {
        // Diretor só vê que tem atendimento (nome do discípulo mascarado)
        resultadoFiltrado.push({
          ...ev,
          titulo: 'Atendimento Pastoral',
          responsavel: 'Sigiloso',
          descricao: 'Atendimento pastoral agendado'
        });
      } else {
        // Líder comum NÃO vê atendimento pastoral de terceiros
        // Apenas como bloqueio de salão se for no mesmo espaço
        continue;
      }
      continue;
    }

    // 2. Caso Pastor, Diretor ou Administrador: vê tudo
    if (perfil?.isPastor || perfil?.isDiretor || perfil?.isAdmin) {
      resultadoFiltrado.push(ev);
      continue;
    }

    // 3. Caso Líder Comum:
    const deptosLider = (perfil?.departamentos || []).map(d => String(d).toLowerCase().trim());
    const deptoEv = String(ev.departamento || '').toLowerCase().trim();
    
    const pertenceAoLider = deptosLider.length === 0 || 
      deptosLider.includes('geral') || 
      deptosLider.some(d => deptoEv.includes(d) || d.includes(deptoEv));

    if (pertenceAoLider) {
      resultadoFiltrado.push(ev);
    } else {
      // Evento de outro departamento: exibe no calendário apenas como aviso de salão ocupado
      // para evitar conflitos na marcação de datas
      resultadoFiltrado.push({
        ...ev,
        titulo: 'Salão Ocupado (Outro Ministério)',
        departamento: 'Igreja',
        responsavel: '',
        descricao: 'Horário já reservado por outro ministério.',
        isOcupacaoExterna: true
      });
    }
  }

  return resultadoFiltrado;
}

/**
 * Lista solicitações de eventos limpas e filtradas pelo perfil do usuário
 */
function listarSolicitacoes({ user = null } = {}) {
  const perfil = user?.perfilTitulo ? user : (user ? obterPerfilGestao(user) : null);
  const solicitacoes = [];

  try {
    const rowsPend = db.prepare(`
      SELECT codigo, dados, criadoEm FROM pendentes ORDER BY rowid DESC
    `).all();

    for (const p of rowsPend) {
      try {
        const d = JSON.parse(p.dados);
        const nome = (d.nomeEvento || d.evento || d.nome || d.finalidade || '').trim();
        if (!nome || /^(teste|test|gabi|gabriela)$/i.test(nome)) continue;

        const dataFormatada = d.dataFormatada || (d.dia && d.mes && d.ano ? `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}/${d.ano}` : '');
        if (!dataFormatada && !d.blocos && !d.dataInicio) continue;

        // Se for Líder comum, filtra apenas as solicitações dele
        if (!perfil?.isPastor && !perfil?.isDiretor && !perfil?.isAdmin) {
          const deptos = (perfil?.departamentos || []).map(d => String(d).toLowerCase());
          const deptoPed = String(d.rede || d.departamento || '').toLowerCase();
          const pertenceDepto = deptos.some(x => deptoPed.includes(x) || x.includes(deptoPed));
          const ehDoUsuario = (d.solicitanteId && (d.solicitanteId === perfil?.telefone || d.solicitanteId === perfil?.username)) ||
                             (d.solicitanteNome && d.solicitanteNome.toLowerCase().includes(String(perfil?.nome || '').toLowerCase())) ||
                             (d.criadoPor && d.criadoPor === perfil?.username);
          if (!pertenceDepto && !ehDoUsuario) continue;
        }

        solicitacoes.push({
          codigo: p.codigo,
          id: p.codigo,
          tipo: d.tipo || 'evento',
          titulo: nome,
          departamento: d.rede || d.departamento || 'Geral',
          data: dataFormatada || (d.blocos && d.blocos[0]?.data) || '',
          horarioInicio: d.horarioInicio || (d.blocos && d.blocos[0]?.inicio) || '19:00',
          horarioFim: d.horarioFim || (d.blocos && d.blocos[0]?.fim) || '21:30',
          responsavel: d.solicitanteNome || '',
          status: 'Aguardando Secretaria',
          statusClass: 'pendente',
          criadoEm: p.criadoEm,
          payload: d
        });
      } catch (_) {}
    }
  } catch (err) {
    console.error('[Gestão] Erro ao listar pendentes:', err.message);
  }

  // Adiciona solicitações aprovadas recentes
  try {
    const rowsForm = db.prepare(`
      SELECT id, evento, departamento, data, solicitanteId, payload, criadoEm
      FROM formularios_eventos
      ORDER BY id DESC LIMIT 50
    `).all();

    for (const f of rowsForm) {
      let p = {};
      try { p = JSON.parse(f.payload); } catch (_) {}
      
      // Filtragem por líder
      if (!perfil?.isPastor && !perfil?.isDiretor && !perfil?.isAdmin) {
        const deptos = (perfil?.departamentos || []).map(d => String(d).toLowerCase());
        const deptoForm = String(f.departamento || '').toLowerCase();
        const pertenceDepto = deptos.some(x => deptoForm.includes(x) || x.includes(deptoForm));
        const ehDoUsuario = f.solicitanteId === perfil?.telefone || f.solicitanteId === perfil?.username ||
                           (p.nome_lider && p.nome_lider.toLowerCase().includes(String(perfil?.nome || '').toLowerCase()));
        if (!pertenceDepto && !ehDoUsuario) continue;
      }

      solicitacoes.push({
        codigo: `AP-${f.id}`,
        id: `form_${f.id}`,
        tipo: 'evento',
        titulo: f.evento,
        departamento: f.departamento || 'Geral',
        data: f.data,
        horarioInicio: p.horario_inicio || '19:00',
        horarioFim: p.horario_termino || '21:30',
        responsavel: p.nome_lider || p.nomeSolicitante || '',
        status: 'Aprovado',
        statusClass: 'aprovado',
        criadoEm: f.criadoEm,
        payload: p
      });
    }
  } catch (_) {}

  return solicitacoes;
}

/**
 * Lista fichas de eventos preenchidas com controle rigoroso de acesso:
 * - Pastores: acesso total a todas as fichas
 * - Líderes: apenas fichas do seu próprio departamento
 * - Diretores: não têm acesso a todas as fichas (apenas se pastor)
 */
function listarFichas({ user = null } = {}) {
  const perfil = user?.perfilTitulo ? user : (user ? obterPerfilGestao(user) : null);
  
  try {
    const rows = db.prepare(`
      SELECT id, evento, departamento, data, dataMaximaDivulgacao, solicitanteId, payload, docUrl, criadoEm
      FROM formularios_eventos
      ORDER BY id DESC LIMIT 100
    `).all();

    // Se for Pastor ou Admin: vê tudo
    if (perfil?.isPastor || perfil?.isAdmin) {
      return rows;
    }

    // Se for Líder comum ou Diretor (sem cargo de pastor): vê apenas o seu departamento
    const deptosUsuario = (perfil?.departamentos || []).map(d => String(d).toLowerCase().trim());
    return rows.filter(f => {
      const deptoFicha = String(f.departamento || '').toLowerCase().trim();
      return deptosUsuario.some(du => deptoFicha.includes(du) || du.includes(deptoFicha));
    });
  } catch (err) {
    console.error('[Gestão] Erro ao listar fichas:', err.message);
    return [];
  }
}

/**
 * Cria nova solicitação no portal web com suporte a todos os tipos de agendamento:
 * - Novo Evento (Único, Múltiplo, Consecutivo)
 * - Reunião de Liderança
 * - Atendimento Pastoral (somente pastores)
 * - Alteração de Evento
 * - Cancelamento de Evento
 */
async function criarSolicitacaoEventoWeb(corpo, usuarioLogado, getClient = () => null) {
  const perfil = obterPerfilGestao(usuarioLogado);
  const tipoAcao = String(corpo.tipo || 'evento').toLowerCase().trim();

  // 1. REUNIÃO DE LIDERANÇA / DEPARTAMENTO
  if (tipoAcao === 'reuniao') {
    const { departamento, data, horario_inicio, horario_termino, local, pauta } = corpo;
    if (!departamento || !data || !horario_inicio || !horario_termino) {
      throw new Error('Preencha o departamento, a data e os horários de início e término da reunião.');
    }

    const [diaStr, mesStr, anoStr] = data.split('/');
    const dadosReuniao = {
      tipo: 'reuniao',
      departamento: departamento.trim(),
      rede: departamento.trim(),
      dia: parseInt(diaStr, 10),
      mes: parseInt(mesStr, 10),
      ano: parseInt(anoStr, 10),
      dataFormatada: data,
      horarioInicio: horario_inicio,
      horarioFim: horario_termino,
      local: local?.trim() || ENDERECO_IGREJA,
      solicitanteNome: perfil?.nome || 'Líder',
      solicitanteId: perfil?.telefone || perfil?.username || '',
      pauta: pauta?.trim() || 'Alinhamento ministerial',
      criadoVia: 'painel_web',
      criadoEm: new Date().toISOString()
    };

    const codigo = salvarPendente(dadosReuniao);

    const avisoGrupo =
      `🤝 *SOLICITAÇÃO DE REUNIÃO DE LIDERANÇA*\n\n` +
      `👤 *Solicitante:* ${perfil?.nome} (${perfil?.telefone || perfil?.username})\n` +
      `🏢 *Departamento:* ${departamento}\n` +
      `📆 *Data:* ${data}\n` +
      `⏰ *Horário:* ${horario_inicio} às ${horario_termino}\n` +
      `📍 *Local:* ${dadosReuniao.local}\n` +
      `📋 *Pauta:* ${dadosReuniao.pauta}\n\n` +
      `_Responda a este resumo com "marcar reunião" para confirmar ou "não marcar" para negar._\n\n` +
      `_Código: ${codigo}_`;

    try {
      const client = typeof getClient === 'function' ? getClient() : null;
      if (client && client.info) {
        await notificarSecretaria(client, avisoGrupo);
      }
    } catch (_) {}

    return {
      ok: true,
      codigo,
      message: `Solicitação registrada com sucesso (Código: ${codigo}) e enviada para aprovação da Secretaria!`,
      mensagem: `Solicitação de reunião registrada com sucesso (Código: ${codigo}) e enviada para aprovação da Secretaria!`
    };
  }

  // 2. ATENDIMENTO PASTORAL (Exclusivo para Pastores / Admin)
  if (tipoAcao === 'atendimento') {
    if (!perfil?.isPastor && !perfil?.isAdmin) {
      throw new Error('Apenas pastores têm permissão para agendar atendimentos pastorais.');
    }

    const { nome_discipulo, telefone_discipulo, pastor_responsavel, data, horario_inicio, horario_termino, local, motivo } = corpo;
    if (!nome_discipulo || !data || !horario_inicio || !horario_termino) {
      throw new Error('Informe o nome do discípulo, a data e os horários do atendimento.');
    }

    const [diaStr, mesStr, anoStr] = data.split('/');
    const dadosAtendimento = {
      tipo: 'atendimento',
      nome_discipulo: nome_discipulo.trim(),
      telefone_discipulo: telefone_discipulo?.trim() || '',
      pastor_responsavel: pastor_responsavel?.trim() || perfil?.nome,
      dia: parseInt(diaStr, 10),
      mes: parseInt(mesStr, 10),
      ano: parseInt(anoStr, 10),
      dataFormatada: data,
      horarioInicio: horario_inicio,
      horarioFim: horario_termino,
      local: local?.trim() || 'Gabinete Pastoral',
      motivo: motivo?.trim() || 'Aconselhamento e Oração',
      criadoVia: 'painel_web',
      criadoEm: new Date().toISOString()
    };

    // Registra direto como aprovado no banco de descrições/fichas pastorais
    const tituloAtendimento = `Atendimento Pastoral - ${nome_discipulo.trim()}`;
    db.prepare(`
      INSERT INTO descricoes_eventos (evento, departamento, local, tipoDuracao, horariosJson, descricao, criadoEm, atualizadoEm)
      VALUES (?, ?, ?, 'unico', ?, ?, datetime('now'), datetime('now'))
    `).run(
      tituloAtendimento,
      'Pastoral',
      dadosAtendimento.local,
      JSON.stringify([{ data, inicio: horario_inicio, fim: horario_termino }]),
      `Atendimento Pastoral com ${nome_discipulo}\nPastor: ${dadosAtendimento.pastor_responsavel}\nContato: ${dadosAtendimento.telefone_discipulo}\nMotivo: ${dadosAtendimento.motivo}`
    );

    return {
      ok: true,
      mensagem: `Atendimento pastoral agendado com sucesso para ${nome_discipulo} no dia ${data} às ${horario_inicio}!`
    };
  }

  // 3. ALTERAR EVENTO
  if (tipoAcao === 'alterar') {
    const { nome_evento, campo_alterar, novo_valor, motivo } = corpo;
    if (!nome_evento || !campo_alterar || !novo_valor) {
      throw new Error('Informe o evento, o campo que deseja alterar e a nova informação.');
    }

    const dadosAlteracao = {
      tipo: 'alterar',
      evento: nome_evento.trim(),
      campo: campo_alterar,
      novoValor: novo_valor,
      motivo: motivo?.trim() || 'Ajuste de cronograma',
      solicitanteNome: perfil?.nome || 'Líder',
      solicitanteId: perfil?.telefone || perfil?.username || '',
      criadoVia: 'painel_web',
      criadoEm: new Date().toISOString()
    };

    const codigo = salvarPendente(dadosAlteracao);

    const avisoGrupo =
      `🔄 *PEDIDO DE ALTERAÇÃO DE EVENTO VIA WEB*\n\n` +
      `👤 *Solicitante:* ${perfil?.nome} (${perfil?.telefone || perfil?.username})\n` +
      `📅 *Evento:* ${nome_evento.trim()}\n` +
      `🔧 *Campo a Alterar:* ${campo_alterar}\n` +
      `✨ *Nova Informação:* ${novo_valor}\n` +
      `📝 *Motivo:* ${dadosAlteracao.motivo}\n\n` +
      `_Responda a este resumo com "alterar evento" para confirmar ou "não alterar" para negar._\n\n` +
      `_Código: ${codigo}_`;

    try {
      const client = typeof getClient === 'function' ? getClient() : null;
      if (client && client.info) {
        await notificarSecretaria(client, avisoGrupo);
      }
    } catch (_) {}

    return {
      ok: true,
      codigo,
      mensagem: `Solicitação de alteração enviada à Secretaria (Código: ${codigo})!`
    };
  }

  // 4. CANCELAR EVENTO
  if (tipoAcao === 'cancelar') {
    const { nome_evento, motivo } = corpo;
    if (!nome_evento || !motivo) {
      throw new Error('Informe o nome do evento e o motivo do cancelamento.');
    }

    const dadosCancelamento = {
      tipo: 'cancelar',
      evento: nome_evento.trim(),
      motivo: motivo.trim(),
      solicitanteNome: perfil?.nome || 'Líder',
      solicitanteId: perfil?.telefone || perfil?.username || '',
      criadoVia: 'painel_web',
      criadoEm: new Date().toISOString()
    };

    const codigo = salvarPendente(dadosCancelamento);

    const avisoGrupo =
      `🗑️ *PEDIDO DE CANCELAMENTO DE EVENTO VIA WEB*\n\n` +
      `👤 *Solicitante:* ${perfil?.nome} (${perfil?.telefone || perfil?.username})\n` +
      `📅 *Evento a Cancelar:* ${nome_evento.trim()}\n` +
      `⚠️ *Motivo:* ${motivo.trim()}\n\n` +
      `_Responda a este resumo com "cancelar evento" para confirmar ou "manter evento" para negar._\n\n` +
      `_Código: ${codigo}_`;

    try {
      const client = typeof getClient === 'function' ? getClient() : null;
      if (client && client.info) {
        await notificarSecretaria(client, avisoGrupo);
      }
    } catch (_) {}

    return {
      ok: true,
      codigo,
      mensagem: `Solicitação de cancelamento enviada à Secretaria (Código: ${codigo})!`
    };
  }

  // 5. NOVO EVENTO (Padrão: Único, Múltiplos Blocos ou Consecutivo)
  const {
    nome_lider,
    telefone_lider,
    departamento,
    nome_evento,
    tipo_duracao = 'unico',
    data,
    horario_inicio,
    horario_termino,
    blocos_json,
    data_inicio_consecutivo,
    data_fim_consecutivo,
    hora_inicio_consecutivo,
    hora_fim_consecutivo,
    local,
    publico,
    publico_outro,
    precisa_salao_antes,
    horario_total_uso,
    horario_inicio_uso,
    horario_fim_uso,
    tema,
    versiculo,
    objetivo_espiritual,
    midia_ja_feita,
    data_maxima_divulgacao,
    precisa_inscricao,
    valor_inscricao,
    precisa_valor_ministerio,
    observacoes
  } = corpo;

  if (!nome_evento || !nome_evento.trim()) {
    throw new Error('O nome do evento é obrigatório.');
  }

  const liderFinal = nome_lider?.trim() || perfil?.nome || 'Líder Responsável';
  const deptoFinal = departamento?.trim() || perfil?.departamentoPrincipal || 'Geral';
  const localFinal = local?.trim() || ENDERECO_IGREJA;
  const publicoFinal = publico === 'outro' ? (publico_outro?.trim() || 'Geral') : (publico || 'Toda a Igreja');

  let dataFormatada = data || '';
  let diaNum = 1, mesNum = 1, anoNum = moment().tz("America/Sao_Paulo").year();

  if (tipo_duracao === 'unico' && data) {
    const partes = data.split('/');
    diaNum = parseInt(partes[0], 10);
    mesNum = parseInt(partes[1], 10);
    anoNum = parseInt(partes[2], 10) || moment().tz("America/Sao_Paulo").year();
  }

  // Montagem de horários e blocos
  let blocosArray = null;
  if (tipo_duracao === 'multiplo' && blocos_json) {
    try {
      blocosArray = JSON.parse(blocos_json);
      if (Array.isArray(blocosArray) && blocosArray.length > 0) {
        dataFormatada = blocosArray[0].data;
        const partes = dataFormatada.split('/');
        diaNum = parseInt(partes[0], 10);
        mesNum = parseInt(partes[1], 10);
        anoNum = parseInt(partes[2], 10) || anoNum;
      }
    } catch (_) {}
  }

  const horarioTotalTexto = precisa_salao_antes === 'sim'
    ? `${horario_inicio_uso || ''} às ${horario_fim_uso || horario_total_uso || ''}`
    : 'Não';

  const payloadCompleto = {
    nome_lider: liderFinal,
    telefone_lider: telefone_lider?.trim() || perfil?.telefone || '',
    departamento: deptoFinal,
    nome_evento: nome_evento.trim(),
    tipo_duracao,
    data: dataFormatada,
    horario_inicio: horario_inicio || '19:00',
    horario_termino: horario_termino || '21:30',
    horario_inicio_termino: `${horario_inicio || '19:00'} às ${horario_termino || '21:30'}`,
    blocos: blocosArray,
    consecutivo: tipo_duracao === 'consecutivo' ? {
      dataInicio: data_inicio_consecutivo,
      dataFim: data_fim_consecutivo,
      horaInicio: hora_inicio_consecutivo,
      horaFim: hora_fim_consecutivo
    } : null,
    local: localFinal,
    publico: publicoFinal,
    precisa_salao_antes: precisa_salao_antes === 'sim' ? 'Sim' : 'Não',
    horario_total_uso: horarioTotalTexto,
    midia_ja_feita: midia_ja_feita === 'sim' ? 'Sim' : 'Não',
    data_maxima_divulgacao: data_maxima_divulgacao || '',
    precisa_inscricao: precisa_inscricao === 'sim' ? 'Sim' : 'Não',
    valor_inscricao: precisa_inscricao === 'sim' && valor_inscricao ? `R$ ${valor_inscricao}` : 'Gratuito',
    precisa_valor_ministerio: precisa_valor_ministerio === 'sim' ? 'Sim' : 'Não',
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
    horarioInicio: horario_inicio || '19:00',
    horarioFim: horario_termino || '21:30',
    solicitanteNome: liderFinal,
    solicitanteId: telefone_lider || usuarioLogado?.telefone || usuarioLogado?.username || '',
    tipoDuracao: tipo_duracao,
    blocos: blocosArray,
    payload: payloadCompleto,
    criadoVia: 'painel_web',
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

  try {
    const client = typeof getClient === 'function' ? getClient() : null;
    if (client && client.info) {
      await notificarSecretaria(client, avisoGrupo);
    }
  } catch (errZap) {
    console.error('[Gestão Web] Erro ao notificar secretaria via WhatsApp:', errZap.message);
  }

  return {
    ok: true,
    codigo,
    evento: nome_evento.trim(),
    departamento: deptoFinal,
    data: dataFormatada,
    message: `Solicitação registrada com sucesso (Código: ${codigo}) e enviada para aprovação da Secretaria!`,
    mensagem: `Solicitação do evento "${nome_evento.trim()}" enviada com sucesso para aprovação da Secretaria! (Código: ${codigo})`
  };
}

/**
 * Renderiza o HTML da tela de Gestão de Eventos (/gestao)
 * TEMA: Cinza Claro (#f4f6f8 / #ffffff) matching public/home.html
 * OTIMIZADO: Mobile-first (perfeito para celulares)
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

      /* PALETA CLARA - Fundo suave */
      --cor-fundo: #f4f6f8;
      --cor-card: #ffffff;
      --cor-borda: #e2e8f0;
      --cor-input: #ffffff;
      --cor-input-borda: #cbd5e1;
      --cor-texto: #1e293b;
      --cor-subtexto: #64748b;
      --cor-cinza-suave: #f8fafc;
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

    /* TOPBAR */
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
      border-bottom: 2px solid var(--cor-roxo);
    }
    .brand-container {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-logo {
      height: 36px;
      width: auto;
      object-fit: contain;
    }
    .brand-info h1 {
      font-size: 0.88rem;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #ffffff;
      line-height: 1.1;
    }
    .brand-info span {
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--cor-ciano);
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .user-profile-badge {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .user-name-tag {
      text-align: right;
    }
    .user-name-tag .name {
      font-size: 0.78rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .user-name-tag .role-pill {
      display: inline-block;
      font-size: 0.62rem;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: rgba(122, 43, 226, 0.2);
      color: #d8b4fe;
      border: 1px solid rgba(122, 43, 226, 0.4);
    }
    .role-pill.pastor { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border-color: rgba(59, 130, 246, 0.4); }
    .role-pill.diretor { background: rgba(245, 158, 11, 0.2); color: #fde68a; border-color: rgba(245, 158, 11, 0.4); }
    .role-pill.admin { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border-color: rgba(239, 68, 68, 0.4); }

    .btn-sair {
      background: transparent;
      border: 1px solid #334155;
      color: #94a3b8;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 5px 10px;
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
    }

    /* CONTAINER PRINCIPAL */
    .container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 12px 14px 40px;
      flex: 1;
    }

    /* HEADER DE GESTÃO */
    .gestao-header {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      border-radius: 18px;
      padding: 16px;
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: var(--sombra-card);
    }
    @media (min-width: 768px) {
      .gestao-header {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
    }
    .gestao-header h2 {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--cor-texto);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .gestao-header p {
      font-size: 0.8rem;
      color: var(--cor-subtexto);
      margin-top: 4px;
    }

    .btn-principal {
      background: linear-gradient(135deg, var(--cor-roxo), #9333ea);
      color: #ffffff;
      border: none;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 0.88rem;
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 14px rgba(122, 43, 226, 0.3);
      min-height: 46px;
      transition: all 0.2s ease;
    }
    .btn-principal:hover {
      background: linear-gradient(135deg, var(--cor-roxo-hover), var(--cor-roxo));
      transform: translateY(-1px);
    }

    /* NAVEGAÇÃO DE ABAS */
    .tabs-nav {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 6px;
      margin-bottom: 14px;
      scrollbar-width: none;
    }
    .tabs-nav::-webkit-scrollbar { display: none; }

    .tab-btn {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      color: var(--cor-subtexto);
      padding: 9px 14px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.03);
      min-height: 42px;
    }
    .tab-btn.active {
      background: var(--cor-roxo);
      color: #ffffff;
      border-color: var(--cor-roxo);
      box-shadow: 0 4px 12px rgba(122, 43, 226, 0.25);
    }
    .tab-badge {
      background: rgba(0,0,0,0.08);
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 999px;
    }
    .tab-btn.active .tab-badge {
      background: rgba(255,255,255,0.25);
      color: #fff;
    }

    /* CONTEÚDO DAS ABAS */
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

    /* LAYOUT CALENDÁRIO */
    .calendario-layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 14px;
    }
    @media (min-width: 900px) {
      .calendario-layout {
        grid-template-columns: 2fr 1fr;
      }
    }

    .calendario-card {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      border-radius: 18px;
      padding: 14px;
      box-shadow: var(--sombra-card);
    }

    .cal-controls {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 14px;
    }
    @media (min-width: 600px) {
      .cal-controls {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
    }

    .cal-mes-ano {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cal-mes-ano h3 {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--cor-texto);
      min-width: 140px;
    }
    .cal-nav-btn {
      background: var(--cor-cinza-suave);
      border: 1px solid var(--cor-borda);
      color: var(--cor-texto);
      width: 34px;
      height: 34px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .cal-filtros {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .cal-select {
      background: var(--cor-input);
      border: 1px solid var(--cor-input-borda);
      color: var(--cor-texto);
      padding: 7px 10px;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 700;
      outline: none;
    }

    /* GRID DO CALENDÁRIO */
    .cal-weekdays {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      text-align: center;
      font-size: 0.7rem;
      font-weight: 800;
      color: var(--cor-subtexto);
      margin-bottom: 6px;
    }
    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
    }
    .cal-day {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      border-radius: 10px;
      min-height: 58px;
      padding: 4px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      position: relative;
      transition: all 0.15s ease;
    }
    .cal-day:active, .cal-day:hover {
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
    .cal-day.hoje .day-num { color: #0d9488; }

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
    .event-chip.confirmado { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .event-chip.pendente { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .event-chip.reuniao { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .event-chip.ensaio { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
    .event-chip.pastoral { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
    .event-chip.bloqueio { background: #f1f5f9; color: #64748b; border: 1px dashed #cbd5e1; }

    /* PAINEL LATERAL DO DIA SELECIONADO */
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

    .salao-status-box {
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 0.78rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .salao-status-box.livre { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    .salao-status-box.ocupado { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }

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
      gap: 10px;
      margin-top: 12px;
      font-size: 0.72rem;
      color: var(--cor-subtexto);
      font-weight: 600;
    }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot-verde { background: var(--cor-verde); }
    .dot-amarelo { background: var(--cor-amarelo); }
    .dot-azul { background: var(--cor-azul); }
    .dot-roxo { background: var(--cor-roxo); }

    /* TABELA DE SOLICITAÇÕES */
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
      min-width: 600px;
    }
    th {
      color: var(--cor-subtexto);
      font-weight: 800;
      padding: 10px 12px;
      border-bottom: 1px solid var(--cor-borda);
      text-transform: uppercase;
      font-size: 0.7rem;
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
    .badge-status.pendente { background: #fef3c7; color: #92400e; }
    .badge-status.aprovado { background: #dcfce7; color: #166534; }
    .badge-codigo {
      font-family: monospace;
      font-size: 0.75rem;
      font-weight: 800;
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      color: var(--cor-roxo);
    }

    /* MODAL DE AGENDAMENTO */
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
    .modal-overlay.active { display: flex; }

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
    }

    /* SELETOR DE AÇÃO DO MODAL */
    .action-selector-bar {
      display: flex;
      gap: 6px;
      padding: 10px 14px;
      background: var(--cor-cinza-suave);
      border-bottom: 1px solid var(--cor-borda);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .action-selector-bar::-webkit-scrollbar { display: none; }
    .action-pill {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      color: var(--cor-subtexto);
      font-size: 0.75rem;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
    }
    .action-pill.active {
      background: var(--cor-roxo);
      color: #ffffff;
      border-color: var(--cor-roxo);
    }

    .modal-body {
      padding: 14px 18px;
      overflow-y: auto;
      flex: 1;
    }
    .form-section { display: none; }
    .form-section.active { display: block; }

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
      background: var(--cor-input);
      border: 1.5px solid var(--cor-input-borda);
      color: var(--cor-texto);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 0.88rem;
      outline: none;
      transition: border 0.15s;
    }
    .form-control:focus {
      border-color: var(--cor-roxo);
      box-shadow: 0 0 0 3px rgba(122, 43, 226, 0.15);
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    @media (min-width: 600px) {
      .form-row.two-cols { grid-template-columns: 1fr 1fr; }
      .form-row.three-cols { grid-template-columns: 1fr 1fr 1fr; }
    }

    .modal-footer {
      padding: 12px 18px;
      border-top: 1px solid var(--cor-borda);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
    }
    .btn-secundario {
      background: var(--cor-cinza-suave);
      border: 1px solid var(--cor-borda);
      color: var(--cor-texto);
      padding: 10px 16px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.82rem;
      cursor: pointer;
    }

    .alert-banner {
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 0.78rem;
      font-weight: 700;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .alert-banner.warning { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
    .alert-banner.info { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
  </style>
</head>
<body>

  <!-- TOPBAR -->
  <header class="topbar">
    <div class="brand-container">
      <img src="/images/logo.png" alt="Logo" class="brand-logo" onerror="this.style.display='none'" />
      <div class="brand-info">
        <h1>Comunidade Cristã Curados</h1>
        <span>Gestão de Eventos</span>
      </div>
    </div>
    <div class="user-profile-badge">
      <div class="user-name-tag">
        <div class="name">${perfil?.nome || 'Líder'}</div>
        <span class="role-pill ${perfil?.perfilTitulo?.toLowerCase()}">${perfil?.perfilTitulo || 'Líder'}</span>
      </div>
      <a href="/logout" class="btn-sair">Sair</a>
    </div>
  </header>

  <!-- CONTAINER -->
  <main class="container">
    
    <!-- HEADER -->
    <section class="gestao-header">
      <div>
        <h2>🎪 Gestão de Eventos & Agendas</h2>
        <p>Acompanhe o calendário, verifique a disponibilidade do salão e solicite aprovações à Secretaria.</p>
      </div>
      <button class="btn-principal" onclick="abrirModalAcao('evento')">
        ➕ Novo Agendamento
      </button>
    </section>

    <!-- NAVEGAÇÃO DE ABAS -->
    <nav class="tabs-nav">
      <button class="tab-btn active" onclick="trocarAba('calendario')">
        📅 Calendário
      </button>
      <button class="tab-btn" onclick="trocarAba('solicitacoes')">
        📋 Minhas Solicitações <span class="tab-badge" id="badgeTotalSol">0</span>
      </button>
      <button class="tab-btn" onclick="trocarAba('fichas')">
        📑 Fichas de Eventos
      </button>
      ${perfil?.isPastor || perfil?.isDiretor ? `
      <button class="tab-btn" onclick="trocarAba('pastoral')">
        📖 Área Pastoral
      </button>
      ` : ''}
    </nav>

    <!-- ABA 1: CALENDÁRIO -->
    <div id="pane-calendario" class="tab-pane active">
      <div class="calendario-layout">
        
        <!-- CARD PRINCIPAL DO CALENDÁRIO -->
        <div class="calendario-card">
          <div class="cal-controls">
            <div class="cal-mes-ano">
              <button class="cal-nav-btn" onclick="mudarMes(-1)">‹</button>
              <h3 id="labelMesAno">Carregando...</h3>
              <button class="cal-nav-btn" onclick="mudarMes(1)">›</button>
              <button class="cal-nav-btn" onclick="irParaHoje()" style="width: auto; padding: 0 10px;">Hoje</button>
            </div>
            <div class="cal-filtros">
              <select id="filtroDepartamento" class="cal-select" onchange="filtrarCalendario()">
                <option value="todos">Todos os Ministérios</option>
                ${(perfil?.departamentos || []).map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
              <select id="filtroTipo" class="cal-select" onchange="filtrarCalendario()">
                <option value="todos">Todos os Tipos</option>
                <option value="evento">Eventos</option>
                <option value="reuniao">Reuniões</option>
                <option value="ensaio">Ensaios</option>
                ${perfil?.isPastor || perfil?.isDiretor ? '<option value="atendimento">Atendimentos</option>' : ''}
              </select>
            </div>
          </div>

          <div class="cal-weekdays">
            <div>DOM</div><div>SEG</div><div>TER</div><div>QUA</div><div>QUI</div><div>SEX</div><div>SÁB</div>
          </div>
          <div class="cal-grid" id="gridCalendario"></div>

          <div class="cal-legend">
            <div class="legend-item"><span class="legend-dot dot-verde"></span> Evento Confirmado</div>
            <div class="legend-item"><span class="legend-dot dot-amarelo"></span> Aguardando Secretaria</div>
            <div class="legend-item"><span class="legend-dot dot-azul"></span> Reunião / Ensaio</div>
            ${perfil?.isPastor || perfil?.isDiretor ? '<div class="legend-item"><span class="legend-dot dot-roxo"></span> Atendimento Pastoral</div>' : ''}
          </div>
        </div>

        <!-- PAINEL LATERAL DO DIA -->
        <div class="day-details-panel">
          <div class="day-details-header">
            <h3 id="labelDiaSelecionado">Selecione um dia</h3>
            <p id="labelSubDiaSelecionado">Clique em qualquer data do calendário</p>
          </div>

          <div id="statusSalaoDia" class="salao-status-box livre">
            💡 Salão disponível nesta data!
          </div>

          <div id="listaEventosDia">
            <p style="font-size: 0.8rem; color: var(--cor-subtexto); text-align: center; padding: 20px 0;">
              Nenhum evento registrado nesta data.
            </p>
          </div>

          <button class="btn-principal" onclick="agendarDataSelecionada()" style="width: 100%; margin-top: auto;">
            ➕ Agendar neste Dia
          </button>
        </div>

      </div>
    </div>

    <!-- ABA 2: SOLICITAÇÕES -->
    <div id="pane-solicitacoes" class="tab-pane">
      <div class="solicitacoes-table-card">
        <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 12px;">Histórico de Solicitações</h3>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Nome / Evento</th>
              <th>Ministério</th>
              <th>Data</th>
              <th>Horário</th>
              <th>Responsável</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="tabelaCorpoSolicitacoes">
            <tr><td colspan="8" style="text-align: center; color: var(--cor-subtexto);">Carregando solicitações...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ABA 3: FICHAS DE EVENTOS -->
    <div id="pane-fichas" class="tab-pane">
      <div class="solicitacoes-table-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 1.1rem; font-weight: 800;">Fichas e Formulários de Eventos</h3>
          <span style="font-size: 0.75rem; color: var(--cor-subtexto); font-weight: 700;">
            ${perfil?.isPastor ? 'Acesso Pastoral Total' : `Fichas do Departamento (${perfil?.departamentoPrincipal})`}
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Evento</th>
              <th>Departamento</th>
              <th>Data</th>
              <th>Responsável</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="tabelaCorpoFichas">
            <tr><td colspan="6" style="text-align: center; color: var(--cor-subtexto);">Carregando fichas...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ABA 4: ÁREA PASTORAL -->
    ${perfil?.isPastor || perfil?.isDiretor ? `
    <div id="pane-pastoral" class="tab-pane">
      <div class="solicitacoes-table-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <div>
            <h3 style="font-size: 1.1rem; font-weight: 800;">📖 Área Pastoral & Atendimentos</h3>
            <p style="font-size: 0.78rem; color: var(--cor-subtexto);">Acompanhamento sigiloso de atendimentos e orientações pastorais.</p>
          </div>
          ${perfil?.isPastor ? `
          <button class="btn-principal" onclick="abrirModalAcao('atendimento')" style="min-height: 38px; padding: 8px 14px; font-size: 0.78rem;">
            ➕ Novo Atendimento
          </button>
          ` : ''}
        </div>
        <div id="listaAtendimentosPastoral">
          <p style="text-align: center; padding: 20px 0; color: var(--cor-subtexto);">Carregando atendimentos pastorais...</p>
        </div>
      </div>
    </div>
    ` : ''}

  </main>

  <!-- MODAL DE AGENDAMENTO MULTI-AÇÕES -->
  <div class="modal-overlay modal-agendamento" id="modalAgendamento">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalTitulo">➕ Agendamento</h3>
        <button class="modal-close-btn" onclick="fecharModalAgendamento()">✕</button>
      </div>

      <!-- SELETOR DE AÇÕES -->
      <div class="action-selector-bar">
        <button class="action-pill active" onclick="selecionarAcaoModal('evento')">🎪 Novo Evento</button>
        <button class="action-pill" onclick="selecionarAcaoModal('reuniao')">🤝 Reunião</button>
        ${perfil?.isPastor ? '<button class="action-pill" onclick="selecionarAcaoModal(\'atendimento\')">📖 Atendimento Pastoral</button>' : ''}
        <button class="action-pill" onclick="selecionarAcaoModal('alterar')">🔄 Alterar Evento</button>
        <button class="action-pill" onclick="selecionarAcaoModal('cancelar')">🗑️ Cancelar Evento</button>
      </div>

      <div class="modal-body">

        <!-- 1. FORMULÁRIO: NOVO EVENTO -->
        <form id="formNovoEvento" class="form-section active" onsubmit="submeterNovoEvento(event)">
          <div class="alert-banner info">
            📌 O evento será enviado automaticamente para aprovação da Secretaria no WhatsApp.
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>Nome do Evento *</label>
              <input type="text" class="form-control" id="ev_nome" placeholder="Ex: Chá das Mulheres" required />
            </div>
            <div class="form-group">
              <label>Ministério / Departamento *</label>
              <select class="form-control" id="ev_departamento" required>
                ${(perfil?.departamentos || ['Geral']).map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Formato de Duração *</label>
            <select class="form-control" id="ev_tipo_duracao" onchange="mudarTipoDuracaoEvento()">
              <option value="unico">📅 Dia Único</option>
              <option value="multiplo">📆 Múltiplos Dias / Blocos de Sessões</option>
              <option value="consecutivo">⛺ Dias Consecutivos (Ex: Acampamento)</option>
            </select>
          </div>

          <!-- Campos Dia Único -->
          <div id="secaoDiaUnico">
            <div class="form-row three-cols">
              <div class="form-group">
                <label>Data *</label>
                <input type="text" class="form-control" id="ev_data" placeholder="DD/MM/AAAA" />
              </div>
              <div class="form-group">
                <label>Horário Início *</label>
                <input type="time" class="form-control" id="ev_hora_ini" value="19:00" />
              </div>
              <div class="form-group">
                <label>Horário Término *</label>
                <input type="time" class="form-control" id="ev_hora_fim" value="21:30" />
              </div>
            </div>
          </div>

          <!-- Campos Múltiplos Dias -->
          <div id="secaoMultiplosDias" style="display: none;">
            <div class="form-group">
              <label>Sessões / Blocos Programados</label>
              <div id="containerBlocos" style="display: flex; flex-direction: column; gap: 8px;"></div>
              <button type="button" class="btn-secundario" onclick="adicionarBlocoSessao()" style="margin-top: 8px;">
                ➕ Adicionar Sessão
              </button>
            </div>
          </div>

          <!-- Campos Consecutivo -->
          <div id="secaoConsecutivo" style="display: none;">
            <div class="form-row two-cols">
              <div class="form-group">
                <label>Data de Início *</label>
                <input type="text" class="form-control" id="ev_consec_data_ini" placeholder="DD/MM/AAAA" />
              </div>
              <div class="form-group">
                <label>Hora de Início *</label>
                <input type="time" class="form-control" id="ev_consec_hora_ini" value="18:00" />
              </div>
            </div>
            <div class="form-row two-cols">
              <div class="form-group">
                <label>Data de Término *</label>
                <input type="text" class="form-control" id="ev_consec_data_fim" placeholder="DD/MM/AAAA" />
              </div>
              <div class="form-group">
                <label>Hora de Término *</label>
                <input type="time" class="form-control" id="ev_consec_hora_fim" value="16:00" />
              </div>
            </div>
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>Local do Evento</label>
              <input type="text" class="form-control" id="ev_local" value="${ENDERECO_IGREJA}" />
            </div>
            <div class="form-group">
              <label>Público Alvo</label>
              <select class="form-control" id="ev_publico">
                <option value="Toda a Igreja">Toda a Igreja</option>
                <option value="Mulheres">Mulheres</option>
                <option value="Homens">Homens</option>
                <option value="Jovens">Jovens</option>
                <option value="Crianças">Crianças</option>
                <option value="Casais">Casais</option>
                <option value="Liderança">Liderança</option>
              </select>
            </div>
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>Tema do Evento</label>
              <input type="text" class="form-control" id="ev_tema" placeholder="Ex: Mulheres Restauradas" />
            </div>
            <div class="form-group">
              <label>Versículo Chave</label>
              <input type="text" class="form-control" id="ev_versiculo" placeholder="Ex: Provérbios 31:10" />
            </div>
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>Precisa de Inscrição?</label>
              <select class="form-control" id="ev_inscricao" onchange="document.getElementById('ev_valor_box').style.display = this.value === 'sim' ? 'block' : 'none'">
                <option value="nao">Não (Entrada Livre)</option>
                <option value="sim">Sim (Pago ou Controle)</option>
              </select>
            </div>
            <div class="form-group" id="ev_valor_box" style="display: none;">
              <label>Valor da Inscrição (R$)</label>
              <input type="text" class="form-control" id="ev_valor" placeholder="Ex: 25,00" />
            </div>
          </div>

          <div class="form-group">
            <label>Precisará de verba da Tesouraria da Igreja?</label>
            <select class="form-control" id="ev_tesouraria">
              <option value="nao">Não</option>
              <option value="sim">Sim (Encaminhar aviso à Tesouraria)</option>
            </select>
          </div>

          <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn-secundario" onclick="fecharModalAgendamento()">Cancelar</button>
            <button type="submit" class="btn-principal" id="btnSalvarEvento">Enviar Solicitação</button>
          </div>
        </form>

        <!-- 2. FORMULÁRIO: REUNIÃO DE LIDERANÇA -->
        <form id="formNovaReuniao" class="form-section" onsubmit="submeterNovaReuniao(event)">
          <div class="alert-banner info">
            🤝 A reunião de liderança será registrada e a Ata gerada automaticamente.
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>Departamento / Ministério *</label>
              <select class="form-control" id="reu_departamento" required>
                ${(perfil?.departamentos || ['Liderança']).map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Data *</label>
              <input type="text" class="form-control" id="reu_data" placeholder="DD/MM/AAAA" required />
            </div>
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>Horário Início *</label>
              <input type="time" class="form-control" id="reu_hora_ini" value="19:30" required />
            </div>
            <div class="form-group">
              <label>Horário Término *</label>
              <input type="time" class="form-control" id="reu_hora_fim" value="21:00" required />
            </div>
          </div>

          <div class="form-group">
            <label>Local</label>
            <input type="text" class="form-control" id="reu_local" value="Na Igreja" />
          </div>

          <div class="form-group">
            <label>Pauta da Reunião</label>
            <textarea class="form-control" id="reu_pauta" rows="3" placeholder="Tópicos que serão abordados na reunião..."></textarea>
          </div>

          <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn-secundario" onclick="fecharModalAgendamento()">Cancelar</button>
            <button type="submit" class="btn-principal" id="btnSalvarReuniao">Solicitar Reunião</button>
          </div>
        </form>

        <!-- 3. FORMULÁRIO: ATENDIMENTO PASTORAL (Pastores) -->
        ${perfil?.isPastor ? `
        <form id="formAtendimentoPastoral" class="form-section" onsubmit="submeterAtendimentoPastoral(event)">
          <div class="alert-banner info">
            📖 Agendamento pastoral confidencial. Visível apenas para pastores e diretoria (mascarado).
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>Nome do Discípulo / Membro *</label>
              <input type="text" class="form-control" id="at_discipulo" placeholder="Nome completo" required />
            </div>
            <div class="form-group">
              <label>Telefone do Discípulo</label>
              <input type="tel" class="form-control" id="at_telefone" placeholder="(11) 99999-9999" />
            </div>
          </div>

          <div class="form-row three-cols">
            <div class="form-group">
              <label>Data *</label>
              <input type="text" class="form-control" id="at_data" placeholder="DD/MM/AAAA" required />
            </div>
            <div class="form-group">
              <label>Início *</label>
              <input type="time" class="form-control" id="at_hora_ini" value="14:00" required />
            </div>
            <div class="form-group">
              <label>Término *</label>
              <input type="time" class="form-control" id="at_hora_fim" value="15:00" required />
            </div>
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>Pastor Responsável</label>
              <input type="text" class="form-control" id="at_pastor" value="${perfil?.nome}" />
            </div>
            <div class="form-group">
              <label>Local</label>
              <input type="text" class="form-control" id="at_local" value="Gabinete Pastoral" />
            </div>
          </div>

          <div class="form-group">
            <label>Motivo / Observações Confidenciais</label>
            <textarea class="form-control" id="at_motivo" rows="2" placeholder="Assunto confidencial..."></textarea>
          </div>

          <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn-secundario" onclick="fecharModalAgendamento()">Cancelar</button>
            <button type="submit" class="btn-principal" id="btnSalvarAtendimento">Confirmar Atendimento</button>
          </div>
        </form>
        ` : ''}

        <!-- 4. FORMULÁRIO: ALTERAR EVENTO -->
        <form id="formAlterarEvento" class="form-section" onsubmit="submeterAlterarEvento(event)">
          <div class="alert-banner warning">
            🔄 A solicitação de alteração será enviada à Secretaria para confirmação.
          </div>

          <div class="form-group">
            <label>Evento a ser Alterado *</label>
            <input type="text" class="form-control" id="alt_evento" placeholder="Nome exato do evento já agendado" required />
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>O que deseja alterar? *</label>
              <select class="form-control" id="alt_campo" required>
                <option value="Data">Data</option>
                <option value="Horário">Horário</option>
                <option value="Local">Local</option>
                <option value="Outro">Outro Detalhe</option>
              </select>
            </div>
            <div class="form-group">
              <label>Nova Informação *</label>
              <input type="text" class="form-control" id="alt_novo_valor" placeholder="Ex: Nova data 25/11 ou 19h às 21h" required />
            </div>
          </div>

          <div class="form-group">
            <label>Motivo da Alteração</label>
            <textarea class="form-control" id="alt_motivo" rows="2" placeholder="Explique brevemente o motivo da mudança..."></textarea>
          </div>

          <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn-secundario" onclick="fecharModalAgendamento()">Cancelar</button>
            <button type="submit" class="btn-principal" id="btnSalvarAlteracao">Enviar Alteração</button>
          </div>
        </form>

        <!-- 5. FORMULÁRIO: CANCELAR EVENTO -->
        <form id="formCancelarEvento" class="form-section" onsubmit="submeterCancelarEvento(event)">
          <div class="alert-banner warning">
            ⚠️ O cancelamento remove o evento da agenda oficial e notifica a Secretaria.
          </div>

          <div class="form-group">
            <label>Evento a ser Cancelado *</label>
            <input type="text" class="form-control" id="canc_evento" placeholder="Nome do evento" required />
          </div>

          <div class="form-group">
            <label>Motivo do Cancelamento *</label>
            <textarea class="form-control" id="canc_motivo" rows="3" placeholder="Informe o motivo do cancelamento..." required></textarea>
          </div>

          <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn-secundario" onclick="fecharModalAgendamento()">Voltar</button>
            <button type="submit" class="btn-principal" id="btnSalvarCancelamento" style="background: var(--cor-vermelho);">
              Confirmar Cancelamento
            </button>
          </div>
        </form>

      </div>
    </div>
  </div>

  <script>
    const usuarioLogado = ${jsonPerfil};

    let dataAtual = new Date();
    let mesAtual = dataAtual.getMonth();
    let anoAtual = dataAtual.getFullYear();
    let diaSelecionado = dataAtual.getDate();

    let todosEventos = [];
    let todasSolicitacoes = [];
    let todasFichas = [];

    const nomesMeses = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    document.addEventListener('DOMContentLoaded', () => {
      carregarEventosServidor();
      carregarSolicitacoesServidor();
      carregarFichasServidor();
    });

    function trocarAba(abaId) {
      document.querySelectorAll('.tabs-nav .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      const targetPane = document.getElementById('pane-' + abaId);
      if (targetPane) targetPane.classList.add('active');

      const btnAba = Array.from(document.querySelectorAll('.tabs-nav .tab-btn'))
        .find(b => b.innerText.toLowerCase().includes(abaId.slice(0, 4)));
      if (btnAba) btnAba.classList.add('active');
    }

    async function carregarEventosServidor() {
      try {
        const res = await fetch(\`/gestao/api/eventos?mes=\${mesAtual + 1}&ano=\${anoAtual}\`);
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.eventos)) {
          todosEventos = data.eventos;
          renderizarCalendario();
          selecionarDia(diaSelecionado);
        }
      } catch (err) {
        console.warn('Erro ao carregar eventos:', err);
      }
    }

    async function carregarSolicitacoesServidor() {
      try {
        const res = await fetch('/gestao/api/solicitacoes');
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.solicitacoes)) {
          todasSolicitacoes = data.solicitacoes;
          document.getElementById('badgeTotalSol').innerText = todasSolicitacoes.length;
          renderizarTabelaSol();
        }
      } catch (_) {}
    }

    async function carregarFichasServidor() {
      try {
        const res = await fetch('/gestao/api/fichas');
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.fichas)) {
          todasFichas = data.fichas;
          renderizarTabelaFichas();
        }
      } catch (_) {}
    }

    function mudarMes(delta) {
      mesAtual += delta;
      if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual--;
      } else if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual++;
      }
      diaSelecionado = 1;
      carregarEventosServidor();
    }

    function irParaHoje() {
      const hoje = new Date();
      mesAtual = hoje.getMonth();
      anoAtual = hoje.getFullYear();
      diaSelecionado = hoje.getDate();
      carregarEventosServidor();
    }

    function renderizarCalendario() {
      const label = document.getElementById('labelMesAno');
      if (label) label.innerText = \`\${nomesMeses[mesAtual]} de \${anoAtual}\`;

      const grid = document.getElementById('gridCalendario');
      if (!grid) return;
      grid.innerHTML = '';

      const primeiroDiaSemana = new Date(anoAtual, mesAtual, 1).getDay();
      const totalDiasMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
      const totalDiasMesAnterior = new Date(anoAtual, mesAtual, 0).getDate();

      const hoje = new Date();
      const ehMesAtual = hoje.getMonth() === mesAtual && hoje.getFullYear() === anoAtual;

      // Dias do mês anterior
      for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
        const d = totalDiasMesAnterior - i;
        const cell = document.createElement('div');
        cell.className = 'cal-day outro-mes';
        cell.innerHTML = \`<div class="day-num">\${d}</div>\`;
        grid.appendChild(cell);
      }

      // Dias do mês atual
      for (let d = 1; d <= totalDiasMes; d++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day';
        if (ehMesAtual && d === hoje.getDate()) cell.classList.add('hoje');
        if (d === diaSelecionado) cell.classList.add('selecionado');

        cell.onclick = () => selecionarDia(d);

        const dataStr = \`\${String(d).padStart(2, '0')}/\${String(mesAtual + 1).padStart(2, '0')}/\${anoAtual}\`;
        const eventosDia = obterEventosNaData(dataStr);

        let chipsHtml = '';
        eventosDia.slice(0, 3).forEach(ev => {
          let chipClass = 'confirmado';
          if (ev.status === 'pendente_secretaria') chipClass = 'pendente';
          else if (ev.tipo === 'reuniao') chipClass = 'reuniao';
          else if (ev.tipo === 'ensaio') chipClass = 'ensaio';
          else if (ev.tipo === 'atendimento') chipClass = 'pastoral';
          else if (ev.isOcupacaoExterna) chipClass = 'bloqueio';

          chipsHtml += \`<span class="event-chip \${chipClass}" title="\${ev.titulo}">\${ev.titulo}</span>\`;
        });
        if (eventosDia.length > 3) {
          chipsHtml += \`<span class="event-chip bloqueio">+\${eventosDia.length - 3} mais</span>\`;
        }

        cell.innerHTML = \`<div class="day-num">\${d}</div><div class="day-events">\${chipsHtml}</div>\`;
        grid.appendChild(cell);
      }
    }

    function obterEventosNaData(dataStr) {
      const filtroDepto = document.getElementById('filtroDepartamento')?.value || 'todos';
      const filtroTipo = document.getElementById('filtroTipo')?.value || 'todos';

      return todosEventos.filter(ev => {
        if (ev.data !== dataStr) return false;
        if (filtroDepto !== 'todos' && ev.departamento !== filtroDepto && !ev.isOcupacaoExterna) return false;
        if (filtroTipo !== 'todos' && ev.tipo !== filtroTipo) return false;
        return true;
      });
    }

    function selecionarDia(d) {
      diaSelecionado = d;
      document.querySelectorAll('.cal-day').forEach(c => c.classList.remove('selecionado'));

      const grid = document.getElementById('gridCalendario');
      if (grid) {
        const primeiroDiaSemana = new Date(anoAtual, mesAtual, 1).getDay();
        const index = primeiroDiaSemana + d - 1;
        if (grid.children[index]) grid.children[index].classList.add('selecionado');
      }

      const dataStr = \`\${String(d).padStart(2, '0')}/\${String(mesAtual + 1).padStart(2, '0')}/\${anoAtual}\`;
      const diaSemanaNome = new Date(anoAtual, mesAtual, d).toLocaleDateString('pt-BR', { weekday: 'long' });

      document.getElementById('labelDiaSelecionado').innerText = dataStr;
      document.getElementById('labelSubDiaSelecionado').innerText = diaSemanaNome.charAt(0).toUpperCase() + diaSemanaNome.slice(1);

      const eventosDia = obterEventosNaData(dataStr);
      const container = document.getElementById('listaEventosDia');
      const boxSalao = document.getElementById('statusSalaoDia');

      if (eventosDia.length === 0) {
        container.innerHTML = '<p style="font-size: 0.8rem; color: var(--cor-subtexto); text-align: center; padding: 20px 0;">Nenhum evento registrado nesta data.</p>';
        boxSalao.className = 'salao-status-box livre';
        boxSalao.innerHTML = '💡 Salão disponível nesta data!';
      } else {
        boxSalao.className = 'salao-status-box ocupado';
        boxSalao.innerHTML = \`⚠️ Salão com \${eventosDia.length} evento(s) agendado(s)\`;

        container.innerHTML = eventosDia.map(ev => \`
          <div class="day-event-card">
            <div class="title">\${ev.titulo}</div>
            <div class="meta">
              <span>🏢 \${ev.departamento} • \${ev.tipo.toUpperCase()}</span>
              <span>⏰ \${ev.horarioInicio || '19:00'} \${ev.horarioFim ? 'às ' + ev.horarioFim : ''}</span>
              <span>📍 \${ev.local}</span>
              \${ev.status === 'pendente_secretaria' ? '<span style="color: var(--cor-amarelo); font-weight:800;">⏳ Aguardando Aprovação</span>' : '<span style="color: var(--cor-verde); font-weight:800;">✅ Confirmado</span>'}
            </div>
          </div>
        \`).join('');
      }
    }

    function agendarDataSelecionada() {
      const dataStr = \`\${String(diaSelecionado).padStart(2, '0')}/\${String(mesAtual + 1).padStart(2, '0')}/\${anoAtual}\`;
      abrirModalAcao('evento', dataStr);
    }

    function abrirModalAcao(acao = 'evento', dataPreDefinida = null) {
      document.getElementById('modalAgendamento').classList.add('active');
      selecionarAcaoModal(acao);

      const dataStr = dataPreDefinida || \`\${String(diaSelecionado).padStart(2, '0')}/\${String(mesAtual + 1).padStart(2, '0')}/\${anoAtual}\`;
      if (document.getElementById('ev_data')) document.getElementById('ev_data').value = dataStr;
      if (document.getElementById('reu_data')) document.getElementById('reu_data').value = dataStr;
      if (document.getElementById('at_data')) document.getElementById('at_data').value = dataStr;
    }

    function fecharModalAgendamento() {
      document.getElementById('modalAgendamento').classList.remove('active');
    }

    function selecionarAcaoModal(acao) {
      document.querySelectorAll('.action-pill').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));

      const mapForm = {
        'evento': 'formNovoEvento',
        'reuniao': 'formNovaReuniao',
        'atendimento': 'formAtendimentoPastoral',
        'alterar': 'formAlterarEvento',
        'cancelar': 'formCancelarEvento'
      };

      const mapTitulo = {
        'evento': '🎪 Novo Evento',
        'reuniao': '🤝 Nova Reunião de Liderança',
        'atendimento': '📖 Agendar Atendimento Pastoral',
        'alterar': '🔄 Alterar Evento Existente',
        'cancelar': '🗑️ Cancelar Evento'
      };

      const fId = mapForm[acao];
      if (fId && document.getElementById(fId)) {
        document.getElementById(fId).classList.add('active');
      }

      document.getElementById('modalTitulo').innerText = mapTitulo[acao] || '➕ Agendamento';

      const btnPill = Array.from(document.querySelectorAll('.action-pill')).find(p => p.innerText.toLowerCase().includes(acao));
      if (btnPill) btnPill.classList.add('active');
    }

    function mudarTipoDuracaoEvento() {
      const tipo = document.getElementById('ev_tipo_duracao').value;
      document.getElementById('secaoDiaUnico').style.display = tipo === 'unico' ? 'block' : 'none';
      document.getElementById('secaoMultiplosDias').style.display = tipo === 'multiplo' ? 'block' : 'none';
      document.getElementById('secaoConsecutivo').style.display = tipo === 'consecutivo' ? 'block' : 'none';
    }

    let contadorBlocos = 0;
    function adicionarBlocoSessao() {
      contadorBlocos++;
      const container = document.getElementById('containerBlocos');
      const div = document.createElement('div');
      div.className = 'form-row three-cols';
      div.style.background = '#f8fafc';
      div.style.padding = '8px';
      div.style.borderRadius = '8px';
      div.id = 'bloco_' + contadorBlocos;

      div.innerHTML = \`
        <div><input type="text" class="form-control" placeholder="Data DD/MM" id="bloco_data_\${contadorBlocos}" /></div>
        <div><input type="time" class="form-control" value="19:00" id="bloco_ini_\${contadorBlocos}" /></div>
        <div style="display: flex; gap: 4px;">
          <input type="time" class="form-control" value="21:30" id="bloco_fim_\${contadorBlocos}" />
          <button type="button" class="btn-secundario" onclick="document.getElementById('bloco_\${contadorBlocos}').remove()" style="padding: 0 8px;">✕</button>
        </div>
      \`;
      container.appendChild(div);
    }

    async function submeterNovoEvento(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSalvarEvento');
      btn.disabled = true;
      btn.innerText = 'Enviando...';

      const tipo = document.getElementById('ev_tipo_duracao').value;
      const blocos = [];
      if (tipo === 'multiplo') {
        const container = document.getElementById('containerBlocos');
        container.querySelectorAll('.form-row').forEach(row => {
          const inputs = row.querySelectorAll('input');
          if (inputs[0]?.value) {
            blocos.push({ data: inputs[0].value, inicio: inputs[1]?.value || '19:00', fim: inputs[2]?.value || '21:30' });
          }
        });
      }

      const payload = {
        tipo: 'evento',
        nome_evento: document.getElementById('ev_nome').value,
        departamento: document.getElementById('ev_departamento').value,
        tipo_duracao: tipo,
        data: document.getElementById('ev_data').value,
        horario_inicio: document.getElementById('ev_hora_ini').value,
        horario_termino: document.getElementById('ev_hora_fim').value,
        blocos_json: blocos.length > 0 ? JSON.stringify(blocos) : null,
        data_inicio_consecutivo: document.getElementById('ev_consec_data_ini')?.value,
        data_fim_consecutivo: document.getElementById('ev_consec_data_fim')?.value,
        hora_inicio_consecutivo: document.getElementById('ev_consec_hora_ini')?.value,
        hora_fim_consecutivo: document.getElementById('ev_consec_hora_fim')?.value,
        local: document.getElementById('ev_local').value,
        publico: document.getElementById('ev_publico').value,
        tema: document.getElementById('ev_tema').value,
        versiculo: document.getElementById('ev_versiculo').value,
        precisa_inscricao: document.getElementById('ev_inscricao').value,
        valor_inscricao: document.getElementById('ev_valor')?.value,
        precisa_valor_ministerio: document.getElementById('ev_tesouraria').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ret = await res.json();
        if (ret.ok) {
          alert('✅ ' + (ret.mensagem || 'Evento solicitado com sucesso!'));
          fecharModalAgendamento();
          carregarEventosServidor();
          carregarSolicitacoesServidor();
        } else {
          alert('❌ Erro: ' + ret.message);
        }
      } catch (err) {
        alert('❌ Erro de conexão com o servidor.');
      } finally {
        btn.disabled = false;
        btn.innerText = 'Enviar Solicitação';
      }
    }

    async function submeterNovaReuniao(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSalvarReuniao');
      btn.disabled = true;
      btn.innerText = 'Enviando...';

      const payload = {
        tipo: 'reuniao',
        departamento: document.getElementById('reu_departamento').value,
        data: document.getElementById('reu_data').value,
        horario_inicio: document.getElementById('reu_hora_ini').value,
        horario_termino: document.getElementById('reu_hora_fim').value,
        local: document.getElementById('reu_local').value,
        pauta: document.getElementById('reu_pauta').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ret = await res.json();
        if (ret.ok) {
          alert('✅ ' + (ret.mensagem || 'Reunião solicitada com sucesso!'));
          fecharModalAgendamento();
          carregarEventosServidor();
          carregarSolicitacoesServidor();
        } else {
          alert('❌ Erro: ' + ret.message);
        }
      } catch (_) {
        alert('❌ Erro ao enviar solicitação.');
      } finally {
        btn.disabled = false;
        btn.innerText = 'Solicitar Reunião';
      }
    }

    async function submeterAtendimentoPastoral(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSalvarAtendimento');
      btn.disabled = true;

      const payload = {
        tipo: 'atendimento',
        nome_discipulo: document.getElementById('at_discipulo').value,
        telefone_discipulo: document.getElementById('at_telefone').value,
        pastor_responsavel: document.getElementById('at_pastor').value,
        data: document.getElementById('at_data').value,
        horario_inicio: document.getElementById('at_hora_ini').value,
        horario_termino: document.getElementById('at_hora_fim').value,
        local: document.getElementById('at_local').value,
        motivo: document.getElementById('at_motivo').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ret = await res.json();
        if (ret.ok) {
          alert('✅ ' + (ret.mensagem || 'Atendimento agendado!'));
          fecharModalAgendamento();
          carregarEventosServidor();
        } else {
          alert('❌ Erro: ' + ret.message);
        }
      } catch (_) {
        alert('❌ Erro ao salvar atendimento.');
      } finally {
        btn.disabled = false;
      }
    }

    async function submeterAlterarEvento(e) {
      e.preventDefault();
      const payload = {
        tipo: 'alterar',
        nome_evento: document.getElementById('alt_evento').value,
        campo_alterar: document.getElementById('alt_campo').value,
        novo_valor: document.getElementById('alt_novo_valor').value,
        motivo: document.getElementById('alt_motivo').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ret = await res.json();
        if (ret.ok) {
          alert('✅ ' + (ret.mensagem || 'Pedido de alteração enviado!'));
          fecharModalAgendamento();
          carregarSolicitacoesServidor();
        } else {
          alert('❌ Erro: ' + ret.message);
        }
      } catch (_) {
        alert('❌ Erro ao enviar alteração.');
      }
    }

    async function submeterCancelarEvento(e) {
      e.preventDefault();
      const payload = {
        tipo: 'cancelar',
        nome_evento: document.getElementById('canc_evento').value,
        motivo: document.getElementById('canc_motivo').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ret = await res.json();
        if (ret.ok) {
          alert('✅ ' + (ret.mensagem || 'Pedido de cancelamento enviado!'));
          fecharModalAgendamento();
          carregarSolicitacoesServidor();
        } else {
          alert('❌ Erro: ' + ret.message);
        }
      } catch (_) {
        alert('❌ Erro ao enviar cancelamento.');
      }
    }

    function renderizarTabelaSol() {
      const tbody = document.getElementById('tabelaCorpoSolicitacoes');
      if (!tbody) return;

      if (todasSolicitacoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--cor-subtexto);">Nenhuma solicitação encontrada.</td></tr>';
        return;
      }

      tbody.innerHTML = todasSolicitacoes.map(sol => \`
        <tr>
          <td><span class="badge-codigo">\${sol.codigo || '-'}</span></td>
          <td><strong>\${(sol.tipo || 'evento').toUpperCase()}</strong></td>
          <td><strong>\${sol.titulo}</strong></td>
          <td>\${sol.departamento}</td>
          <td>\${sol.data || '-'}</td>
          <td>\${sol.horarioInicio} \${sol.horarioFim ? 'às ' + sol.horarioFim : ''}</td>
          <td>\${sol.responsavel || '-'}</td>
          <td><span class="badge-status \${sol.statusClass}">\${sol.status}</span></td>
        </tr>
      \`).join('');
    }

    function renderizarTabelaFichas() {
      const tbody = document.getElementById('tabelaCorpoFichas');
      if (!tbody) return;

      if (todasFichas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--cor-subtexto);">Nenhuma ficha disponível para seu perfil.</td></tr>';
        return;
      }

      tbody.innerHTML = todasFichas.map(f => {
        let p = {};
        try { p = JSON.parse(f.payload); } catch (_) {}
        return \`
          <tr>
            <td>#\${f.id}</td>
            <td><strong>\${f.evento}</strong></td>
            <td>\${f.departamento}</td>
            <td>\${f.data}</td>
            <td>\${p.nome_lider || p.nomeSolicitante || '-'}</td>
            <td>
              \${f.docUrl ? \`<a href="\${f.docUrl}" target="_blank" class="btn-secundario" style="text-decoration: none; padding: 4px 8px; font-size: 0.72rem;">Abrir Google Docs</a>\` : '<span style="color: var(--cor-subtexto); font-size: 0.72rem;">Docs em geração</span>'}
            </td>
          </tr>
        \`;
      }).join('');
    }

    function filtrarCalendario() {
      renderizarCalendario();
      selecionarDia(diaSelecionado);
    }
  </script>
</body>
</html>`;
}

module.exports = {
  obterPerfilGestao,
  listarEventosCalendario,
  listarSolicitacoes,
  listarFichas,
  criarSolicitacaoEventoWeb,
  renderGestaoHtml,
  setDependencies
};
