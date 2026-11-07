const db = require("../db");

function loadUsers() {
  try {
    const rows = db.prepare("SELECT * FROM users").all();
    const users = {};
    for (const row of rows) {
      let nome = row.nome || "";
      let telefone = row.telefone || "";
      let role = row.role;

      // Garantia oficial: a conta da secretária gabriela é estritamente Gabriela Diniz
      if (row.username === "gabriela" || row.username === "gabrieladiniz" || telefone === "5511942685501") {
        nome = "Gabriela Diniz";
        telefone = "5511942685501";
        role = "admin";
      }

      // Garantia oficial: Isabelly Lacerda (Secretaria & Diretora)
      if (row.username === "isabelly" || row.username === "isabellylacerda" || telefone === "5511970498716") {
        nome = "Isabelly Lacerda";
        telefone = "5511970498716";
        role = "admin";
      }

      users[row.username] = {
        username: row.username,
        nome,
        telefone,
        salt: row.salt,
        hash: row.hash,
        status: row.status,
        role,
        primeiroAcessoEm: row.primeiroAcessoEm || null,
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
    let nome = user.nome ?? null;
    let telefone = user.telefone ?? null;
    let role = user.role;

    if (user.username === "gabriela" || user.username === "gabrieladiniz" || telefone === "5511942685501") {
      nome = "Gabriela Diniz";
      telefone = "5511942685501";
      role = "admin";
    }

    if (user.username === "isabelly" || user.username === "isabellylacerda" || telefone === "5511970498716") {
      nome = "Isabelly Lacerda";
      telefone = "5511970498716";
      role = "admin";
    }

    db.prepare(`
      INSERT INTO users (username, salt, hash, status, role, telefone, nome, primeiroAcessoEm, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        salt = excluded.salt,
        hash = excluded.hash,
        status = excluded.status,
        role = excluded.role,
        telefone = excluded.telefone,
        nome = excluded.nome,
        primeiroAcessoEm = excluded.primeiroAcessoEm,
        updatedAt = excluded.updatedAt
    `).run(
      user.username,
      user.salt ?? null,
      user.hash ?? null,
      user.status,
      role,
      telefone,
      nome,
      user.primeiroAcessoEm ?? null,
      user.createdAt ?? null,
      user.updatedAt ?? null
    );

    try {
      db.exec("PRAGMA wal_checkpoint(PASSIVE);");
    } catch (_) {}
  } catch (err) {
    console.error("[ALERTA:persistencia] Erro ao gravar usuário:", err);
  }
}

function deleteUser(username) {
  const normalized = username?.toLowerCase().trim();
  if (normalized === "gabriela" || normalized === "gabrieladiniz" || normalized === "5511942685501") {
    return { ok: false, message: "A conta principal da Secretaria não pode ser excluída." };
  }
  const cleanPhone = normalized ? normalized.replace(/\D/g, '') : '';
  const existing = db.prepare("SELECT username, telefone FROM users WHERE username = ? OR (telefone IS NOT NULL AND (telefone = ? OR telefone = ?))").get(normalized, normalized, cleanPhone);
  if (!existing) {
    console.warn(`[Users] Tentativa de excluir usuário inexistente: '${normalized}'`);
    return { ok: false, message: "Usuário não encontrado." };
  }
  db.prepare("DELETE FROM users WHERE username = ?").run(existing.username);
  if (existing.telefone) {
    db.prepare("DELETE FROM users WHERE username = ? OR telefone = ?").run(existing.telefone, existing.telefone);
  }
  try {
    db.exec("PRAGMA wal_checkpoint(PASSIVE);");
  } catch (_) {}
  console.log(`[Users] Usuário '${existing.username}' (tel: ${existing.telefone || '-'}) removido.`);
  return { ok: true, message: "Usuário excluído com sucesso." };
}

module.exports = { loadUsers, saveUser, deleteUser };
