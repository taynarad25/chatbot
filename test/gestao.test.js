const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-gestao-test-"));
process.env.DB_PATH = path.join(tmpDir, "dados.db");
process.env.COMBINED_LOG_PATH = path.join(tmpDir, "combined.log");
fs.writeFileSync(process.env.COMBINED_LOG_PATH, "linha de log\n");

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db");
const { startWebServer, addUser } = require("../web");
const { addLider } = require("../web/lideres");
const gestao = require("../web/gestao");
const { createSession } = require("../web/auth");
const { montarResourceEvento } = require("../bot/agendamentoAutomatico");

const getStatus = () => ({ connected: false, initializing: false });
const noop = async () => ({ ok: true });

let server;
let baseUrl;

before(async () => {
  gestao.setDependencies({ buscarEventos: async () => [] });
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

test("GET /gestao sem autenticação: redireciona 302 para /gestao/login", async () => {
  const res = await fetch(`${baseUrl}/gestao`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/gestao/login");
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

test("POST /gestao/api/solicitar: lider só altera eventos do seu ministério, pastores e diretores alteram todos", async () => {
  const tokenLiderHomens = createSession("lider.teste", "lider", "active"); // Rede de Homens
  const tokenPastor = createSession("pastor.teste", "pastor", "active");
  const tokenDiretor = createSession("diretor.teste", "diretor", "active");

  // Cadastra evento da Rede de Mulheres no banco
  db.prepare(`
    INSERT INTO descricoes_eventos (evento, departamento, local, tipoDuracao, horariosJson, descricao, criadoEm, atualizadoEm)
    VALUES (?, ?, ?, 'unico', ?, ?, datetime('now'), datetime('now'))
  `).run(
    "Chá das Mulheres Vitoriosas",
    "Rede de Mulheres",
    "Igreja",
    JSON.stringify([{ data: "20/11/2026", inicio: "19:00", fim: "21:30" }]),
    "Evento exclusivo de mulheres"
  );

  // 1. Líder de Homens tenta alterar evento da Rede de Mulheres -> Bloqueado 400
  const resLiderBloqueado = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenLiderHomens}`
    },
    body: JSON.stringify({
      tipo: "alterar",
      nome_evento: "Chá das Mulheres Vitoriosas",
      campo_alterar: "Data",
      novo_valor: "25/11/2026",
      motivo: "Tentativa de troca por outro líder"
    })
  });
  assert.equal(resLiderBloqueado.status, 400);
  const dataBloqueado = await resLiderBloqueado.json();
  assert.equal(dataBloqueado.ok, false);
  assert.ok(dataBloqueado.message.includes("Permissão negada"));

  // 2. Pastor pode alterar evento de qualquer ministério -> 200
  const resPastor = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenPastor}`
    },
    body: JSON.stringify({
      tipo: "alterar",
      nome_evento: "Chá das Mulheres Vitoriosas",
      campo_alterar: "Horário",
      novo_valor: "19:30 às 22:00",
      motivo: "Ajuste pastoral"
    })
  });
  assert.equal(resPastor.status, 200);
  const dataPastor = await resPastor.json();
  assert.equal(dataPastor.ok, true);

  // 3. Diretor pode alterar evento de qualquer ministério -> 200
  const resDiretor = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenDiretor}`
    },
    body: JSON.stringify({
      tipo: "alterar",
      nome_evento: "Chá das Mulheres Vitoriosas",
      campo_alterar: "Local",
      novo_valor: "Salão Nobre",
      motivo: "Ajuste diretoria"
    })
  });
  assert.equal(resDiretor.status, 200);
  const dataDiretor = await resDiretor.json();
  assert.equal(dataDiretor.ok, true);
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

test("Segurança de Identidade: usuário 'gabriela' sempre resolve para Gabriela Diniz (nunca Gabriela Henrique)", () => {
  addLider({
    nome: "Gabriela Henrique",
    telefone: "5511999991111",
    cargos: ["lider"],
    departamentos: ["Departamento de Artes"]
  });

  const perfil = gestao.obterPerfilGestao({ username: "gabriela", role: "admin" });
  assert.equal(perfil.nome, "Gabriela Diniz", "Deve resolver estritamente como Gabriela Diniz");
  assert.equal(perfil.telefone, "5511942685501", "Deve usar o telefone oficial de Gabriela Diniz");
  assert.equal(perfil.perfilTitulo, "Administrador");
  assert.equal(perfil.isAdmin, true);
});

test("Primeiro Acesso: líder cadastrado cria senha pelo WhatsApp e nome", async () => {
  addLider({
    nome: "Carlos Eduardo",
    telefone: "5511988887777",
    cargos: ["lider"],
    departamentos: ["Rede Ruach"]
  });

  const regRes = await fetch(`${baseUrl}/secretaria/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telefone: "(11) 98888-7777",
      nome: "Carlos Eduardo",
      password: "senhaSegura123"
    })
  });

  assert.equal(regRes.status, 200);
  const regData = await regRes.json();
  assert.equal(regData.ok, true);

  // Tentativa de primeiro acesso repetido deve falhar
  const regRepetido = await fetch(`${baseUrl}/secretaria/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telefone: "5511988887777",
      password: "outraSenha123"
    })
  });
  assert.equal(regRepetido.status, 400);

  // Login com o número de WhatsApp
  const loginRes = await fetch(`${baseUrl}/secretaria/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "11988887777",
      password: "senhaSegura123"
    })
  });
  assert.equal(loginRes.status, 200);
  const cookie = loginRes.headers.get("set-cookie");
  assert.ok(cookie);

  // Acesso ao portal /gestao
  const gestaoRes = await fetch(`${baseUrl}/gestao`, {
    headers: { Cookie: cookie }
  });
  assert.equal(gestaoRes.status, 200);
  const html = await gestaoRes.text();
  assert.match(html, /Carlos Eduardo/);
});

