const moment = require("moment-timezone");

const URL_PLANILHA_LOGS_PADRAO =
  "https://script.google.com/macros/s/AKfycbxwykTsHXQueoRhaPbPxZcp8sZ1H-WUYSj5P2tlmCHq7yNoQWe4SK_3NPhKAf8UZ9h5/exec";

function obterUrlPlanilhaLogs() {
  return process.env.LOGS_ENVIO_WEBAPP_URL || URL_PLANILHA_LOGS_PADRAO;
}

/**
 * Retorna o período em formato ISO de semana (ex: "2026-W40") para uma data de referência.
 * @param {Date|string} dataRef 
 * @returns {string}
 */
function obterPeriodoSemana(dataRef = new Date()) {
  return moment(dataRef).tz("America/Sao_Paulo").format("GGGG-[W]WW");
}

/**
 * Retorna o período em formato ISO diário (ex: "2026-10-01") para uma data de referência.
 * @param {Date|string} dataRef 
 * @returns {string}
 */
function obterPeriodoDia(dataRef = new Date()) {
  return moment(dataRef).tz("America/Sao_Paulo").format("YYYY-MM-DD");
}

/**
 * Consulta a planilha via Web App para verificar se uma rotina/mensagem já foi enviada no período.
 * @param {object} params
 * @param {string} params.tipo - Descrição da mensagem (ex: "lembrete_inscricao", "agenda_quinzenal", "aviso_lideres", "aniversario", "confirmacao_inscricao")
 * @param {string} [params.destinatario="Geral"] - Quem vai receber (pode ser "Geral", identificador do evento ou o destinatário específico)
 * @param {string} params.periodo - Chave única que identifica o dia ou semana daquele envio (ex: "2026-10-01" ou "2026-W40")
 * @param {string} [params.url] - URL customizada do Web App
 * @param {Function} [params.fetchFn] - Função fetch (útil para testes unitários)
 * @returns {Promise<boolean|null>} true se já enviado, false se não enviado, ou null em caso de falha de conexão/permissão
 */
async function verificarEnvioRemoto({
  tipo,
  destinatario = "Geral",
  periodo,
  url = obterUrlPlanilhaLogs(),
  fetchFn = globalThis.fetch,
} = {}) {
  if (!tipo || !periodo) {
    console.warn("[LogsEnvioSheet] 'tipo' e 'periodo' são obrigatórios para verificar envio.");
    return null;
  }

  const payload = {
    action: "verificar_envio",
    tipo: String(tipo),
    destinatario: String(destinatario || "Geral"),
    periodo: String(periodo),
  };

  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[LogsEnvioSheet] Web App retornou status HTTP ${res.status} ao verificar envio para '${tipo}' (${destinatario}, ${periodo}).`);
      return null;
    }

    let data;
    if (typeof res.text === "function") {
      const texto = await res.text();
      try {
        data = JSON.parse(texto);
      } catch {
        console.warn(`[LogsEnvioSheet] Resposta não-JSON recebida ao verificar envio para '${tipo}': ${texto.slice(0, 100)}`);
        return null;
      }
    } else if (typeof res.json === "function") {
      data = await res.json();
    } else {
      return null;
    }

    // A planilha responderá com { "enviado": true } ou { "enviado": false }
    if (data && typeof data.enviado !== "undefined") {
      return data.enviado === true || data.enviado === "true";
    }

    return null;
  } catch (err) {
    console.warn(`[LogsEnvioSheet] Erro ao comunicar com Web App de logs (${tipo}, ${destinatario}, ${periodo}): ${err.message}`);
    return null;
  }
}

/**
 * Registra o envio da rotina/mensagem na planilha via Web App.
 * @param {object} params
 * @param {string} params.tipo - Descrição da mensagem (ex: "lembrete_inscricao", "agenda_quinzenal", "aviso_lideres", "aniversario", "confirmacao_inscricao")
 * @param {string} [params.destinatario="Geral"] - Quem recebeu a mensagem
 * @param {string} params.periodo - Chave única que identifica o dia ou semana do envio
 * @param {object} [params.detalhes] - Informações adicionais a salvar
 * @param {string} [params.url] - URL customizada do Web App
 * @param {Function} [params.fetchFn] - Função fetch (útil para testes unitários)
 * @returns {Promise<boolean>}
 */
async function registrarEnvioRemoto({
  tipo,
  destinatario = "Geral",
  periodo,
  detalhes = {},
  url = obterUrlPlanilhaLogs(),
  fetchFn = globalThis.fetch,
} = {}) {
  if (!tipo || !periodo) {
    console.warn("[LogsEnvioSheet] 'tipo' e 'periodo' são obrigatórios para registrar envio.");
    return false;
  }

  const payload = {
    action: "registrar_envio",
    tipo: String(tipo),
    destinatario: String(destinatario || "Geral"),
    periodo: String(periodo),
    timestamp: new Date().toISOString(),
    ...detalhes,
  };

  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[LogsEnvioSheet] Web App retornou status HTTP ${res.status} ao registrar envio para '${tipo}' (${destinatario}, ${periodo}).`);
      return false;
    }

    let data;
    if (typeof res.text === "function") {
      const texto = await res.text();
      try {
        data = JSON.parse(texto);
      } catch {
        // Se respondeu 200 com texto ok
        return true;
      }
    } else if (typeof res.json === "function") {
      data = await res.json();
    } else {
      return true;
    }

    return data && (data.sucesso === true || data.status === "success" || data.ok === true || typeof data.enviado !== "undefined");
  } catch (err) {
    console.warn(`[LogsEnvioSheet] Erro ao registrar envio no Web App de logs (${tipo}, ${destinatario}, ${periodo}): ${err.message}`);
    return false;
  }
}

module.exports = {
  URL_PLANILHA_LOGS_PADRAO,
  obterUrlPlanilhaLogs,
  obterPeriodoSemana,
  obterPeriodoDia,
  verificarEnvioRemoto,
  registrarEnvioRemoto,
};
