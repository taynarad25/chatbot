const fs = require("fs");
const path = require("path");

const USERS_FILE = path.join(__dirname, "..", "users.json");

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return {};
    const data = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("[Users] Erro ao carregar usuários:", err);
    return {};
  }
}

function saveUser(user) {
  const users = loadUsers();
  users[user.username] = user;
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function deleteUser(username) {
  const users = loadUsers();
  if (users[username]) delete users[username];
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function deleteUser(username) {
  const users = loadUsers();
  if (users[username]) delete users[username];
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
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

module.exports = { loadUsers, saveUser, deleteUser, initAdmin };