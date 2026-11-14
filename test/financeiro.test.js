const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

process.env.NODE_ENV = "test";
const financeiro = require("../web/financeiro");
const gestao = require("../web/gestao");

function createMockReqRes(method, urlStr, bodyObj = null, cookie = "") {
  const url = new URL(urlStr, "http://localhost:3000");
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : "";
  let dataSent = false;

  const req = {
    method,
    url: url.pathname + url.search,
    headers: {
      host: "localhost:3000",
      "content-type": "application/json",
      cookie,
    },
    on(event, cb) {
      if (event === "data" && !dataSent) {
        dataSent = true;
        if (bodyStr) cb(Buffer.from(bodyStr));
      }
      if (event === "end") {
        cb();
      }
    },
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    headersSent: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    writeHead(status, hdrs = {}) {
      this.statusCode = status;
      this.headersSent = true;
      for (const [k, v] of Object.entries(hdrs)) {
        this.headers[k.toLowerCase()] = v;
      }
    },
    end(chunk) {
      if (chunk) this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      this.headersSent = true;
    },
  };

  return { req, res, pathname: url.pathname, searchParams: url.searchParams };
}

test("Controle Financeiro — Usuários iniciais, Primeiro Acesso, Contas, Lançamentos, Conferência e Fechamento", async () => {
  const db = require("../db");
  db.prepare("UPDATE fin_usuarios SET salt=NULL, hash=NULL WHERE telefone='5511951617993'").run();

  // 1. Verifica que rota privada redireciona sem sessão
  {
    const { req, res, pathname, searchParams } = createMockReqRes("GET", "/controlefinanceiro");
    await financeiro.handle(req, res, { pathname, searchParams, ip: "127.0.0.1" });
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, "/controlefinanceiro/login");
  }

  // 2. Número não autorizado é bloqueado no login / primeiro acesso
  {
    const { req, res, pathname, searchParams } = createMockReqRes("POST", "/controlefinanceiro/api/primeiro-acesso", {
      usuario: "11 90000-0000",
      nova_senha: "Senha123",
      confirmar_senha: "Senha123",
    });
    await financeiro.handle(req, res, { pathname, searchParams, ip: "127.0.0.1" });
    assert.equal(res.statusCode, 403);
  }

  // 3. Primeiro acesso de Larissa Luana dos Santos (11 95161-7993)
  let sessionCookie = "";
  {
    const { req, res, pathname, searchParams } = createMockReqRes("POST", "/controlefinanceiro/api/primeiro-acesso", {
      usuario: "11 95161-7993",
      nova_senha: "SenhaForte123",
      confirmar_senha: "SenhaForte123",
    });
    await financeiro.handle(req, res, { pathname, searchParams, ip: "127.0.0.1" });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.ok, true);
    assert.equal(data.usuario.nome, "Larissa Luana dos Santos");
    const setCookie = res.headers["set-cookie"] || "";
    sessionCookie = setCookie.split(";")[0];
    assert.ok(sessionCookie.startsWith("fin_session="));
  }

  // 4. Criar conta bancária com saldo inicial R$ 1.000,00
  let contaBancoId;
  {
    const { req, res, pathname, searchParams } = createMockReqRes(
      "POST",
      "/controlefinanceiro/api/contas",
      {
        nome: "Conta Corrente PrincipalTeste " + Date.now(),
        tipo: "conta_corrente",
        instituicao: "Banco Teste",
        saldo_inicial: 1000,
      },
      sessionCookie
    );
    await financeiro.handle(req, res, { pathname, searchParams, ip: "127.0.0.1" });
    assert.equal(res.statusCode, 201);
    contaBancoId = JSON.parse(res.body).id;
  }

  // 5. Registrar entrada efetivada de R$ 500,00 e conta a pagar pendente de R$ 300,00
  let despesaPendenteId;
  {
    const { req, res, pathname, searchParams } = createMockReqRes(
      "POST",
      "/controlefinanceiro/api/lancamentos",
      {
        tipo: "entrada",
        conta_id: contaBancoId,
        descricao: "Oferta Especial Teste " + Date.now(),
        valor: 500,
        status: "efetivado",
        forma_pagamento: "PIX",
      },
      sessionCookie
    );
    await financeiro.handle(req, res, { pathname, searchParams, ip: "127.0.0.1" });
    assert.equal(res.statusCode, 201);
  }

  {
    const { req, res, pathname, searchParams } = createMockReqRes(
      "POST",
      "/controlefinanceiro/api/lancamentos",
      {
        tipo: "saida",
        conta_id: contaBancoId,
        descricao: "Conta Energia Pendente " + Date.now(),
        valor: 300,
        status: "pendente",
        forma_pagamento: "Boleto",
      },
      sessionCookie
    );
    await financeiro.handle(req, res, { pathname, searchParams, ip: "127.0.0.1" });
    assert.equal(res.statusCode, 201);
    despesaPendenteId = JSON.parse(res.body).id;
  }

  // 6. Verificar cálculo automático de saldo (Real = 1000 + 500 = 1500 reais = 150000 centavos; Projetado = 1200 reais = 120000 centavos)
  {
    const { req, res, pathname, searchParams } = createMockReqRes(
      "GET",
      "/controlefinanceiro/api/contas",
      null,
      sessionCookie
    );
    await financeiro.handle(req, res, { pathname, searchParams, ip: "127.0.0.1" });
    assert.equal(res.statusCode, 200);
    const contas = JSON.parse(res.body).contas;
    const c = contas.find((x) => x.id === contaBancoId);
    assert.equal(c.saldo_atual, 150000);
    assert.equal(c.saldo_disponivel, 150000);
    assert.equal(c.saldo_projetado, 120000);
  }

  // 7. Pagamento parcial da conta a pagar (paga R$ 100 de R$ 300 -> gera restante pendente de R$ 200 = 20000 centavos)
  {
    const { req, res, pathname, searchParams } = createMockReqRes(
      "POST",
      `/controlefinanceiro/api/lancamentos/${despesaPendenteId}/quitar`,
      {
        valor_pago: 100,
        conta_id: contaBancoId,
      },
      sessionCookie
    );
    await financeiro.handle(req, res, { pathname, searchParams, ip: "127.0.0.1" });
    assert.equal(res.statusCode, 200);
    const qData = JSON.parse(res.body);
    assert.equal(qData.parcial, true);
    assert.equal(qData.valor_restante, 20000);
  }

  // 8. Conferência de Caixa Físico calcula cédulas e diferença sem alterar saldo contábil (R$ 650,00 = 65000 centavos)
  {
    const { req, res, pathname, searchParams } = createMockReqRes(
      "POST",
      "/controlefinanceiro/api/conferencias",
      {
        conta_id: 1,
        detalhes_cedulas: { "100": 3, "50": 5, "20": 4, "10": 2 },
        observacoes: "Teste conferência 650 reais",
      },
      sessionCookie
    );
    await financeiro.handle(req, res, { pathname, searchParams, ip: "127.0.0.1" });
    assert.equal(res.statusCode, 201);
    const conf = JSON.parse(res.body);
    assert.equal(conf.valor_contado, 65000);
  }

  // 9. Prestação de Contas via API Web
  {
    const { req, res, pathname, searchParams } = createMockReqRes("GET", "/controlefinanceiro/api/prestacao-contas", null, sessionCookie);
    await financeiro.handle(req, res, { pathname, searchParams, ip: "127.0.0.1" });
    assert.equal(res.statusCode, 200);
    const pData = JSON.parse(res.body);
    assert.equal(pData.ok, true);
    assert.ok(pData.textoWhatsApp.includes("PRESTAÇÃO DE CONTAS DA IGREJA"));
    assert.ok(pData.textoWhatsApp.includes("SALDOS ATUAIS"));
    assert.ok(pData.textoWhatsApp.includes("MOVIMENTO DO MÊS"));

    // Verifica que auditoria foi gravada
    const log = db.prepare("SELECT * FROM fin_auditoria WHERE acao = 'solicitacao_prestacao_contas' ORDER BY id DESC LIMIT 1").get();
    assert.ok(log);
    assert.ok(log.usuario.includes("Larissa Luana dos Santos"));
    const det = JSON.parse(log.detalhes);
    assert.equal(det.canal, "web");
  }

  // 10. Prestação de Contas direta (como chamada pelo bot do WhatsApp)
  {
    const resWpp = financeiro.obterResumoPrestacaoContas({
      solicitanteNome: "Pastor Anderson",
      solicitanteTel: "5511999998888",
      canal: "whatsapp",
    });
    assert.equal(resWpp.ok, true);
    assert.ok(resWpp.textoWhatsApp.includes("Pastor Anderson"));
    assert.ok(resWpp.textoWhatsApp.includes("Saldo Geral"));

    const logWpp = db.prepare("SELECT * FROM fin_auditoria WHERE acao = 'solicitacao_prestacao_contas' ORDER BY id DESC LIMIT 1").get();
    assert.ok(logWpp);
    assert.ok(logWpp.usuario.includes("Pastor Anderson"));
    const detWpp = JSON.parse(logWpp.detalhes);
    assert.equal(detWpp.canal, "whatsapp");
  }

  // Limpa dados criados pelo teste para deixar o banco limpo para o primeiro acesso real
  db.prepare("DELETE FROM fin_lancamentos WHERE conta_id = ?").run(contaBancoId);
  db.prepare("DELETE FROM fin_contas WHERE id = ?").run(contaBancoId);
  db.prepare("DELETE FROM fin_conferencias WHERE observacoes = 'Teste conferência 650 reais'").run();
  db.prepare("DELETE FROM fin_auditoria WHERE acao = 'solicitacao_prestacao_contas'").run();
  db.prepare("UPDATE fin_usuarios SET salt=NULL, hash=NULL WHERE telefone='5511951617993'").run();
});

