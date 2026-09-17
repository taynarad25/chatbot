// Agendas internas da igreja que não são exibidas na agenda pública/geral
// e nem estão disponíveis para agendamento direto pelos líderes como departamento.
const AGENDAS_INTERNAS = {
  REUNIOES: "b8f01bfd149139d388080ec63176c2556e6e1aedce184b84d37671c3d082d238@group.calendar.google.com",
  ATENDIMENTO: "0a55126694643f39944faf173fe3acd127b2a52074c6ecc9e9ed4dc23edf8b57@group.calendar.google.com",
  LIMPEZA: "7975950de545f60f585bc041682c6564ce4c29d0ef7e06cdeffa21ffc0ffd572@group.calendar.google.com",
  ENSAIOS: "fc012c51d15e9b272d4f955f504df24d816277da10194302f0ac1f04ae997e81@group.calendar.google.com",
  USO_SALAO: "49b999ac91607d07310d7e36a26fe088ddc3cd2b34ff741a0e139b43a18bdabc@group.calendar.google.com",
};

// Aliases para flexibilidade de nomenclatura
AGENDAS_INTERNAS.REUNIOES_E_ATENDIMENTOS = AGENDAS_INTERNAS.REUNIOES;
AGENDAS_INTERNAS.ATENDIMENTOS = AGENDAS_INTERNAS.ATENDIMENTO;
AGENDAS_INTERNAS.SALAO = AGENDAS_INTERNAS.USO_SALAO;

const IDS_AGENDAS_INTERNAS = Array.from(new Set(Object.values(AGENDAS_INTERNAS)));

function isAgendaInterna(calendarId) {
  if (!calendarId) return false;
  return IDS_AGENDAS_INTERNAS.includes(calendarId);
}

module.exports = {
  AGENDAS_INTERNAS,
  IDS_AGENDAS_INTERNAS,
  isAgendaInterna,
};