test("Primeiro Acesso: líder escolhe nome de usuário personalizado e consegue logar com ele", async () => {
  addLider({
    nome: "Juliana Santos",
    telefone: "5511977771122",
    cargos: ["lider"],
    departamentos: ["Rede de Mulheres"]
  });

  const regRes = await fetch(`${baseUrl}/secretaria/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telefone: "(11) 97777-1122",
      nome: "Juliana Santos",
      customUsername: "julianasantos",
      password: "senhaJu123"
    })
  });

  assert.equal(regRes.status, 200);
  const regData = await regRes.json();
  assert.equal(regData.ok, true);
  assert.match(regData.message, /julianasantos/);

  // Login com o nome de usuário escolhido
  const loginRes = await fetch(`${baseUrl}/secretaria/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "julianasantos",
      password: "senhaJu123"
    })
  });
  assert.equal(loginRes.status, 200);

  // Impede que outro líder pegue o mesmo nome de usuário
  addLider({
    nome: "Outro Líder",
    telefone: "5511988880000",
    cargos: ["lider"],
    departamentos: ["Música"]
  });

  const regConflito = await fetch(`${baseUrl}/secretaria/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telefone: "5511988880000",
      nome: "Outro Líder",
      customUsername: "julianasantos",
      password: "outraSenha123"
    })
  });
  assert.equal(regConflito.status, 400);
  const conflitoData = await regConflito.json();
  assert.match(conflitoData.message, /já está em uso/);
});

test("Controle de Acesso: membro cadastrado não tem acesso ao painel de liderança", async () => {
  addLider({
    nome: "Marcos Membro",
    telefone: "5511966665555",
    cargos: ["membro"],
    departamentos: []
  });

  // Primeiro acesso de membro deve ser rejeitado (403)
  const regRes = await fetch(`${baseUrl}/secretaria/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telefone: "5511966665555",
      nome: "Marcos Membro",
      password: "senhaMembro123"
    })
  });
  assert.equal(regRes.status, 403);
  const regData = await regRes.json();
  assert.equal(regData.ok, false);
  assert.match(regData.message, /Membro/);
});

