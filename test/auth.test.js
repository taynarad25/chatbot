const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  validatePassword,
  hashPassword,
  createSession,
  getSession,
  getSessionId,
  isAuthenticated,
  isAdmin,
  setSessionCookie,
  clearSessionCookie,
  sessions,
} = require("../web/auth");

function fakeReq(cookieHeader) {
  return { headers: cookieHeader ? { cookie: cookieHeader } : {} };
}

function fakeRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
  };
}

test("hashPassword + validatePassword: aceita a senha correta", async () => {
  const { salt, hash } = await hashPassword("minhaSenh@123");
  assert.equal(await validatePassword("minhaSenh@123", salt, hash), true);
});

test("validatePassword: rejeita senha incorreta", async () => {
  const { salt, hash } = await hashPassword("minhaSenh@123");
  assert.equal(await validatePassword("senhaErrada", salt, hash), false);
});

test("validatePassword: retorna false (sem lançar exceção) quando salt/hash estão ausentes (usuário pendente)", async () => {
  assert.equal(await validatePassword("qualquer", null, null), false);
  assert.equal(await validatePassword("qualquer", undefined, undefined), false);
});

test("validatePassword: retorna false quando o hash salvo tem tamanho diferente do derivado (comparação segura, sem lançar)", async () => {
  const { salt } = await hashPassword("minhaSenh@123");
  assert.equal(await validatePassword("minhaSenh@123", salt, "abcd"), false);
});

test("validatePassword: usa comparação constant-time (crypto.timingSafeEqual) e não apenas '==='", async () => {
  // Regressão: garante que a comparação não volte a usar `===` direto em string,
  // que é vulnerável a timing attack.
  const src = require("fs").readFileSync(require.resolve("../web/auth"), "utf8");
  assert.match(src, /timingSafeEqual/);
  assert.doesNotMatch(src, /derivedKeyHex === hash/);
});

test("createSession + getSessionId + getSession: round-trip via cookie", () => {
  const token = createSession("lider1", "user", "active");
  const req = fakeReq(`whatsapp_control_session=${token}; outro=valor`);

  assert.equal(getSessionId(req), token);

  const session = getSession(req);
  assert.equal(session.username, "lider1");
  assert.equal(session.role, "user");
  assert.equal(session.id, token);

  delete sessions[token];
});

test("getSession: retorna null sem cookie ou com token desconhecido", () => {
  assert.equal(getSession(fakeReq(undefined)), null);
  assert.equal(getSession(fakeReq("whatsapp_control_session=token-inexistente")), null);
});

test("getSession: expira sessões mais antigas que o TTL configurado", () => {
  const token = createSession("lider1", "user", "active");
  const SESSION_TTL = 1000 * 60 * 120; // mesmo valor usado em web/auth.js
  sessions[token].createdAt = Date.now() - SESSION_TTL - 1000;

  const req = fakeReq(`whatsapp_control_session=${token}`);
  assert.equal(getSession(req), null);
  assert.equal(sessions[token], undefined, "sessão expirada deve ser removida do mapa");
});

test("isAuthenticated: true para sessão ativa, false para status pendente/inativo ou sem cookie", () => {
  const tokenAtivo = createSession("lider1", "user", "active");
  assert.equal(isAuthenticated(fakeReq(`whatsapp_control_session=${tokenAtivo}`)), true);
  delete sessions[tokenAtivo];

  const tokenPendente = createSession("novo", "user", "pending");
  assert.equal(isAuthenticated(fakeReq(`whatsapp_control_session=${tokenPendente}`)), false);
  delete sessions[tokenPendente];

  // Sem cookie, getSession retorna null e o curto-circuito `&&` propaga null (falsy), não `false`
  assert.ok(!isAuthenticated(fakeReq(undefined)));
});

test("isAdmin: true apenas quando role === 'admin'", () => {
  const tokenAdmin = createSession("chefe", "admin", "active");
  const tokenUser = createSession("comum", "user", "active");

  assert.equal(isAdmin(fakeReq(`whatsapp_control_session=${tokenAdmin}`)), true);
  assert.equal(isAdmin(fakeReq(`whatsapp_control_session=${tokenUser}`)), false);
  // Sem cookie, getSession retorna null e o curto-circuito `&&` propaga null (falsy), não `false`
  assert.ok(!isAdmin(fakeReq(undefined)));

  delete sessions[tokenAdmin];
  delete sessions[tokenUser];
});

test("setSessionCookie: define cookie HttpOnly, SameSite=Strict e Path=/", () => {
  const res = fakeRes();
  setSessionCookie(res, "meu-token");
  const cookie = res.headers["Set-Cookie"];
  assert.match(cookie, /^whatsapp_control_session=meu-token;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /SameSite=Strict/);
});

test("clearSessionCookie: expira o cookie e remove a sessão do mapa quando o id é informado", () => {
  const token = createSession("lider1", "user", "active");
  const res = fakeRes();
  clearSessionCookie(res, token);

  assert.equal(sessions[token], undefined);
  const cookie = res.headers["Set-Cookie"];
  assert.match(cookie, /whatsapp_control_session=;/);
  assert.match(cookie, /1970/);
});
