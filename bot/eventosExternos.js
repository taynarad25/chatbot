const WEBHOOK_EVENTOS_EXTERNOS_URL =
  process.env.WEBHOOK_EVENTOS_EXTERNOS_URL ||
  "https://script.google.com/macros/s/AKfycbwMjixPj0ZpHVPxCYxFvIQvw4fuEiS59dPZlSUvjB9yJY1aDWXklePJA1yCLCP9-a_nbQ/exec";

const AGENDA_INDEX_EVENTOS_EXTERNOS = 10;
const AGENDA_INDEX_USO_SALAO = 15;

const TERMO_RESPONSABILIDADE_EVENTO_EXTERNO =
  `📜 *Termo de Responsabilidade - Eventos Externos*\n\n` +
  `⚠️ *Compromissos e Cuidados:*\n` +
  `• O responsável zela pela integridade de todo o patrimônio, equipamentos e dependências utilizadas.\n` +
  `• O espaço deve ser entregue limpo, organizado e nas mesmas condições em que foi recebido.\n` +
  `• As diretrizes e os horários acordados devem ser rigorosamente cumpridos.\n\n` +
  `Você concorda com estes termos e assume a responsabilidade pelo evento?\n\n` +
  `Digite *SIM* para aceitar e prosseguir, ou *menu* para cancelar.`;

function montarPayloadEventoExterno(dados = {}) {
  const precisaSalao = Boolean(dados.precisaSalaoAntes);
  const salaoDetalhe = precisaSalao ? (dados.salaoDetalhes || "Sim") : "Não";

  return {
    nome_evento: dados.nomeEvento || "",
    data_horario: dados.dataHorarioTexto || "",
    local: dados.local || "",
    valores_repasse: dados.valores || "",
    precisa_salao_antes: salaoDetalhe,
    salao_antes: salaoDetalhe,
    termo_responsabilidade: "Aceito",
    observacoes: dados.observacoes || "",
    solicitante: dados.nomeSolicitante || "",
    telefone_solicitante: dados.solicitanteId || "",
  };
}

async function enviarWebhookGoogleDocsExternos(
  payload,
  { webhookUrl = WEBHOOK_EVENTOS_EXTERNOS_URL, fetchFn = globalThis.fetch } = {}
) {
  const response = await fetchFn(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook de eventos externos respondeu com status HTTP ${response.status}`);
  }

  let data;
  const textoResposta = await response.text();
  try {
    data = JSON.parse(textoResposta);
  } catch {
    // Caso o Apps Script responda em texto puro com a URL
    if (textoResposta && textoResposta.trim().startsWith("http")) {
      data = { url: textoResposta.trim() };
    } else {
      throw new Error(`Resposta do Webhook não pôde ser interpretada: ${textoResposta}`);
    }
  }

  const url = data?.url || data?.docUrl || data?.link || data?.documentUrl;
  if (!url) {
    throw new Error(`Webhook de eventos externos não retornou a URL do documento. Resposta: ${JSON.stringify(data)}`);
  }

  return { ...data, url };
}

module.exports = {
  WEBHOOK_EVENTOS_EXTERNOS_URL,
  AGENDA_INDEX_EVENTOS_EXTERNOS,
  AGENDA_INDEX_USO_SALAO,
  TERMO_RESPONSABILIDADE_EVENTO_EXTERNO,
  montarPayloadEventoExterno,
  enviarWebhookGoogleDocsExternos,
};
