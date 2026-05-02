const fs = require("fs");
const path = require("path");

const LOGIN_FILE = path.join(__dirname, "..", "login.json");

function loadUsers() {
  try {
    if (!fs.existsSync(LOGIN_FILE)) {
      console.warn(`[Users] Arquivo de usuários não encontrado em: ${LOGIN_FILE}`);
      return {};
    }
    const data = fs.readFileSync(LOGIN_FILE, "utf8");
    if (!data.trim()) {
      console.warn(`[Users] O arquivo login.json está vazio.`);
      return {};
    }
    let usersRaw = JSON.parse(data);
    let users = usersRaw;

    // Se o arquivo for um Array [...], converte para Objeto {"username": {...}}
    if (Array.isArray(usersRaw)) {
      console.warn("[Users] Corrigindo formato de array para objeto no login.json...");
      users = {};
      usersRaw.forEach(u => {
        if (u.username) users[u.username.toLowerCase().trim()] = u;
      });
      // Salva de volta para corrigir o arquivo fisicamente
      fs.writeFileSync(LOGIN_FILE, JSON.stringify(users, null, 2), "utf8");
    }

    console.log(`[Users] Banco carregado. Usuários detectados: ${Object.keys(users).join(", ") || "Nenhum"}`);
    return users;
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