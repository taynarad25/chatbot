const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  montarPayloadEventoExterno,
  enviarWebhookGoogleDocsExternos,
  TERMO_RESPONSABILIDADE_EVENTO_EXTERNO,
  WEBHOOK_EVENTOS_EXTERNOS_URL,
} = require("../bot/eventosExternos");

test("montarPayloadEventoExterno: formata payload corretamente com salão", () => {
  const dados = {
    nomeSolicitante: "Pr. Marcos",
    solicitanteId: "5511999991111",
    nomeEvento: "Congresso de Jovens Regional",
    dataHorarioTexto: "25/10/2026 das 19:00 às 22:00",
    local: "Rua Exemplo, 123",
    valores: "Entrada gratuita, sem repasse",
    precisaSalaoAntes: true,
    salaoDetalhes: "24/10 das 14:00 às 18:00 para montagem",
    observacoes: "Necessário som e 2 microfones",
  };

  const payload = montarPayloadEventoExterno(dados);

  assert.equal(payload.nome_evento, "Congresso de Jovens Regional");
  assert.equal(payload.data_horario, "25/10/2026 das 19:00 às 22:00");
  assert.equal(payload.local, "Rua Exemplo, 123");
  assert.equal(payload.valores_repasse, "Entrada gratuita, sem repasse");
  assert.equal(payload.precisa_salao_antes, "24/10 das 14:00 às 18:00 para montagem");
  assert.equal(payload.termo_responsabilidade, "Aceito");
  assert.equal(payload.observacoes, "Necessário som e 2 microfones");
  assert.equal(payload.solicitante, "Pr. Marcos");
  assert.equal(payload.telefone_solicitante, "5511999991111");
});

test("montarPayloadEventoExterno: formata payload corretamente sem salão", () => {
  const dados = {
    nomeSolicitante: "Líder Ana",
    solicitanteId: "5511988882222",
    nomeEvento: "Evangelismo no Parque",
    dataHorarioTexto: "15/11 às 10h",
    local: "Parque Central",
    valores: "Não",
    precisaSalaoAntes: false,
    observacoes: "Nenhuma",
  };

  const payload = montarPayloadEventoExterno(dados);

  assert.equal(payload.precisa_salao_antes, "Não");
  assert.equal(payload.termo_responsabilidade, "Aceito");
});

test("enviarWebhookGoogleDocsExternos: envia POST e retorna url em caso de sucesso JSON", async () => {
  let chamadaFeita = null;

  const mockFetch = async (url, opts) => {
    chamadaFeita = { url, opts };
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ url: "https://docs.google.com/document/d/externo-123/edit" });
      },
    };
  };

  const resultado = await enviarWebhookGoogleDocsExternos(
    { nome_evento: "Evento Teste" },
    { fetchFn: mockFetch }
  );

  assert.equal(chamadaFeita.url, WEBHOOK_EVENTOS_EXTERNOS_URL);
  assert.equal(chamadaFeita.opts.method, "POST");
  assert.equal(resultado.url, "https://docs.google.com/document/d/externo-123/edit");
});

test("enviarWebhookGoogleDocsExternos: aceita docUrl como fallback", async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({ docUrl: "https://docs.google.com/document/d/doc-url-456/edit" });
    },
  });

  const resultado = await enviarWebhookGoogleDocsExternos(
    { nome_evento: "Evento Teste" },
    { fetchFn: mockFetch }
  );

  assert.equal(resultado.url, "https://docs.google.com/document/d/doc-url-456/edit");
});

test("enviarWebhookGoogleDocsExternos: lida com texto puro contendo http link", async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return "https://docs.google.com/document/d/plain-text-789/edit\n";
    },
  });

  const resultado = await enviarWebhookGoogleDocsExternos(
    { nome_evento: "Evento Teste" },
    { fetchFn: mockFetch }
  );

  assert.equal(resultado.url, "https://docs.google.com/document/d/plain-text-789/edit");
});

test("enviarWebhookGoogleDocsExternos: lança erro se status HTTP não for ok", async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 500,
    async text() {
      return "Internal Server Error";
    },
  });

  await assert.rejects(
    async () => {
      await enviarWebhookGoogleDocsExternos({ nome_evento: "Evento Teste" }, { fetchFn: mockFetch });
    },
    /Webhook de eventos externos respondeu com status HTTP 500/
  );
});

test("TERMO_RESPONSABILIDADE_EVENTO_EXTERNO: exige concordância e contém instruções", () => {
  assert.match(TERMO_RESPONSABILIDADE_EVENTO_EXTERNO, /Termo de Responsabilidade/i);
  assert.match(TERMO_RESPONSABILIDADE_EVENTO_EXTERNO, /SIM/);
});
