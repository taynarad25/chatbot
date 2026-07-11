const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter } = require("../web/rateLimiter");

test("createRateLimiter: não bloqueia uma chave sem tentativas registradas", () => {
  const limiter = createRateLimiter({ maxAttempts: 10, windowMs: 15 * 60 * 1000 });
  assert.equal(limiter.isBlocked("1.2.3.4"), false);
});

test("createRateLimiter: bloqueia depois de atingir o número máximo de tentativas", () => {
  const limiter = createRateLimiter({ maxAttempts: 3, windowMs: 15 * 60 * 1000 });
  const now = 1000;

  limiter.registerFailure("1.2.3.4", now);
  limiter.registerFailure("1.2.3.4", now);
  assert.equal(limiter.isBlocked("1.2.3.4", now), false);

  limiter.registerFailure("1.2.3.4", now);
  assert.equal(limiter.isBlocked("1.2.3.4", now), true);
});

test("createRateLimiter: chaves diferentes não interferem entre si", () => {
  const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 15 * 60 * 1000 });
  const now = 1000;

  limiter.registerFailure("1.2.3.4", now);
  limiter.registerFailure("1.2.3.4", now);
  assert.equal(limiter.isBlocked("1.2.3.4", now), true);
  assert.equal(limiter.isBlocked("5.6.7.8", now), false);
});

test("createRateLimiter: reset() libera a chave imediatamente (usado em login bem-sucedido)", () => {
  const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 15 * 60 * 1000 });
  const now = 1000;

  limiter.registerFailure("1.2.3.4", now);
  limiter.registerFailure("1.2.3.4", now);
  assert.equal(limiter.isBlocked("1.2.3.4", now), true);

  limiter.reset("1.2.3.4");
  assert.equal(limiter.isBlocked("1.2.3.4", now), false);
});

test("createRateLimiter: a contagem reseta sozinha depois que a janela de tempo expira", () => {
  const windowMs = 15 * 60 * 1000;
  const limiter = createRateLimiter({ maxAttempts: 2, windowMs });
  const inicio = 1_000_000;

  limiter.registerFailure("1.2.3.4", inicio);
  limiter.registerFailure("1.2.3.4", inicio);
  assert.equal(limiter.isBlocked("1.2.3.4", inicio), true, "deveria estar bloqueado dentro da janela");

  const depoisDaJanela = inicio + windowMs + 1;
  assert.equal(limiter.isBlocked("1.2.3.4", depoisDaJanela), false, "deveria destravar sozinho após a janela expirar");

  // Uma nova falha após a janela expirar começa a contagem do zero, não continua de onde parou
  limiter.registerFailure("1.2.3.4", depoisDaJanela);
  assert.equal(limiter.isBlocked("1.2.3.4", depoisDaJanela), false);
});

test("createRateLimiter: tentativas dentro da janela continuam somando até o limite", () => {
  const windowMs = 15 * 60 * 1000;
  const limiter = createRateLimiter({ maxAttempts: 3, windowMs });
  const inicio = 1_000_000;

  limiter.registerFailure("1.2.3.4", inicio);
  limiter.registerFailure("1.2.3.4", inicio + windowMs / 2);
  assert.equal(limiter.isBlocked("1.2.3.4", inicio + windowMs / 2), false);

  limiter.registerFailure("1.2.3.4", inicio + windowMs - 1);
  assert.equal(limiter.isBlocked("1.2.3.4", inicio + windowMs - 1), true);
});
