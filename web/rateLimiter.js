// Rate limiter em memória com janela de tempo deslizante por chave (ex: IP).
// Depois de `windowMs` sem uma nova falha, a contagem daquela chave reseta
// sozinha, em vez de bloquear para sempre até o processo reiniciar.
function createRateLimiter({ maxAttempts, windowMs }) {
  const attempts = {};

  function getEntry(key, now) {
    const entry = attempts[key];
    if (!entry || now - entry.firstAttemptAt > windowMs) return null;
    return entry;
  }

  return {
    isBlocked(key, now = Date.now()) {
      const entry = getEntry(key, now);
      return !!entry && entry.count >= maxAttempts;
    },
    registerFailure(key, now = Date.now()) {
      const entry = getEntry(key, now);
      if (entry) {
        entry.count += 1;
      } else {
        attempts[key] = { count: 1, firstAttemptAt: now };
      }
    },
    reset(key) {
      delete attempts[key];
    },
  };
}

module.exports = { createRateLimiter };
