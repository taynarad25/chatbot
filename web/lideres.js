const fs = require("fs");
const path = require("path");

// Sobrescrevível via env var (usado pelos testes, para nunca ler/escrever no
// lideres.json real de produção).
const LIDERES_FILE = process.env.LIDERES_FILE_PATH || path.join(__dirname, "..", "lideres.json");

// Array mantido em memória e sempre atualizado por mutação (nunca reatribuído).
// bot/chatbot.js guarda essa mesma referência ao montar o messageHandler, então
// uma alteração feita pelo painel (add/remove) já vale na próxima mensagem, sem
// precisar reiniciar o bot.
const telefonesLideres = [];

function normalizarTelefone(telefone) {
  return String(telefone || "").replace(/\D/g, "");
}

function sincronizarTelefones(lideres) {
  telefonesLideres.length = 0;
  telefonesLideres.push(...Object.keys(lideres));
}

// Na primeira execução (arquivo ainda não existe), semeia a partir da variável
// de ambiente WHATSAPP_LIDERES para não perder os números já configurados.
// A partir daí, o arquivo passa a ser a fonte de verdade.
function seedFromEnv() {
  const numeros = (process.env.WHATSAPP_LIDERES || "")
    .split(",")
    .map(normalizarTelefone)
    .filter(Boolean);

  const lideres = {};
  numeros.forEach((telefone) => {
    lideres[telefone] = { nome: "", telefone, createdAt: new Date().toISOString() };
  });
  return lideres;
}

function loadLideres() {
  try {
    if (!fs.existsSync(LIDERES_FILE)) {
      const lideres = seedFromEnv();
      if (Object.keys(lideres).length > 0) {
        fs.writeFileSync(LIDERES_FILE, JSON.stringify(lideres, null, 2), "utf8");
        console.log(`[Lideres] Arquivo criado a partir de WHATSAPP_LIDERES com ${Object.keys(lideres).length} número(s).`);
      }
      sincronizarTelefones(lideres);
      return lideres;
    }

    const data = fs.readFileSync(LIDERES_FILE, "utf8");
    const lideres = data.trim() ? JSON.parse(data) : {};
    console.log(`[Lideres] Banco carregado. ${Object.keys(lideres).length} líder(es) detectado(s).`);
    sincronizarTelefones(lideres);
    return lideres;
  } catch (err) {
    console.error("[Lideres] Erro crítico ao carregar líderes. Retornando vazio para evitar perda de dados.", err);
    sincronizarTelefones({});
    return {};
  }
}

function salvar(lideres) {
  fs.writeFileSync(LIDERES_FILE, JSON.stringify(lideres, null, 2), "utf8");
  sincronizarTelefones(lideres);
}

function listLideres() {
  const lideres = loadLideres();
  return Object.values(lideres).sort((a, b) => a.nome.localeCompare(b.nome));
}

function addLider({ nome, telefone }) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  if (!telefoneNormalizado) return { ok: false, message: "Telefone inválido." };
  if (!nome || !nome.trim()) return { ok: false, message: "Nome é obrigatório." };

  const lideres = loadLideres();
  if (lideres[telefoneNormalizado]) return { ok: false, message: "Já existe um líder com esse telefone." };

  lideres[telefoneNormalizado] = {
    nome: nome.trim(),
    telefone: telefoneNormalizado,
    createdAt: new Date().toISOString(),
  };
  salvar(lideres);
  console.log(`[Lideres] Líder adicionado: ${nome.trim()} (${telefoneNormalizado})`);
  return { ok: true, message: "Líder adicionado com sucesso." };
}

function updateLider(telefoneAtual, { nome, telefone }) {
  const telefoneAtualNormalizado = normalizarTelefone(telefoneAtual);
  const novoTelefoneNormalizado = normalizarTelefone(telefone);
  if (!novoTelefoneNormalizado) return { ok: false, message: "Telefone inválido." };
  if (!nome || !nome.trim()) return { ok: false, message: "Nome é obrigatório." };

  const lideres = loadLideres();
  const liderExistente = lideres[telefoneAtualNormalizado];
  if (!liderExistente) return { ok: false, message: "Líder não encontrado." };

  if (novoTelefoneNormalizado !== telefoneAtualNormalizado && lideres[novoTelefoneNormalizado]) {
    return { ok: false, message: "Já existe um líder com esse telefone." };
  }

  delete lideres[telefoneAtualNormalizado];
  lideres[novoTelefoneNormalizado] = {
    nome: nome.trim(),
    telefone: novoTelefoneNormalizado,
    createdAt: liderExistente.createdAt,
    updatedAt: new Date().toISOString(),
  };
  salvar(lideres);
  console.log(`[Lideres] Líder editado: ${telefoneAtualNormalizado} -> ${nome.trim()} (${novoTelefoneNormalizado})`);
  return { ok: true, message: "Líder atualizado com sucesso." };
}

function removeLider(telefone) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  const lideres = loadLideres();
  if (!lideres[telefoneNormalizado]) return { ok: false, message: "Líder não encontrado." };

  delete lideres[telefoneNormalizado];
  salvar(lideres);
  console.log(`[Lideres] Líder removido: ${telefoneNormalizado}`);
  return { ok: true, message: "Líder removido com sucesso." };
}

module.exports = { telefonesLideres, loadLideres, listLideres, addLider, updateLider, removeLider };
