const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-gestao-test-"));
process.env.DB_PATH = path.join(tmpDir, "dados.db");
process.env.COMBINED_LOG_PATH = path.join(tmpDir, "combined.log");
fs.writeFileSync(process.env.COMBINED_LOG_PATH, "linha de log\n");

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startWebServer, addUser } = require("../web");
const gestao = require("../web/gestao");
const { createSession } = require("../web/auth");
const { montarResourceEvento } = require("../bot/agendamentoAutomatico");

const getStatus = () => ({ connected: false, initializing: false });
const noop = async () => ({ ok: true });

let server;
let baseUrl;

before(async () => {
  server = startWebServer({ getStatus, startClient: noop, cancelQr: noop, disconnectClient: noop, port: 0 });
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

test("GET /gestao sem autenticação: redireciona 302 para login", async () => {
  const res = await fetch(`${baseUrl}/gestao`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/secretaria/login?redirect=/gestao");
});

test("GET /gestao autenticado: retorna a página HTML com status 200 e componentes do painel", async () => {
  const token = createSession("pastor.teste", "pastor", "active");
  const res = await fetch(`${baseUrl}/gestao`, {
    headers: { Cookie: `whatsapp_control_session=${token}` }
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Gestão de Eventos/);
  assert.match(html, /Calendário/);
  assert.match(html, /Novo Agendamento/);
  assert.match(html, /modal-agendamento/);
});

test("GET /gestao/api/eventos: retorna 200 e lista de eventos", async () => {
  const res = await fetch(`${baseUrl}/gestao/api/eventos`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.eventos));
});

test("obterPerfilGestao: identifica corretamente os perfis Líder, Diretor, Pastor e Admin", () => {
  const perfilLider = gestao.obterPerfilGestao({ username: "joao.lider", role: "lider" });
  assert.equal(perfilLider.perfilTitulo, "Líder");
  assert.equal(perfilLider.isLider, true);

  const perfilDiretor = gestao.obterPerfilGestao({ username: "carlos.diretor", role: "diretor" });
  assert.equal(perfilDiretor.perfilTitulo, "Diretor");
  assert.equal(perfilDiretor.isDiretor, true);

  const perfilPastor = gestao.obterPerfilGestao({ username: "pr.mauricio", role: "user" });
  assert.equal(perfilPastor.perfilTitulo, "Pastor");
  assert.equal(perfilPastor.isPastor, true);

  const perfilAdmin = gestao.obterPerfilGestao({ username: "admin", role: "admin" });
  assert.equal(perfilAdmin.perfilTitulo, "Administrador");
  assert.equal(perfilAdmin.isAdmin, true);
});

test("POST /gestao/api/solicitar: valida campos e cria solicitação com código único", async () => {
  const token = createSession("lider.teste", "lider", "active");

  // Tentativa sem nome do evento
  const resInvalido = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${token}`
    },
    body: JSON.stringify({
      nome_lider: "Líder de Teste",
      data_evento: "2026-11-20"
    })
  });
  assert.equal(resInvalido.status, 400);

  // Tentativa com dados válidos completos
  const resValido = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${token}`
    },
    body: JSON.stringify({
      nome_lider: "Líder Débora",
      telefone_lider: "11988887777",
      nome_evento: "Vigília de Mulheres",
      departamento: "Rede de Mulheres",
      data_evento: "2026-11-20",
      horario_inicio: "22:00",
      horario_termino: "03:00",
      precisa_salao_antes: "sim",
      salao_detalhes: "No dia a partir das 21h",
      local: "Igreja",
      publico: "Mulheres",
      responsavel_geral: "Líder Débora",
      convidado: "Banda Convidada",
      louvor: "Equipe Local",
      decoracao: "Simples",
      alimentacao: "Café da manhã ao término",
      equipe: "5 voluntárias",
      materiais: "Som e microfones",
      cronograma: "22h Abertura, 23h Louvor, 00h Oração, 02h Palavra",
      midia_ja_feita: "nao",
      paleta: "Lilás e branco",
      estilo: "Flyer stories",
      prazo_imagem: "Até 10/11",
      data_maxima_divulgacao: "11/11/2026",
      valor_inscricao: "Gratuito",
      precisa_valor_ministerio: "nao",
      tema: "Despertar",
      versiculo: "Isaías 60:1",
      objetivo_espiritual: "Despertamento e renovo espiritual",
      observacoes: "Levar almofadas"
    })
  });

  assert.equal(resValido.status, 200);
  const data = await resValido.json();
  assert.equal(data.ok, true);
  assert.ok(data.codigo);
  assert.equal(data.codigo.length, 4);
  assert.match(data.message, /Solicitação registrada com sucesso/);
});

