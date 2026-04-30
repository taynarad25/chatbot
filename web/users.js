const fs = require("fs");
const path = require("path");

const USERS_FILE = path.join(__dirname, "..", "users.json");

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return {};
    const data = fs.readFileSync(USERS_FILE, "utf8");
    if (!data.trim()) return {};
    return JSON.parse(data);
  } catch (err) {
    console.error("[Users] Erro crítico ao carregar usuários. Retornando vazio para evitar perda de dados.", err);
    return {};
  }
}

function saveUser(user) {
  const users = loadUsers();
  users[user.username] = user;
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (err) {
    console.error("[Users] Erro ao gravar arquivo de usuários:", err);
  }
}

function updateUserPassword(username, salt, hash) {
  const users = loadUsers();
  const normalized = username?.toLowerCase().trim();
  if (users[normalized]) {
    users[normalized] = { ...users[normalized], salt, hash, status: 'active' };
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
    console.log(`[Users] Senha atualizada para '${normalized}'.`);
  }
}

function deleteUser(username) {
  const users = loadUsers();
  const normalized = username?.toLowerCase().trim();
  if (users[normalized]) delete users[normalized];
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  console.log(`[Users] Usuário '${normalized}' removido.`);
}

function initAdmin(username, salt, hash) {
  if (!fs.existsSync(USERS_FILE) && username && salt && hash) {
    const initialUsers = {};
    initialUsers[username] = {
      username,
      salt,
      hash,
      createdAt: new Date().toISOString(),
      role: 'admin'
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2));
    console.log("[Web] Arquivo users.json criado e admin inicial configurado.");
  }
}

module.exports = { loadUsers, saveUser, deleteUser, updateUserPassword, initAdmin };