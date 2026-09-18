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

const REDE_PADRAO = REDES.find((r) => r.nome === "Outros") || REDES[REDES.length - 1]; // "Outros", usada como fallback

function usuarioTemCargo(usuario, cargo) {
  if (!usuario || !Array.isArray(usuario.cargos)) return false;
  return usuario.cargos.map((c) => String(c).toLowerCase().trim()).includes(cargo.toLowerCase().trim());
}

function obterRedesParaUsuario(usuario) {
  if (!usuario) {
    return REDES.map((r, i) => ({ ...r, numeroExibicao: String(i + 1) }));
  }

  // Pastores e Diretores têm acesso a TODOS os departamentos da igreja
  if (usuarioTemCargo(usuario, "pastor") || usuarioTemCargo(usuario, "diretor")) {
    return REDES.map((r, i) => ({ ...r, numeroExibicao: String(i + 1) }));
  }

  // Líder comum:
  // Se for líder legado (sem registro no banco), mantém acesso total para retrocompatibilidade
  if (!usuario.registradoNoBanco && Array.isArray(usuario.cargos) && usuario.cargos.includes("lider")) {
    return REDES.map((r, i) => ({ ...r, numeroExibicao: String(i + 1) }));
  }

  const deptosCadastrados = (Array.isArray(usuario.departamentos) ? usuario.departamentos : (usuario.departamento ? [usuario.departamento] : []))
    .map((d) => String(d || "").trim().toLowerCase())
    .filter(Boolean);

  if (deptosCadastrados.length === 0) {
    return REDES.map((r, i) => ({ ...r, numeroExibicao: String(i + 1) }));
  }

  const redesPermitidas = [];
  REDES.forEach((r) => {
    if (r.nome.toLowerCase() === "outros") return;
    const bateu = deptosCadastrados.some((dep) => {
      const nomeRede = r.nome.toLowerCase();
      return (
        nomeRede === dep ||
        dep.includes(nomeRede) ||
        nomeRede.includes(dep) ||
        (r.palavrasChave && r.palavrasChave.some((p) => dep.includes(p)))
      );
    });
    if (bateu) {
      redesPermitidas.push({ ...r });
    }
  });

  // A opção "Outros" sempre é adicionada ao final para o líder
  redesPermitidas.push({ ...REDE_PADRAO });

  return redesPermitidas.map((r, i) => ({
    ...r,
    numeroExibicao: String(i + 1),
    numeroOriginal: r.numero,
  }));
}

function montarListaRedesParaUsuario(redesDisponiveis) {
  const lista = redesDisponiveis || REDES;
  return lista.map((r, i) => `${r.numeroExibicao || r.numero || i + 1} - ${r.nome}`).join("\n");
}

function montarListaRedes(redesDisponiveis) {
  return montarListaRedesParaUsuario(redesDisponiveis || REDES);
}

function obterRedeDaLista(entrada, redesDisponiveis = REDES) {
  const texto = String(entrada || "").trim().toLowerCase();
  if (!texto) return null;

  // 1. Número de exibição da lista atual (1, 2, 3...)
  const porNumeroExibicao = redesDisponiveis.find((r) => String(r.numeroExibicao) === texto);
  if (porNumeroExibicao) return porNumeroExibicao;

  // 2. Número original da rede
  const porNumeroOriginal = redesDisponiveis.find((r) => String(r.numero || r.numeroOriginal) === texto);
  if (porNumeroOriginal) return porNumeroOriginal;

  // 3. Busca por nome da rede ou palavra-chave
  const porNome = redesDisponiveis.find((r) => {
    const nome = r.nome.toLowerCase();
    return nome === texto || (r.palavrasChave && r.palavrasChave.some((p) => texto.includes(p)));
  });
  if (porNome) return porNome;

  return null;
}

function obterRedePorNumero(numero) {
  return obterRedeDaLista(numero, REDES);
}

// Identifica a rede a partir de um texto livre (busca por substring, case-insensitive).
// Usado ao reidentificar a rede pelo nome já escolhido anteriormente (ex: ao processar a
// confirmação automática de agendamento vinda do grupo). Sem correspondência, cai em "Outros".
function mapearRedeParaAgendaIndex(nomeRede) {
  const alvo = (nomeRede || "").toLowerCase();
  if (/externo/i.test(alvo)) {
    return 10;
  }
  const encontrada = REDES.find(
    (r) => r.nome.toLowerCase() === alvo || r.palavrasChave.some((p) => alvo.includes(p))
  );
  return (encontrada || REDE_PADRAO).agendaIndex;
}

const { AGENDAS_INTERNAS, IDS_AGENDAS_INTERNAS, isAgendaInterna } = require("./agendasInternas");

module.exports = {
  REDES,
  montarListaRedes,
  montarListaRedesParaUsuario,
  obterRedesParaUsuario,
  obterRedeDaLista,
  obterRedePorNumero,
  mapearRedeParaAgendaIndex,
  AGENDAS_INTERNAS,
  IDS_AGENDAS_INTERNAS,
  isAgendaInterna,
};