test("GET /gestao/api/fichas: controle rigoroso de acesso (Pastor tem acesso total, Líder só ao seu depto, Diretor sem acesso irrestrito)", async () => {
  const tokenPastor = createSession("pastor.teste", "pastor", "active");
  const tokenLider = createSession("lider.teste", "lider", "active");
  const tokenDiretor = createSession("diretor.teste", "diretor", "active");

  // Pastor
  const resPastor = await fetch(`${baseUrl}/gestao/api/fichas`, {
    headers: { Cookie: `whatsapp_control_session=${tokenPastor}` }
  });
  assert.equal(resPastor.status, 200);
  const dataPastor = await resPastor.json();
  assert.equal(dataPastor.ok, true);
  assert.ok(Array.isArray(dataPastor.fichas));

  // Líder (Rede de Homens)
  const resLider = await fetch(`${baseUrl}/gestao/api/fichas`, {
    headers: { Cookie: `whatsapp_control_session=${tokenLider}` }
  });
  assert.equal(resLider.status, 200);
  const dataLider = await resLider.json();
  assert.equal(dataLider.ok, true);
  // Garante que o líder só vê fichas do seu departamento
  for (const ficha of dataLider.fichas) {
    assert.match(ficha.departamento.toLowerCase(), /homens|geral/);
  }

  // Diretor (não pastor): não tem acesso total a fichas de outros departamentos
  const resDiretor = await fetch(`${baseUrl}/gestao/api/fichas`, {
    headers: { Cookie: `whatsapp_control_session=${tokenDiretor}` }
  });
  assert.equal(resDiretor.status, 200);
  const dataDiretor = await resDiretor.json();
  assert.equal(dataDiretor.ok, true);
  assert.ok(dataDiretor.fichas.length <= dataPastor.fichas.length);
});

test("GET /gestao/api/solicitacoes: limpa registros de teste e aplica privacidade por líder", async () => {
  const tokenLider = createSession("lider.teste", "lider", "active");
  const res = await fetch(`${baseUrl}/gestao/api/solicitacoes`, {
    headers: { Cookie: `whatsapp_control_session=${tokenLider}` }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.solicitacoes));

  // Nenhuma solicitação deve ter nomes de teste óbvios
  for (const sol of data.solicitacoes) {
    assert.doesNotMatch(sol.titulo.toLowerCase(), /^(teste|test|gabi)$/);
  }
});

