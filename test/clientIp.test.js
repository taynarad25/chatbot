const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getClientIp, isTrustedProxyIp, normalizeIp } = require("../web/clientIp");

function fakeReq(remoteAddress, headers = {}) {
  return { socket: { remoteAddress }, headers };
}

test("isTrustedProxyIp: reconhece um IP dentro de uma faixa oficial do Cloudflare (IPv4)", () => {
  assert.equal(isTrustedProxyIp("173.245.48.1"), true); // dentro de 173.245.48.0/20
  assert.equal(isTrustedProxyIp("104.16.0.5"), true); // dentro de 104.16.0.0/13
});

test("isTrustedProxyIp: rejeita um IP fora de qualquer faixa do Cloudflare", () => {
  assert.equal(isTrustedProxyIp("8.8.8.8"), false);
  assert.equal(isTrustedProxyIp("1.1.1.1"), false); // IP público comum, mas não é do Cloudflare
});

test("isTrustedProxyIp: reconhece um IP dentro de uma faixa oficial do Cloudflare (IPv6)", () => {
  assert.equal(isTrustedProxyIp("2606:4700::1"), true);
  assert.equal(isTrustedProxyIp("2001:4860:4860::8888"), false); // DNS público do Google, não é Cloudflare
});

test("isTrustedProxyIp: entrada vazia/indefinida nunca é confiada", () => {
  assert.equal(isTrustedProxyIp(undefined), false);
  assert.equal(isTrustedProxyIp(""), false);
  assert.equal(isTrustedProxyIp("não-é-um-ip"), false);
});

test("normalizeIp: remove o prefixo IPv4-mapped de sockets dual-stack", () => {
  assert.equal(normalizeIp("::ffff:104.16.0.5"), "104.16.0.5");
  assert.equal(normalizeIp("104.16.0.5"), "104.16.0.5");
});

test("getClientIp: confia no header cf-connecting-ip quando a conexão vem do Cloudflare", () => {
  const req = fakeReq("104.16.0.5", { "cf-connecting-ip": "203.0.113.7" });
  assert.equal(getClientIp(req), "203.0.113.7");
});

test("getClientIp: usa x-forwarded-for como alternativa quando cf-connecting-ip não vem", () => {
  const req = fakeReq("104.16.0.5", { "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
  assert.equal(getClientIp(req), "203.0.113.9");
});

test("getClientIp: ignora os headers e usa o IP real da conexão quando NÃO vem do Cloudflare (ex: acesso direto à porta)", () => {
  const req = fakeReq("8.8.8.8", { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "203.0.113.9" });
  assert.equal(getClientIp(req), "8.8.8.8", "headers forjáveis não podem substituir o IP real numa conexão não confiável");
});

test("getClientIp: conexão do Cloudflare sem nenhum header de encaminhamento cai para o IP do socket", () => {
  const req = fakeReq("104.16.0.5", {});
  assert.equal(getClientIp(req), "104.16.0.5");
});
