const db = require("../db");
const fs = require("fs");
const path = require("path");

console.log("Iniciando limpeza dos dados de The Chosen...");

try {
  const rTc = db.prepare("DELETE FROM the_chosen_inscricoes").run();
  console.log(`the_chosen_inscricoes deletados: ${rTc.changes}`);
} catch (e) {
  console.warn("Aviso ao limpar the_chosen_inscricoes:", e.message);
}

try {
  const rLemb = db.prepare("DELETE FROM lembretes_aguardando_resposta WHERE eventoId = 'the_chosen' OR eventoNome LIKE '%chosen%'").run();
  console.log(`lembretes_aguardando_resposta deletados: ${rLemb.changes}`);
} catch (e) {
  console.warn("Aviso ao limpar lembretes_aguardando_resposta:", e.message);
}

// the_chosen_inscricoes.json
const jsonPath = path.join(__dirname, "..", "the_chosen_inscricoes.json");
if (fs.existsSync(jsonPath)) {
  fs.writeFileSync(jsonPath, "[]\n", "utf8");
  console.log("the_chosen_inscricoes.json esvaziado.");
}

console.log("Limpeza de The Chosen concluída com sucesso!");
