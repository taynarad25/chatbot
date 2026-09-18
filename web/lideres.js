const db = require("../db");

// Array mantido em memória e sempre atualizado por mutação (nunca reatribuído).
// bot/chatbot.js guarda essa mesma referência ao montar o messageHandler, então
// uma alteração feita pelo painel (add/remove) já vale na próxima mensagem, sem
// precisar reiniciar o bot.
const telefonesLideres = [];

function normalizarTelefone(telefone) {
  return String(telefone || "").replace(/\D/g, "");
}

function normalizarCargos(cargos) {
  if (!cargos) return ["lider"];
  let arr = [];
  if (Array.isArray(cargos)) {
    arr = cargos;
  } else if (typeof cargos === "string") {
    try {
      const parsed = JSON.parse(cargos);
      arr = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      arr = cargos.split(",").map((c) => c.trim());
    }
  }
  const limpos = arr
    .map((c) => String(c || "").toLowerCase().trim())
    .filter(Boolean);
  const unicos = Array.from(new Set(limpos));
  return unicos.length > 0 ? unicos : ["lider"];
}

function sincronizarTelefones() {
  const rows = db.prepare("SELECT telefone, cargos FROM lideres").all();
  telefonesLideres.length = 0;
  const apenasLideres = rows.filter((r) => normalizarCargos(r.cargos).includes("lider"));
  telefonesLideres.push(...apenasLideres.map((r) => r.telefone));
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
  const cargosPadrao = JSON.stringify(["lider"]);
  const insert = db.prepare("INSERT INTO lideres (telefone, nome, cargos, createdAt) VALUES (?, ?, ?, ?)");
  numeros.forEach((telefone) => insert.run(telefone, "", cargosPadrao, agora));
  console.log(`[Lideres] Banco semeado a partir de WHATSAPP_LIDERES com ${numeros.length} número(s).`);
}

function normalizarDepartamentos(deptos) {
  if (!deptos) return [];
  let arr = [];
  if (Array.isArray(deptos)) {
    arr = deptos;
  } else if (typeof deptos === "string") {
    try {
      const parsed = JSON.parse(deptos);
      arr = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      arr = deptos.split(",").map((d) => d.trim());
    }
  }
  const limpos = arr
    .map((d) => String(d || "").trim())
    .filter(Boolean);
  return Array.from(new Set(limpos));
}

