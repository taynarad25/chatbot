const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  encontrarGrupoAlertas,
  extrairAlerta,
  notificarAlerta,
  podeEnviar,
  resetDeduplicacao,
} = require("../bot/alertas");

function fakeChat({ isGroup, name }) {
  return { isGroup, name, sendMessage: async () => {} };
}

beforeEach(() => {
  resetDeduplicacao();
});

// ---------------------------------------------------------------------------
// encontrarGrupoAlertas
// ---------------------------------------------------------------------------

test("encontrarGrupoAlertas: encontra o grupo 'Alertas' pelo nome exato entre vários chats", () => {
  const chats = [
    fakeChat({ isGroup: false, name: "Fulano" }),
    fakeChat({ isGroup: true, name: "Mensagens Secretaria" }),
    fakeChat({ isGroup: true, name: "Alertas" }),
  ];
  const grupo = encontrarGrupoAlertas(chats);
  assert.equal(grupo.name, "Alertas");
});

test("encontrarGrupoAlertas: ignora um chat individual com o mesmo nome (precisa ser grupo)", () => {
  const chats = [fakeChat({ isGroup: false, name: "Alertas" })];
  assert.equal(encontrarGrupoAlertas(chats), null);
});

test("encontrarGrupoAlertas: retorna null quando o grupo não existe", () => {
  const chats = [fakeChat({ isGroup: true, name: "Outro Grupo" })];
  assert.equal(encontrarGrupoAlertas(chats), null);
});

// ---------------------------------------------------------------------------
// extrairAlerta
// ---------------------------------------------------------------------------

test("extrairAlerta: reconhece a tag '[ALERTA:categoria]' e separa a categoria do texto", () => {
  const resultado = extrairAlerta("[ALERTA:google-calendar] Erro na agenda X: falha de rede");
  assert.deepEqual(resultado, { categoria: "google-calendar", textoLimpo: "Erro na agenda X: falha de rede" });
});

test("extrairAlerta: categoria é normalizada para minúsculas", () => {
  const resultado = extrairAlerta("[ALERTA:FATAL] Exceção não capturada");
  assert.equal(resultado.categoria, "fatal");
});

test("extrairAlerta: retorna null pra mensagens de erro comuns (sem a tag)", () => {
  assert.equal(extrairAlerta("[Web] Erro ao processar login: senha incorreta"), null);
  assert.equal(extrairAlerta("Falha ao validar formulário"), null);
});

test("extrairAlerta: retorna null quando o primeiro argumento não é uma string (ex: um objeto Error puro)", () => {
  assert.equal(extrairAlerta(new Error("falha")), null);
  assert.equal(extrairAlerta(undefined), null);
});

// ---------------------------------------------------------------------------
// podeEnviar (deduplicação por categoria)
// ---------------------------------------------------------------------------

test("podeEnviar: permite o primeiro envio de uma categoria", () => {
  assert.equal(podeEnviar("google-calendar", 1000), true);
});

test("podeEnviar: bloqueia um reenvio da mesma categoria dentro da janela de repetição", () => {
  assert.equal(podeEnviar("google-calendar", 1000), true);
  assert.equal(podeEnviar("google-calendar", 1000 + 60_000), false); // 1 min depois, dentro da janela de 10 min
});

test("podeEnviar: libera de novo após a janela de repetição passar", () => {
  assert.equal(podeEnviar("google-calendar", 1000), true);
  assert.equal(podeEnviar("google-calendar", 1000 + 11 * 60_000, 10 * 60_000), true);
});

test("podeEnviar: categorias diferentes não se bloqueiam entre si", () => {
  assert.equal(podeEnviar("google-calendar", 1000), true);
  assert.equal(podeEnviar("persistencia", 1000), true);
});

// ---------------------------------------------------------------------------
// notificarAlerta
// ---------------------------------------------------------------------------

test("notificarAlerta: envia a mensagem quando o grupo 'Alertas' existe e retorna true", async () => {
  let mensagemEnviada = null;
  const grupo = { isGroup: true, name: "Alertas", sendMessage: async (msg) => { mensagemEnviada = msg; } };
  const client = { getChats: async () => [grupo] };

  const resultado = await notificarAlerta(client, "fatal", "🚨 Alerta de teste");
  assert.equal(resultado, true);
  assert.equal(mensagemEnviada, "🚨 Alerta de teste");
});

test("notificarAlerta: retorna false sem lançar erro quando o grupo não é encontrado", async () => {
  const client = { getChats: async () => [fakeChat({ isGroup: true, name: "Outro Grupo" })] };
  const resultado = await notificarAlerta(client, "fatal", "🚨 Alerta de teste");
  assert.equal(resultado, false);
});

test("notificarAlerta: retorna false sem lançar erro quando client.getChats() falha", async () => {
  const client = { getChats: async () => { throw new Error("falha de rede"); } };
  const resultado = await notificarAlerta(client, "fatal", "🚨 Alerta de teste");
  assert.equal(resultado, false);
});

test("notificarAlerta: retorna false sem lançar erro quando sendMessage falha", async () => {
  const grupo = { isGroup: true, name: "Alertas", sendMessage: async () => { throw new Error("falha ao enviar"); } };
  const client = { getChats: async () => [grupo] };
  const resultado = await notificarAlerta(client, "fatal", "🚨 Alerta de teste");
  assert.equal(resultado, false);
});

test("notificarAlerta: retorna false sem lançar erro quando não há client (ex: WhatsApp ainda não conectou)", async () => {
  const resultado = await notificarAlerta(null, "fatal", "🚨 Alerta de teste");
  assert.equal(resultado, false);
});

test("notificarAlerta: não reenvia a mesma categoria dentro da janela de repetição, mesmo com sucesso", async () => {
  let vezes = 0;
  const grupo = { isGroup: true, name: "Alertas", sendMessage: async () => { vezes++; } };
  const client = { getChats: async () => [grupo] };

  const r1 = await notificarAlerta(client, "google-calendar", "primeiro", { agora: 1000 });
  const r2 = await notificarAlerta(client, "google-calendar", "segundo (deveria ser bloqueado)", { agora: 1000 + 60_000 });

  assert.equal(r1, true);
  assert.equal(r2, false);
  assert.equal(vezes, 1);
});

test("notificarAlerta: categorias diferentes não bloqueiam uma a outra", async () => {
  const grupo = { isGroup: true, name: "Alertas", sendMessage: async () => {} };
  const client = { getChats: async () => [grupo] };

  const r1 = await notificarAlerta(client, "google-calendar", "erro de agenda", { agora: 1000 });
  const r2 = await notificarAlerta(client, "persistencia", "erro de arquivo", { agora: 1000 });

  assert.equal(r1, true);
  assert.equal(r2, true);
});