test("POST /gestao/api/solicitar: suporta solicitação com múltiplas artes e perguntas específicas por tipo", async () => {
  const tokenLider = createSession("lider.multi", "lider", "active");

  const resMulti = await fetch(`${baseUrl}/gestao/api/solicitar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `whatsapp_control_session=${tokenLider}`
    },
    body: JSON.stringify({
      tipo: "midia",
      departamento: "Rede de Mulheres",
      nome_evento: "Chá das Mulheres",
      prazo_entrega: "20/11/2026",
      itens: [
        {
          tipo_arte: "digital",
          formatos: ["Feed Instagram (1:1)", "Story / Reels (9:16)"],
          detalhes: "Tema: Mulheres Vitoriosas. Preletora: Pra. Ana",
          estilo: "Tons florais e lilás"
        },
        {
          tipo_arte: "impressa",
          tipo_impresso: "Banner com Ilhós",
          medidas: "1,00m x 2,00m",
          detalhes: "Entrada Franca - Traga sua Bíblia",
          acabamento: "Para suporte no hall"
        },
        {
          tipo_arte: "video",
          formato_video: "Vertical (9:16 - Reels)",
          duracao: "Até 30 segundos",
          detalhes: "Chamada convidando todas as mulheres com frases de ânimo",
          trilha: "Música animada instrumental",
          material_bruto: "A equipe precisa filmar"
        }
      ]
    })
  });

  assert.equal(resMulti.status, 200);
  const dataMulti = await resMulti.json();
  assert.equal(dataMulti.ok, true);
  assert.ok(dataMulti.codigo);

  // Confere que o pedido foi salvo com os itens
  const resSol = await fetch(`${baseUrl}/gestao/api/solicitacoes`, {
    headers: { Cookie: `whatsapp_control_session=${tokenLider}` }
  });
  const dataSol = await resSol.json();
  assert.equal(dataSol.ok, true);
  const sol = dataSol.solicitacoes.find(s => s.codigo === dataMulti.codigo);
  assert.ok(sol, "Solicitação com múltiplos itens deve constar na listagem");
  assert.equal(sol.status, "Aguardando Multimídia");
  assert.equal(sol.payload.itens.length, 3);
});

test("Cache de Calendário: listarEventosCalendario armazena dados em memória por período", async () => {
  const tokenAdmin = createSession("gabriela", "admin", "active");

  const t0 = Date.now();
  const res1 = await fetch(`${baseUrl}/gestao/api/eventos?mes=11&ano=2026`, {
    headers: { Cookie: `whatsapp_control_session=${tokenAdmin}` }
  });
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.ok, true);

  // Segunda chamada para o mesmo mês deve ser praticamente instantânea (cache backend)
  const t1 = Date.now();
  const res2 = await fetch(`${baseUrl}/gestao/api/eventos?mes=11&ano=2026`, {
    headers: { Cookie: `whatsapp_control_session=${tokenAdmin}` }
  });
  const t2 = Date.now();
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.ok, true);
  assert.ok(t2 - t1 < 50, `Segunda chamada deve responder via cache instantaneamente (${t2 - t1}ms)`);
});

test("Segurança de Rotas: líder comum acessando /secretaria é redirecionado para /gestao", async () => {
  const tokenLider = createSession("lider.teste2", "lider", "active");

  const res = await fetch(`${baseUrl}/secretaria`, {
    headers: { Cookie: `whatsapp_control_session=${tokenLider}` },
    redirect: "manual"
  });

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/gestao");
});

test("Logout: /gestao/logout e /logout redirecionam para /gestao/login; /secretaria/logout para /secretaria/login", async () => {
  const token = createSession("lider.logout", "lider", "active");

  const res1 = await fetch(`${baseUrl}/logout`, {
    headers: { Cookie: `whatsapp_control_session=${token}` },
    redirect: "manual"
  });
  assert.equal(res1.status, 302);
  assert.equal(res1.headers.get("location"), "/gestao/login");

  const resGestao = await fetch(`${baseUrl}/gestao/logout`, {
    headers: { Cookie: `whatsapp_control_session=${token}` },
    redirect: "manual"
  });
  assert.equal(resGestao.status, 302);
  assert.equal(resGestao.headers.get("location"), "/gestao/login");

  const res2 = await fetch(`${baseUrl}/secretaria/logout`, {
    headers: { Cookie: `whatsapp_control_session=${token}` },
    redirect: "manual"
  });
  assert.equal(res2.status, 302);
  assert.equal(res2.headers.get("location"), "/secretaria/login");
});

test("Recuperar Senha: líder cadastrado consegue redefinir senha informando WhatsApp e Nome", async () => {
  addLider({
    nome: "Débora Líder",
    telefone: "5511977778899",
    cargos: ["lider"],
    departamentos: ["Dança"]
  });

  const res = await fetch(`${baseUrl}/secretaria/recuperar-senha`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telefone: "(11) 97777-8899",
      nome: "Débora Líder",
      password: "novaSenhaSegura123",
      confirmPassword: "novaSenhaSegura123"
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.match(data.message, /Senha redefinida/);

  // Login com a nova senha
  const loginRes = await fetch(`${baseUrl}/secretaria/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "11977778899",
      password: "novaSenhaSegura123"
    })
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.equal(loginData.redirect, "/gestao");
});