function loadLideres() {
  try {
    seedFromEnvSeNecessario();
    const rows = db.prepare("SELECT * FROM lideres").all();
    const lideres = {};
    for (const row of rows) {
      const cargos = normalizarCargos(row.cargos);
      const departamentos = normalizarDepartamentos(row.departamento);
      lideres[row.telefone] = {
        nome: row.nome,
        telefone: row.telefone,
        cargos,
        departamentos,
        departamento: departamentos.join(", "),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }
    console.log(`[Lideres] Banco carregado. ${Object.keys(lideres).length} usuário(s)/líder(es) detectado(s).`);
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

function obterUsuarioPorTelefone(telefone) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  const lideres = loadLideres();
  if (lideres[telefoneNormalizado]) {
    return lideres[telefoneNormalizado];
  }
  return {
    nome: "",
    telefone: telefoneNormalizado,
    cargos: [],
    departamentos: [],
    departamento: "",
  };
}

function addLider({ nome, telefone, cargos, departamentos, departamento }) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  if (!telefoneNormalizado) return { ok: false, message: "Telefone inválido." };
  if (!nome || !nome.trim()) return { ok: false, message: "Nome é obrigatório." };

  const existente = db.prepare("SELECT telefone FROM lideres WHERE telefone = ?").get(telefoneNormalizado);
  if (existente) return { ok: false, message: "Já existe um usuário com esse telefone." };

  const cargosNormalizados = normalizarCargos(cargos);
  const deptosNormalizados = normalizarDepartamentos(departamentos !== undefined ? departamentos : departamento);

  db.prepare("INSERT INTO lideres (telefone, nome, cargos, departamento, createdAt) VALUES (?, ?, ?, ?, ?)")
    .run(telefoneNormalizado, nome.trim(), JSON.stringify(cargosNormalizados), JSON.stringify(deptosNormalizados), new Date().toISOString());
  sincronizarTelefones();
  console.log(`[Lideres] Usuário adicionado: ${nome.trim()} (${telefoneNormalizado}) - Cargos: [${cargosNormalizados.join(", ")}] - Deptos: [${deptosNormalizados.join(", ") || "Nenhum"}]`);
  return { ok: true, message: "Usuário adicionado com sucesso." };
}

function updateLider(telefoneAtual, { nome, telefone, cargos, departamentos, departamento }) {
  const telefoneAtualNormalizado = normalizarTelefone(telefoneAtual);
  const novoTelefoneNormalizado = normalizarTelefone(telefone);
  if (!novoTelefoneNormalizado) return { ok: false, message: "Telefone inválido." };
  if (!nome || !nome.trim()) return { ok: false, message: "Nome é obrigatório." };

  const liderExistente = db.prepare("SELECT * FROM lideres WHERE telefone = ?").get(telefoneAtualNormalizado);
  if (!liderExistente) return { ok: false, message: "Líder não encontrado." };

  if (novoTelefoneNormalizado !== telefoneAtualNormalizado) {
    const conflito = db.prepare("SELECT telefone FROM lideres WHERE telefone = ?").get(novoTelefoneNormalizado);
    if (conflito) return { ok: false, message: "Já existe um usuário com esse telefone." };
  }

  const cargosNormalizados = normalizarCargos(cargos !== undefined ? cargos : liderExistente.cargos);
  const deptosFonte = departamentos !== undefined ? departamentos : (departamento !== undefined ? departamento : liderExistente.departamento);
  const deptosNormalizados = normalizarDepartamentos(deptosFonte);

  db.prepare("DELETE FROM lideres WHERE telefone = ?").run(telefoneAtualNormalizado);
  db.prepare("INSERT INTO lideres (telefone, nome, cargos, departamento, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(novoTelefoneNormalizado, nome.trim(), JSON.stringify(cargosNormalizados), JSON.stringify(deptosNormalizados), liderExistente.createdAt, new Date().toISOString());
  sincronizarTelefones();
  console.log(`[Lideres] Usuário editado: ${telefoneAtualNormalizado} -> ${nome.trim()} (${novoTelefoneNormalizado}) - Cargos: [${cargosNormalizados.join(", ")}] - Deptos: [${deptosNormalizados.join(", ") || "Nenhum"}]`);
  return { ok: true, message: "Usuário atualizado com sucesso." };
}

function removeLider(telefone) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  const existente = db.prepare("SELECT telefone FROM lideres WHERE telefone = ?").get(telefoneNormalizado);
  if (!existente) return { ok: false, message: "Líder não encontrado." };

  db.prepare("DELETE FROM lideres WHERE telefone = ?").run(telefoneNormalizado);
  sincronizarTelefones();
  console.log(`[Lideres] Usuário removido: ${telefoneNormalizado}`);
  return { ok: true, message: "Usuário removido com sucesso." };
}

function obterLideresPorDepartamento(departamento) {
  if (!departamento || !String(departamento).trim()) return [];
  const deptoNorm = String(departamento).trim().toLowerCase();
  const todos = listLideres();
  return todos.filter((l) => {
    const deptos = Array.isArray(l.departamentos) ? l.departamentos : normalizarDepartamentos(l.departamento);
    return deptos.some((d) => {
      const dNorm = String(d || "").trim().toLowerCase();
      if (!dNorm) return false;
      return dNorm === deptoNorm || dNorm.includes(deptoNorm) || deptoNorm.includes(dNorm);
    });
  });
}

module.exports = {
  telefonesLideres,
  loadLideres,
  listLideres,
  addLider,
  updateLider,
  removeLider,
  normalizarCargos,
  normalizarDepartamentos,
  obterUsuarioPorTelefone,
  obterLideresPorDepartamento,
};
