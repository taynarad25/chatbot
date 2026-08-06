const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-secretaria-test-"));
process.env.GRUPO_IDS_FILE_PATH = path.join(tmpDir, "grupo_ids.json");

const {
  encontrarGrupoSecretaria,
  notificarSecretaria,
  encontrarGrupoPastoral,
  notificarPastoral,
  obterJidCached,
} = require("../bot/secretaria");

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function fakeChat({ isGroup, name }) {
  return { isGroup, name, sendMessage: async () => {} };
}

test("encontrarGrupoSecretaria: encontra o grupo pelo nome exato entre vários chats", () => {
  const chats = [
    fakeChat({ isGroup: false, name: "Fulano" }),
    fakeChat({ isGroup: true, name: "Outro Grupo" }),
    fakeChat({ isGroup: true, name: "Mensagens Secretaria" }),
  ];
  const grupo = encontrarGrupoSecretaria(chats);
  assert.equal(grupo.name, "Mensagens Secretaria");
});

test("encontrarGrupoSecretaria: encontra o grupo mesmo com diferenças de maiúsculas/minúsculas e espaços em branco", () => {
  const chats = [
    fakeChat({ isGroup: true, name: "  mensagens secretaria  " }),
  ];
  const grupo = encontrarGrupoSecretaria(chats);
  assert.equal(grupo.name, "  mensagens secretaria  ");
});

test("encontrarGrupoSecretaria: ignora um chat individual com o mesmo nome (precisa ser grupo)", () => {
  const chats = [fakeChat({ isGroup: false, name: "Mensagens Secretaria" })];
  assert.equal(encontrarGrupoSecretaria(chats), null);
});

test("encontrarGrupoSecretaria: retorna null quando o grupo não existe", () => {
  const chats = [fakeChat({ isGroup: true, name: "Outro Grupo" })];
  assert.equal(encontrarGrupoSecretaria(chats), null);
});

test("notificarSecretaria: envia a mensagem quando o grupo existe e retorna true", async () => {
  let mensagemEnviada = null;
  const grupo = { isGroup: true, name: "Mensagens Secretaria", sendMessage: async (msg) => { mensagemEnviada = msg; } };
  const client = { getChats: async () => [grupo] };

  const resultado = await notificarSecretaria(client, "Olá secretaria");
  assert.equal(resultado, true);
  assert.equal(mensagemEnviada, "Olá secretaria");
});

test("notificarSecretaria: retorna false sem lançar erro quando o grupo não é encontrado", async () => {
  const client = { getChats: async () => [fakeChat({ isGroup: true, name: "Outro Grupo" })] };
  const resultado = await notificarSecretaria(client, "Olá secretaria");
  assert.equal(resultado, false);
});

test("notificarSecretaria: retorna false sem lançar erro quando client.getChats() falha", async () => {
  const client = { getChats: async () => { throw new Error("falha de rede"); } };
  const resultado = await notificarSecretaria(client, "Olá secretaria");
  assert.equal(resultado, false);
});

test("notificarSecretaria: retorna false sem lançar erro quando sendMessage falha", async () => {
  const grupo = { isGroup: true, name: "Mensagens Secretaria", sendMessage: async () => { throw new Error("falha ao enviar"); } };
  const client = { getChats: async () => [grupo] };
  const resultado = await notificarSecretaria(client, "Olá secretaria");
  assert.equal(resultado, false);
});

// Atendimento Pastoral Tests
test("encontrarGrupoPastoral: encontra o grupo pelo nome", () => {
  const chats = [
    fakeChat({ isGroup: false, name: "Fulano" }),
    fakeChat({ isGroup: true, name: "Outro Grupo" }),
    fakeChat({ isGroup: true, name: "Atendimento Pastoral" }),
  ];
  const grupo = encontrarGrupoPastoral(chats);
  assert.equal(grupo.name, "Atendimento Pastoral");
});

test("encontrarGrupoPastoral: encontra o grupo mesmo com diferenças de maiúsculas/minúsculas e espaços", () => {
  const chats = [
    fakeChat({ isGroup: true, name: "  atendimento pastoral  " }),
  ];
  const grupo = encontrarGrupoPastoral(chats);
  assert.equal(grupo.name, "  atendimento pastoral  ");
});