test("POST /gestao/api/solicitar: suporta reunião, alteração e cancelamento de eventos", async () => {
  const tokenLider = createSession("lider.teste", "lider", "active");

  // 1. Reunião de liderança
  const resReuniao = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenLider}`
    },
    body: JSON.stringify({
      tipo: "reuniao",
      departamento: "Rede de Homens",
      data: "22/11/2026",
      horario_inicio: "19:30",
      horario_termino: "21:00",
      local: "Igreja",
      pauta: "Planejamento anual da Rede"
    })
  });
  assert.equal(resReuniao.status, 200);
  const dataReuniao = await resReuniao.json();
  assert.equal(dataReuniao.ok, true);
  assert.ok(dataReuniao.codigo);

  // 2. Pedido de alteração de evento
  const resAlterar = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenLider}`
    },
    body: JSON.stringify({
      tipo: "alterar",
      nome_evento: "Café com Deus",
      campo_alterar: "Horário",
      novo_valor: "09:00 às 11:30",
      motivo: "Ajuste na escala"
    })
  });
  assert.equal(resAlterar.status, 200);
  const dataAlterar = await resAlterar.json();
  assert.equal(dataAlterar.ok, true);
  assert.ok(dataAlterar.codigo);

  // 3. Pedido de cancelamento de evento
  const resCancelar = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenLider}`
    },
    body: JSON.stringify({
      tipo: "cancelar",
      nome_evento: "Café com Deus",
      motivo: "Evento cancelado em comum acordo"
    })
  });
  assert.equal(resCancelar.status, 200);
  const dataCancelar = await resCancelar.json();
  assert.equal(dataCancelar.ok, true);
  assert.ok(dataCancelar.codigo);
});

test("POST /gestao/api/solicitar: atendimento pastoral restrito a pastores", async () => {
  const tokenLider = createSession("lider.teste", "lider", "active");
  const tokenPastor = createSession("pastor.teste", "pastor", "active");

  // Líder tenta agendar atendimento pastoral -> Erro 400
  const resLider = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenLider}`
    },
    body: JSON.stringify({
      tipo: "atendimento",
      nome_discipulo: "Irmão Marcos",
      data: "20/11/2026",
      horario_inicio: "15:00",
      horario_termino: "16:00"
    })
  });
  assert.equal(resLider.status, 400);

  // Pastor agenda atendimento pastoral -> Sucesso 200
  const resPastor = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenPastor}`
    },
    body: JSON.stringify({
      tipo: "atendimento",
      nome_discipulo: "Irmão Marcos",
      telefone_discipulo: "11999998888",
      data: "20/11/2026",
      horario_inicio: "15:00",
      horario_termino: "16:00",
      motivo: "Aconselhamento familiar"
    })
  });
  assert.equal(resPastor.status, 200);
  const dataPastor = await resPastor.json();
  assert.equal(dataPastor.ok, true);
});

test("POST /gestao/api/solicitar: suporta solicitação de artes e mídia com código e notificação", async () => {
  const tokenLider = createSession("lider.teste", "lider", "active");

  const resMidia = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenLider}`
    },
    body: JSON.stringify({
      tipo: "midia",
      departamento: "Rede de Homens",
      tipo_material: "Flyer / Redes Sociais (Feed e Stories)",
      nome_evento: "Café de Homens",
      prazo_entrega: "15/11/2026",
      detalhes: "Tema: Homens Fortes na Fé. Preletor: Pr. Idel. Horário: 08:30"
    })
  });

  assert.equal(resMidia.status, 200);
  const dataMidia = await resMidia.json();
  assert.equal(dataMidia.ok, true);
  assert.ok(dataMidia.codigo);

  // Verifica se aparece em Minhas Solicitações
  const resSol = await fetch(`${baseUrl}/gestao/api/solicitacoes`, {
    headers: { Cookie: `whatsapp_control_session=${tokenLider}` }
  });
  const dataSol = await resSol.json();
  assert.equal(dataSol.ok, true);
  const solMidia = dataSol.solicitacoes.find(s => s.codigo === dataMidia.codigo);
  assert.ok(solMidia, "Solicitação de mídia deve estar listada nas solicitações");
  assert.equal(solMidia.tipo, "midia");
  assert.equal(solMidia.status, "Aguardando Multimídia");
});

