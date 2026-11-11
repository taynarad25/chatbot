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
    assert.ok(pData.textoWhatsApp.includes("SALDOS & DISPONIBILIDADE"));
    assert.ok(pData.textoWhatsApp.includes("SITUAÇÃO FINANCEIRA DOS PRÓXIMOS MESES"));

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
    assert.ok(resWpp.textoWhatsApp.includes("WhatsApp"));

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

