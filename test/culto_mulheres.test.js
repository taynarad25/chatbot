const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

// Configura banco de dados em memória ou arquivo temporário para os testes
const tempDbPath = path.join(__dirname, `test_mulheres_${Date.now()}.db`);
process.env.DB_PATH = tempDbPath;

const db = require("../db");
const {
  enviarInscricaoPlanilhaMulheres,
  salvarInscricaoMulheres,
  buscarInscricaoMulheresPorEmail,
  buscarInscricaoMulheresPorTelefone,
  listarInscricoesMulheres,
  obterEstatisticasMulheres,
  excluirInscricaoMulheres,
  marcarConfirmacaoMulheresEnviada,
  montarMensagemConfirmacaoMulheres,
  renderMulheresPdfHtml,
} = require("../web/culto_mulheres");

const {
  processarNotificacoesRedeMulheres,
  enviarMensagemConfirmacaoInscricaoMulheres,
} = require("../web/culto_mulheres_notificacoes");

const { addLider } = require("../web/lideres");
const { processarFluxoInscricaoMulheres } = require("../bot/messageHandler");

test.after(() => {
  try {
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  } catch {}
});

test("Culto de Mulheres: salvar e consultar inscrições no banco local SQLite", () => {
  const inscricao = salvarInscricaoMulheres({
    nome: "Ana Paula Souza",
    email: "anapaula@teste.com",
    telefone: "11988887777",
  });

  assert.ok(inscricao);
  assert.equal(inscricao.nome, "Ana Paula Souza");
  assert.equal(inscricao.email, "anapaula@teste.com");
  assert.equal(inscricao.telefone, "11988887777");
  assert.equal(inscricao.whatsappConfirmacaoEnviado, false);

  const porEmail = buscarInscricaoMulheresPorEmail("anapaula@teste.com");
  assert.equal(porEmail.nome, "Ana Paula Souza");

  const porTelefone = buscarInscricaoMulheresPorTelefone("11988887777");
  assert.equal(porTelefone.email, "anapaula@teste.com");

  let stats = obterEstatisticasMulheres();
  assert.equal(stats.total, 1);
  assert.equal(stats.whatsappConfirmados, 0);
  assert.equal(stats.pendentesConfirmacao, 1);

  marcarConfirmacaoMulheresEnviada("anapaula@teste.com");
  stats = obterEstatisticasMulheres();
  assert.equal(stats.whatsappConfirmados, 1);
  assert.equal(stats.pendentesConfirmacao, 0);

  const lista = listarInscricoesMulheres();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].whatsappConfirmacaoEnviado, true);

  const removido = excluirInscricaoMulheres(inscricao.id);
  assert.equal(removido, true);
  assert.equal(listarInscricoesMulheres().length, 0);
});

test("Culto de Mulheres: comunicação com o Web App do Google Apps Script com sucesso e duplicidade", async () => {
  // Mock de fetch para nova inscrição
  const mockFetchSuccess = async (url, opts) => {
    assert.equal(opts.method, "POST");
    const body = JSON.parse(opts.body);
    assert.equal(body.email, "maria@exemplo.com");
    return {
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({
        status: "success",
        ja_inscrito: false,
        message: "Inscrição realizada com sucesso!",
      }),
    };
  };

  const res1 = await enviarInscricaoPlanilhaMulheres({
    nome: "Maria Silva",
    email: "maria@exemplo.com",
    telefone: "11999991111",
    fetchFn: mockFetchSuccess,
  });

  assert.equal(res1.ok, true);
  assert.equal(res1.ja_inscrito, false);
  assert.equal(res1.status, "success");

  // Mock de fetch para e-mail já cadastrado
  const mockFetchDuplicate = async (url, opts) => {
    return {
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({
        status: "success",
        ja_inscrito: true,
        message: "Este e-mail já está cadastrado!",
      }),
    };
  };

  const res2 = await enviarInscricaoPlanilhaMulheres({
    nome: "Maria Silva",
    email: "maria@exemplo.com",
    telefone: "11999991111",
    fetchFn: mockFetchDuplicate,
  });

  assert.equal(res2.ok, true);
  assert.equal(res2.ja_inscrito, true);
  assert.match(res2.message, /já está cadastrado/i);
});

