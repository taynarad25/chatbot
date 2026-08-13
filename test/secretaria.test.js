const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-secretaria-test-"));
process.env.DB_PATH = path.join(tmpDir, "dados.db");

const {
  encontrarGrupoSecretaria,
  notificarSecretaria,
  encontrarGrupoPastoral,
  notificarPastoral,
  obterJidCached,
  atualizarCacheGrupo,
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
  let jidDestino = null;
  const grupo = { id: { _serialized: "120363024838492039@g.us" }, isGroup: true, name: "Mensagens Secretaria" };
  const client = {
    getChats: async () => [grupo],
    sendMessage: async (jid, msg) => { jidDestino = jid; mensagemEnviada = msg; }
  };

  const resultado = await notificarSecretaria(client, "Olá secretaria");
  assert.equal(resultado, true);
  assert.equal(jidDestino, "120363024838492039@g.us");
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
  const grupo = { id: { _serialized: "120363024838492039@g.us" }, isGroup: true, name: "Mensagens Secretaria" };
  const client = {
    getChats: async () => [grupo],
    sendMessage: async () => { throw new Error("falha ao enviar"); }
  };
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
  let jidDestino = null;
  const grupo = { id: { _serialized: "120363024838492039@g.us" }, isGroup: true, name: "Atendimento Pastoral" };
  const client = {
    getChats: async () => [grupo],
    sendMessage: async (jid, msg) => { jidDestino = jid; mensagemEnviada = msg; }
  };

  const resultado = await notificarPastoral(client, "Olá pastores");
  assert.equal(resultado, true);
  assert.equal(jidDestino, "120363024838492039@g.us");
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

// atualizarCacheGrupo sempre normaliza a chave em minúsculo ao gravar no banco — a
// consulta em obterJidCached precisa encontrar o JID independente de como o nome
// foi digitado (igual ao "nome de exibição" do WhatsApp, capitalizado).
test("obterJidCached: encontra o JID independente de maiúsculas/minúsculas no nome consultado", () => {
  atualizarCacheGrupo("Atendimento Pastoral", "I2AxSM7v9CI211RGWJBX2Y");
  atualizarCacheGrupo("Mensagens Secretaria", "KsHKE5q5BiI81KvJ1ARdUp");

  assert.equal(obterJidCached("Mensagens Secretaria"), "KsHKE5q5BiI81KvJ1ARdUp");
  assert.equal(obterJidCached("Atendimento Pastoral"), "I2AxSM7v9CI211RGWJBX2Y");
});

// client.getChats() provou ser não-confiável em produção (falha sempre, independente da
// versão da lib), e o cache já se perdeu por motivos operacionais no passado (arquivo
// editado manualmente, bind mount do Docker virando diretório vazio). As variáveis de
// ambiente GRUPO_JID_SECRETARIA/GRUPO_JID_PASTORAL são uma fonte alternativa que
// sobrevive a isso, mesmo com o cache agora em banco.
test("obterJidCached: variável de ambiente tem prioridade sobre o banco quando nenhum dos dois é um JID real", () => {
  atualizarCacheGrupo("Mensagens Secretaria", "codigo-convite-do-banco");
  process.env.GRUPO_JID_SECRETARIA = "jid-da-env";

  try {
    assert.equal(obterJidCached("Mensagens Secretaria"), "jid-da-env");
  } finally {
    delete process.env.GRUPO_JID_SECRETARIA;
  }
});

test("obterJidCached: sem variável de ambiente, cai de volta pro banco", () => {
  atualizarCacheGrupo("Atendimento Pastoral", "jid-do-banco");
  delete process.env.GRUPO_JID_PASTORAL;

  assert.equal(obterJidCached("Atendimento Pastoral"), "jid-do-banco");
});

test("obterJidCached: JID real do banco tem prioridade sobre código de convite na variável de ambiente", () => {
  atualizarCacheGrupo("Mensagens Secretaria", "120363024838492039@g.us");
  process.env.GRUPO_JID_SECRETARIA = "KsHKE5q5BiI81KvJ1ARdUp";

  try {
    assert.equal(obterJidCached("Mensagens Secretaria"), "120363024838492039@g.us");
  } finally {
    delete process.env.GRUPO_JID_SECRETARIA;
  }
});

test("notificarSecretaria: resolve o código de convite via getInviteInfo, atualiza o cache e envia mensagem", async () => {
  // Sobrescreve qualquer JID real deixado no banco por testes anteriores, pra garantir
  // que a resolução por convite (via variável de ambiente) realmente seja exercitada.
  atualizarCacheGrupo("Mensagens Secretaria", "valor-antigo-sem-jid");
  process.env.GRUPO_JID_SECRETARIA = "KsHKE5q5BiI81KvJ1ARdUp";

  let getInviteInfoCalled = null;
  let jidDestino = null;
  let messageSent = null;

  const client = {
    getInviteInfo: async (code) => {
      getInviteInfoCalled = code;
      return { id: { _serialized: "120363024838492039@g.us" } };
    },
    sendMessage: async (jid, msg) => {
      jidDestino = jid;
      messageSent = msg;
    }
  };

  try {
    const resultado = await notificarSecretaria(client, "Mensagem secreta");
    assert.equal(resultado, true);
    assert.equal(getInviteInfoCalled, "KsHKE5q5BiI81KvJ1ARdUp");
    assert.equal(jidDestino, "120363024838492039@g.us");
    assert.equal(messageSent, "Mensagem secreta");

    delete process.env.GRUPO_JID_SECRETARIA;
    assert.equal(obterJidCached("Mensagens Secretaria"), "120363024838492039@g.us");
  } finally {
    delete process.env.GRUPO_JID_SECRETARIA;
  }
});

