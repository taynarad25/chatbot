const fs = require("fs");
const path = require("path");

// Sobrescrevível via env var (usado pelos testes, para nunca ler/escrever no
// login.json real de produção).
const LOGIN_FILE = process.env.LOGIN_FILE_PATH || path.join(__dirname, "..", "login.json");

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

function deleteUser(username) {
  const users = loadUsers();
  const normalized = username?.toLowerCase().trim();
  if (!users[normalized]) {
    console.warn(`[Users] Tentativa de excluir usuário inexistente: '${normalized}'`);
    return { ok: false, message: "Usuário não encontrado." };
  }
  delete users[normalized];
  fs.writeFileSync(LOGIN_FILE, JSON.stringify(users, null, 2), "utf8");
  console.log(`[Users] Usuário '${normalized}' removido.`);
  return { ok: true, message: "Usuário excluído com sucesso." };
}
module.exports = { loadUsers, saveUser, deleteUser };