test("Culto de Mulheres: comunicação com Web App tratando redirecionamento 302 do Google", async () => {
  const mockFetchRedirect = async (url, opts) => {
    if (opts?.method === "POST") {
      const headers = new Map();
      headers.set("location", "https://script.googleusercontent.com/macros/echo?user=123");
      return {
        status: 302,
        headers: {
          get: (name) => headers.get(name.toLowerCase()),
        },
        text: async () => "",
      };
    }
    // Requisição redirecionada via GET
    return {
      status: 200,
      text: async () => JSON.stringify({
        status: "success",
        ja_inscrito: false,
        message: "Inscrição realizada com sucesso!",
      }),
    };
  };

  const res = await enviarInscricaoPlanilhaMulheres({
    nome: "Débora Juíza",
    email: "debora@exemplo.com",
    telefone: "11977776666",
    fetchFn: mockFetchRedirect,
  });

  assert.equal(res.ok, true);
  assert.equal(res.ja_inscrito, false);
  assert.equal(res.message, "Inscrição realizada com sucesso!");
});

test("Culto de Mulheres: renderMulheresPdfHtml gera o modelo de impressão no padrão da secretaria", () => {
  salvarInscricaoMulheres({
    nome: "Ester Rainha",
    email: "ester@exemplo.com",
    telefone: "11988880000",
  });

  const html = renderMulheresPdfHtml();

  assert.ok(html.includes("Comunidade Cristã Curados • Secretaria"));
  assert.ok(html.includes("Culto de Mulheres: O Vaso e o Oleiro"));
  assert.ok(html.includes("24/10/2026 às 16:00"));
  assert.ok(html.includes("Ester Rainha"));
  assert.ok(html.includes("ester@exemplo.com"));
  assert.ok(html.includes("window.print()"));
});

test("Culto de Mulheres: mensagem curta de confirmação no WhatsApp", () => {
  const msg = montarMensagemConfirmacaoMulheres({ nome: "Rebeca Oliveira" });
  assert.ok(msg.includes("Rebeca"));
  assert.ok(msg.includes("O Vaso e o Oleiro"));
  assert.ok(msg.includes("24/10/2026"));
  assert.ok(msg.includes("16:00"));
  assert.ok(msg.includes("Esperamos por você no dia"));
});

test("Culto de Mulheres: fluxo conversacional no WhatsApp (Nome -> Email -> Telefone -> Confirmação)", async () => {
  const etapas = {};
  const numero = "5511999990000";

  etapas[numero] = {
    fluxo: "inscricao_mulheres",
    etapa: "coletar_nome",
    dados: {},
  };

  // Passo 1: Usuária digita o nome
  let resposta = "";
  const msgNome = {
    body: "Sara Albuquerque",
    reply: (txt) => { resposta = txt; },
  };

  await processarFluxoInscricaoMulheres({
    msg: msgNome,
    numero,
    info: etapas[numero],
    etapas,
  });

  assert.equal(etapas[numero].etapa, "coletar_email");
  assert.equal(etapas[numero].dados.nome, "Sara Albuquerque");
  assert.ok(resposta.includes("Sara Albuquerque"));
  assert.ok(resposta.includes("e-mail"));

  // Passo 2: Usuária digita o e-mail
  const msgEmail = {
    body: "sara@exemplo.com",
    reply: (txt) => { resposta = txt; },
  };

  await processarFluxoInscricaoMulheres({
    msg: msgEmail,
    numero,
    info: etapas[numero],
    etapas,
  });

  assert.equal(etapas[numero].etapa, "coletar_telefone");
  assert.equal(etapas[numero].dados.email, "sara@exemplo.com");
  assert.ok(resposta.includes("telefone para contato"));

  // Passo 3: Usuária digita o telefone (com mock de sucesso do Web App)
  const mockFetchWebapp = async () => ({
    status: 200,
    text: async () => JSON.stringify({
      status: "success",
      ja_inscrito: false,
      message: "Inscrição realizada com sucesso!",
    }),
  });

  const msgTel = {
    body: "(11) 98765-4321",
    reply: (txt) => { resposta = txt; },
  };

  await processarFluxoInscricaoMulheres({
    msg: msgTel,
    numero,
    info: etapas[numero],
    etapas,
    fetchFn: mockFetchWebapp,
  });

  // Fluxo deve ser concluído e limpo de etapas
  assert.equal(etapas[numero], undefined);
  assert.ok(resposta.includes("Sara"));
  assert.ok(resposta.includes("Inscrição Confirmada"));
  assert.ok(resposta.includes("Esperamos por você no dia"));

  // Confere se salvou no banco
  const noBanco = buscarInscricaoMulheresPorEmail("sara@exemplo.com");
  assert.ok(noBanco);
  assert.equal(noBanco.nome, "Sara Albuquerque");
});

