const db = require("../db");
const moment = require("moment-timezone");
const { notificarMultimidia: notificarMultimidiaDefault } = require("./secretaria");

const WEBHOOK_GOOGLE_DOCS_URL =
  process.env.WEBHOOK_GOOGLE_DOCS_URL ||
  "https://script.google.com/macros/s/AKfycbxUafGASn73Xvj77v_hzy7A3EzGXCwpEz7S1fzM1KMgFwXM4-HrUn3-VVzM6kjW6yeu6A/exec";

const ENDERECO_IGREJA = "Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi";
const LOCAL_IGREJA_REGEX = /\bigreja\b|\btemplo\b|\bsal[aã]o\b/i;
const CONTATO_TESOURARIA = "+55 11 99111-7612";

function temConteudoRelevante(valor) {
  if (!valor) return false;
  const v = String(valor).trim().toLowerCase();
  return (
    v !== "" &&
    v !== "não" &&
    v !== "nao" &&
    v !== "n" &&
    v !== "nenhum" &&
    v !== "nenhuma" &&
    v !== "a definir" &&
    v !== "a combinar" &&
    v !== "não tem" &&
    v !== "nao tem" &&
    v !== "-"
  );
}

function extrairDataIso(texto, anoPadrao = new Date().getFullYear()) {
  if (!texto) return null;
  const limpo = String(texto).trim();
  if (/^(n[aã]o|sem\s|nenhum|a\s*definir|cancel)/i.test(limpo)) {
    return null;
  }
  // YYYY-MM-DD
  const mIso = limpo.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (mIso) {
    return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  }
  // DD/MM/YYYY ou DD-MM-YYYY
  const mCompleto = limpo.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (mCompleto) {
    const dia = mCompleto[1].padStart(2, "0");
    const mes = mCompleto[2].padStart(2, "0");
    const ano = mCompleto[3];
    return `${ano}-${mes}-${dia}`;
  }
  // DD/MM ou DD-MM
  const mCurto = limpo.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (mCurto) {
    const dia = mCurto[1].padStart(2, "0");
    const mes = mCurto[2].padStart(2, "0");
    return `${anoPadrao}-${mes}-${dia}`;
  }
  return null;
}

