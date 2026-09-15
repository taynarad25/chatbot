const WEBHOOK_GOOGLE_DOCS_URL =
  process.env.WEBHOOK_GOOGLE_DOCS_URL ||
  "https://script.google.com/macros/s/AKfycbxUafGASn73Xvj77v_hzy7A3EzGXCwpEz7S1fzM1KMgFwXM4-HrUn3-VVzM6kjW6yeu6A/exec";

const PERGUNTAS_FORMULARIO = [
  {
    id: "nome_lider",
    campoDoc: "nome_lider",
    pergunta: "👤 *Nome do líder responsável:*\nQual é o nome do líder responsável pelo evento?",
  },
  {
    id: "nome_evento",
    campoDoc: "nome_evento",
    pergunta: "📅 *Nome do Evento:*\nQual é o nome oficial do evento?",
    devePular: (dadosIniciais) =>
      Boolean(
        dadosIniciais.evento &&
          !dadosIniciais.evento.startsWith("Reunião de") &&
          !dadosIniciais.evento.startsWith("Reunião ")
      ),
  },
  {
    id: "publico",
    campoDoc: "publico",
    pergunta: "🎯 *Público-Alvo:*\nQual é o público-alvo do evento? (Ex: Jovens, Mulheres, Crianças, Toda a Igreja)",
  },
  {
    id: "valor",
    campoDoc: "valor",
    pergunta: "💰 *Valor (se houver):*\nHaverá cobrança de valor ou inscrição? Se sim, qual o valor? (Ou responda *Gratuito* / *Não*)",
  },
  {
    id: "tema",
    campoDoc: "tema",
    pergunta: "✨ *Tema Oficial:*\nQual é o tema oficial do evento? (Ou responda *Nenhum* / *A definir*)",
  },
  {
    id: "versiculo",
    campoDoc: "versiculo",
    pergunta: "📖 *Versículo Base (se houver):*\nQual é o versículo base do evento? (Ou responda *Nenhum* / *Não*)",
  },
  {
    id: "paleta",
    campoDoc: "paleta",
    pergunta: "🎨 *Paleta de Cores:*\nQuais são as cores da identidade visual do evento? (Ex: Azul, branco e dourado / ou *A definir*)",
  },
  {
    id: "estilo",
    campoDoc: "estilo",
    pergunta: "🖼️ *Estilo Visual:*\nQual é o estilo visual desejado? (Ex: *jovem*, *elegante*, *minimalista*, *vibrante* ou outro)",
  },
  {
    id: "responsavel_geral",
    campoDoc: "responsavel_geral",
    pergunta: "👔 *Responsável Geral:*\nQuem será o responsável geral pela coordenação no dia do evento?",
  },
  {
    id: "convidado",
    campoDoc: "convidado",
    pergunta: "🎤 *Convidado (banda, pregador)?*\nHaverá algum convidado especial (banda, pregador, cantor)? Se sim, quem? (Ou responda *Não*)",
  },
  {
    id: "louvor",
    campoDoc: "louvor",
    pergunta: "🎵 *Louvor definido?*\nO louvor já está definido (equipe/repertório)? (Ex: Sim / Não / A definir)",
  },
  {
    id: "decoracao",
    campoDoc: "decoracao",
    pergunta: "🎈 *Decoração:*\nComo será a decoração ou quem ficará responsável? (Ou responda *Nenhuma* / *Simples*)",
  },
  {
    id: "alimentacao",
    campoDoc: "alimentacao",
    pergunta: "☕ *Alimentação:*\nHaverá alimentação (lanche, coffee break, almoço)? Se sim, descreva brevemente (ou responda *Não*)",
  },
  {
    id: "equipe",
    campoDoc: "equipe",
    pergunta: "👥 *Equipe (pré, durante e pós-evento):*\nComo está dividida a equipe de apoio (montagem pré-evento, durante e limpeza pós-evento)?",
  },
  {
    id: "materiais",
    campoDoc: "materiais",
    pergunta: "📦 *Materiais necessários:*\nQuais materiais e equipamentos serão necessários? (Ex: Projetor, microfones, mesas / ou responda *Nenhum*)",
  },
  {
    id: "cronograma",
    campoDoc: "cronograma",
    pergunta: "⏱️ *Cronograma do evento:*\nQual é o cronograma previsto do evento? (Ex: 19h Abertura, 19h30 Louvor, 20h Palavra, 21h Término)",
  },
  {
    id: "observacoes",
    campoDoc: "observacoes",
    pergunta: "📝 *Observações:*\nAlguma observação, detalhe extra ou necessidade especial? (Ou responda *Nenhuma*)",
  },
  {
    id: "objetivo_espiritual",
    campoDoc: "objetivo_espiritual",
    pergunta: "🙏 *Objetivo espiritual:*\nQual é o objetivo espiritual principal deste evento?",
  },
  {
    id: "resultado_esperado",
    campoDoc: "resultado_esperado",
    pergunta: "🎯 *Resultado esperado:*\nQual é o resultado esperado com este evento (impacto, vidas alcançadas, conversões)?",
  },
];

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
    departamento: dadosIniciais.rede || dadosIniciais.departamento || "",
    evento: dadosIniciais.evento || "",
    local: dadosIniciais.local || "",
    data: dataFormatada,
    horarioInicio: dadosIniciais.horarioInicio || "",
    horarioFim: dadosIniciais.horarioFim || "",
  };
}

