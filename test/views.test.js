const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { renderIndexHtml } = require("../web/views");

// Extrai o código-fonte real de uma função declarada dentro do <script> renderizado,
// para testar o código de produção (não uma reimplementação) contra XSS.
function extractFunction(source, name) {
  const re = new RegExp(`async\\s+function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
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
    if (url === "/api/admin/users") {
      return { ok: true, json: async () => ({ ok: true, users: usersPayload }) };
    }
    if (url.startsWith("/api/admin/users/")) {
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

  assert.deepEqual(calls, [{ url: "/api/admin/users", method: "GET" }]);
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
    calls.some((c) => c.url === "/api/admin/users/fulano" && c.method === "DELETE"),
    "o clique deveria disparar uma chamada DELETE para o usuário correto"
  );
});