function salvarFormularioEvento({ evento, departamento, data, dataMaximaDivulgacao, solicitanteId, payload, docUrl }) {
  try {
    const agora = new Date().toISOString();
    const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload || {});
    let parsedPayload = {};
    if (typeof payload === "object" && payload !== null) {
      parsedPayload = payload;
    } else if (typeof payload === "string") {
      try {
        parsedPayload = JSON.parse(payload);
      } catch {}
    }

    let dataDivulgacaoFinal = dataMaximaDivulgacao || parsedPayload.data_maxima_divulgacao || parsedPayload.dataMaximaDivulgacao || null;
    if (dataDivulgacaoFinal) {
      dataDivulgacaoFinal = extrairDataIso(dataDivulgacaoFinal) || dataDivulgacaoFinal;
    }

    const existing = db.prepare("SELECT id FROM formularios_eventos WHERE evento = ? ORDER BY id DESC LIMIT 1").get(evento);

    if (existing) {
      db.prepare(`
        UPDATE formularios_eventos
        SET departamento = ?, data = ?, dataMaximaDivulgacao = ?, solicitanteId = ?, payload = ?, docUrl = ?, atualizadoEm = ?
        WHERE id = ?
      `).run(departamento || "", data || "", dataDivulgacaoFinal || null, solicitanteId || "", payloadStr, docUrl || "", agora, existing.id);
      return existing.id;
    } else {
      const info = db.prepare(`
        INSERT INTO formularios_eventos (evento, departamento, data, dataMaximaDivulgacao, solicitanteId, payload, docUrl, criadoEm, atualizadoEm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(evento, departamento || "", data || "", dataDivulgacaoFinal || null, solicitanteId || "", payloadStr, docUrl || "", agora, agora);
      return info.lastInsertRowid;
    }
  } catch (err) {
    console.error("[Formulário Evento] Erro ao salvar formulário no banco:", err.message);
    return null;
  }
}

function obterFormularioEvento(evento) {
  try {
    if (!evento) return null;
    const row = db.prepare("SELECT * FROM formularios_eventos WHERE evento = ? ORDER BY id DESC LIMIT 1").get(evento);
    if (!row) return null;
    let payload = {};
    try {
      payload = JSON.parse(row.payload);
    } catch {}
    return { ...row, payload };
  } catch (err) {
    console.error("[Formulário Evento] Erro ao buscar formulário no banco:", err.message);
    return null;
  }
}

function formatarJidWhatsApp(telefone) {
  if (!telefone) return "";
  const digits = String(telefone).replace(/\D/g, "");
  return digits.endsWith("@c.us") ? digits : `${digits}@c.us`;
}

async function notificarTesouraria(client, mensagem, { jidTesouraria } = {}) {
  const destino = jidTesouraria || formatarJidWhatsApp(CONTATO_TESOURARIA);
  if (!client || typeof client.sendMessage !== "function" || !destino) {
    return false;
  }
  try {
    await client.sendMessage(destino, mensagem);
    console.log(`[Tesouraria] Notificação enviada com sucesso para ${destino}`);
    return true;
  } catch (err) {
    console.error(`[Tesouraria] Erro ao enviar mensagem para tesouraria (${destino}):`, err.message);
    return false;
  }
}

const PERGUNTAS_DEFINICOES = [
  // 1. Nome do líder responsável
  ["nome_lider", "👤 *Nome do líder responsável:*\nQual é o nome do líder responsável pelo evento?"],

  // 2. Nome do Evento (pula se já preenchido no agendamento)
  ["nome_evento", "📅 *Nome do Evento:*\nQual é o nome oficial do evento?", (d) => Boolean(d.evento)],

  // 3. Data Solicitada (DD/MM/AAAA) (pula se já preenchido no agendamento)
  ["data_solicitada", "📆 *Data Solicitada (DD/MM/AAAA):*\nQual é a data do evento? (Ex: DD/MM/AAAA)", (d) => Boolean(d.data)],

  // 4. Horário de Início e Término (pula se já preenchido no agendamento)
  [
    "horario_inicio_termino",
    "⏰ *Horário de Início e Término:*\nQual é o horário previsto de início e término do evento? (Ex: 19:00 às 22:00)",
    (d) => Boolean(d.horarioInicio && d.horarioFim),
  ],

  // 5. Uso do salão antes, depois ou no dia anterior
  [
    "horario_total",
    "🏛️ *Uso do salão antes, depois ou no dia anterior:*\nVai precisar usar o salão antes do horário de início do evento (para montagem/organização), depois para desmontagem/limpeza, ou no dia anterior para decoração?\n\n👉 Se *SIM*, informe os horários necessários (ex: *Dia anterior das 18h às 21h para decoração, e no dia das 17h às 19h para montagem e 22h às 23h para limpeza*).\n👉 Se *NÃO*, responda apenas *NÃO*.",
  ],

  // 6. Local (Lembrar: Se for na Igreja, preenche automaticamente com o endereço fixo)
  ["local", "📍 *Local:*\nOnde será realizado o evento? (Se for na Igreja, basta responder *Igreja*)", (d) => Boolean(d.local)],

  // 7. Público-Alvo
  ["publico", "🎯 *Público-Alvo:*\nQual é o público-alvo do evento? (Ex: Jovens, Mulheres, Crianças, Homens, Casais, Toda a Igreja)"],

  // 8. Valor de inscrição
  ["valor_inscricao", "💰 *Valor de inscrição:*\nHaverá cobrança de taxa ou inscrição? Se sim, qual o valor? (Ou responda *Gratuito* / *Não*)"],

  // 9. Vai precisar de valor do ministério? (Se sim, lembrar do contato da tesouraria: +55 11 99111-7612)
  [
    "precisa_valor_ministerio",
    "🏛️ *Vai precisar de valor do ministério?*\nO evento precisará de verba ou investimento financeiro do ministério? (Responda *Sim* ou *Não*)",
  ],

  // 10. Tema Oficial
  ["tema", "✨ *Tema Oficial:*\nQual é o tema oficial do evento? (Ou responda *Nenhum* / *A definir*)"],

  // 11. Versículo Base (se houver)
  ["versiculo", "📖 *Versículo Base (se houver):*\nQual é o versículo base do evento? (Ou responda *Nenhum* / *Não*)"],

  // 12. Cores da Identidade Visual (Paleta de Cores)
  [
    "paleta",
    "🎨 *Paleta de Cores (Identidade Visual):*\nQuais são as cores da identidade visual do evento? (Ex: Azul, branco e dourado / ou *A definir*)",
  ],

  // 13. Mídias e Estilo Visual
  [
    "estilo",
    "📱 *Mídias e Estilo Visual:*\nQuais mídias serão necessárias e qual o estilo visual desejado? (Ex: Flyer feed/stories, telão, vídeo teaser; jovem, elegante, minimalista / ou *Padrão*)",
  ],

  // 14. Responsável Geral
  ["responsavel_geral", "👔 *Responsável Geral:*\nQuem será o responsável geral pela coordenação no dia do evento?"],

  // 15. Haverá convidado (banda, pregador)?
  ["convidado", "🎤 *Haverá convidado (banda, pregador)?*\nHaverá algum convidado especial (banda, pregador, cantor)? Se sim, quem? (Ou responda *Não*)"],

  // 16. Louvor definido?
  ["louvor", "🎵 *Louvor definido?*\nO louvor já está definido (equipe/repertório)? (Ex: Sim / Não / A definir)"],

  // 17. Decoração
  ["decoracao", "🎈 *Decoração:*\nComo será a decoração ou quem ficará responsável? (Ou responda *Nenhuma* / *Simples*)"],

  // 18. Alimentação
  ["alimentacao", "☕ *Alimentação:*\nHaverá alimentação (lanche, coffee break, almoço, jantar)? Se sim, descreva brevemente (ou responda *Não*)"],

  // 19. Equipe (pré, durante e pós-evento)
  ["equipe", "👥 *Equipe (pré, durante e pós-evento):*\nComo está dividida a equipe de apoio (montagem pré-evento, durante e limpeza pós-evento)?"],

  // 20. Materiais necessários
  ["materiais", "📦 *Materiais necessários:*\nQuais materiais e equipamentos serão necessários? (Ex: Som, projetor, microfones, mesas / ou responda *Nenhum*)"],

  // 21. Divulgação e Prazo da Imagem
  [
    "prazo_imagem",
    "📢 *Divulgação e Prazo:*\nAté quando você precisa da imagem/arte de divulgação pronta para a mídia e quais os canais? (Informe a data limite ou prazo desejado)",
  ],

  // 22. Data Máxima para Início da Divulgação
  [
    "data_maxima_divulgacao",
    "🗓️ *Data Máxima para Início da Divulgação:*\nQual é a data máxima para começar a divulgação deste evento? (Ex: DD/MM/AAAA - informe a data limite para iniciar as postagens ou responda *Não haverá* se não houver divulgação)",
  ],

  // 23. Cronograma do evento
  ["cronograma", "⏱️ *Cronograma do evento:*\nQual é o cronograma previsto do evento? (Ex: 19h Abertura, 19h30 Louvor, 20h Palavra, 21h Término)"],

  // 24. Observações
  ["observacoes", "📝 *Observações:*\nAlguma observação, detalhe extra ou necessidade especial? (Ou responda *Nenhuma*)"],

  // 25. Objetivo espiritual do evento (pergunta única unificada)
  [
    "objetivo_espiritual",
    "🙏 *Objetivo espiritual do evento:*\nQual é o objetivo espiritual e o resultado esperado deste evento? (Descreva o propósito principal e o impacto esperado em vidas)",
  ],
];

const PERGUNTAS_FORMULARIO = PERGUNTAS_DEFINICOES.map(([id, pergunta, devePular]) => ({
  id,
  campoDoc: id,
  pergunta,
  devePular,
}));

function precisaDeValorDoMinisterio(resposta) {
  if (!resposta) return false;
  const r = String(resposta).trim().toLowerCase();
  return (
    /^(sim\b|s\b|precisa|com certeza|vai precisar|positivo)/i.test(r) ||
    (r.includes("sim") && !r.includes("não") && !r.includes("nao"))
  );
}

function normalizarTextoLocal(local) {
  if (!local) return "";
  const limpo = String(local).trim();
  if (
    limpo === "1" ||
    /^(?:1\s*[-–]\s*)?(?:na\s+igreja|igreja|no\s+templo|templo)$/i.test(limpo)
  ) {
    return ENDERECO_IGREJA;
  }
  return limpo;
}

async function enviarWebhookGoogleDocs(payload, { webhookUrl = WEBHOOK_GOOGLE_DOCS_URL, fetchFn = globalThis.fetch } = {}) {
  const response = await fetchFn(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook respondeu com status HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data || !data.url) {
    throw new Error(`Webhook não retornou a URL do Google Docs. Resposta: ${JSON.stringify(data)}`);
  }

  return data;
}

function normalizarDadosIniciais(dadosIniciais = {}) {
  let dataFormatada = dadosIniciais.dataFormatada || "";
  if (!dataFormatada && dadosIniciais.dia && dadosIniciais.mes) {
    const ano = dadosIniciais.ano || new Date().getFullYear();
    dataFormatada = `${String(dadosIniciais.dia).padStart(2, "0")}/${String(dadosIniciais.mes).padStart(2, "0")}/${ano}`;
  }

  return {
    tipo: dadosIniciais.tipo || "",
    departamento: dadosIniciais.rede || dadosIniciais.departamento || "",
    evento: dadosIniciais.evento || "",
    local: normalizarTextoLocal(dadosIniciais.local || ""),
    data: dataFormatada,
    horarioInicio: dadosIniciais.horarioInicio || "",
    horarioFim: dadosIniciais.horarioFim || "",
  };
}

function formatarResumoEventoGrupo(payload, { incluirTesouraria = true } = {}) {
  const horario =
    payload.horario_inicio_termino ||
    (payload.horario_inicio && payload.horario_termino
      ? `${payload.horario_inicio} às ${payload.horario_termino}`
      : payload.horario_inicio || "");
  const local = payload.local || "";
  const cores = payload.cores || payload.paleta || "";
  const midias = payload.midias || payload.estilo || "";
  const divulgacao = payload.divulgacao || payload.prazo_imagem || "";

  let resumo =
    `👤 *Líder:* ${payload.nome_lider}\n` +
    `📅 *Evento:* ${payload.nome_evento}\n` +
    `🏢 *Depto:* ${payload.departamento}\n` +
    `📆 *Data:* ${payload.data}\n` +
    `⏰ *Horário:* ${horario}\n` +
    (payload.horario_total ? `⏱️ *Horário Total:* ${payload.horario_total}\n` : "") +
    `📍 *Endereço / Local:* ${local}`;

  // Informações de Tema e Versículo Base (se houver)
  if (temConteudoRelevante(payload.tema)) {
    resumo += `\n✨ *Tema:* ${payload.tema}`;
  }
  if (temConteudoRelevante(payload.versiculo)) {
    resumo += `\n📖 *Versículo Base:* ${payload.versiculo}`;
  }

  // Informações de Divulgação, Mídias e Cores
  if (cores) {
    resumo += `\n🎨 *Cores:* ${cores}`;
  }
  if (midias) {
    resumo += `\n📱 *Mídias:* ${midias}`;
  }
  if (divulgacao) {
    resumo += `\n📢 *Divulgação:* ${divulgacao}`;
  }
  if (temConteudoRelevante(payload.data_maxima_divulgacao)) {
    resumo += `\n🗓️ *Início da Divulgação:* ${payload.data_maxima_divulgacao}`;
  }

  if (incluirTesouraria && precisaDeValorDoMinisterio(payload.precisa_valor_ministerio)) {
    resumo += `\n💰 *Tesouraria:* Solicita valor do ministério (Contato: ${CONTATO_TESOURARIA})`;
  }

  return resumo;
}

const CAMPOS_RESPOSTAS_LIVRES = [
  "publico", "tema", "versiculo", "paleta", "estilo",
  "responsavel_geral", "convidado", "louvor", "decoracao",
  "alimentacao", "equipe", "materiais", "prazo_imagem",
  "data_maxima_divulgacao",
  "cronograma", "observacoes", "objetivo_espiritual",
];

function montarPayloadFormulario(dadosIniciais = {}, respostas = {}) {
  const data = respostas.data_solicitada || dadosIniciais.data || "";
  const hInicio = dadosIniciais.horarioInicio || "";
  const hFim = dadosIniciais.horarioFim || "";
  const hFaixa = respostas.horario_inicio_termino || (hInicio && hFim ? `${hInicio} às ${hFim}` : "");
  const taxa = respostas.valor_inscricao || respostas.valor || "";
  const querTesouraria = precisaDeValorDoMinisterio(respostas.precisa_valor_ministerio);
  const dataMaxDiv = respostas.data_maxima_divulgacao || respostas.dataMaximaDivulgacao || "";
  const dataMaxDivIso = extrairDataIso(dataMaxDiv);

  const payload = {
    nome_lider: respostas.nome_lider || "",
    departamento: dadosIniciais.departamento || "",
    nome_evento: respostas.nome_evento || dadosIniciais.evento || "",
    data,
    data_solicitada: data,
    horario_inicio: hInicio,
    horario_termino: hFim,
    horario_inicio_termino: hFaixa,
    horario_total: respostas.horario_total || "",
    local: normalizarTextoLocal(respostas.local || dadosIniciais.local || ""),
    valor_inscricao: taxa,
    valor: taxa,
    precisa_valor_ministerio: respostas.precisa_valor_ministerio || "",
    contato_tesouraria: querTesouraria ? CONTATO_TESOURARIA : "",
    aviso_tesouraria: querTesouraria ? `Entrar em contato com a tesouraria: ${CONTATO_TESOURARIA}` : "",
    resultado_esperado: respostas.objetivo_espiritual || "",
    data_maxima_divulgacao: dataMaxDiv,
    dataMaximaDivulgacao: dataMaxDivIso || dataMaxDiv,
  };

  for (const c of CAMPOS_RESPOSTAS_LIVRES) {
    payload[c] = respostas[c] || "";
  }

  if (respostas.cores && !payload.paleta) payload.paleta = respostas.cores;
  if (respostas.midias && !payload.estilo) payload.estilo = respostas.midias;
  if (respostas.divulgacao && !payload.prazo_imagem) payload.prazo_imagem = respostas.divulgacao;

  return payload;
}

async function iniciarFormularioEvento({ etapas, solicitanteId, dadosIniciais, client }) {
  if (
    dadosIniciais &&
    (dadosIniciais.tipo === "reuniao" ||
      (typeof dadosIniciais.evento === "string" &&
        dadosIniciais.evento.trim().toLowerCase().startsWith("reunião")))
  ) {
    console.warn(`[Formulário Evento] Tentativa de iniciar formulário para reunião (${dadosIniciais.evento}) ignorada.`);
    return;
  }

  const dados = normalizarDadosIniciais(dadosIniciais);
  const perguntasFiltradas = PERGUNTAS_FORMULARIO.filter(
    (p) => !p.devePular || !p.devePular(dados)
  );

  etapas[solicitanteId] = {
    fluxo: "formulario_evento",
    dadosIniciais: dados,
    perguntas: perguntasFiltradas,
    indicePergunta: 0,
    respostas: {},
  };

  const total = perguntasFiltradas.length;
  const intro =
    `📝 *FORMULÁRIO INTERNO DO EVENTO*\n\n` +
    `Para alinhamento completo com a secretaria e diretoria, vamos preencher os detalhes restantes do evento.\n\n` +
    `📌 *Informações já salvas:*\n` +
    `• *Departamento:* ${dados.departamento}\n` +
    `• *Data:* ${dados.data}\n` +
    `• *Horário:* ${dados.horarioInicio} às ${dados.horarioFim}\n` +
    `• *Local:* ${dados.local}` +
    (dados.evento ? `\n• *Evento:* ${dados.evento}` : "") +
    `\n\n_Esses dados não precisam ser informados novamente._\n` +
    `_(Você pode digitar *menu* a qualquer momento para cancelar)_\n\n` +
    `---\n📋 *[1/${total}]* ${perguntasFiltradas[0].pergunta}`;

  await client.sendMessage(solicitanteId, intro);
}

function comporNotificacaoSecretaria(cabecalho, payload, extra = "") {
  const meio = extra ? `${extra}\n\n` : "";
  return `${cabecalho}\n\n${meio}${formatarResumoEventoGrupo(payload, { incluirTesouraria: false })}`;
}

async function processarRespostaFormulario({
  msg,
  numero,
  info,
  client,
  notificarSecretaria,
  notificarMultimidia = notificarMultimidiaDefault,
  etapas,
  enviarWebhook = enviarWebhookGoogleDocs,
  calendar = null,
  agendasParaLer = null,
}) {
  const perguntaAtual = info.perguntas[info.indicePergunta];
  if (!perguntaAtual) {
    delete etapas[numero];
    return msg.reply("❌ Ocorreu um erro no preenchimento. Digite *menu* para reiniciar.");
  }

  let respostaTexto = (msg.body || "").trim();
  if (perguntaAtual.id === "local") {
    respostaTexto = normalizarTextoLocal(respostaTexto);
  }

  info.respostas[perguntaAtual.id] = respostaTexto;
  info.indicePergunta++;

  if (info.indicePergunta < info.perguntas.length) {
    const proxima = info.perguntas[info.indicePergunta];
    const progresso = `📋 *[${info.indicePergunta + 1}/${info.perguntas.length}]*`;
    return msg.reply(`${progresso} ${proxima.pergunta}`);
  }

  await msg.reply("⏳ *Obrigado pelas respostas!*\nGerando o documento oficial no Google Docs e notificando a secretaria, por favor aguarde um momento...");

  const payload = montarPayloadFormulario(info.dadosIniciais, info.respostas);
  const querTesouraria = precisaDeValorDoMinisterio(info.respostas.precisa_valor_ministerio);
  const notaTesouraria = querTesouraria
    ? `\n\n💰 *Aviso da Tesouraria:*\nComo foi informado que precisará de recursos do ministério, por favor entre em contato com a tesouraria para alinhamento: *${CONTATO_TESOURARIA}*`
    : "";
  const tagGrupoTesouraria = querTesouraria
    ? `\n\n💰 *Aviso da Tesouraria:* Este evento precisará de valor do ministério. Contato da tesouraria: *${CONTATO_TESOURARIA}*`
    : "";

  const responderLider = (corpo) => msg.reply(`${corpo}${notaTesouraria}\n\nDigite *menu* para voltar ao menu principal.`);

  try {
    const resultado = await enviarWebhook(payload);
    const linkDoc = resultado.url;

    salvarFormularioEvento({
      evento: payload.nome_evento,
      departamento: payload.departamento,
      data: payload.data,
      dataMaximaDivulgacao: payload.dataMaximaDivulgacao || payload.data_maxima_divulgacao,
      solicitanteId: numero,
      payload,
      docUrl: linkDoc,
    });

    // Se o líder informou horários extras de preparação/decoração/limpeza, grava na agenda do departamento do evento
    const textoExtra = (payload.horario_total || "").trim();
    const precisaExtra = textoExtra && !/^(não|nao|nenhum|nenhuma|nada|zero)$/i.test(textoExtra);
    if (precisaExtra && calendar && calendar.events && typeof calendar.events.insert === "function" && agendasParaLer) {
      try {
        const { mapearRedeParaAgendaIndex } = require("./redes");
        const agendaDepto = agendasParaLer[mapearRedeParaAgendaIndex(payload.departamento)];
        if (agendaDepto) {
          let dataMom = moment.tz(payload.data, "DD/MM/YYYY", "America/Sao_Paulo");
          if (!dataMom.isValid()) {
            dataMom = moment.tz("America/Sao_Paulo").add(1, "day");
          }
          if (/dia anterior|v[eé]spera/i.test(textoExtra)) {
            dataMom = dataMom.clone().subtract(1, "day");
          }
          const dataIsoIni = dataMom.clone().set({ hour: 18, minute: 0, second: 0 }).format();
          const dataIsoFim = dataMom.clone().set({ hour: 21, minute: 0, second: 0 }).format();

          const resourceExtra = {
            summary: `[Preparação/Decoração] ${payload.nome_evento}`,
            description: `Uso do espaço para montagem, preparação, decoração ou limpeza.\nEvento Principal: ${payload.nome_evento}\nLíder Responsável: ${payload.nome_lider}\nDetalhes dos horários: ${textoExtra}`,
            location: payload.local || "Igreja",
            start: { dateTime: dataIsoIni, timeZone: "America/Sao_Paulo" },
            end: { dateTime: dataIsoFim, timeZone: "America/Sao_Paulo" },
          };
          await calendar.events.insert({ calendarId: agendaDepto, resource: resourceExtra });
          console.log(`[Formulário] Bloco de preparação/decoração inserido no calendário do departamento '${payload.departamento}': ${resourceExtra.summary}`);
        }
      } catch (errCalExtra) {
        console.warn("[Formulário] Aviso ao agendar bloco extra de preparação:", errCalExtra.message);
      }
    }

    await responderLider(
      `✅ *Formulário do Evento Concluído com Sucesso!*\n\n` +
      `O documento oficial do evento foi gerado automaticamente no Google Docs:\n` +
      `🔗 *Acesse o documento gerado:*\n${linkDoc}\n\n` +
      `A secretaria já foi notificada com o link do documento gerado. 🙏\n\n` +
      `🧹 *Compromisso de Limpeza e Organização:*\n` +
      `Lembramos que o salão e as dependências da igreja devem ser entregues após o evento exatamente da mesma forma como foram encontrados (organização das cadeiras, lixo recolhido e limpeza geral).`
    );

    const notificacaoGrupo =
      `${comporNotificacaoSecretaria("📋 *FORMULÁRIO DE EVENTO PREENCHIDO*", payload)}\n\n` +
      `📄 *Documento Oficial Gerado (Google Docs):*\n${linkDoc}${tagGrupoTesouraria}`;

    await notificarSecretaria(client, notificacaoGrupo);

    // Notifica o grupo MULTIMÍDIAS caso o formulário contenha pedidos/informações de mídia ou divulgação
    const temMidia = temConteudoRelevante(payload.midias || payload.estilo);
    const temDivulgacao = temConteudoRelevante(payload.divulgacao || payload.prazo_imagem);
    const temCores = temConteudoRelevante(payload.cores || payload.paleta);
    const temDataDivulgacao = temConteudoRelevante(payload.data_maxima_divulgacao);
    if (temMidia || temDivulgacao || temCores || temDataDivulgacao) {
      const horario =
        payload.horario_inicio_termino ||
        (payload.horario_inicio && payload.horario_termino
          ? `${payload.horario_inicio} às ${payload.horario_termino}`
          : payload.horario_inicio || "");
      let resumoMultimidia =
        `📢 *DEMANDA DE MÍDIA & COMUNICAÇÃO DE EVENTO*\n\n` +
        `👤 *Líder:* ${payload.nome_lider}\n` +
        `📅 *Evento:* ${payload.nome_evento}\n` +
        `🏢 *Depto:* ${payload.departamento}\n` +
        `📆 *Data:* ${payload.data}\n` +
        `⏰ *Horário:* ${horario}\n` +
        `📍 *Endereço / Local:* ${payload.local}`;

      if (temConteudoRelevante(payload.tema)) resumoMultimidia += `\n✨ *Tema:* ${payload.tema}`;
      if (temConteudoRelevante(payload.versiculo)) resumoMultimidia += `\n📖 *Versículo Base:* ${payload.versiculo}`;
      if (temCores) resumoMultimidia += `\n🎨 *Cores/Estilo:* ${payload.cores || payload.paleta}`;
      if (temMidia) resumoMultimidia += `\n📱 *Mídias Solicitadas:* ${payload.midias || payload.estilo}`;
      if (temDivulgacao) resumoMultimidia += `\n📢 *Divulgação / Prazo:* ${payload.divulgacao || payload.prazo_imagem}`;
      if (temDataDivulgacao) resumoMultimidia += `\n🗓️ *Data Máxima para Início da Divulgação:* ${payload.data_maxima_divulgacao}`;
      if (linkDoc) resumoMultimidia += `\n\n📄 *Documento Oficial Gerado (Google Docs):*\n${linkDoc}`;

      try {
        await notificarMultimidia(client, resumoMultimidia);
      } catch (errM) {
        console.error("[Multimídia] Erro ao notificar grupo MULTIMÍDIAS sobre formulário de evento:", errM);
      }
    }

    if (querTesouraria) {
      const msgTesouraria =
        `🏛️ *AVISO DE EVENTO - DEMANDA DA TESOURARIA*\n\n` +
        `Olá! Foi preenchido um formulário de evento que informou *necessidade de verba/apoio do ministério*:\n\n` +
        `👤 *Líder:* ${payload.nome_lider}\n` +
        `📅 *Evento:* ${payload.nome_evento}\n` +
        `🏢 *Depto:* ${payload.departamento}\n` +
        `📆 *Data:* ${payload.data}\n` +
        `⏰ *Horário:* ${payload.horario_inicio} às ${payload.horario_termino}\n` +
        `📍 *Local:* ${payload.local}\n\n` +
        `📄 *Documento Oficial (Google Docs):*\n${linkDoc}\n\n` +
        `O líder foi orientado a entrar em contato com a tesouraria. 🙏`;
      await notificarTesouraria(client, msgTesouraria);
    }

    console.log(`[Formulário Evento] Concluído com sucesso para ${numero}. Documento: ${linkDoc}`);
  } catch (err) {
    console.error("[ALERTA:secretaria] Erro ao enviar formulário para o Webhook do Google Docs:", err);
    await responderLider(
      "⚠️ Suas respostas foram salvas, mas houve uma instabilidade momentânea ao gerar o Google Docs. A secretaria já foi avisada."
    );

    const avisoFalha = `O líder preencheu o formulário, mas houve uma falha ao gerar o documento via Google Apps Script.\nErro: ${err.message}`;
    const resumoGrupoFalha = `${comporNotificacaoSecretaria("⚠️ *FORMULÁRIO DE EVENTO PREENCHIDO (FALHA NO GOOGLE DOCS)*", payload, avisoFalha)}${tagGrupoTesouraria}`;

    try {
      await notificarSecretaria(client, resumoGrupoFalha);
    } catch (notifErr) {
      console.error("[ALERTA:secretaria] Erro ao notificar secretaria da falha:", notifErr);
    }

    if (querTesouraria) {
      const msgTesouraria =
        `🏛️ *AVISO DE EVENTO - DEMANDA DA TESOURARIA*\n\n` +
        `Olá! Foi preenchido um formulário de evento que informou *necessidade de verba/apoio do ministério*:\n\n` +
        `👤 *Líder:* ${payload.nome_lider}\n` +
        `📅 *Evento:* ${payload.nome_evento}\n` +
        `🏢 *Depto:* ${payload.departamento}\n` +
        `📆 *Data:* ${payload.data}\n` +
        `⏰ *Horário:* ${payload.horario_inicio} às ${payload.horario_termino}\n` +
        `📍 *Local:* ${payload.local}\n\n` +
        `O líder foi orientado a entrar em contato com a tesouraria. 🙏`;
      try {
        await notificarTesouraria(client, msgTesouraria);
      } catch (notifTesErr) {
        console.error("[ALERTA:tesouraria] Erro ao notificar tesouraria:", notifTesErr);
      }
    }
  } finally {
    delete etapas[numero];
  }
}

module.exports = {
  WEBHOOK_GOOGLE_DOCS_URL,
  ENDERECO_IGREJA,
  LOCAL_IGREJA_REGEX,
  CONTATO_TESOURARIA,
  PERGUNTAS_DEFINICOES,
  PERGUNTAS_FORMULARIO,
  precisaDeValorDoMinisterio,
  normalizarTextoLocal,
  normalizarDadosIniciais,
  formatarResumoEventoGrupo,
  montarPayloadFormulario,
  enviarWebhookGoogleDocs,
  iniciarFormularioEvento,
  processarRespostaFormulario,
  notificarTesouraria,
  formatarJidWhatsApp,
  salvarFormularioEvento,
  obterFormularioEvento,
  extrairDataIso,
  temConteudoRelevante,
};