test("Portal de Gestão: /gestao/login, /gestao/register e /gestao/recuperar-senha possuem identidade própria", async () => {
  const resLogin = await fetch(`${baseUrl}/gestao/login`);
  assert.equal(resLogin.status, 200);
  const htmlLogin = await resLogin.text();
  assert.match(htmlLogin, /Gestão de Eventos/);
  assert.match(htmlLogin, /Gestão de Eventos & Ministérios/);
  assert.match(htmlLogin, /\/gestao\/register/);
  assert.match(htmlLogin, /\/gestao\/recuperar-senha/);

  const resReg = await fetch(`${baseUrl}/gestao/register`);
  assert.equal(resReg.status, 200);
  const htmlReg = await resReg.text();
  assert.match(htmlReg, /Primeiro Acesso de Líder/);
  assert.match(htmlReg, /\/gestao\/login/);

  const resRec = await fetch(`${baseUrl}/gestao/recuperar-senha`);
  assert.equal(resRec.status, 200);
  const htmlRec = await resRec.text();
  assert.match(htmlRec, /Recuperação de Senha de Líder/);
  assert.match(htmlRec, /\/gestao\/login/);
});

test("Bloqueio de 1h30: verificarConflitoHorarioEvento bloqueia evento com menos de 1h30 de intervalo, mas não bloqueia reunião e atendimento", () => {
  const eventosExistentes = [
    {
      id: "ev_1",
      titulo: "Conferência de Homens",
      data: "14/11/2026",
      horarioInicio: "19:00",
      horarioFim: "21:00",
      tipo: "evento"
    }
  ];

  // 1. Novo evento terminando às 18:00 (1h antes do existente) -> Conflito pelo buffer de 1h30 (90 min: livre antes das 17:30 ou após 22:30)
  const conf1 = gestao.verificarConflitoHorarioEvento({
    data: "14/11/2026",
    horarioInicio: "16:00",
    horarioTermino: "18:00",
    tipo: "evento",
    eventosExistentes
  });
  assert.equal(conf1.conflito, true);
  assert.equal(conf1.bloquear, true);
  assert.match(conf1.mensagem, /intervalo mínimo de 1h30/);
  assert.equal(conf1.horaLivreAntes, "17:30");
  assert.equal(conf1.horaLivreDepois, "22:30");

  // 2. Novo evento iniciando às 22:00 (1h após o existente) -> Conflito pelo buffer de 1h30
  const conf2 = gestao.verificarConflitoHorarioEvento({
    data: "14/11/2026",
    horarioInicio: "22:00",
    horarioTermino: "23:30",
    tipo: "evento",
    eventosExistentes
  });
  assert.equal(conf2.conflito, true);
  assert.equal(conf2.bloquear, true);
  assert.match(conf2.mensagem, /intervalo mínimo de 1h30/);

  // 3. Novo evento iniciando às 22:30 (1h30 após o término das 21:00) -> Permitido!
  const confLivreDepois = gestao.verificarConflitoHorarioEvento({
    data: "14/11/2026",
    horarioInicio: "22:30",
    horarioTermino: "00:00",
    tipo: "evento",
    eventosExistentes
  });
  assert.equal(confLivreDepois.conflito, false);

  // 4. Novo evento terminando às 17:30 (1h30 antes do início das 19:00) -> Permitido!
  const confLivreAntes = gestao.verificarConflitoHorarioEvento({
    data: "14/11/2026",
    horarioInicio: "15:00",
    horarioTermino: "17:30",
    tipo: "evento",
    eventosExistentes
  });
  assert.equal(confLivreAntes.conflito, false);

  // 5. Reunião de liderança no mesmo horário das 19:30 às 20:30 (sobreposição) -> Não bloqueia, apenas emite aviso!
  const confReuniao = gestao.verificarConflitoHorarioEvento({
    data: "14/11/2026",
    horarioInicio: "19:30",
    horarioTermino: "20:30",
    tipo: "reuniao",
    eventosExistentes
  });
  assert.equal(confReuniao.bloquear, false);
  assert.equal(confReuniao.aviso, true);
  assert.match(confReuniao.mensagem, /Reuniões e atendimentos são permitidos/);

  // 6. Atendimento pastoral no horário das 19:00 às 20:00 -> Não bloqueia, apenas emite aviso!
  const confAtend = gestao.verificarConflitoHorarioEvento({
    data: "14/11/2026",
    horarioInicio: "19:00",
    horarioTermino: "20:00",
    tipo: "atendimento",
    eventosExistentes
  });
  assert.equal(confAtend.bloquear, false);
  assert.equal(confAtend.aviso, true);
});

