const db = require("../db");

function loadUsers() {
  try {
    const rows = db.prepare("SELECT * FROM users").all();
    const users = {};
    for (const row of rows) {
      users[row.username] = {
        username: row.username,
        salt: row.salt,
        hash: row.hash,
        status: row.status,
        role: row.role,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }
    console.log(`[Users] Banco carregado. Usuários detectados: ${Object.keys(users).join(", ") || "Nenhum"}`);
    return users;
  } catch (err) {
    console.error("[ALERTA:persistencia] Erro crítico ao carregar usuários. Retornando vazio para evitar perda de dados.", err);
    return {};
  }
}

function saveUser(user) {
  try {
    db.prepare(`
      INSERT INTO users (username, salt, hash, status, role, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        salt = excluded.salt,
        hash = excluded.hash,
        status = excluded.status,
        role = excluded.role,
        updatedAt = excluded.updatedAt
    `).run(
      user.username,
      user.salt ?? null,
      user.hash ?? null,
      user.status,
      user.role,
      user.createdAt ?? null,
      user.updatedAt ?? null
    );
  } catch (err) {
    console.error("[ALERTA:persistencia] Erro ao gravar usuário:", err);
  }
}

function deleteUser(username) {
  const normalized = username?.toLowerCase().trim();
  const existing = db.prepare("SELECT username FROM users WHERE username = ?").get(normalized);
  if (!existing) {
    console.warn(`[Users] Tentativa de excluir usuário inexistente: '${normalized}'`);
    return { ok: false, message: "Usuário não encontrado." };
  }
  db.prepare("DELETE FROM users WHERE username = ?").run(normalized);
  console.log(`[Users] Usuário '${normalized}' removido.`);
  return { ok: true, message: "Usuário excluído com sucesso." };
}

module.exports = { loadUsers, saveUser, deleteUser };