test("Gestão — Todos os inputs type='time' começam em branco (value='')", () => {
  const html = gestao.renderGestaoHtml({
    user: { username: "gabriela", nome: "Gabriela Diniz", role: "admin", telefone: "5511942685501" },
  });
  const timeInputsWithDefault = html.match(/type="time"[^>]*value="[0-9]{2}:[0-9]{2}"/g);
  assert.equal(timeInputsWithDefault, null, "Nenhum input type='time' deve vir com horário pré-preenchido");
});

test("Gestão — Área de gestão não exibe controle financeiro", () => {
  const html = gestao.renderGestaoHtml({
    user: { username: "gabriela", nome: "Gabriela Diniz", role: "admin", telefone: "5511942685501" },
  });
  assert.equal(html.includes("/controlefinanceiro"), false, "A área de gestão não deve conter link para /controlefinanceiro");
  assert.equal(html.includes("Controle Financeiro"), false, "A área de gestão não deve exibir texto de Controle Financeiro");
});

test("Controle Financeiro — Edição completa de lançamentos e parcelamento com início personalizado", async () => {
  const db = require("../db");

  // Garante usuário admin e conta para teste
  const user = { id: 1, nome: "Admin Teste", papel: "admin", telefone: "5511999990000" };
  const cat = db.prepare("SELECT id FROM fin_categorias LIMIT 1").get();
  const cta = db.prepare("SELECT id FROM fin_contas LIMIT 1").get();

  // 1. Parcelamento começando na parcela 7 de 11 (modo_valor = 'parcela')
  const lancParcelas = financeiro.criarLancamento({
    tipo: "saida",
    status: "pendente",
    descricao: "Compra Equipamento Som Teste Unitario",
    valor: 150.0,
    categoria_id: cat.id,
    conta_id: cta.id,
    data: "2026-11-14",
    vencimento: "2026-11-14",
    parcelas: 11,
    parcela_inicial: 7,
    modo_valor: "parcela",
    confirmar_saldo_negativo: true,
    confirmar_duplicidade: true,
  }, user);

  assert.equal(lancParcelas.ok, true);
  assert.equal(lancParcelas.ids.length, 5, "Devem ser geradas 5 parcelas (da 7 até a 11)");
  const rowsParcelas = lancParcelas.ids.map((id) => db.prepare("SELECT * FROM fin_lancamentos WHERE id = ?").get(id));
  assert.ok(rowsParcelas[0].descricao.includes("(7/11)"));
  assert.ok(rowsParcelas[4].descricao.includes("(11/11)"));
  assert.equal(rowsParcelas[0].valor, 15000, "Valor armazenado em centavos (150 reais = 15000)");
  assert.equal(rowsParcelas[4].valor, 15000);

  // 2. Parcelamento com modo_valor = 'total'
  const lancTotal = financeiro.criarLancamento({
    tipo: "saida",
    status: "pendente",
    descricao: "Reforma Pintura Teste Unitario",
    valor: 1000.0,
    categoria_id: cat.id,
    conta_id: cta.id,
    data: "2026-11-14",
    vencimento: "2026-11-14",
    total_parcelas: 5,
    parcela_inicial: 3,
    modo_valor: "total",
    confirmar_saldo_negativo: true,
    confirmar_duplicidade: true,
  }, user);

  assert.equal(lancTotal.ok, true);
  assert.equal(lancTotal.ids.length, 3, "Devem ser geradas 3 parcelas (da 3 até a 5)");
  const rowsTotal = lancTotal.ids.map((id) => db.prepare("SELECT * FROM fin_lancamentos WHERE id = ?").get(id));
  assert.ok(rowsTotal[0].descricao.includes("(3/5)"));
  assert.equal(rowsTotal[0].valor, 20000, "1000 dividido por 5 parcelas no total = 200 por parcela (20000 centavos)");

  // 3. Edição completa de lançamento sem exigência de motivo
  const itemParaEditar = rowsTotal[0];
  const editado = financeiro.editarLancamento(itemParaEditar.id, {
    descricao: "Reforma Pintura Fachada Principal",
    valor: 250.0,
    status: "efetivado",
    data: "2026-11-15",
    vencimento: "2026-11-20",
    competencia: "2026-11",
    categoria_id: cat.id,
    conta_id: cta.id,
    forma: "Cartão de Crédito",
    ministerio: "Manutenção",
    fornecedor: "Tintas & Cia",
    observacoes: "Adiantado conforme combinado",
  }, user);

  assert.equal(editado.ok, true);
  assert.equal(editado.lancamento.descricao, "Reforma Pintura Fachada Principal");
  assert.equal(editado.lancamento.valor, 25000, "250 reais em centavos = 25000");
  assert.equal(editado.lancamento.status, "efetivado");
  assert.equal(editado.lancamento.forma, "Cartão de Crédito");
  assert.equal(editado.lancamento.ministerio, "Manutenção");
  assert.equal(editado.lancamento.fornecedor, "Tintas & Cia");
  assert.equal(editado.lancamento.observacoes, "Adiantado conforme combinado");

  // Limpeza dos lançamentos de teste
  const idsParaLimpar = [...lancParcelas.ids, ...lancTotal.ids];
  for (const id of idsParaLimpar) {
    db.prepare("DELETE FROM fin_lancamentos WHERE id = ?").run(id);
    db.prepare("DELETE FROM fin_auditoria WHERE acao = 'editar_lancamento' AND detalhes LIKE ?").run(`%"id":${id}%`);
  }
});