test("Culto Temático: Pastores e Diretores podem solicitar sem necessidade de ficha longa", async () => {
  const sessionPastor = {
    username: "pastor.alberto",
    role: "pastor",
    nome: "Pastor Alberto",
    telefone: "5511999990099"
  };

  const res = await gestao.criarSolicitacaoEventoWeb({
    tipo: "culto_tematico",
    tema_culto: "Culto da Família Vitoriosa",
    data: "15/11/2026",
    horario_inicio: "18:00",
    horario_termino: "20:30",
    decoracao: "Sim, arranjos florais e iluminação especial",
    louvor_diferente: "Sim, ministração do coral e hinos temáticos",
    observacoes: "Entrada livre e Santa Comunhão"
  }, sessionPastor);

  assert.equal(res.ok, true);
  assert.match(res.message, /Culto Temático solicitado com sucesso/);
  assert.ok(res.codigo);

  // Líder comum sem cargo pastor/diretor deve receber erro de permissão
  const sessionLiderComum = {
    username: "lider.comum",
    role: "lider",
    nome: "Líder Comum",
    telefone: "5511988880011"
  };

  await assert.rejects(
    async () => {
      await gestao.criarSolicitacaoEventoWeb({
        tipo: "culto_tematico",
        tema_culto: "Culto dos Jovens",
        data: "22/11/2026",
        horario_inicio: "18:00",
        horario_termino: "20:30"
      }, sessionLiderComum);
    },
    /Apenas pastores e diretores têm permissão/
  );
});