test("notificarPastoral: envia a mensagem quando o grupo existe e retorna true", async () => {
  let mensagemEnviada = null;
  const grupo = { isGroup: true, name: "Atendimento Pastoral", sendMessage: async (msg) => { mensagemEnviada = msg; } };
  const client = { getChats: async () => [grupo] };

  const resultado = await notificarPastoral(client, "Olá pastores");
  assert.equal(resultado, true);
  assert.equal(mensagemEnviada, "Olá pastores");
});

test("notificarPastoral: retorna false sem lançar erro quando o grupo não é encontrado", async () => {
  const client = { getChats: async () => [fakeChat({ isGroup: true, name: "Outro Grupo" })] };
  const resultado = await notificarPastoral(client, "Olá pastores");
  assert.equal(resultado, false);
});

test("encontrarGrupoSecretaria: encontra o grupo contendo emojis ou sufixos/prefixos", () => {
  const chats = [
    fakeChat({ isGroup: true, name: "💬 Mensagens Secretaria - Admin" }),
  ];
  const grupo = encontrarGrupoSecretaria(chats);
  assert.equal(grupo.name, "💬 Mensagens Secretaria - Admin");
});

test("encontrarGrupoPastoral: encontra o grupo contendo emojis ou sufixos/prefixos", () => {
  const chats = [
    fakeChat({ isGroup: true, name: "⛪ Atendimento Pastoral ⛪" }),
  ];
  const grupo = encontrarGrupoPastoral(chats);
  assert.equal(grupo.name, "⛪ Atendimento Pastoral ⛪");
});

// Reproduz o bug real de produção: alguém editou grupo_ids.json manualmente e salvou
// as chaves com o nome "de exibição" (capitalizado), igual ao que aparece no WhatsApp,
// em vez do formato interno em minúsculo que atualizarCacheGrupo grava. Isso fazia
// obterJidCached nunca encontrar o JID salvo, e o bot caía sempre no fallback lento
// via getChats() — que, quando falhava, silenciava o envio da notificação ao grupo.
test("obterJidCached: encontra o JID mesmo quando o arquivo foi editado manualmente com chaves capitalizadas", () => {
  fs.writeFileSync(
    process.env.GRUPO_IDS_FILE_PATH,
    JSON.stringify({
      "Atendimento Pastoral": "I2AxSM7v9CI211RGWJBX2Y",
      "Mensagens Secretaria": "KsHKE5q5BiI81KvJ1ARdUp",
    }),
    "utf8"
  );

  assert.equal(obterJidCached("Mensagens Secretaria"), "KsHKE5q5BiI81KvJ1ARdUp");
  assert.equal(obterJidCached("Atendimento Pastoral"), "I2AxSM7v9CI211RGWJBX2Y");
});

// client.getChats() provou ser não-confiável em produção (falha sempre, independente da
// versão da lib), e o arquivo de cache já se perdeu duas vezes por motivos operacionais
// (edição manual, bind mount do Docker virando diretório vazio). As variáveis de ambiente
// GRUPO_JID_SECRETARIA/GRUPO_JID_PASTORAL são uma fonte alternativa que sobrevive a isso.
test("obterJidCached: variável de ambiente tem prioridade sobre o arquivo de cache", () => {
  fs.writeFileSync(
    process.env.GRUPO_IDS_FILE_PATH,
    JSON.stringify({ "mensagens secretaria": "jid-do-arquivo" }),
    "utf8"
  );
  process.env.GRUPO_JID_SECRETARIA = "jid-da-env";

  try {
    assert.equal(obterJidCached("Mensagens Secretaria"), "jid-da-env");
  } finally {
    delete process.env.GRUPO_JID_SECRETARIA;
  }
});

test("obterJidCached: sem variável de ambiente, cai de volta pro arquivo de cache", () => {
  fs.writeFileSync(
    process.env.GRUPO_IDS_FILE_PATH,
    JSON.stringify({ "atendimento pastoral": "jid-do-arquivo" }),
    "utf8"
  );
  delete process.env.GRUPO_JID_PASTORAL;

  assert.equal(obterJidCached("Atendimento Pastoral"), "jid-do-arquivo");
});
