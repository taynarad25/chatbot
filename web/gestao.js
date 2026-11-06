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

const LISTA_TODOS_DEPARTAMENTOS = [
  "Rede de Mulheres",
  "Rede de Homens",
  "Rede Ruach",
  "Rede de Casais",
  "Rede Kids",
  "Epifania (Louvor)",
  "Departamento de Artes",
  "Evangelismo",
  "Intercessão",
  "Projeto Social Seeds",
  "Diaconia",
  "Relacionamentos",
  "Liderança",
  "Geral"
];

const ENDERECO_IGREJA = "Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi";
const CONTATO_TESOURARIA = "11943890204";
const LINK_ATA_REUNIAO = "https://docs.google.com/document/d/1ZtFfD3f3jB1QkL2Y4XvW5T6n8M7a9K0p/edit";

let injectedBuscarEventos = null;
let injectedCalendar = null;

// Cache em memória para Google Calendar (TTL 3 minutos)
let cacheGoogleEvents = {
  timestamp: 0,
  data: []
};

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
  } else if (isAdmin || isPastor || isDiretor) {
    departamentos = [...LISTA_TODOS_DEPARTAMENTOS];
  } else {
    departamentos = ['Geral'];
  }
  if (!departamentos || departamentos.length === 0) {
    departamentos = (isAdmin || isPastor || isDiretor) ? [...LISTA_TODOS_DEPARTAMENTOS] : ['Geral'];
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
 * Identifica o departamento provável do evento
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
 * Busca rápida no Google Calendar com timeout reduzido e cache em memória (TTL 10 min)
 */
async function buscarEventosGoogleCalendar(inicioIso, fimIso) {
  const agora = Date.now();
  if (cacheGoogleEvents.timestamp && (agora - cacheGoogleEvents.timestamp < 600000) && Array.isArray(cacheGoogleEvents.data)) {
    return cacheGoogleEvents.data;
  }

  const eventosGcal = [];
  try {
    if (injectedBuscarEventos && typeof injectedBuscarEventos === 'function') {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
      const res = await Promise.race([injectedBuscarEventos(inicioIso, fimIso), timeoutPromise]);
      if (Array.isArray(res)) {
        cacheGoogleEvents = { timestamp: agora, data: res };
        return res;
      }
    }

    let googleapis;
    try { googleapis = require('googleapis').google; } catch (_) {}
    if (googleapis) {
      const keyFile = path.join(process.cwd(), 'credenciais-google.json');
      if (fs.existsSync(keyFile)) {
        const auth = new googleapis.auth.GoogleAuth({
          keyFile,
          scopes: ['https://www.googleapis.com/auth/calendar']
        });
        const cal = googleapis.calendar({ version: 'v3', auth });

        const idsAgendas = [
          "694d1388f8f961bdbefed402fab5d498b44e0a489ec5fbcb3a40a5d1c3eda011@group.calendar.google.com",
          "692b7e0551c4113b02838eadaf1d60873587a956000b7b1932c4575c3a00ddd2@group.calendar.google.com",
          "f4625f5738f62b443b1f6279b5f124b37dffec23b9a56e3bb0dff064dc30e057@group.calendar.google.com",
          "9f1ee711c5b270aed77f50597c3fbdcf7bd33775707f4def5c82cc3794810ca4@group.calendar.google.com",
          "2ebaead80554da51744895e38dc117c3b43e0982e95d75ef64193702f9811bbd@group.calendar.google.com",
          "3839992a12d4695f87a19e9cfa3257f9ca60fab24e96549160e94c8603862b45@group.calendar.google.com",
          "8eae57daa28963736c7ab1c343e2d8e973b4c5caecf78caa8f38255662aa9f17@group.calendar.google.com",
          "384215b0335082cfde0c5f5f98b75ca59612a77a5123544f15bd41dd60d238d4@group.calendar.google.com",
          "b02048ebc98f7504e086cf4b2a54881a4e645189b565c90b5f7c477a4d0de10f@group.calendar.google.com",
          "b0aae19433652d50d04ae2290889cf7f905cc226ae103eb839ff3ca511acd6af@group.calendar.google.com",
          "18e7b84e62b7f4155bb98458b8c750099b937bed118a572d51d9a21b87aaaa3e@group.calendar.google.com",
          "b8f01bfd149139d388080ec63176c2556e6e1aedce184b84d37671c3d082d238@group.calendar.google.com",
          "0a55126694643f39944faf173fe3acd127b2a52074c6ecc9e9ed4dc23edf8b57@group.calendar.google.com",
          "7975950de545f60f585bc041682c6564ce4c29d0ef7e06cdeffa21ffc0ffd572@group.calendar.google.com",
          "fc012c51d15e9b272d4f955f504df24d816277da10194302f0ac1f04ae997e81@group.calendar.google.com",
          "49b999ac91607d07310d7e36a26fe088ddc3cd2b34ff741a0e139b43a18bdabc@group.calendar.google.com",
          "ca137e32f53409b1bd297929b9a2afd663eaf7df370e4c0aea6442c6a68a7946@group.calendar.google.com"
        ];

        const promessas = idsAgendas.map(async (calId) => {
          try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
            const reqPromise = cal.events.list({
              calendarId: calId,
              timeMin: inicioIso,
              timeMax: fimIso,
              singleEvents: true,
              maxResults: 100
            });
            const res = await Promise.race([reqPromise, timeoutPromise]);
            if (res?.data?.items) {
              return res.data.items.map(item => ({ ...item, calendarId: calId }));
            }
          } catch (_) {}
          return [];
        });

        const results = await Promise.allSettled(promessas);
        for (const r of results) {
          if (r.status === 'fulfilled' && Array.isArray(r.value)) {
            eventosGcal.push(...r.value);
          }
        }
        cacheGoogleEvents = { timestamp: agora, data: eventosGcal };
      }
    }
  } catch (_) {}
  return eventosGcal;
}

/**
 * Filtra lista de eventos aplicando regras de privacidade e visibilidade por papel
 */