test("Culto de Mulheres: fluxo conversacional avisa quando e-mail já está cadastrado", async () => {
  const etapas = {};
  const numero = "5511999990001";

  etapas[numero] = {
    fluxo: "inscricao_mulheres",
    etapa: "coletar_telefone",
    dados: {
      nome: "Marta Rocha",
      email: "marta@exemplo.com",
    },
  };

  const mockFetchDuplicate = async () => ({
    status: 200,
    text: async () => JSON.stringify({
      status: "success",
      ja_inscrito: true,
      message: "Este e-mail já está cadastrado!",
    }),
  });

  let resposta = "";
  const msgTel = {
    body: "11988887777",
    reply: (txt) => { resposta = txt; },
  };

  await processarFluxoInscricaoMulheres({
    msg: msgTel,
    numero,
    info: etapas[numero],
    etapas,
    fetchFn: mockFetchDuplicate,
  });

  assert.equal(etapas[numero], undefined);
  assert.ok(resposta.includes("já está inscrito"));
  assert.ok(resposta.includes("marta@exemplo.com"));
});

test("Culto de Mulheres: notificação de marcos de 10, 5 e 3 dias para líderes da Rede de Mulheres", async () => {
  // Cadastra líder da Rede de Mulheres para o teste
  addLider({
    nome: "Pastora Lígia",
    telefone: "5511999991234",
    cargos: ["pastor", "lider"],
    departamento: "Rede de Mulheres",
  });

  const mensagensEnviadas = [];
  const mockClient = {
    sendMessage: async (jid, texto) => {
      mensagensEnviadas.push({ jid, texto });
      return true;
    },
  };

  // 1. Teste faltando exatamente 10 dias (14/10/2026 para evento 24/10/2026)
  const data10Dias = new Date(2026, 9, 14, 8, 0, 0); // 14 de Outubro de 2026
  const res10 = await processarNotificacoesRedeMulheres({
    client: mockClient,
    dataBase: data10Dias,
  });

  assert.equal(res10.executado, true);
  assert.equal(res10.diasRestantes, 10);
  assert.ok(mensagensEnviadas.length > 0);
  assert.ok(mensagensEnviadas[0].texto.includes("10 dias"));
  assert.ok(mensagensEnviadas[0].texto.includes("O Vaso e o Oleiro"));

  // Idempotência: rodar novamente no mesmo dia não deve reenviar
  const res10Repetido = await processarNotificacoesRedeMulheres({
    client: mockClient,
    dataBase: data10Dias,
  });
  assert.equal(res10Repetido.executado, false);

  // 2. Teste faltando 5 dias (19/10/2026)
  mensagensEnviadas.length = 0;
  const data5Dias = new Date(2026, 9, 19, 8, 0, 0);
  const res5 = await processarNotificacoesRedeMulheres({
    client: mockClient,
    dataBase: data5Dias,
  });
  assert.equal(res5.executado, true);
  assert.equal(res5.diasRestantes, 5);
  assert.ok(mensagensEnviadas[0].texto.includes("5 dias"));

  // 3. Teste faltando 3 dias (21/10/2026)
  mensagensEnviadas.length = 0;
  const data3Dias = new Date(2026, 9, 21, 8, 0, 0);
  const res3 = await processarNotificacoesRedeMulheres({
    client: mockClient,
    dataBase: data3Dias,
  });
  assert.equal(res3.executado, true);
  assert.equal(res3.diasRestantes, 3);
  assert.ok(mensagensEnviadas[0].texto.includes("3 dias"));

  // 4. Teste em dia que não é marco (ex: 7 dias antes - 17/10/2026)
  const data7Dias = new Date(2026, 9, 17, 8, 0, 0);
  const res7 = await processarNotificacoesRedeMulheres({
    client: mockClient,
    dataBase: data7Dias,
  });
  assert.equal(res7.executado, false);
});