async function iniciarFormularioEvento({ etapas, solicitanteId, dadosIniciais, client }) {
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

  const primeiraPergunta = perguntasFiltradas[0];
  const total = perguntasFiltradas.length;

  const intro =
    `📝 *FORMULÁRIO INTERNO DO EVENTO*\n\n` +
    `Para alinhamento completo com a secretaria e diretoria, vamos preencher os detalhes restantes do evento.\n\n` +
    `📌 *Informações já salvas:*\n` +
    `• *Departamento:* ${dados.departamento}\n` +
    `• *Data:* ${dados.data}\n` +
    `• *Horário:* ${dados.horarioInicio} às ${dados.horarioFim}\n` +
    `• *Local:* ${dados.local}` +
    (dados.evento && !dados.evento.startsWith("Reunião") ? `\n• *Evento:* ${dados.evento}` : "") +
    `\n\n_Esses dados não precisam ser informados novamente._\n` +
    `_(Você pode digitar *menu* a qualquer momento para cancelar)_\n\n` +
    `---\n📋 *[1/${total}]* ${primeiraPergunta.pergunta}`;

  await client.sendMessage(solicitanteId, intro);
}

async function processarRespostaFormulario({
  msg,
  numero,
  info,
  client,
  notificarSecretaria,
  etapas,
  enviarWebhook = enviarWebhookGoogleDocs,
}) {
  const perguntaAtual = info.perguntas[info.indicePergunta];
  if (!perguntaAtual) {
    delete etapas[numero];
    return msg.reply("❌ Ocorreu um erro no preenchimento. Digite *menu* para reiniciar.");
  }

  const respostaTexto = (msg.body || "").trim();
  info.respostas[perguntaAtual.id] = respostaTexto;
  info.indicePergunta++;

  if (info.indicePergunta < info.perguntas.length) {
    const proxima = info.perguntas[info.indicePergunta];
    const progresso = `📋 *[${info.indicePergunta + 1}/${info.perguntas.length}]*`;
    return msg.reply(`${progresso} ${proxima.pergunta}`);
  }

  // Última pergunta respondida: consolida e dispara Webhook
  await msg.reply("⏳ *Obrigado pelas respostas!*\nGerando o documento oficial no Google Docs e notificando a secretaria, por favor aguarde um momento...");

  const { dadosIniciais, respostas } = info;
  const payload = {
    nome_lider: respostas.nome_lider || "",
    departamento: dadosIniciais.departamento || "",
    nome_evento: respostas.nome_evento || dadosIniciais.evento || "",
    data: dadosIniciais.data || "",
    horario_inicio: dadosIniciais.horarioInicio || "",
    horario_termino: dadosIniciais.horarioFim || "",
    local: dadosIniciais.local || "",
    publico: respostas.publico || "",
    valor: respostas.valor || "",
    tema: respostas.tema || "",
    versiculo: respostas.versiculo || "",
    paleta: respostas.paleta || "",
    estilo: respostas.estilo || "",
    responsavel_geral: respostas.responsavel_geral || "",
    convidado: respostas.convidado || "",
    louvor: respostas.louvor || "",
    decoracao: respostas.decoracao || "",
    alimentacao: respostas.alimentacao || "",
    equipe: respostas.equipe || "",
    materiais: respostas.materiais || "",
    cronograma: respostas.cronograma || "",
    observacoes: respostas.observacoes || "",
    objetivo_espiritual: respostas.objetivo_espiritual || "",
    resultado_esperado: respostas.resultado_esperado || "",
  };

  try {
    const resultado = await enviarWebhook(payload);
    const linkDoc = resultado.url;

    const confirmacaoLider =
      `✅ *Formulário do Evento Concluído com Sucesso!*\n\n` +
      `O documento oficial do evento foi gerado automaticamente no Google Docs:\n` +
      `🔗 *Acesse o documento gerado:*\n${linkDoc}\n\n` +
      `A secretaria já foi notificada com o link do documento gerado. 🙏\n\n` +
      `Digite *menu* para voltar ao menu principal.`;

    await msg.reply(confirmacaoLider);

    const notificacaoGrupo =
      `📋 *FORMULÁRIO DE EVENTO PREENCHIDO*\n\n` +
      `👤 *Líder:* ${payload.nome_lider}\n` +
      `📅 *Evento:* ${payload.nome_evento}\n` +
      `🏢 *Depto:* ${payload.departamento}\n` +
      `📆 *Data:* ${payload.data}\n` +
      `⏰ *Horário:* ${payload.horario_inicio} às ${payload.horario_termino}\n` +
      `📍 *Local:* ${payload.local}\n\n` +
      `📄 *Documento Oficial Gerado (Google Docs):*\n${linkDoc}`;

    await notificarSecretaria(client, notificacaoGrupo);
    console.log(`[Formulário Evento] Concluído com sucesso para ${numero}. Documento: ${linkDoc}`);
  } catch (err) {
    console.error("[ALERTA:secretaria] Erro ao enviar formulário para o Webhook do Google Docs:", err);
    await msg.reply(
      "⚠️ Suas respostas foram salvas, mas houve uma instabilidade momentânea ao gerar o Google Docs. A secretaria já foi avisada.\n\nDigite *menu* para voltar ao menu principal."
    );

    const resumoGrupoFalha =
      `⚠️ *FORMULÁRIO DE EVENTO PREENCHIDO (FALHA NO GOOGLE DOCS)*\n\n` +
      `O líder preencheu o formulário, mas houve uma falha ao gerar o documento via Google Apps Script.\n` +
      `Erro: ${err.message}\n\n` +
      `👤 *Líder:* ${payload.nome_lider}\n` +
      `📅 *Evento:* ${payload.nome_evento}\n` +
      `🏢 *Depto:* ${payload.departamento}\n` +
      `📆 *Data:* ${payload.data}\n` +
      `⏰ *Horário:* ${payload.horario_inicio} às ${payload.horario_termino}\n` +
      `📍 *Local:* ${payload.local}`;

    try {
      await notificarSecretaria(client, resumoGrupoFalha);
    } catch (notifErr) {
      console.error("[ALERTA:secretaria] Erro ao notificar secretaria da falha:", notifErr);
    }
  } finally {
    delete etapas[numero];
  }
}

module.exports = {
  WEBHOOK_GOOGLE_DOCS_URL,
  PERGUNTAS_FORMULARIO,
  normalizarDadosIniciais,
  enviarWebhookGoogleDocs,
  iniciarFormularioEvento,
  processarRespostaFormulario,
};