function filtrarEventosPorPapel(eventos, perfil) {
  const resultadoFiltrado = [];
  for (const ev of eventos) {
    const isAtendimento = ev.tipo === 'atendimento' || ev.departamento === 'Pastoral';

    // 1. Atendimento Pastoral
    if (isAtendimento) {
      if (perfil?.isPastor || perfil?.isAdmin) {
        resultadoFiltrado.push(ev);
      } else if (perfil?.isDiretor) {
        resultadoFiltrado.push({
          ...ev,
          titulo: 'Atendimento Pastoral (Sigiloso)',
          responsavel: 'Sigiloso',
          descricao: 'Atendimento pastoral agendado'
        });
      }
      continue;
    }

    // 2. Pastor, Diretor ou Administrador vê tudo
    if (perfil?.isPastor || perfil?.isDiretor || perfil?.isAdmin) {
      resultadoFiltrado.push(ev);
      continue;
    }

    // 3. Líder Comum: Vê apenas do seu departamento
    const deptosLider = (perfil?.departamentos || []).map(d => String(d).toLowerCase().trim());
    const deptoEv = String(ev.departamento || '').toLowerCase().trim();
    
    const pertenceAoLider = deptosLider.length === 0 || 
      deptosLider.includes('geral') || 
      deptosLider.some(d => deptoEv.includes(d) || d.includes(deptoEv));

    if (pertenceAoLider) {
      resultadoFiltrado.push(ev);
    } else {
      // Ocupação do salão por outro ministério
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
 * Carrega instantaneamente os eventos armazenados no banco local (SQLite)
 * Executa em menos de 2 milissegundos sem dependência de rede externa.
 */
function listarEventosLocais(user = null, ano = null, mes = null) {
  const eventos = [];
  const perfil = user?.perfilTitulo ? user : (user ? obterPerfilGestao(user) : null);
  const anoAtual = ano ? parseInt(ano, 10) : moment().tz("America/Sao_Paulo").year();

  // 1. descricoes_eventos (eventos aprovados pelo bot com blocos/dias múltiplos/consecutivos)
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
        let dataEv = (h.data || '').trim();
        if (!dataEv || dataEv.toLowerCase() === 'não') continue;
        if (/^\d{1,2}\/\d{1,2}$/.test(dataEv)) {
          dataEv = `${dataEv}/${anoAtual}`;
        }

        const tituloEv = h.titulo ? `${r.evento} - ${h.titulo}` : (horarios.length > 1 && !r.evento.includes('Sessão') ? `${r.evento} (Sessão ${idx + 1})` : r.evento);

        eventos.push({
          id: `desc_${r.id}_${idx}`,
          origem: 'descricao',
          titulo: tituloEv,
          departamento: r.departamento || inferirDepartamentoDeTitulo(r.evento),
          data: dataEv,
          horarioInicio: h.inicio || '19:00',
          horarioFim: h.fim || '21:30',
          local: r.local || ENDERECO_IGREJA,
          responsavel: '',
          docUrl: '',
          status: 'confirmado',
          tipo: r.evento.toLowerCase().includes('ensaio') ? 'ensaio' : (r.evento.toLowerCase().includes('reunião') ? 'reuniao' : 'evento'),
          descricao: r.descricao || ''
        });
      }
    }
  } catch (errDesc) {
    console.error('[Gestão Eventos] Erro ao carregar descricoes_eventos:', errDesc.message);
  }

  // 2. formularios_eventos
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

      const jaExiste = eventos.some(e => 
        e.data === r.data && 
        e.titulo.toLowerCase().trim() === r.evento.toLowerCase().trim()
      );

      if (!jaExiste) {
        // Verifica se o evento está na tabela pendentes aguardando aprovação
        let estaPendente = false;
        try {
          const rowPend = db.prepare("SELECT codigo, dados FROM pendentes").all();
          estaPendente = rowPend.some(p => {
            try {
              const dp = JSON.parse(p.dados);
              const nomeP = (dp.nomeEvento || dp.evento || dp.nome || '').trim().toLowerCase();
              return nomeP === r.evento.toLowerCase().trim();
            } catch (_) { return false; }
          });
        } catch (_) {}

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
          status: estaPendente ? 'pendente_secretaria' : 'confirmado',
          tipo: r.evento.toLowerCase().includes('ensaio') ? 'ensaio' : (r.evento.toLowerCase().includes('reunião') ? 'reuniao' : 'evento'),
          payload
        });
      }
    }
  } catch (err) {
    console.error('[Gestão Eventos] Erro ao carregar formularios_eventos:', err.message);
  }

  // 3. painel_eventos
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
  } catch (errPainel) {}

  // 4. pendentes
  try {
    const rowsPendentes = db.prepare(`
      SELECT codigo, dados, criadoEm FROM pendentes ORDER BY rowid DESC
    `).all();

    for (const pend of rowsPendentes) {
      try {
        const d = JSON.parse(pend.dados);
        const nome = (d.nomeEvento || d.evento || d.nome || d.finalidade || '').trim();
        if (!nome) continue;
        if (d.status === 'recusado' || d.status === 'aprovado') continue;

        const dataFormatada = d.dataFormatada || (d.dia && d.mes && d.ano ? `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}/${d.ano}` : '');
        if (!dataFormatada && !d.blocos && !d.dataInicio && d.tipo !== 'midia') continue;

        let tipo = d.tipo || 'evento';
        if (d.tipo === 'uso_salao') tipo = 'uso_salao';
        if (d.tipo === 'reuniao') tipo = 'reuniao';
        if (d.tipo === 'ensaio') tipo = 'ensaio';
        if (d.tipo === 'acao' || d.tipo === 'venda') tipo = 'acao';
        if (d.tipo === 'alterar' || d.tipo === 'reuniao_alterar') tipo = 'alteracao';
        if (d.tipo === 'cancelar' || d.tipo === 'cancelar_reuniao') tipo = 'cancelamento';

        if (Array.isArray(d.blocos) && d.blocos.length > 0) {
          d.blocos.forEach((b, bIdx) => {
            let bData = (b.data || '').trim();
            if (bData && /^\d{1,2}\/\d{1,2}$/.test(bData)) {
              bData = `${bData}/${anoAtual}`;
            }
            if (!bData) return;
            const tituloBloco = b.titulo ? `${nome} - ${b.titulo}` : (d.blocos.length > 1 ? `${nome} (Sessão ${bIdx + 1})` : nome);
            eventos.push({
              id: `pend_${pend.codigo}_${bIdx}`,
              origem: 'pendente',
              codigo: pend.codigo,
              titulo: tituloBloco,
              departamento: d.rede || d.departamento || inferirDepartamentoDeTitulo(nome),
              data: bData,
              horarioInicio: b.inicio || '19:00',
              horarioFim: b.fim || '21:30',
              local: d.local || ENDERECO_IGREJA,
              responsavel: d.solicitanteNome || '',
              status: 'pendente_secretaria',
              tipo,
              payload: d
            });
          });
        } else {
          if (dataFormatada && /^\d{1,2}\/\d{1,2}$/.test(dataFormatada.trim())) {
            dataFormatada = `${dataFormatada.trim()}/${anoAtual}`;
          }
          if (dataFormatada) {
            eventos.push({
              id: `pend_${pend.codigo}`,
              origem: 'pendente',
              codigo: pend.codigo,
              titulo: nome,
              departamento: d.rede || d.departamento || inferirDepartamentoDeTitulo(nome),
              data: dataFormatada,
              horarioInicio: d.horarioInicio || '19:00',
              horarioFim: d.horarioFim || '21:30',
              local: d.local || ENDERECO_IGREJA,
              responsavel: d.solicitanteNome || '',
              status: 'pendente_secretaria',
              tipo,
              payload: d
            });
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  return filtrarEventosPorPapel(eventos, perfil);
}

/**
 * Lista eventos unificados para exibir no calendário do site com filtros de permissão e suporte a Google Calendar
 */
async function listarEventosCalendario({ user = null, mes = null, ano = null } = {}) {
  const eventos = listarEventosLocais(user, ano, mes);
  const perfil = user?.perfilTitulo ? user : (user ? obterPerfilGestao(user) : null);

  const anoAtual = ano ? parseInt(ano, 10) : moment().tz("America/Sao_Paulo").year();
  const mesAtual = mes ? parseInt(mes, 10) : moment().tz("America/Sao_Paulo").month() + 1;

  const inicioMes = moment.tz([anoAtual, mesAtual - 1, 1], "America/Sao_Paulo").startOf('month').subtract(7, 'days').startOf('day');
  const fimMes = moment.tz([anoAtual, mesAtual - 1, 1], "America/Sao_Paulo").endOf('month').add(7, 'days').endOf('day');

  // Google Calendar (Reuniões, Ensaios, Atendimentos, Eventos) com timeout rápido de 4s
  try {
    const gcalEvents = await buscarEventosGoogleCalendar(inicioMes.toISOString(), fimMes.toISOString());
    const novosEventosGcal = [];

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
      } else if (summary.toLowerCase().includes('feijoada') || summary.toLowerCase().includes('venda') || summary.toLowerCase().includes('pastel') || summary.toLowerCase().includes('bazar') || summary.toLowerCase().includes('cantina') || summary.toLowerCase().includes('arrecadação')) {
        tipo = 'acao';
      }

      const duplicado = eventos.some(e => e.data === dataFormatada && e.titulo.toLowerCase().trim() === summary.toLowerCase().trim());
      if (!duplicado) {
        novosEventosGcal.push({
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

    if (novosEventosGcal.length > 0) {
      const gcalFiltrados = filtrarEventosPorPapel(novosEventosGcal, perfil);
      eventos.push(...gcalFiltrados);
    }
  } catch (_) {}

  return eventos;
}

/**
 * Lista solicitações limpas e filtradas
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
        if (!dataFormatada && !d.blocos && !d.dataInicio && d.tipo !== 'midia') continue;

        if (!perfil?.isPastor && !perfil?.isDiretor && !perfil?.isAdmin) {
          const deptos = (perfil?.departamentos || []).map(d => String(d).toLowerCase());
          const deptoPed = String(d.rede || d.departamento || '').toLowerCase();
          const pertenceDepto = deptos.some(x => deptoPed.includes(x) || x.includes(deptoPed));
          const ehDoUsuario = (d.solicitanteId && (d.solicitanteId === perfil?.telefone || d.solicitanteId === perfil?.username)) ||
                             (d.solicitanteNome && d.solicitanteNome.toLowerCase().includes(String(perfil?.nome || '').toLowerCase())) ||
                             (d.criadoPor && d.criadoPor === perfil?.username);
          if (!pertenceDepto && !ehDoUsuario) continue;
        }

        let statusTexto = 'Aguardando Secretaria';
        let statusClass = 'pendente';
        if (d.status === 'recusado') {
          statusTexto = '❌ Recusado pela Secretaria';
          statusClass = 'recusado';
        } else if (d.status === 'aprovado') {
          statusTexto = '✅ Aprovado';
          statusClass = 'aprovado';
        } else if (d.tipo === 'midia') {
          statusTexto = 'Aguardando Multimídia';
          statusClass = 'midia';
        }

        solicitacoes.push({
          codigo: p.codigo,
          id: p.codigo,
          tipo: d.tipo || 'evento',
          titulo: nome,
          departamento: d.rede || d.departamento || 'Geral',
          data: dataFormatada || (d.blocos && d.blocos[0]?.data) || d.prazoEntrega || '',
          horarioInicio: d.horarioInicio || (d.blocos && d.blocos[0]?.inicio) || (d.tipo === 'midia' ? 'Prazo de Entrega' : '19:00'),
          horarioFim: d.horarioFim || (d.blocos && d.blocos[0]?.fim) || '',
          responsavel: d.solicitanteNome || '',
          status: statusTexto,
          statusClass: statusClass,
          criadoEm: p.criadoEm,
          payload: d
        });
      } catch (_) {}
    }
  } catch (_) {}

  try {
    const rowsForm = db.prepare(`
      SELECT id, evento, departamento, data, solicitanteId, payload, criadoEm
      FROM formularios_eventos
      ORDER BY id DESC LIMIT 50
    `).all();

    for (const f of rowsForm) {
      let p = {};
      try { p = JSON.parse(f.payload); } catch (_) {}
      
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
 * Lista fichas de eventos preenchidas com controle rigoroso de acesso
 */
function listarFichas({ user = null } = {}) {
  const perfil = user?.perfilTitulo ? user : (user ? obterPerfilGestao(user) : null);
  
  try {
    const rows = db.prepare(`
      SELECT id, evento, departamento, data, dataMaximaDivulgacao, solicitanteId, payload, docUrl, criadoEm
      FROM formularios_eventos
      ORDER BY id DESC LIMIT 100
    `).all();

    if (perfil?.isPastor || perfil?.isAdmin) {
      return rows;
    }

    const deptosUsuario = (perfil?.departamentos || []).map(d => String(d).toLowerCase().trim());
    return rows.filter(f => {
      const deptoFicha = String(f.departamento || '').toLowerCase().trim();
      return deptosUsuario.some(du => deptoFicha.includes(du) || du.includes(deptoFicha));
    });
  } catch (err) {
    return [];
  }
}

/**
 * Cria ou atualiza solicitação no portal web
 */
async function criarSolicitacaoEventoWeb(corpo, usuarioLogado, getClient = () => null) {
  const perfil = obterPerfilGestao(usuarioLogado);
  const tipoAcao = String(corpo.tipo || 'evento').toLowerCase().trim();

  // 0. SOLICITAÇÃO DE ARTES / MÍDIA
  if (tipoAcao === 'midia') {
    const { departamento, tipo_material, detalhes, prazo_entrega, nome_evento } = corpo;
    if (!departamento || !tipo_material || !detalhes) {
      throw new Error('Preencha o departamento, o tipo de material e os detalhes da arte.');
    }

    const dadosMidia = {
      tipo: 'midia',
      departamento: departamento.trim(),
      rede: departamento.trim(),
      tipoMaterial: tipo_material.trim(),
      detalhesArte: detalhes.trim(),
      prazoEntrega: prazo_entrega?.trim() || 'A combinar',
      nomeEvento: nome_evento?.trim() || `Arte para ${departamento.trim()}`,
      solicitanteNome: perfil?.nome || 'Líder',
      solicitanteId: perfil?.telefone || perfil?.username || '',
      criadoVia: 'painel_web',
      criadoEm: new Date().toISOString()
    };

    const codigo = salvarPendente(dadosMidia);

    const avisoGrupo =
      `🎨 *NOVA SOLICITAÇÃO DE ARTE/FLYER (VIA PAINEL WEB)*\n\n` +
      `👤 *Solicitante:* ${perfil?.nome} (${perfil?.telefone || perfil?.username})\n` +
      `🏢 *Depto/Rede:* ${departamento}\n` +
      `📌 *Tipo de Material:* ${tipo_material}\n` +
      `⏳ *Prazo de Entrega:* ${dadosMidia.prazoEntrega}\n` +
      `📝 *Detalhes/Texto da Arte:*\n${detalhes}\n\n` +
      `_Código da Solicitação: ${codigo}_`;

    try {
      const client = typeof getClient === 'function' ? getClient() : null;
      if (client && client.info) {
        const { notificarMultimidia } = require('../bot/secretaria');
        if (typeof notificarMultimidia === 'function') {
          await notificarMultimidia(client, avisoGrupo);
        }
        await notificarSecretaria(client, avisoGrupo);
      }
    } catch (_) {}

    return {
      ok: true,
      codigo,
      message: `Solicitação de arte/divulgação registrada com sucesso (Código: ${codigo}) e enviada à equipe de Multimídia!`,
      mensagem: `Solicitação de arte/divulgação registrada com sucesso (Código: ${codigo}) e enviada à equipe de Multimídia!`
    };
  }

  // 1. AÇÃO / VENDA BENEFICENTE (Feijoada, Pastelada, Cantina, Bazar, Arrecadação)
  if (tipoAcao === 'acao' || tipoAcao === 'venda') {
    const { nome_evento, departamento, data, horario_inicio, horario_termino, local, ocupa_salao, detalhes } = corpo;
    if (!nome_evento || !departamento || !data || !horario_inicio || !horario_termino) {
      throw new Error('Preencha o nome da ação/venda, o ministério responsável, a data e os horários.');
    }

    const [diaStr, mesStr, anoStr] = data.split('/');
    const dadosAcao = {
      tipo: 'acao',
      evento: nome_evento.trim(),
      nomeEvento: nome_evento.trim(),
      departamento: departamento.trim(),
      rede: departamento.trim(),
      dia: parseInt(diaStr, 10),
      mes: parseInt(mesStr, 10),
      ano: parseInt(anoStr, 10),
      dataFormatada: data,
      horarioInicio: horario_inicio,
      horarioFim: horario_termino,
      local: local?.trim() || ENDERECO_IGREJA,
      ocupaSalao: ocupa_salao === 'sim',
      detalhes: detalhes?.trim() || 'Ação beneficente / venda de alimentos',
      solicitanteNome: perfil?.nome || 'Líder',
      solicitanteId: perfil?.telefone || perfil?.username || '',
      criadoVia: 'painel_web',
      criadoEm: new Date().toISOString()
    };

    const codigo = salvarPendente(dadosAcao);

    const avisoGrupo =
      `🍲 *SOLICITAÇÃO DE AÇÃO / VENDA BENEFICENTE*\n\n` +
      `👤 *Solicitante:* ${perfil?.nome} (${perfil?.telefone || perfil?.username})\n` +
      `🏢 *Departamento:* ${departamento}\n` +
      `🍛 *Ação / Venda:* ${nome_evento.trim()}\n` +
      `📆 *Data:* ${data}\n` +
      `⏰ *Horário:* ${horario_inicio} às ${horario_termino}\n` +
      `📍 *Local:* ${dadosAcao.local}\n` +
      `🏛️ *Ocupa o Salão/Cozinha:* ${dadosAcao.ocupaSalao ? 'Sim' : 'Não'}\n` +
      `📝 *Detalhes:* ${dadosAcao.detalhes}\n\n` +
      `_Responda a este resumo com "marcar evento" para confirmar ou "não marcar" para negar._\n\n` +
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
      message: `Ação/Venda solicitada com sucesso (Código: ${codigo}) e enviada para aprovação da Secretaria!`,
      mensagem: `Ação/Venda solicitada com sucesso (Código: ${codigo}) e enviada para aprovação da Secretaria!`
    };
  }

  // 1B. REUNIÃO DE LIDERANÇA
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

  // 2. ENSAIO
  if (tipoAcao === 'ensaio') {
    const { departamento, data, horario_inicio, horario_termino, local, pauta } = corpo;
    if (!departamento || !data || !horario_inicio || !horario_termino) {
      throw new Error('Preencha o ministério, data e horários do ensaio.');
    }

    const [diaStr, mesStr, anoStr] = data.split('/');
    const dadosEnsaio = {
      tipo: 'ensaio',
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
      pauta: pauta?.trim() || 'Ensaio geral',
      criadoVia: 'painel_web',
      criadoEm: new Date().toISOString()
    };

    const codigo = salvarPendente(dadosEnsaio);

    const avisoGrupo =
      `🎵 *SOLICITAÇÃO DE ENSAIO*\n\n` +
      `👤 *Solicitante:* ${perfil?.nome} (${perfil?.telefone || perfil?.username})\n` +
      `🏢 *Ministério:* ${departamento}\n` +
      `📆 *Data:* ${data}\n` +
      `⏰ *Horário:* ${horario_inicio} às ${horario_termino}\n` +
      `📍 *Local:* ${dadosEnsaio.local}\n` +
      `🎼 *Detalhes:* ${dadosEnsaio.pauta}\n\n` +
      `_Responda a este resumo com "marcar evento" para confirmar ou "não marcar" para negar._\n\n` +
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
      message: `Ensaio registrado com sucesso (Código: ${codigo}) e enviado para aprovação da Secretaria!`,
      mensagem: `Ensaio registrado com sucesso (Código: ${codigo}) e enviado para aprovação da Secretaria!`
    };
  }

  // 3. ATENDIMENTO PASTORAL (Exclusivo Pastores / Admin)
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
      message: `Atendimento pastoral agendado com sucesso para ${nome_discipulo}!`,
      mensagem: `Atendimento pastoral agendado com sucesso para ${nome_discipulo} no dia ${data} às ${horario_inicio}!`
    };
  }

  // 4. ALTERAR EVENTO
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
      message: `Solicitação registrada com sucesso (Código: ${codigo}) e enviada para aprovação da Secretaria!`,
      mensagem: `Solicitação de alteração enviada à Secretaria (Código: ${codigo})!`
    };
  }

  // 5. CANCELAR EVENTO
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
      message: `Solicitação registrada com sucesso (Código: ${codigo}) e enviada para aprovação da Secretaria!`,
      mensagem: `Solicitação de cancelamento enviada à Secretaria (Código: ${codigo})!`
    };
  }

  // 6. ATUALIZAR FORMULÁRIO / DETALHES
  if (tipoAcao === 'atualizar_formulario') {
    const { nome_evento, tema, versiculo, objetivo_espiritual, precisa_inscricao, valor_inscricao, precisa_valor_ministerio, observacoes } = corpo;
    if (!nome_evento) throw new Error('Nome do evento é obrigatório.');

    try {
      const rowForm = db.prepare("SELECT id, payload FROM formularios_eventos WHERE LOWER(TRIM(evento)) = LOWER(TRIM(?)) ORDER BY id DESC LIMIT 1").get(nome_evento);
      if (rowForm) {
        let p = {};
        try { p = JSON.parse(rowForm.payload); } catch (_) {}
        if (tema) p.tema = tema;
        if (versiculo) p.versiculo = versiculo;
        if (objetivo_espiritual) p.objetivo_espiritual = objetivo_espiritual;
        if (precisa_inscricao) p.precisa_inscricao = precisa_inscricao;
        if (valor_inscricao) p.valor_inscricao = valor_inscricao;
        if (precisa_valor_ministerio) p.precisa_valor_ministerio = precisa_valor_ministerio;
        if (observacoes) p.observacoes = observacoes;

        db.prepare("UPDATE formularios_eventos SET payload = ? WHERE id = ?").run(JSON.stringify(p), rowForm.id);
      }
      if (typeof db.marcarFormularioComoPreenchido === 'function') {
        db.marcarFormularioComoPreenchido(nome_evento);
      }
    } catch (_) {}

    return {
      ok: true,
      message: 'Formulário atualizado com sucesso!',
      mensagem: 'Formulário atualizado com sucesso!'
    };
  }

  // 7. NOVO EVENTO (Padrão)
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

  const codigo = salvarPendente(dadosAgendamento);

  salvarFormularioEvento({
    evento: nome_evento.trim(),
    departamento: deptoFinal,
    data: dataFormatada,
    dataMaximaDivulgacao: data_maxima_divulgacao || null,
    solicitanteId: telefone_lider || usuarioLogado?.username,
    payload: payloadCompleto,
    docUrl: ''
  });

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
  } catch (_) {}

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
 */
