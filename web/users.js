const fs = require("fs");
const path = require("path");

const LOGIN_FILE = path.join(__dirname, "..", "login.json");

function loadUsers() {
  try {
    if (!fs.existsSync(LOGIN_FILE)) return {};
    const data = fs.readFileSync(LOGIN_FILE, "utf8");
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
    fs.writeFileSync(LOGIN_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (err) {
    console.error("[Users] Erro ao gravar arquivo de usuários:", err);
  }
}

function updateUserPassword(username, salt, hash) {
  const users = loadUsers();
  const normalized = username?.toLowerCase().trim();
  if (users[normalized]) {
    users[normalized] = { ...users[normalized], salt, hash, status: 'active' };
    fs.writeFileSync(LOGIN_FILE, JSON.stringify(users, null, 2), "utf8");
    console.log(`[Users] Senha atualizada para '${normalized}'.`);
  }
}

function deleteUser(username) {
  const users = loadUsers();
  const normalized = username?.toLowerCase().trim();
  if (users[normalized]) delete users[normalized];
  fs.writeFileSync(LOGIN_FILE, JSON.stringify(users, null, 2), "utf8");
  console.log(`[Users] Usuário '${normalized}' removido.`);
}
module.exports = { loadUsers, saveUser, deleteUser, updateUserPassword };