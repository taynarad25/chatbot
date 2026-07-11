// Fonte única de verdade para o mapeamento "rede -> agenda do Google", usado pelo
// fluxo de agendamento (Opção 6). Antes duplicado em 3 lugares no chatbot.js:
// mapearRedeParaAgendaId(), mapaConfig (fluxo de alterar evento) e mapaRedes
// (fluxo de novo evento) — cada um com a própria lista hardcoded das 10 redes.
const REDES = [
  { numero: "1", nome: "Evangelismo", agendaIndex: 0, palavrasChave: ["evangelismo"] },
  { numero: "2", nome: "Epifania", agendaIndex: 1, palavrasChave: ["epifania"] },
  { numero: "3", nome: "Intercessão", agendaIndex: 2, palavrasChave: ["intercessao", "intercessão"] },
  { numero: "4", nome: "Projeto Social Seeds", agendaIndex: 4, palavrasChave: ["seeds", "projeto"] },
  { numero: "5", nome: "Rede Ruach", agendaIndex: 5, palavrasChave: ["ruach"] },
  { numero: "6", nome: "Rede de Casais", agendaIndex: 6, palavrasChave: ["casais"] },
  { numero: "7", nome: "Rede de Homens", agendaIndex: 7, palavrasChave: ["homens"] },
  { numero: "8", nome: "Rede de Mulheres", agendaIndex: 8, palavrasChave: ["mulheres"] },
  { numero: "9", nome: "Rede Kids", agendaIndex: 9, palavrasChave: ["kids"] },
  { numero: "10", nome: "Outros", agendaIndex: 3, palavrasChave: [] },
];

const REDE_PADRAO = REDES[REDES.length - 1]; // "Outros", usada como fallback

function montarListaRedes() {
  return REDES.map((r) => `${r.numero} - ${r.nome}`).join("\n");
}

function obterRedePorNumero(numero) {
  return REDES.find((r) => r.numero === String(numero).trim()) || null;
}

// Identifica a rede a partir de um texto livre (busca por substring, case-insensitive).
// Usado ao reidentificar a rede pelo nome já escolhido anteriormente (ex: ao processar a
// confirmação automática de agendamento vinda do grupo). Sem correspondência, cai em "Outros".
function mapearRedeParaAgendaIndex(nomeRede) {
  const alvo = (nomeRede || "").toLowerCase();
  const encontrada = REDES.find((r) => r.palavrasChave.some((p) => alvo.includes(p)));
  return (encontrada || REDE_PADRAO).agendaIndex;
}

module.exports = { REDES, montarListaRedes, obterRedePorNumero, mapearRedeParaAgendaIndex };
