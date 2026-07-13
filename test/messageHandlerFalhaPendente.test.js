// Reproduz o bug real de produção (EISDIR): o bind mount do Docker cria um
// DIRETÓRIO no lugar de pendentes.json quando o arquivo não existe no host
// antes do primeiro `docker compose up`, e bot/pendentesAprovacao.js falha ao
// tentar ler/escrever nele. Precisa de um arquivo de teste isolado porque
// PENDENTES_FILE_PATH só é lido uma vez, no load do módulo — os outros testes
// já usam esse mesmo env var apontando pra um arquivo válido.
const os = require("os");
const path = require("path");
const fs = require("fs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-pendente-falha-test-"));
const dirNoLugarDoArquivo = path.join(tmpDir, "pendentes.json");
fs.mkdirSync(dirNoLugarDoArquivo);
process.env.PENDENTES_FILE_PATH = dirNoLugarDoArquivo;

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { createMessageHandler } = require("../bot/messageHandler");

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const AGENDAS = [
  "cal-evangelismo", "cal-epifania", "cal-intercessao", "cal-outros",
  "cal-seeds", "cal-ruach", "cal-casais", "cal-homens", "cal-mulheres", "cal-kids",
];
const LIDERES = ["5511999999999"];
const NUMERO_LIDER = "5511999999999@c.us";

function criarContexto() {
  const etapas = {};
  const client = {
    sendMessage: async () => {},
    getChats: async () => [{
      isGroup: true,
      name: "Mensagens Secretaria",
      sendMessage: async () => {},
    }],
  };
  const calendar = { events: { insert: async () => ({ data: {} }) } };
  const buscarEventos = async () => [];

  const handleMessage = createMessageHandler({
    client, calendar, agendasParaLer: AGENDAS, lideres: LIDERES, etapas, buscarEventos,
  });
  return { handleMessage };
}

function criarMsgPrivada(numero, body) {
  const respostas = [];
  return {
    from: numero,
    fromMe: false,
    body,
    reply: async (texto) => { respostas.push(texto); return texto; },
    getContact: async () => ({ id: { _serialized: numero }, pushname: undefined, name: undefined }),
    respostas,
  };
}

async function enviar(handleMessage, numero, body) {
  const msg = criarMsgPrivada(numero, body);
  await handleMessage(msg);
  return msg.respostas;
}

test("pendentes.json quebrado (diretório em vez de arquivo): líder recebe um aviso claro, não fica sem resposta nem vê 'erro na agenda'", async () => {
  const { handleMessage } = criarContexto();

  await enviar(handleMessage, NUMERO_LIDER, "6");
  await enviar(handleMessage, NUMERO_LIDER, "1"); // Agendar novo evento
  await enviar(handleMessage, NUMERO_LIDER, "Culto de Jovens");
  await enviar(handleMessage, NUMERO_LIDER, "Igreja");
  await enviar(handleMessage, NUMERO_LIDER, "7"); // Rede de Homens
  await enviar(handleMessage, NUMERO_LIDER, "12"); // Dezembro
  await enviar(handleMessage, NUMERO_LIDER, "2"); // busca por dia da semana/horário
  await enviar(handleMessage, NUMERO_LIDER, "3"); // Quarta-feira
  await enviar(handleMessage, NUMERO_LIDER, "19:30");
  const finalResp = await enviar(handleMessage, NUMERO_LIDER, "21:00");
  assert.match(finalResp[finalResp.length - 1], /Datas Disponíveis/);

  const respostaFinal = await enviar(handleMessage, NUMERO_LIDER, "1");

  assert.equal(respostaFinal.length, 1, "deveria responder exatamente uma vez, não ficar em silêncio");
  assert.match(respostaFinal[0], /Não consegui registrar sua solicitação agora/);
  assert.doesNotMatch(respostaFinal[0], /acessar a agenda/i, "a falha foi ao salvar a solicitação, não ao consultar o Google Calendar");
});