function renderGestaoHtml({ user }) {
  const perfil = obterPerfilGestao(user);
  const jsonPerfil = JSON.stringify(perfil || {});
  const primeiroNome = perfil?.nome ? perfil.nome.split(' ')[0] : 'Líder';
  const deptosParaForm = (perfil?.isPastor || perfil?.isDiretor || perfil?.isAdmin || !perfil?.departamentos || perfil.departamentos.length === 0)
    ? LISTA_TODOS_DEPARTAMENTOS
    : perfil.departamentos;

  // Carrega instantaneamente os eventos do banco local (SQLite) para renderização imediata sem espera
  let eventosIniciais = [];
  try {
    eventosIniciais = listarEventosLocais(perfil);
  } catch (errIniciais) {
    console.warn('[Gestão] Aviso ao carregar eventos locais iniciais:', errIniciais.message);
  }
  const jsonEventosIniciais = JSON.stringify(eventosIniciais);

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
    .user-name-tag { text-align: right; }
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

    .container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 12px 14px 40px;
      flex: 1;
    }

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

    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

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
      min-width: 150px;
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

    .cal-weekdays {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
      text-align: center;
      font-size: 0.7rem;
      font-weight: 800;
      color: var(--cor-subtexto);
      margin-bottom: 6px;
    }
    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
    }
    .cal-day {
      background: #ffffff;
      border: 1px solid var(--cor-borda);
      border-radius: 10px;
      min-height: 64px;
      max-height: 84px;
      padding: 3px 4px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      position: relative;
      transition: all 0.15s ease;
      min-width: 0;
      overflow: hidden;
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
      min-width: 0;
      overflow: hidden;
    }
    .event-chip {
      font-size: 0.62rem;
      font-weight: 700;
      padding: 2px 4px;
      border-radius: 5px;
      line-height: 1.15;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      word-break: break-word;
      overflow-wrap: anywhere;
      white-space: normal;
      min-width: 0;
      max-width: 100%;
      cursor: default;
      pointer-events: none;
      user-select: none;
    }
    .cal-day .event-chip {
      pointer-events: none;
      cursor: default;
    }
    .event-chip.confirmado { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .event-chip.pendente { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .event-chip.acao { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }
    .event-chip.reuniao { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .event-chip.ensaio { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .event-chip.pastoral { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
    .event-chip.bloqueio { background: #f1f5f9; color: #64748b; border: 1px dashed #cbd5e1; }

    @media (max-width: 600px) {
      .cal-day {
        min-height: 56px;
        max-height: 74px;
        padding: 2px;
        border-radius: 8px;
      }
      .day-num {
        font-size: 0.7rem;
      }
      .event-chip {
        font-size: 0.58rem;
        line-height: 1.1;
        padding: 1px 3px;
        border-radius: 4px;
      }
    }

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
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
    }
    .day-event-card:hover {
      border-color: var(--cor-roxo);
      background: #faf5ff;
      transform: translateY(-1px);
    }
    .day-event-card .title {
      font-size: 0.88rem;
      font-weight: 800;
      color: var(--cor-texto);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .day-event-card .meta {
      font-size: 0.75rem;
      color: var(--cor-subtexto);
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .day-event-card .action-hint {
      display: inline-block;
      margin-top: 6px;
      font-size: 0.7rem;
      font-weight: 800;
      color: var(--cor-roxo);
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
    .dot-laranja { background: #f97316; }

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
    .badge-status.recusado { background: #fee2e2; color: #991b1b; }
    .badge-status.acao { background: #ffedd5; color: #c2410c; }
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
      max-width: 620px;
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

    /* CARDS DO PASSO 1: ESCOLHA DE TIPO */
    .tipo-escolha-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      padding: 16px;
    }
    @media (min-width: 500px) {
      .tipo-escolha-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
    .tipo-card-btn {
      background: #ffffff;
      border: 2px solid var(--cor-borda);
      border-radius: 14px;
      padding: 16px 14px;
      text-align: left;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: all 0.2s ease;
    }
    .tipo-card-btn:hover {
      border-color: var(--cor-roxo);
      background: #faf5ff;
      transform: translateY(-2px);
      box-shadow: 0 4px 14px rgba(122, 43, 226, 0.12);
    }
    .tipo-card-btn .icone {
      font-size: 1.7rem;
    }
    .tipo-card-btn .titulo {
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--cor-texto);
    }
    .tipo-card-btn .desc {
      font-size: 0.75rem;
      color: var(--cor-subtexto);
      line-height: 1.3;
    }

    .modal-body {
      padding: 14px 18px;
      overflow-y: auto;
      flex: 1;
    }
    .form-step { display: none; }
    .form-step.active { display: block; }

    .btn-voltar-tipo {
      background: none;
      border: none;
      color: var(--cor-roxo);
      font-size: 0.82rem;
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 12px;
      padding: 4px 0;
    }

    .form-group { margin-bottom: 12px; }
    .form-group label {
      display: block;
      font-size: 0.82rem;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--cor-texto);
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

    /* MODAL DE GERENCIAMENTO DO EVENTO (ALTERAR / CANCELAR / FORMULÁRIO) */
    .evento-detalhes-box {
      background: var(--cor-cinza-suave);
      border: 1px solid var(--cor-borda);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 14px;
    }
    .evento-detalhes-box h4 {
      font-size: 1rem;
      font-weight: 800;
      color: var(--cor-texto);
      margin-bottom: 4px;
    }
    .evento-detalhes-box p {
      font-size: 0.78rem;
      color: var(--cor-subtexto);
    }

    .acoes-evento-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      margin-bottom: 14px;
    }
    .btn-acao-evento {
      background: #ffffff;
      border: 1.5px solid var(--cor-borda);
      border-radius: 10px;
      padding: 12px;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--cor-texto);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.15s;
    }
    .btn-acao-evento:hover {
      border-color: var(--cor-roxo);
      background: #faf5ff;
    }
    .btn-acao-evento.cancelar:hover {
      border-color: var(--cor-vermelho);
      background: #fef2f2;
      color: var(--cor-vermelho);
    }
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
    
    <!-- HEADER COM SAUDAÇÃO PERSONALIZADA -->
    <section class="gestao-header">
      <div>
        <h2>Olá, ${primeiroNome}! O que você gostaria de fazer hoje? 👋</h2>
        <p>Acompanhe a agenda da igreja, reserve datas, consulte fichas ou solicite artes para o seu ministério.</p>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-principal" onclick="abrirNovoAgendamento()">
          ➕ Novo Agendamento
        </button>
        <button class="btn-secundario" onclick="abrirModalSolicitarMidia()" style="background: #ffffff; border: 1.5px solid #cbd5e1; color: var(--cor-roxo); font-weight: 800;">
          🎨 Solicitar Arte / Mídia
        </button>
      </div>
    </section>

    <!-- NAVEGAÇÃO DE ABAS -->
    <nav class="tabs-nav">
      <button class="tab-btn active" onclick="trocarAba('calendario')">
        📅 Calendário
      </button>
      <button class="tab-btn" onclick="trocarAba('pesquisa')">
        🔍 Pesquisar Eventos
      </button>
      <button class="tab-btn" onclick="trocarAba('solicitacoes')">
        📋 Minhas Solicitações <span class="tab-badge" id="badgeTotalSol">0</span>
      </button>
      <button class="tab-btn" onclick="abrirModalSolicitarMidia()">
        🎨 Solicitar Arte / Mídia
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
              <h3 id="labelMesAno">Novembro de 2026</h3>
              <button class="cal-nav-btn" onclick="mudarMes(1)">›</button>
              <button class="cal-nav-btn" onclick="irParaHoje()" style="width: auto; padding: 0 10px;">Hoje</button>
            </div>
            <div class="cal-filtros">
              <select id="filtroDepartamento" class="cal-select" onchange="filtrarCalendario()">
                <option value="todos">Todos os Ministérios</option>
                ${LISTA_TODOS_DEPARTAMENTOS.map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
              <select id="filtroTipo" class="cal-select" onchange="filtrarCalendario()">
                <option value="todos">Todos os Tipos</option>
                <option value="evento">Eventos</option>
                <option value="acao">Ações / Vendas</option>
                <option value="reuniao">Reuniões</option>
                <option value="ensaio">Ensaios</option>
                ${perfil?.isPastor || perfil?.isDiretor ? '<option value="atendimento">Atendimentos</option>' : ''}
              </select>
            </div>
          </div>

          <!-- INDICADOR VISUAL DE CARREGAMENTO -->
          <div id="calLoadingIndicator" class="cal-loading-badge" style="display: none;">
            <span class="spinner-mini"></span> ⏳ Sincronizando eventos com a agenda...
          </div>

          <div class="cal-weekdays">
            <div>DOM</div><div>SEG</div><div>TER</div><div>QUA</div><div>QUI</div><div>SEX</div><div>SÁB</div>
          </div>
          <div class="cal-grid" id="gridCalendario"></div>

          <div class="cal-legend">
            <div class="legend-item"><span class="legend-dot dot-verde"></span> Evento Confirmado</div>
            <div class="legend-item"><span class="legend-dot dot-amarelo"></span> Aguardando Secretaria</div>
            <div class="legend-item"><span class="legend-dot dot-laranja"></span> Ação / Venda</div>
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

    <!-- ABA DE PESQUISA DE EVENTOS -->
    <div id="pane-pesquisa" class="tab-pane">
      <div class="solicitacoes-table-card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 800; margin: 0 0 4px 0;">🔍 Pesquisar Agendas e Eventos</h3>
            <p style="font-size: 0.8rem; color: var(--cor-subtexto); margin: 0;">Busque por título, departamento, reunião, ensaio ou data.</p>
          </div>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px;">
          <input type="text" id="campoBuscaPesquisa" class="form-control" style="flex: 1; min-width: 240px;" placeholder="Digite o nome do evento, reunião, ensaio, tema ou data..." oninput="executarPesquisaEventos()" />
          <select id="filtroTipoPesquisa" class="form-control" style="width: auto; min-width: 140px;" onchange="executarPesquisaEventos()">
            <option value="todos">Todos os Tipos</option>
            <option value="evento">Eventos</option>
            <option value="acao">Ações / Vendas</option>
            <option value="reuniao">Reuniões</option>
            <option value="ensaio">Ensaios</option>
            ${perfil?.isPastor || perfil?.isDiretor ? '<option value="atendimento">Atendimentos</option>' : ''}
          </select>
          <select id="filtroDeptoPesquisa" class="form-control" style="width: auto; min-width: 170px;" onchange="executarPesquisaEventos()">
            <option value="todos">Todos os Ministérios</option>
            ${LISTA_TODOS_DEPARTAMENTOS.map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
        </div>

        <div id="containerResultadosPesquisa" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
          <p style="grid-column: 1 / -1; text-align: center; color: var(--cor-subtexto); padding: 20px;">Carregando eventos...</p>
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
              <th>Status</th>
              <th>Ações</th>
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
          <button class="btn-principal" onclick="iniciarAgendamentoTipo('atendimento')" style="min-height: 38px; padding: 8px 14px; font-size: 0.78rem;">
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

  <!-- MODAL DE NOVO AGENDAMENTO (EM 2 PASSOS) -->
  <div class="modal-overlay modal-agendamento" id="modalAgendamento">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalAgendamentoTitulo">➕ Novo Agendamento</h3>
        <button class="modal-close-btn" onclick="fecharModalAgendamento()">✕</button>
      </div>

      <div class="modal-body">
        
        <!-- PASSO 1: ESCOLHA DO TIPO (CARDS VISUAIS E LIMPOS) -->
        <div id="stepEscolhaTipo" class="form-step active">
          <p style="font-size: 0.88rem; font-weight: 700; color: var(--cor-subtexto); margin-bottom: 14px;">
            Qual tipo de agendamento você deseja realizar?
          </p>
          <div class="tipo-escolha-grid">
            <button class="tipo-card-btn" onclick="iniciarAgendamentoTipo('evento')">
              <span class="icone">🎪</span>
              <span class="titulo">Evento da Igreja</span>
              <span class="desc">Cultos especiais, conferências, congressos, encontros e vigílias.</span>
            </button>

            <button class="tipo-card-btn" onclick="iniciarAgendamentoTipo('acao')">
              <span class="icone">🍲</span>
              <span class="titulo">Ação / Venda Beneficente</span>
              <span class="desc">Feijoada, pastelada, cantina ou bazar. Formulário rápido sem ficha longa.</span>
            </button>

            <button class="tipo-card-btn" onclick="iniciarAgendamentoTipo('reuniao')">
              <span class="icone">🤝</span>
              <span class="titulo">Reunião de Liderança</span>
              <span class="desc">Alinhamento de departamento e líderes com geração de Ata.</span>
            </button>

            <button class="tipo-card-btn" onclick="iniciarAgendamentoTipo('ensaio')">
              <span class="icone">🎵</span>
              <span class="titulo">Ensaio</span>
              <span class="desc">Ensaios de louvor, coral, dança, teatro ou artes.</span>
            </button>

            ${perfil?.isPastor ? `
            <button class="tipo-card-btn" onclick="iniciarAgendamentoTipo('atendimento')">
              <span class="icone">📖</span>
              <span class="titulo">Atendimento Pastoral</span>
              <span class="desc">Agendamento sigiloso de aconselhamento pastoral com membros.</span>
            </button>
            ` : ''}

            <button class="tipo-card-btn" onclick="fecharModalAgendamento(); abrirModalSolicitarMidia();">
              <span class="icone">🎨</span>
              <span class="titulo">Solicitar Arte / Mídia</span>
              <span class="desc">Flyers para redes sociais, comunicados gerais, banners impressos e vídeos.</span>
            </button>
          </div>
        </div>

        <!-- PASSO 2A: FORMULÁRIO DE EVENTO -->
        <div id="stepFormEvento" class="form-step">
          <button type="button" class="btn-voltar-tipo" onclick="voltarParaEscolhaTipo()">← Escolher outro tipo</button>
          
          <form id="formNovoEvento" onsubmit="submeterNovoEvento(event)">
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
                  ${deptosParaForm.map(d => `<option value="${d}">${d}</option>`).join('')}
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
        </div>

        <!-- PASSO 2B: FORMULÁRIO DE REUNIÃO -->
        <div id="stepFormReuniao" class="form-step">
          <button type="button" class="btn-voltar-tipo" onclick="voltarParaEscolhaTipo()">← Escolher outro tipo</button>
          
          <form id="formNovaReuniao" onsubmit="submeterNovaReuniao(event)">
            <div class="alert-banner info">
              🤝 A reunião será registrada na agenda de Reuniões e a Ata gerada automaticamente.
            </div>

            <div class="form-row two-cols">
              <div class="form-group">
                <label>Departamento / Ministério *</label>
                <select class="form-control" id="reu_departamento" required>
                  ${deptosParaForm.map(d => `<option value="${d}">${d}</option>`).join('')}
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
        </div>

        <!-- PASSO 2C: FORMULÁRIO DE ENSAIO -->
        <div id="stepFormEnsaio" class="form-step">
          <button type="button" class="btn-voltar-tipo" onclick="voltarParaEscolhaTipo()">← Escolher outro tipo</button>
          
          <form id="formNovoEnsaio" onsubmit="submeterNovoEnsaio(event)">
            <div class="alert-banner info">
              🎵 O ensaio será registrado na agenda oficial com aviso à Secretaria.
            </div>

            <div class="form-row two-cols">
              <div class="form-group">
                <label>Ministério / Grupo *</label>
                <select class="form-control" id="ens_departamento" required>
                  <option value="Epifania (Louvor)">Epifania (Louvor)</option>
                  <option value="Departamento de Artes">Departamento de Artes</option>
                  ${deptosParaForm.filter(d => !d.includes('Epifania') && !d.includes('Artes')).map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Data *</label>
                <input type="text" class="form-control" id="ens_data" placeholder="DD/MM/AAAA" required />
              </div>
            </div>

            <div class="form-row two-cols">
              <div class="form-group">
                <label>Horário Início *</label>
                <input type="time" class="form-control" id="ens_hora_ini" value="19:30" required />
              </div>
              <div class="form-group">
                <label>Horário Término *</label>
                <input type="time" class="form-control" id="ens_hora_fim" value="21:30" required />
              </div>
            </div>

            <div class="form-group">
              <label>Local</label>
              <input type="text" class="form-control" id="ens_local" value="Templo Principal" />
            </div>

            <div class="form-group">
              <label>Músicas / Observações do Ensaio</label>
              <textarea class="form-control" id="ens_pauta" rows="3" placeholder="Repertório ou foco do ensaio..."></textarea>
            </div>

            <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
              <button type="button" class="btn-secundario" onclick="fecharModalAgendamento()">Cancelar</button>
              <button type="submit" class="btn-principal" id="btnSalvarEnsaio">Solicitar Ensaio</button>
            </div>
          </form>
        </div>

        <!-- PASSO 2E: FORMULÁRIO DE AÇÃO / VENDA BENEFICENTE -->
        <div id="stepFormAcao" class="form-step">
          <button type="button" class="btn-voltar-tipo" onclick="voltarParaEscolhaTipo()">← Escolher outro tipo</button>
          
          <form id="formNovaAcao" onsubmit="submeterNovaAcao(event)">
            <div class="alert-banner info">
              🍲 Formulário rápido para ações e vendas beneficentes (Feijoada, Pastelada, Cantina, Bazar). Não requer preenchimento de ficha de evento detalhada.
            </div>

            <div class="form-group">
              <label>Nome da Ação / Venda *</label>
              <input type="text" class="form-control" id="acao_nome" placeholder="Ex: Feijoada dos Jovens, Pastelada da Família, Bazar..." required />
            </div>

            <div class="form-row two-cols">
              <div class="form-group">
                <label>Ministério Responsável *</label>
                <select class="form-control" id="acao_departamento" required>
                  <option value="">Selecione...</option>
                  ${deptosParaForm.map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Data *</label>
                <input type="text" class="form-control" id="acao_data" placeholder="DD/MM/AAAA" required />
              </div>
            </div>

            <div class="form-row two-cols">
              <div class="form-group">
                <label>Horário Início *</label>
                <input type="time" class="form-control" id="acao_hora_ini" value="11:30" required />
              </div>
              <div class="form-group">
                <label>Horário Término *</label>
                <input type="time" class="form-control" id="acao_hora_fim" value="15:00" required />
              </div>
            </div>

            <div class="form-row two-cols">
              <div class="form-group">
                <label>Local</label>
                <input type="text" class="form-control" id="acao_local" value="Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi" />
              </div>
              <div class="form-group">
                <label>Ocupa o Salão / Cozinha?</label>
                <select class="form-control" id="acao_ocupa_salao">
                  <option value="sim">Sim (utilizará a estrutura da igreja)</option>
                  <option value="nao">Não (apenas retirada / externo)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Detalhes / Observações (opcional)</label>
              <textarea class="form-control" id="acao_detalhes" rows="3" placeholder="Informações adicionais, valor, objetivo..."></textarea>
            </div>

            <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
              <button type="button" class="btn-secundario" onclick="fecharModalAgendamento()">Cancelar</button>
              <button type="submit" class="btn-principal" id="btnSalvarAcao">Solicitar Ação / Venda</button>
            </div>
          </form>
        </div>

        <!-- PASSO 2D: FORMULÁRIO DE ATENDIMENTO PASTORAL (Pastores) -->
        ${perfil?.isPastor ? `
        <div id="stepFormAtendimento" class="form-step">
          <button type="button" class="btn-voltar-tipo" onclick="voltarParaEscolhaTipo()">← Escolher outro tipo</button>
          
          <form id="formAtendimentoPastoral" onsubmit="submeterAtendimentoPastoral(event)">
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
        </div>
        ` : ''}

      </div>
    </div>
  </div>

  <!-- MODAL: SOLICITAR ARTE / MÍDIA -->
  <div class="modal-overlay" id="modalSolicitarMidia">
    <div class="modal-content">
      <div class="modal-header">
        <h3>🎨 Solicitar Arte / Divulgação para Mídia</h3>
        <button class="modal-close-btn" onclick="fecharModalSolicitarMidia()">✕</button>
      </div>
      <div class="modal-body">
        <form id="formSolicitarMidia" onsubmit="submeterSolicitacaoMidia(event)">
          <div class="alert-banner info">
            📢 A solicitação será encaminhada diretamente para a equipe de Multimídia e para a Secretaria.
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>Departamento / Ministério *</label>
              <select class="form-control" id="midia_departamento" required>
                ${deptosParaForm.map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Tipo de Material *</label>
              <select class="form-control" id="midia_tipo_material" required>
                <option value="Flyer / Redes Sociais (Feed e Stories)">Flyer / Redes Sociais (Feed & Stories)</option>
                <option value="Aviso / Comunicado Geral">Aviso / Comunicado Geral</option>
                <option value="Banner / Faixa para Fachada ou Salão">Banner / Faixa Impressa</option>
                <option value="Lembrancinha / Tag / Crachá">Lembrancinha / Tag / Crachá</option>
                <option value="Vídeo Teaser / Telão">Vídeo Teaser / Telão</option>
                <option value="Outro Material">Outro Material</option>
              </select>
            </div>
          </div>

          <div class="form-row two-cols">
            <div class="form-group">
              <label>Nome do Evento ou Finalidade *</label>
              <input type="text" class="form-control" id="midia_evento" placeholder="Ex: Chá das Mulheres ou Culto da Família" required />
            </div>
            <div class="form-group">
              <label>Prazo Máximo de Entrega *</label>
              <input type="text" class="form-control" id="midia_prazo" placeholder="Ex: 20/11/2026 ou Até quinta-feira" required />
            </div>
          </div>

          <div class="form-group">
            <label>Detalhes, Texto da Arte e Estilo Visual *</label>
            <textarea class="form-control" id="midia_detalhes" rows="4" placeholder="Informe temas, frases obrigatórias, preletores, horários, cores desejadas ou referências..." required></textarea>
          </div>

          <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn-secundario" onclick="fecharModalSolicitarMidia()">Cancelar</button>
            <button type="submit" class="btn-principal">🚀 Enviar para Multimídia</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- MODAL DE GERENCIAMENTO DE EVENTO (ALTERAR / CANCELAR / FORMULÁRIO) -->
  <div class="modal-overlay" id="modalGerenciarEvento">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="gerenciarEventoTitulo">⚙️ Gerenciar Evento</h3>
        <button class="modal-close-btn" onclick="fecharModalGerenciarEvento()">✕</button>
      </div>

      <div class="modal-body">
        
        <div class="evento-detalhes-box" id="boxDetalhesEventoGerenciar">
          <h4 id="det_titulo">Nome do Evento</h4>
          <p id="det_meta">Data • Horário • Local</p>
        </div>

        <div class="alert-banner info" id="avisoOcupacaoExterna" style="display: none;">
          ℹ️ Este horário está reservado por outro ministério. Os detalhes, formulário e alterações são restritos à respectiva liderança e à Secretaria.
        </div>

        <!-- MENU DE AÇÕES DO EVENTO -->
        <div id="acoesEventoMenu" class="acoes-evento-grid">
          <button class="btn-acao-evento" onclick="exibirSubtelaGerenciar('alterar')">
            <span>🔄</span>
            <div>
              <strong>Alterar Evento</strong>
              <div style="font-size: 0.72rem; color: var(--cor-subtexto);">Mudar data, horário, local ou informações</div>
            </div>
          </button>

          <button class="btn-acao-evento" id="btnAcaoFormulario" onclick="exibirSubtelaGerenciar('formulario')">
            <span>📝</span>
            <div>
              <strong>Terminar de Responder / Ver Formulário</strong>
              <div style="font-size: 0.72rem; color: var(--cor-subtexto);">Completar tema, versículo, verba e detalhes da ficha</div>
            </div>
          </button>

          <button class="btn-acao-evento cancelar" onclick="exibirSubtelaGerenciar('cancelar')">
            <span>🗑️</span>
            <div>
              <strong>Cancelar / Excluir Evento</strong>
              <div style="font-size: 0.72rem; color: var(--cor-subtexto);">Enviar pedido formal de cancelamento para a Secretaria</div>
            </div>
          </button>
        </div>

        <!-- SUBTELA 1: ALTERAR EVENTO -->
        <div id="subtelaAlterar" style="display: none;">
          <button type="button" class="btn-voltar-tipo" onclick="voltarMenuGerenciar()">← Voltar às opções</button>
          
          <form onsubmit="submeterAlterarEventoSelecionado(event)">
            <div class="alert-banner warning">
              🔄 A alteração será enviada à Secretaria para aprovação no WhatsApp.
            </div>

            <div class="form-row two-cols">
              <div class="form-group">
                <label>O que deseja alterar? *</label>
                <select class="form-control" id="ger_alt_campo" required>
                  <option value="Data">Data</option>
                  <option value="Horário">Horário</option>
                  <option value="Local">Local</option>
                  <option value="Outro Detalhe">Outro Detalhe</option>
                </select>
              </div>
              <div class="form-group">
                <label>Nova Informação *</label>
                <input type="text" class="form-control" id="ger_alt_novo_valor" placeholder="Ex: Nova data 25/11 ou 19h às 21h" required />
              </div>
            </div>

            <div class="form-group">
              <label>Motivo da Alteração</label>
              <textarea class="form-control" id="ger_alt_motivo" rows="2" placeholder="Explique brevemente o motivo da mudança..."></textarea>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;">
              <button type="button" class="btn-secundario" onclick="voltarMenuGerenciar()">Voltar</button>
              <button type="submit" class="btn-principal">Enviar Alteração</button>
            </div>
          </form>
        </div>

        <!-- SUBTELA 2: COMPLETAR FORMULÁRIO -->
        <div id="subtelaFormulario" style="display: none;">
          <button type="button" class="btn-voltar-tipo" onclick="voltarMenuGerenciar()">← Voltar às opções</button>
          
          <form onsubmit="submeterAtualizarFormularioSelecionado(event)">
            <div class="form-row two-cols">
              <div class="form-group">
                <label>Tema do Evento</label>
                <input type="text" class="form-control" id="ger_form_tema" placeholder="Tema oficial" />
              </div>
              <div class="form-group">
                <label>Versículo Chave</label>
                <input type="text" class="form-control" id="ger_form_versiculo" placeholder="Livro, capítulo e versículo" />
              </div>
            </div>

            <div class="form-group">
              <label>Objetivo Espiritual do Evento</label>
              <textarea class="form-control" id="ger_form_objetivo" rows="2" placeholder="Edificação da igreja e salvação de almas..."></textarea>
            </div>

            <div class="form-row two-cols">
              <div class="form-group">
                <label>Inscrição</label>
                <select class="form-control" id="ger_form_inscricao">
                  <option value="nao">Não (Entrada Livre)</option>
                  <option value="sim">Sim (Inscrição Necessária)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Valor da Inscrição (R$)</label>
                <input type="text" class="form-control" id="ger_form_valor" placeholder="Ex: 20,00" />
              </div>
            </div>

            <div class="form-group">
              <label>Precisará de verba da Tesouraria?</label>
              <select class="form-control" id="ger_form_tesouraria">
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </div>

            <div class="form-group">
              <label>Observações Gerais</label>
              <textarea class="form-control" id="ger_form_obs" rows="2" placeholder="Requisitos de multimídia, som, voluntários..."></textarea>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;">
              <button type="button" class="btn-secundario" onclick="voltarMenuGerenciar()">Voltar</button>
              <button type="submit" class="btn-principal">Salvar Formulário</button>
            </div>
          </form>
        </div>

        <!-- SUBTELA 3: CANCELAR EVENTO -->
        <div id="subtelaCancelar" style="display: none;">
          <button type="button" class="btn-voltar-tipo" onclick="voltarMenuGerenciar()">← Voltar às opções</button>
          
          <form onsubmit="submeterCancelarEventoSelecionado(event)">
            <div class="alert-banner warning">
              ⚠️ O cancelamento será comunicado à Secretaria e o evento retirado da agenda oficial.
            </div>

            <div class="form-group">
              <label>Motivo do Cancelamento *</label>
              <textarea class="form-control" id="ger_canc_motivo" rows="3" placeholder="Informe detalhadamente o motivo do cancelamento..." required></textarea>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;">
              <button type="button" class="btn-secundario" onclick="voltarMenuGerenciar()">Voltar</button>
              <button type="submit" class="btn-principal" style="background: var(--cor-vermelho);">
                Confirmar Cancelamento
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  </div>

  <script>
    const usuarioLogado = ${jsonPerfil};

    let dataAtual = new Date();
    let mesAtual = dataAtual.getMonth();
    let anoAtual = dataAtual.getFullYear();
    let diaSelecionado = dataAtual.getDate();

    let todosEventos = ${jsonEventosIniciais} || [];
    let todasSolicitacoes = [];
    let todasFichas = [];
    let eventoSendoGerenciado = null;

    const nomesMeses = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // RENDERIZAÇÃO IMEDIATA (sem piscar tela, usando eventos locais do servidor)
    renderizarCalendario();
    selecionarDia(diaSelecionado);

    function iniciarCarregamentos() {
      carregarEventosServidor();
      carregarSolicitacoesServidor();
      carregarFichasServidor();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', iniciarCarregamentos);
    } else {
      iniciarCarregamentos();
    }
    setTimeout(iniciarCarregamentos, 50);

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
      const loader = document.getElementById('calLoadingIndicator');
      if (loader && todosEventos.length === 0) loader.style.display = 'flex';
      try {
        const res = await fetch(\`/gestao/api/eventos?mes=\${mesAtual + 1}&ano=\${anoAtual}\`);
        if (!res.ok) throw new Error('Falha HTTP ' + res.status);
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.eventos)) {
          todosEventos = data.eventos;
          renderizarCalendario();
          selecionarDia(diaSelecionado);
          if (typeof executarPesquisaEventos === 'function') {
            executarPesquisaEventos();
          }
        }
      } catch (err) {
        console.warn('Erro ao sincronizar eventos:', err);
      } finally {
        if (loader) loader.style.display = 'none';
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
      renderizarCalendario();
      selecionarDia(1);
      carregarEventosServidor();
    }

    function irParaHoje() {
      const hoje = new Date();
      mesAtual = hoje.getMonth();
      anoAtual = hoje.getFullYear();
      diaSelecionado = hoje.getDate();
      renderizarCalendario();
      selecionarDia(diaSelecionado);
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

      // Dias anteriores
      for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
        const d = totalDiasMesAnterior - i;
        const cell = document.createElement('div');
        cell.className = 'cal-day outro-mes';
        cell.innerHTML = \`<div class="day-num">\${d}</div>\`;
        grid.appendChild(cell);
      }

      // Dias do mês
      for (let d = 1; d <= totalDiasMes; d++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day';
        if (ehMesAtual && d === hoje.getDate()) cell.classList.add('hoje');
        if (d === diaSelecionado) cell.classList.add('selecionado');

        cell.onclick = () => selecionarDia(d);

        const dataStr = \`\${String(d).padStart(2, '0')}/\${String(mesAtual + 1).padStart(2, '0')}/\${anoAtual}\`;
        const eventosDia = obterEventosNaData(dataStr);

        let chipsHtml = '';
        const maxChipsVisiveis = 2;
        eventosDia.slice(0, maxChipsVisiveis).forEach((ev, idx) => {
          let chipClass = 'confirmado';
          if (ev.status === 'pendente_secretaria') chipClass = 'pendente';
          else if (ev.tipo === 'acao') chipClass = 'acao';
          else if (ev.tipo === 'reuniao') chipClass = 'reuniao';
          else if (ev.tipo === 'ensaio') chipClass = 'ensaio';
          else if (ev.tipo === 'atendimento') chipClass = 'pastoral';
          else if (ev.isOcupacaoExterna) chipClass = 'bloqueio';

          chipsHtml += \`<span class="event-chip \${chipClass}" title="\${ev.titulo}">\${ev.titulo}</span>\`;
        });
        if (eventosDia.length > maxChipsVisiveis) {
          const restantes = eventosDia.length - maxChipsVisiveis;
          chipsHtml += \`<span class="event-chip bloqueio">+\${restantes} mais</span>\`;
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
        if (filtroDepto !== 'todos' && !ev.isOcupacaoExterna) {
          const deptoEv = String(ev.departamento || '').toLowerCase();
          const f = filtroDepto.toLowerCase();
          const match = deptoEv.includes(f) || f.includes(deptoEv) ||
                        (f.includes('epifania') && deptoEv.includes('epifania')) ||
                        (f.includes('mulher') && deptoEv.includes('mulher')) ||
                        (f.includes('homem') && deptoEv.includes('homem')) ||
                        (f.includes('ruach') && deptoEv.includes('ruach')) ||
                        (f.includes('casais') && deptoEv.includes('casais')) ||
                        (f.includes('kids') && deptoEv.includes('kids')) ||
                        (f.includes('arte') && deptoEv.includes('arte')) ||
                        (f.includes('intercess') && deptoEv.includes('intercess')) ||
                        (f.includes('seeds') && deptoEv.includes('seeds'));
          if (!match) return false;
        }
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

        container.innerHTML = eventosDia.map((ev, i) => \`
          <div class="day-event-card" onclick="abrirGerenciadorEvento(\${i})">
            <div class="title">
              <span>\${ev.titulo}</span>
              <span style="font-size: 0.7rem; color: var(--cor-roxo);">⚙️</span>
            </div>
            <div class="meta">
              <span>🏢 \${ev.departamento} • \${ev.tipo === 'acao' ? 'AÇÃO / VENDA' : (ev.tipo || 'evento').toUpperCase()}</span>
              <span>⏰ \${ev.horarioInicio || '19:00'} \${ev.horarioFim ? 'às ' + ev.horarioFim : ''}</span>
              <span>📍 \${ev.local}</span>
              \${ev.status === 'pendente_secretaria' ? '<span style="color: var(--cor-amarelo); font-weight:800;">⏳ Aguardando Aprovação</span>' : '<span style="color: var(--cor-verde); font-weight:800;">✅ Confirmado</span>'}
            </div>
            <span class="action-hint">Toque para alterar, ver formulário ou cancelar ›</span>
          </div>
        \`).join('');
      }
    }

    // ABERTURA DE NOVO AGENDAMENTO (PASSO 1: ESCOLHA DE TIPO)
    function abrirNovoAgendamento() {
      voltarParaEscolhaTipo();
      document.getElementById('modalAgendamento').classList.add('active');
    }

    function agendarDataSelecionada() {
      abrirNovoAgendamento();
    }

    function voltarParaEscolhaTipo() {
      document.querySelectorAll('#modalAgendamento .form-step').forEach(s => s.classList.remove('active'));
      document.getElementById('stepEscolhaTipo').classList.add('active');
      document.getElementById('modalAgendamentoTitulo').innerText = '➕ Novo Agendamento';
    }

    function iniciarAgendamentoTipo(tipo) {
      document.querySelectorAll('#modalAgendamento .form-step').forEach(s => s.classList.remove('active'));

      const dataStr = \`\${String(diaSelecionado).padStart(2, '0')}/\${String(mesAtual + 1).padStart(2, '0')}/\${anoAtual}\`;

      if (tipo === 'evento') {
        document.getElementById('stepFormEvento').classList.add('active');
        document.getElementById('modalAgendamentoTitulo').innerText = '🎪 Agendar Novo Evento';
        if (document.getElementById('ev_data')) document.getElementById('ev_data').value = dataStr;
      } else if (tipo === 'acao') {
        const stepAc = document.getElementById('stepFormAcao');
        if (stepAc) {
          stepAc.classList.add('active');
          document.getElementById('modalAgendamentoTitulo').innerText = '🍲 Agendar Ação / Venda Beneficente';
          if (document.getElementById('acao_data')) document.getElementById('acao_data').value = dataStr;
        }
      } else if (tipo === 'reuniao') {
        document.getElementById('stepFormReuniao').classList.add('active');
        document.getElementById('modalAgendamentoTitulo').innerText = '🤝 Agendar Reunião de Liderança';
        if (document.getElementById('reu_data')) document.getElementById('reu_data').value = dataStr;
      } else if (tipo === 'ensaio') {
        document.getElementById('stepFormEnsaio').classList.add('active');
        document.getElementById('modalAgendamentoTitulo').innerText = '🎵 Agendar Ensaio';
        if (document.getElementById('ens_data')) document.getElementById('ens_data').value = dataStr;
      } else if (tipo === 'atendimento') {
        const stepAt = document.getElementById('stepFormAtendimento');
        if (stepAt) {
          stepAt.classList.add('active');
          document.getElementById('modalAgendamentoTitulo').innerText = '📖 Agendar Atendimento Pastoral';
          if (document.getElementById('at_data')) document.getElementById('at_data').value = dataStr;
        }
      }

      document.getElementById('modalAgendamento').classList.add('active');
    }

    function fecharModalAgendamento() {
      document.getElementById('modalAgendamento').classList.remove('active');
    }

    // MODAL DE GERENCIAMENTO DO EVENTO (ALTERAR / CANCELAR / FORMULÁRIO)
    function abrirGerenciadorPorObjeto(ev) {
      if (!ev) return;
      eventoSendoGerenciado = ev;
      document.getElementById('det_titulo').innerText = ev.titulo;
      document.getElementById('det_meta').innerText = \`\${ev.data || '-'} • \${ev.horarioInicio || '19:00'} às \${ev.horarioFim || '21:30'} • \${ev.local || 'Na Igreja'} (\${ev.departamento || 'Geral'})\`;

      // Pré-preenche campos
      if (document.getElementById('ger_alt_novo_valor')) document.getElementById('ger_alt_novo_valor').value = '';
      if (document.getElementById('ger_alt_motivo')) document.getElementById('ger_alt_motivo').value = '';
      if (document.getElementById('ger_canc_motivo')) document.getElementById('ger_canc_motivo').value = '';

      if (ev.payload) {
        if (document.getElementById('ger_form_tema')) document.getElementById('ger_form_tema').value = ev.payload.tema || '';
        if (document.getElementById('ger_form_versiculo')) document.getElementById('ger_form_versiculo').value = ev.payload.versiculo || '';
        if (document.getElementById('ger_form_objetivo')) document.getElementById('ger_form_objetivo').value = ev.payload.objetivo_espiritual || '';
        if (document.getElementById('ger_form_obs')) document.getElementById('ger_form_obs').value = ev.payload.observacoes || '';
      }

      voltarMenuGerenciar();

      if (ev.isOcupacaoExterna) {
        const aviso = document.getElementById('avisoOcupacaoExterna');
        if (aviso) aviso.style.display = 'flex';
        const menu = document.getElementById('acoesEventoMenu');
        if (menu) menu.style.display = 'none';
      }

      document.getElementById('modalGerenciarEvento').classList.add('active');
    }

    function abrirGerenciadorPorEventoData(d, idx) {
      const dataStr = \`\${String(d).padStart(2, '0')}/\${String(mesAtual + 1).padStart(2, '0')}/\${anoAtual}\`;
      const eventosDia = obterEventosNaData(dataStr);
      const ev = eventosDia[idx];
      if (!ev) return;
      abrirGerenciadorPorObjeto(ev);
    }

    function abrirGerenciadorEvento(indexNoDia) {
      abrirGerenciadorPorEventoData(diaSelecionado, indexNoDia);
    }

    function abrirGerenciadorPorId(idOuCodigo) {
      let ev = todosEventos.find(e => e.id === idOuCodigo || e.codigo === idOuCodigo);
      if (!ev) {
        const sol = todasSolicitacoes.find(s => s.id === idOuCodigo || s.codigo === idOuCodigo);
        if (sol) {
          ev = {
            titulo: sol.titulo,
            data: sol.data,
            horarioInicio: sol.horarioInicio,
            horarioFim: sol.horarioFim,
            local: sol.local || ENDERECO_IGREJA,
            departamento: sol.departamento,
            payload: sol.payload
          };
        }
      }
      if (!ev) return;
      abrirGerenciadorPorObjeto(ev);
    }

    function fecharModalGerenciarEvento() {
      document.getElementById('modalGerenciarEvento').classList.remove('active');
    }

    function voltarMenuGerenciar() {
      const aviso = document.getElementById('avisoOcupacaoExterna');
      if (aviso) aviso.style.display = 'none';
      document.getElementById('acoesEventoMenu').style.display = 'grid';
      document.getElementById('subtelaAlterar').style.display = 'none';
      document.getElementById('subtelaFormulario').style.display = 'none';
      document.getElementById('subtelaCancelar').style.display = 'none';
      document.getElementById('gerenciarEventoTitulo').innerText = '⚙️ Gerenciar Evento';
      if (eventoSendoGerenciado) {
        const btnF = document.getElementById('btnAcaoFormulario');
        if (btnF) {
          const ehEv = (eventoSendoGerenciado.tipo === 'evento' || !eventoSendoGerenciado.tipo) && !eventoSendoGerenciado.isOcupacaoExterna;
          btnF.style.display = ehEv ? 'flex' : 'none';
        }
      }
    }

    function exibirSubtelaGerenciar(tipo) {
      document.getElementById('acoesEventoMenu').style.display = 'none';
      document.getElementById('subtelaAlterar').style.display = tipo === 'alterar' ? 'block' : 'none';
      document.getElementById('subtelaFormulario').style.display = tipo === 'formulario' ? 'block' : 'none';
      document.getElementById('subtelaCancelar').style.display = tipo === 'cancelar' ? 'block' : 'none';

      if (tipo === 'alterar') document.getElementById('gerenciarEventoTitulo').innerText = '🔄 Alterar Informações do Evento';
      if (tipo === 'formulario') document.getElementById('gerenciarEventoTitulo').innerText = '📝 Ficha & Formulário do Evento';
      if (tipo === 'cancelar') document.getElementById('gerenciarEventoTitulo').innerText = '🗑️ Cancelar Evento';
    }

    async function submeterAlterarEventoSelecionado(e) {
      e.preventDefault();
      if (!eventoSendoGerenciado) return;

      const payload = {
        tipo: 'alterar',
        nome_evento: eventoSendoGerenciado.titulo,
        campo_alterar: document.getElementById('ger_alt_campo').value,
        novo_valor: document.getElementById('ger_alt_novo_valor').value,
        motivo: document.getElementById('ger_alt_motivo').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ret = await res.json();
        if (ret.ok) {
          alert('✅ ' + (ret.mensagem || 'Solicitação de alteração enviada!'));
          fecharModalGerenciarEvento();
          carregarSolicitacoesServidor();
        } else {
          alert('❌ Erro: ' + ret.message);
        }
      } catch (_) {
        alert('❌ Erro de conexão.');
      }
    }

    async function submeterAtualizarFormularioSelecionado(e) {
      e.preventDefault();
      if (!eventoSendoGerenciado) return;

      const payload = {
        tipo: 'atualizar_formulario',
        nome_evento: eventoSendoGerenciado.titulo,
        tema: document.getElementById('ger_form_tema').value,
        versiculo: document.getElementById('ger_form_versiculo').value,
        objetivo_espiritual: document.getElementById('ger_form_objetivo').value,
        precisa_inscricao: document.getElementById('ger_form_inscricao').value,
        valor_inscricao: document.getElementById('ger_form_valor').value,
        precisa_valor_ministerio: document.getElementById('ger_form_tesouraria').value,
        observacoes: document.getElementById('ger_form_obs').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ret = await res.json();
        if (ret.ok) {
          alert('✅ Ficha atualizada com sucesso!');
          fecharModalGerenciarEvento();
          carregarFichasServidor();
        } else {
          alert('❌ Erro: ' + ret.message);
        }
      } catch (_) {
        alert('❌ Erro ao atualizar.');
      }
    }

    async function submeterCancelarEventoSelecionado(e) {
      e.preventDefault();
      if (!eventoSendoGerenciado) return;

      const payload = {
        tipo: 'cancelar',
        nome_evento: eventoSendoGerenciado.titulo,
        motivo: document.getElementById('ger_canc_motivo').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ret = await res.json();
        if (ret.ok) {
          alert('✅ Solicitação de cancelamento enviada à Secretaria!');
          fecharModalGerenciarEvento();
          carregarSolicitacoesServidor();
        } else {
          alert('❌ Erro: ' + ret.message);
        }
      } catch (_) {
        alert('❌ Erro de conexão.');
      }
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
      } catch (_) {
        alert('❌ Erro ao enviar.');
      } finally {
        btn.disabled = false;
        btn.innerText = 'Enviar Solicitação';
      }
    }

    async function submeterNovaReuniao(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSalvarReuniao');
      btn.disabled = true;

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
        alert('❌ Erro ao enviar.');
      } finally {
        btn.disabled = false;
      }
    }

    async function submeterNovoEnsaio(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSalvarEnsaio');
      btn.disabled = true;

      const payload = {
        tipo: 'ensaio',
        departamento: document.getElementById('ens_departamento').value,
        data: document.getElementById('ens_data').value,
        horario_inicio: document.getElementById('ens_hora_ini').value,
        horario_termino: document.getElementById('ens_hora_fim').value,
        local: document.getElementById('ens_local').value,
        pauta: document.getElementById('ens_pauta').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ret = await res.json();
        if (ret.ok) {
          alert('✅ ' + (ret.mensagem || 'Ensaio solicitado com sucesso!'));
          fecharModalAgendamento();
          carregarEventosServidor();
          carregarSolicitacoesServidor();
        } else {
          alert('❌ Erro: ' + ret.message);
        }
      } catch (_) {
        alert('❌ Erro ao enviar.');
      } finally {
        btn.disabled = false;
      }
    }

    async function submeterNovaAcao(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSalvarAcao');
      if (btn) btn.disabled = true;

      const payload = {
        tipo: 'acao',
        nome_evento: document.getElementById('acao_nome').value,
        departamento: document.getElementById('acao_departamento').value,
        data: document.getElementById('acao_data').value,
        horario_inicio: document.getElementById('acao_hora_ini').value,
        horario_termino: document.getElementById('acao_hora_fim').value,
        local: document.getElementById('acao_local').value,
        ocupa_salao: document.getElementById('acao_ocupa_salao').value,
        detalhes: document.getElementById('acao_detalhes').value
      };

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ret = await res.json();
        if (ret.ok) {
          alert('✅ ' + (ret.mensagem || ret.message || 'Ação/Venda solicitada com sucesso!'));
          fecharModalAgendamento();
          carregarEventosServidor();
          carregarSolicitacoesServidor();
        } else {
          alert('❌ Erro: ' + (ret.message || 'Falha ao solicitar ação/venda.'));
        }
      } catch (_) {
        alert('❌ Erro ao enviar.');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function submeterAtendimentoPastoral(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSalvarAtendimento');
      if (btn) btn.disabled = true;

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
        alert('❌ Erro ao salvar.');
      } finally {
        if (btn) btn.disabled = false;
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
          <td><span class="badge-status \${sol.statusClass}">\${sol.status}</span></td>
          <td>
            <button class="btn-secundario" onclick="abrirGerenciadorPorId('\${sol.codigo || sol.id}')" style="padding: 4px 8px; font-size: 0.72rem;">
              ⚙️ Opções
            </button>
          </td>
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
              <div style="display: flex; gap: 4px;">
                \${f.docUrl ? \`<a href="\${f.docUrl}" target="_blank" class="btn-secundario" style="text-decoration: none; padding: 4px 8px; font-size: 0.72rem;">Abrir Docs</a>\` : ''}
                <button class="btn-secundario" onclick="abrirGerenciadorPorId('form_\${f.id}')" style="padding: 4px 8px; font-size: 0.72rem;">
                  📝 Ver / Editar
                </button>
              </div>
            </td>
          </tr>
        \`;
      }).join('');
    }

    function filtrarCalendario() {
      renderizarCalendario();
      selecionarDia(diaSelecionado);
    }

        // PESQUISA GLOBAL DE EVENTOS
    function executarPesquisaEventos() {
      const termo = (document.getElementById('campoBuscaPesquisa')?.value || '').toLowerCase().trim();
      const filtroTipo = document.getElementById('filtroTipoPesquisa')?.value || 'todos';
      const filtroDepto = document.getElementById('filtroDeptoPesquisa')?.value || 'todos';

      const container = document.getElementById('containerResultadosPesquisa');
      if (!container) return;

      const resultados = todosEventos.filter(ev => {
        if (filtroTipo !== 'todos' && ev.tipo !== filtroTipo) return false;
        if (filtroDepto !== 'todos') {
          const deptoEv = String(ev.departamento || '').toLowerCase();
          const f = filtroDepto.toLowerCase();
          const match = deptoEv.includes(f) || f.includes(deptoEv) ||
                        (f.includes('epifania') && deptoEv.includes('epifania')) ||
                        (f.includes('mulher') && deptoEv.includes('mulher')) ||
                        (f.includes('homem') && deptoEv.includes('homem')) ||
                        (f.includes('ruach') && deptoEv.includes('ruach')) ||
                        (f.includes('casais') && deptoEv.includes('casais')) ||
                        (f.includes('kids') && deptoEv.includes('kids')) ||
                        (f.includes('arte') && deptoEv.includes('arte')) ||
                        (f.includes('intercess') && deptoEv.includes('intercess')) ||
                        (f.includes('seeds') && deptoEv.includes('seeds'));
          if (!match && !ev.isOcupacaoExterna) return false;
        }
        if (termo) {
          const t = String(ev.titulo || '') + ' ' + String(ev.departamento || '') + ' ' + String(ev.data || '') + ' ' + String(ev.local || '') + ' ' + String(ev.descricao || '');
          if (!t.toLowerCase().includes(termo)) return false;
        }
        return true;
      });

      if (resultados.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--cor-subtexto);">Nenhum agendamento encontrado para esta busca.</div>';
        return;
      }

      container.innerHTML = resultados.map(ev => {
        let chipClass = 'confirmado';
        let tipoNome = 'EVENTO';
        if (ev.tipo === 'acao') { chipClass = 'acao'; tipoNome = 'AÇÃO / VENDA'; }
        else if (ev.tipo === 'reuniao') { chipClass = 'reuniao'; tipoNome = 'REUNIÃO'; }
        else if (ev.tipo === 'ensaio') { chipClass = 'ensaio'; tipoNome = 'ENSAIO'; }
        else if (ev.tipo === 'atendimento') { chipClass = 'pastoral'; tipoNome = 'ATENDIMENTO'; }

        const statusHtml = ev.status === 'pendente_secretaria'
          ? '<span style="color: var(--cor-amarelo); font-weight: 700;">⏳ Aguardando Aprovação</span>'
          : '<span style="color: var(--cor-verde); font-weight: 700;">✅ Confirmado</span>';

        const horarioStr = '⏰ ' + (ev.horarioInicio || '19:00') + (ev.horarioFim ? ' às ' + ev.horarioFim : '');

        const idEv = String(ev.id || ev.codigo || '');
        return '<div class="day-event-card" style="border: 1px solid var(--cor-borda); background: #ffffff; cursor: pointer;" onclick="abrirGerenciadorPorId(&quot;' + idEv + '&quot;)">' +
          '<div class="title" style="margin-bottom: 6px;">' +
            '<span style="font-size: 0.92rem; font-weight: 800;">' + ev.titulo + '</span>' +
            '<span class="event-chip ' + chipClass + '" style="pointer-events: auto;">' + tipoNome + '</span>' +
          '</div>' +
          '<div class="meta" style="gap: 4px;">' +
            '<span>📅 ' + (ev.data || '-') + ' • ' + horarioStr + '</span>' +
            '<span>🏢 ' + (ev.departamento || 'Geral') + ' • 📍 ' + (ev.local || 'Na Igreja') + '</span>' +
            statusHtml +
          '</div>' +
          '<span class="action-hint" style="margin-top: 8px;">Toque para gerenciar ›</span>' +
        '</div>';
      }).join('');
    }

    // MODAL DE SOLICITAÇÃO DE MÍDIA
    function abrirModalSolicitarMidia() {
      document.getElementById('modalSolicitarMidia').classList.add('active');
    }
    function fecharModalSolicitarMidia() {
      document.getElementById('modalSolicitarMidia').classList.remove('active');
    }

    async function submeterSolicitacaoMidia(event) {
      event.preventDefault();
      const departamento = document.getElementById('midia_departamento').value;
      const tipo_material = document.getElementById('midia_tipo_material').value;
      const nome_evento = document.getElementById('midia_evento').value;
      const prazo_entrega = document.getElementById('midia_prazo').value;
      const detalhes = document.getElementById('midia_detalhes').value;

      try {
        const res = await fetch('/gestao/api/solicitar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'midia',
            departamento,
            tipo_material,
            nome_evento,
            prazo_entrega,
            detalhes
          })
        });
        const data = await res.json();
        if (data.ok) {
          alert('✅ ' + (data.mensagem || data.message || 'Solicitação de arte enviada com sucesso!'));
          fecharModalSolicitarMidia();
          document.getElementById('formSolicitarMidia').reset();
          carregarSolicitacoesServidor();
          trocarAba('solicitacoes');
        } else {
          alert('❌ Erro: ' + (data.message || 'Falha ao registrar solicitação.'));
        }
      } catch (err) {
        alert('❌ Erro de conexão ao enviar solicitação.');
      }
    }
  </script>
</body>
</html>`;
}

module.exports = {
  obterPerfilGestao,
  listarEventosLocais,
  listarEventosCalendario,
  listarSolicitacoes,
  listarFichas,
  criarSolicitacaoEventoWeb,
  renderGestaoHtml,
  setDependencies
};