test("Controle Financeiro — Cartões de crédito, Receitas parceladas e Projeção do próximo mês", async () => {
  const db = require("../db");
  const user = { id: 1, nome: "Larissa Luana", telefone: "5511951617993", papel: "admin_financeiro" };
  const cta = db.prepare("SELECT * FROM fin_contas LIMIT 1").get();
  const catEnt = db.prepare("SELECT * FROM fin_categorias WHERE tipo='entrada' LIMIT 1").get();
  const catSai = db.prepare("SELECT * FROM fin_categorias WHERE tipo='saida' LIMIT 1").get();

  // 1. Cadastrar cartão de crédito
  const resCard = financeiro.salvarCartao({
    nome: "Nubank Corporativo Teste",
    instituicao: "Nubank",
    bandeira: "Mastercard",
    limite: 5000.0, // R$ 5.000,00
    dia_fechamento: 5,
    dia_vencimento: 15,
    conta_id: cta.id,
    cor: "#8b5cf6",
  }, user);

  assert.equal(resCard.ok, true);
  const cardId = resCard.id;

  // 2. Listar cartões e verificar limites
  let cartoes = financeiro.listarCartoes();
  let cardCriado = cartoes.find((c) => c.id === cardId);
  assert.ok(cardCriado);
  assert.equal(cardCriado.limite_total, 500000); // 5000 reais em centavos
  assert.equal(cardCriado.limite_usado, 0);
  assert.equal(cardCriado.limite_disponivel, 500000);

  // 3. Lançar despesa no cartão de crédito
  const lancDespesaCard = financeiro.criarLancamento({
    tipo: "saida",
    status: "pendente",
    descricao: "Equipamento Microfone Teste Cartão",
    valor: 1200.0, // R$ 1.200,00
    categoria_id: catSai.id,
    conta_id: cta.id,
    cartao_id: cardId,
    forma: "Cartão de Crédito",
    vencimento: "2026-11-15",
    confirmar_saldo_negativo: true,
    confirmar_duplicidade: true,
  }, user);

  assert.equal(lancDespesaCard.ok, true);

  // 4. Verificar limite usado e disponível atualizados
  cartoes = financeiro.listarCartoes();
  cardCriado = cartoes.find((c) => c.id === cardId);
  assert.equal(cardCriado.limite_usado, 120000); // R$ 1.200,00
  assert.equal(cardCriado.limite_disponivel, 380000); // R$ 3.800,00 restantes

  // 5. Receita parcelada (ex: doação ou venda em 4x começando na 2ª parcela)
  const lancReceitaParc = financeiro.criarLancamento({
    tipo: "entrada",
    status: "pendente",
    descricao: "Doação Campanha Especial",
    valor: 800.0,
    categoria_id: catEnt.id,
    conta_id: cta.id,
    data: "2026-11-14",
    vencimento: "2026-11-14",
    total_parcelas: 4,
    parcela_inicial: 2,
    modo_valor: "total",
    confirmar_duplicidade: true,
  }, user);

  assert.equal(lancReceitaParc.ok, true);
  assert.equal(lancReceitaParc.ids.length, 3, "Parcelas 2, 3 e 4 devem ser geradas");
  const rowsRec = lancReceitaParc.ids.map((id) => db.prepare("SELECT * FROM fin_lancamentos WHERE id = ?").get(id));
  assert.ok(rowsRec[0].descricao.includes("(2/4)"));
  assert.ok(rowsRec[2].descricao.includes("(4/4)"));
  assert.equal(rowsRec[0].tipo, "entrada");
  assert.equal(rowsRec[0].valor, 20000, "800 total dividido por 4 = 200 por parcela");

  // 6. Projeção por contas e dashboard para o próximo mês
  const saldos = financeiro.saldosContas();
  assert.ok(saldos.length > 0);
  assert.ok("saldo_previsto_proximo_mes" in saldos[0]);

  const dash = financeiro.dashboard({ periodo: "mes" }, user);
  assert.ok(dash.cartoes.length > 0);
  assert.ok(dash.proximo_mes);
  assert.ok("saldo_previsto_proximo_mes" in dash.indicadores);

  // 7. Navegação por mês no dashboard (ex: YYYY-MM) e previsão considerando apenas parcelas do mês
  const dashDez = financeiro.dashboard({ periodo: "2026-12" }, user);
  assert.equal(dashDez.periodo.inicio, "2026-12-01");
  assert.equal(dashDez.periodo.fim, "2026-12-31");
  assert.ok("saldo_previsto_mes" in dashDez.indicadores);
  assert.equal(
    dashDez.indicadores.previsao_saldo_futuro,
    dashDez.indicadores.saldo_total + dashDez.indicadores.a_receber_mes - dashDez.indicadores.a_pagar_mes,
    "Previsão do mês deve considerar estritamente as parcelas e pendências daquele mês"
  );

  // Limpeza
  financeiro.removerCartao(cardId, user, "127.0.0.1");
  db.prepare("DELETE FROM fin_lancamentos WHERE id = ?").run(lancDespesaCard.id);
  for (const id of lancReceitaParc.ids) {
    db.prepare("DELETE FROM fin_lancamentos WHERE id = ?").run(id);
  }
});



