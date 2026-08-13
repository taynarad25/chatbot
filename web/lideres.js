const db = require("../db");

// Array mantido em memória e sempre atualizado por mutação (nunca reatribuído).
// bot/chatbot.js guarda essa mesma referência ao montar o messageHandler, então
// uma alteração feita pelo painel (add/remove) já vale na próxima mensagem, sem
// precisar reiniciar o bot.
const telefonesLideres = [];

function normalizarTelefone(telefone) {
  return String(telefone || "").replace(/\D/g, "");
}

function sincronizarTelefones() {
  const rows = db.prepare("SELECT telefone FROM lideres").all();
  telefonesLideres.length = 0;
  telefonesLideres.push(...rows.map((r) => r.telefone));
}

// Na primeira execução (banco ainda sem nenhum líder), semeia a partir da
// variável de ambiente WHATSAPP_LIDERES para não perder os números já
// configurados. A partir daí, o banco passa a ser a fonte de verdade.
function seedFromEnvSeNecessario() {
  const { total } = db.prepare("SELECT COUNT(*) AS total FROM lideres").get();
  if (total > 0) return;

  const numeros = (process.env.WHATSAPP_LIDERES || "")
    .split(",")
    .map(normalizarTelefone)
    .filter(Boolean);
  if (numeros.length === 0) return;

  const agora = new Date().toISOString();
  const insert = db.prepare("INSERT INTO lideres (telefone, nome, createdAt) VALUES (?, ?, ?)");
  numeros.forEach((telefone) => insert.run(telefone, "", agora));
  console.log(`[Lideres] Banco semeado a partir de WHATSAPP_LIDERES com ${numeros.length} número(s).`);
}

function loadLideres() {
  try {
    seedFromEnvSeNecessario();
    const rows = db.prepare("SELECT * FROM lideres").all();
    const lideres = {};
    for (const row of rows) {
      lideres[row.telefone] = { nome: row.nome, telefone: row.telefone, createdAt: row.createdAt, updatedAt: row.updatedAt };
    }
    console.log(`[Lideres] Banco carregado. ${Object.keys(lideres).length} líder(es) detectado(s).`);
    sincronizarTelefones();
    return lideres;
  } catch (err) {
    console.error("[ALERTA:persistencia] Erro crítico ao carregar líderes. Retornando vazio para evitar perda de dados.", err);
    sincronizarTelefones();
    return {};
  }
}

function listLideres() {
  const lideres = loadLideres();
  return Object.values(lideres).sort((a, b) => a.nome.localeCompare(b.nome));
}

function addLider({ nome, telefone }) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  if (!telefoneNormalizado) return { ok: false, message: "Telefone inválido." };
  if (!nome || !nome.trim()) return { ok: false, message: "Nome é obrigatório." };

  const existente = db.prepare("SELECT telefone FROM lideres WHERE telefone = ?").get(telefoneNormalizado);
  if (existente) return { ok: false, message: "Já existe um líder com esse telefone." };

  db.prepare("INSERT INTO lideres (telefone, nome, createdAt) VALUES (?, ?, ?)")
    .run(telefoneNormalizado, nome.trim(), new Date().toISOString());
  sincronizarTelefones();
  console.log(`[Lideres] Líder adicionado: ${nome.trim()} (${telefoneNormalizado})`);
  return { ok: true, message: "Líder adicionado com sucesso." };
}

function updateLider(telefoneAtual, { nome, telefone }) {
  const telefoneAtualNormalizado = normalizarTelefone(telefoneAtual);
  const novoTelefoneNormalizado = normalizarTelefone(telefone);
  if (!novoTelefoneNormalizado) return { ok: false, message: "Telefone inválido." };
  if (!nome || !nome.trim()) return { ok: false, message: "Nome é obrigatório." };

  const liderExistente = db.prepare("SELECT * FROM lideres WHERE telefone = ?").get(telefoneAtualNormalizado);
  if (!liderExistente) return { ok: false, message: "Líder não encontrado." };

  if (novoTelefoneNormalizado !== telefoneAtualNormalizado) {
    const conflito = db.prepare("SELECT telefone FROM lideres WHERE telefone = ?").get(novoTelefoneNormalizado);
    if (conflito) return { ok: false, message: "Já existe um líder com esse telefone." };
  }

  db.prepare("DELETE FROM lideres WHERE telefone = ?").run(telefoneAtualNormalizado);
  db.prepare("INSERT INTO lideres (telefone, nome, createdAt, updatedAt) VALUES (?, ?, ?, ?)")
    .run(novoTelefoneNormalizado, nome.trim(), liderExistente.createdAt, new Date().toISOString());
  sincronizarTelefones();
  console.log(`[Lideres] Líder editado: ${telefoneAtualNormalizado} -> ${nome.trim()} (${novoTelefoneNormalizado})`);
  return { ok: true, message: "Líder atualizado com sucesso." };
}

function removeLider(telefone) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  const existente = db.prepare("SELECT telefone FROM lideres WHERE telefone = ?").get(telefoneNormalizado);
  if (!existente) return { ok: false, message: "Líder não encontrado." };

  db.prepare("DELETE FROM lideres WHERE telefone = ?").run(telefoneNormalizado);
  sincronizarTelefones();
  console.log(`[Lideres] Líder removido: ${telefoneNormalizado}`);
  return { ok: true, message: "Líder removido com sucesso." };
}

module.exports = { telefonesLideres, loadLideres, listLideres, addLider, updateLider, removeLider };