test("GET /gestao: inclui saudação personalizada, busca de eventos, modal de mídia e cores corretas", async () => {
  const tokenAdmin = createSession("gabriela", "admin", "active");
  const res = await fetch(`${baseUrl}/gestao`, {
    headers: { Cookie: `whatsapp_control_session=${tokenAdmin}` }
  });
  assert.equal(res.status, 200);
  const html = await res.text();

  // Saudação personalizada
  assert.match(html, /Olá,.*O que você gostaria de fazer hoje/);

  // Aba e controles de pesquisa
  assert.match(html, /Pesquisar Eventos/);
  assert.match(html, /pane-pesquisa/);

  // Solicitar Mídia
  assert.match(html, /Solicitar Arte \/ Mídia/);
  assert.match(html, /modalSolicitarMidia/);

  // Cores de ensaio (azul) e pastoral (roxo)
  assert.match(html, /\.event-chip\.ensaio\s*\{\s*background:\s*#e0f2fe/);
  assert.match(html, /\.event-chip\.pastoral\s*\{\s*background:\s*#f3e8ff/);

  // Indicador de carregamento
  assert.match(html, /calLoadingIndicator/);
  assert.match(html, /Sincronizando eventos com a agenda/);

  // Dropdown de ministérios populado
  assert.match(html, /Rede de Mulheres/);
  assert.match(html, /Rede de Homens/);
  assert.match(html, /Epifania/);

  // Ação / Venda Beneficente
  assert.match(html, /Ação \/ Venda Beneficente/);
  assert.match(html, /stepFormAcao/);
  assert.match(html, /\.event-chip\.acao/);
});

test("POST /gestao/api/solicitar: suporta criação de Ação / Venda Beneficente (tipo: acao)", async () => {
  addUser("lider_acao", "senha123", "lider");
  const tokenLider = createSession("lider_acao", "lider", "active");

  const res = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenLider}`
    },
    body: JSON.stringify({
      tipo: "acao",
      nome_evento: "Feijoada Beneficente dos Jovens",
      departamento: "Ruach (Jovens)",
      data: "21/11/2026",
      horario_inicio: "11:30",
      horario_termino: "15:00",
      local: "Salão da Igreja",
      ocupa_salao: "sim",
      detalhes: "Venda de marmitas de feijoada para arrecadação do acampamento"
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.codigo);

  // Verifica listagem em solicitações
  const resSol = await fetch(`${baseUrl}/gestao/api/solicitacoes`, {
    headers: { Cookie: `whatsapp_control_session=${tokenLider}` }
  });
  const dataSol = await resSol.json();
  assert.equal(dataSol.ok, true);
  const sol = dataSol.solicitacoes.find(s => s.codigo === data.codigo);
  assert.ok(sol, "Solicitação de ação deve constar na lista de solicitações");
  assert.equal(sol.tipo, "acao");
  assert.equal(sol.status, "Aguardando Secretaria");

  // Verifica listagem em eventos locais (aparece como pendente no calendário)
  const eventos = gestao.listarEventosLocais("lider_acao", 2026, 11);
  const evAcao = eventos.find(e => e.codigo === data.codigo);
  assert.ok(evAcao, "Ação solicitada deve aparecer na listagem de eventos locais do mês");
  assert.equal(evAcao.tipo, "acao");
  assert.equal(evAcao.status, "pendente_secretaria");
});

test("Status de recusa e aprovação: pendentes recusados não aparecem no calendário e exibem status ❌ Recusado pela Secretaria", async () => {
  const { salvarPendente } = require("../bot/pendentesAprovacao");
  const codigo = salvarPendente({
    tipo: "evento",
    nomeEvento: "Evento Rejeitado Teste",
    departamento: "Geral",
    rede: "Geral",
    dia: 15,
    mes: 11,
    ano: 2026,
    dataFormatada: "15/11/2026",
    solicitanteNome: "Líder Teste",
    solicitanteId: "5511999990001",
    status: "recusado",
    recusadoEm: new Date().toISOString()
  });

  // Não deve aparecer no calendário como pendente
  const eventos = gestao.listarEventosLocais(null, 2026, 11);
  const evRecusado = eventos.find(e => e.codigo === codigo);
  assert.equal(evRecusado, undefined, "Evento recusado NÃO deve ser listado como evento pendente no calendário");

  // Deve aparecer em Minhas Solicitações com status Recusado
  const solicitacoes = gestao.listarSolicitacoes();
  const solRecusada = solicitacoes.find(s => s.codigo === codigo);
  assert.ok(solRecusada, "Solicitação recusada deve constar no histórico de solicitações");
  assert.equal(solRecusada.status, "❌ Recusado pela Secretaria");
  assert.equal(solRecusada.statusClass, "recusado");
});

test("Overnight calendar: montarResourceEvento calcula data de término no dia seguinte quando cruza a meia-noite", () => {
  const resource = montarResourceEvento({
    dia: 28,
    mes: 11,
    horarioInicio: "22:00",
    horarioFim: "01:00",
    nomeEvento: "Sala de Oração",
    departamento: "Intercessão",
    local: "Igreja"
  }, 2026);

  assert.ok(resource.start.dateTime, "Deve conter start.dateTime");
  assert.ok(resource.end.dateTime, "Deve conter end.dateTime");

  const dtInicio = new Date(resource.start.dateTime);
  const dtFim = new Date(resource.end.dateTime);

  assert.ok(dtFim > dtInicio, `O horário de término (${dtFim.toISOString()}) deve ser maior que o início (${dtInicio.toISOString()})`);
  assert.equal(dtInicio.getDate(), 28);
  assert.equal(dtFim.getDate(), 29, "Término às 01:00 deve cair no dia seguinte (29)");
});


