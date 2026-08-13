const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { renderIndexHtml } = require("../web/views");

// Extrai o código-fonte real de uma função declarada dentro do <script> renderizado,
// para testar o código de produção (não uma reimplementação) contra XSS.
function extractFunction(source, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = source.match(re);
  assert.ok(match, `função ${name} não encontrada no <script> renderizado por renderIndexHtml()`);

  const start = match.index;
  let i = source.indexOf("{", start);
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return source.slice(start, i + 1);
}

function buildSandbox(usersPayload) {
  const html = renderIndexHtml();
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, "não encontrei o bloco <script> em renderIndexHtml()");
  const scriptSrc = scriptMatch[1];

  const fetchUsersSrc = extractFunction(scriptSrc, "fetchUsers");
  const deleteUserSrc = extractFunction(scriptSrc, "deleteUser");

  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/whatsappcontrol" });
  const { window } = dom;

  const calls = [];
  window.fetch = async (url, opts) => {
    calls.push({ url, method: opts?.method || "GET" });
    if (url === "/secretaria/api/admin/users") {
      return { ok: true, json: async () => ({ ok: true, users: usersPayload }) };
    }
    if (url.startsWith("/secretaria/api/admin/users/")) {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: false, status: 404, json: async () => ({ ok: false }) };
  };

  window.eval(fetchUsersSrc + "\n" + deleteUserSrc);
  return { dom, window, document: window.document, calls };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("fetchUsers: username com payload de script é renderizado como texto, não como HTML", async () => {
  const payload = '<img src=x onerror="window.__pwned = true">';
  const { window, document, calls } = buildSandbox([{ username: payload, role: "user" }]);

  await window.fetchUsers();
  await flushMicrotasks();

  assert.equal(window.__pwned, undefined, "o payload não deveria ser executado como script");
  assert.equal(document.getElementById("userList").querySelector("img"), null, "nenhuma tag <img> deveria ser criada a partir do username");

  const span = document.getElementById("userList").querySelector("span");
  assert.ok(span, "deveria existir um <span> com o nome do usuário");
  assert.equal(span.textContent, `${payload} (user)`, "o payload deve aparecer literalmente como texto");

  assert.deepEqual(calls, [{ url: "/secretaria/api/admin/users", method: "GET" }]);
});

test("fetchUsers: username com aspas não quebra o atributo do botão (sem onclick inline)", async () => {
  const payload = `o'brien" onmouseover="alert(1)`;
  const { window, document } = buildSandbox([{ username: payload, role: "user" }]);

  await window.fetchUsers();
  await flushMicrotasks();

  const button = document.getElementById("userList").querySelector("button.danger");
  assert.ok(button, "deveria existir o botão de excluir para usuário não-admin");
  assert.equal(button.getAttribute("onclick"), null, "o botão não deve usar onclick inline construído por concatenação de string");
  assert.equal(button.textContent, "Excluir");
});

test("fetchUsers: usuário admin não recebe botão de excluir", async () => {
  const { window, document } = buildSandbox([{ username: "chefe", role: "admin" }]);

  await window.fetchUsers();
  await flushMicrotasks();

  assert.equal(document.getElementById("userList").querySelector("button"), null);
});

test("deleteUser: clique no botão dispara exclusão via addEventListener (sem lançar erro)", async () => {
  const { window, document, calls } = buildSandbox([{ username: "fulano", role: "user" }]);
  window.confirm = () => true;

  await window.fetchUsers();
  await flushMicrotasks();

  const button = document.getElementById("userList").querySelector("button.danger");
  button.dispatchEvent(new window.Event("click", { bubbles: true }));
  await flushMicrotasks();

  assert.ok(
    calls.some((c) => c.url === "/secretaria/api/admin/users/fulano" && c.method === "DELETE"),
    "o clique deveria disparar uma chamada DELETE para o usuário correto"
  );
});

// A máscara de telefone vive dentro de uma template literal gigante (todo o HTML de
// renderIndexHtml). \D e \d não são sequências de escape reconhecidas por template
// literals do JS, então o parser descarta a barra invertida silenciosamente — o bug
// não aparece lendo o código-fonte, só rodando o <script> de fato como o navegador
// faria. Por isso estes testes extraem e executam o código real, em vez de
// reimplementar a lógica da máscara.
function buildTelefoneSandbox() {
  const html = renderIndexHtml();
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, "não encontrei o bloco <script> em renderIndexHtml()");
  const scriptSrc = scriptMatch[1];

  const fnsSrc = ["extrairDigitosTelefone", "formatarTelefone", "digitosAteIndice", "indiceAposNDigitos", "ativarMascaraTelefone"]
    .map((name) => extractFunction(scriptSrc, name))
    .join("\n");

  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/whatsappcontrol" });
  const { window } = dom;
  window.eval(fnsSrc);
  return { window, document: window.document };
}

function dispararInput(window, input, valor, inputType) {
  input.value = valor;
  const ev = new window.Event("input", { bubbles: true });
  Object.defineProperty(ev, "inputType", { value: inputType });
  input.dispatchEvent(ev);
}

test("extrairDigitosTelefone: remove símbolos de formatação, mantendo só os dígitos", () => {
  const { window } = buildTelefoneSandbox();
  assert.equal(window.extrairDigitosTelefone("+55 (11) 94659-3056"), "5511946593056");
  assert.equal(window.extrairDigitosTelefone("+55 11 94659-3056"), "5511946593056");
});

test("formatarTelefone: formata os dígitos como +55 (11) 94659-3056", () => {
  const { window } = buildTelefoneSandbox();
  assert.equal(window.formatarTelefone("5511946593056"), "+55 (11) 94659-3056");
});

test("ativarMascaraTelefone: colar um telefone com máscara formata corretamente o campo", () => {
  const { window, document } = buildTelefoneSandbox();
  const input = document.getElementById("liderTelefone");
  window.ativarMascaraTelefone(input);

  dispararInput(window, input, "+55 11 94659-3056", "insertFromPaste");

  assert.equal(input.value, "+55 (11) 94659-3056");
});

test("ativarMascaraTelefone: apagar repetidamente a partir do fim nunca corrompe o campo", () => {
  const { window, document } = buildTelefoneSandbox();
  const input = document.getElementById("liderTelefone");
  window.ativarMascaraTelefone(input);

  dispararInput(window, input, "5511946593056", "insertFromPaste");
  assert.equal(input.value, "+55 (11) 94659-3056");

  for (let i = 0; i < 13; i++) {
    const cursor = input.value.length;
    const novoValor = input.value.slice(0, cursor - 1) + input.value.slice(cursor);
    input.setSelectionRange(cursor - 1, cursor - 1);
    dispararInput(window, input, novoValor, "deleteContentBackward");
    // Nunca deveria sobrar um "+" fora da primeira posição, nem parênteses vazios —
    // sintoma exato do bug relatado (campo "travado" mostrando algo como "+++ (+ ) (+ )").
    assert.doesNotMatch(input.value, /\+.*\+/, `valor corrompido após ${i + 1} backspace(s): "${input.value}"`);
  }
  assert.equal(input.value, "", "depois de apagar todos os dígitos o campo deveria ficar vazio");
});
