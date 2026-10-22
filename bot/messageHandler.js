const fs = require("fs");
const db = require("../db");
let MessageMedia;
try {
  MessageMedia = require("whatsapp-web.js").MessageMedia;
} catch {
  MessageMedia = null;
}
const moment = require("moment-timezone");
const {
  agruparEventosAgenda,
  montarMensagemAgenda,
  montarMensagemAgendaCompletaPorSecoes,
  montarDetalheEvento,
  interpretarPeriodoPersonalizado,
  isEventoFuturo,
  ehEventoPreparacaoLimpeza,
  obterLinkInscricaoEvento,
  extrairNomeBaseEvento,
  agruparEventosPorNomeBase,
} = require("./agenda");
const {
  interpretarMesesRecorrencia,
  interpretarDiaSemana,
  gerarDatasRecorrentes,
  removerDatasRecorrentes,
  formatarListaDatasInterativa,
  NOMES_DIAS_SEMANA,
} = require("./recorrencia");
const {
  calcularDisponibilidade,
  montarMensagemConflito,
  montarMensagemDatasDisponiveis,
  verificarDataEspecifica,
  verificarConflitoCultoDomingo,
  calcularJanelasLivres,
  montarMensagemDataEspecificaBloqueada,
  consultarDisponibilidadeMesDiaSemana,
  formatarRelatorioDisponibilidade,
} = require("./disponibilidade");
const {
  REDES,
  montarListaRedes,
  montarListaRedesParaUsuario,
  obterRedesParaUsuario,
  obterRedeDaLista,
  obterRedePorNumero,
  mapearRedeParaAgendaIndex,
  isAgendaInterna,
  AGENDAS_INTERNAS,
} = require("./redes");
const { notificarSecretaria: notificarSecretariaDefault, notificarPastoral, notificarMultimidia, NOME_GRUPO_SECRETARIA, NOME_GRUPO_PASTORAL, NOME_GRUPO_MULTIMIDIA, atualizarCacheGrupo, obterJidCached } = require("./secretaria");
const { executarBroadcast, BROADCAST_CONFIG } = require("./broadcast");
const { baixarMidiaComRetry } = require("./mediaStorage");
const { montarResourceEvento, montarResourcesMultiplosBlocos, montarResourcePatchAlteracao } = require("./agendamentoAutomatico");
const { gerarDescricaoEvento, salvarDescricaoEvento, buscarDescricaoEvento } = require("./descricaoEvento");
const { salvarPendente, buscarPendente, buscarPendentePorPastor, atualizarPendente, removerPendente, extrairCodigo } = require("./pendentesAprovacao");
const {
  registrarAgendamentoPastoral,
  buscarPastorAgendamento,
  buscarLembreteAguardandoResposta,
  removerLembreteAguardandoResposta,
  formatarDataBrasil,
  extrairItensADefinirFormulario,
  REGEX_A_DEFINIR,
} = require("./lembretes");
const {
  iniciarFormularioEvento,
  processarRespostaFormulario,
  enviarWebhookGoogleDocs,
  notificarTesouraria,
  CONTATO_TESOURARIA,
  precisaDeValorDoMinisterio,
  salvarFormularioEvento,
  obterFormularioEvento,
} = require("./formularioEvento");
const {
  WEBHOOK_EVENTOS_EXTERNOS_URL,
  AGENDA_INDEX_EVENTOS_EXTERNOS,
  AGENDA_INDEX_USO_SALAO,
  TERMO_RESPONSABILIDADE_EVENTO_EXTERNO,
  montarPayloadEventoExterno,
  enviarWebhookGoogleDocsExternos,
} = require("./eventosExternos");
const {
  iniciarFluxoConsultaInscricoes,
  processarFluxoConsultaInscricoes,
} = require("./consultaInscricoes");

// Cada "átomo" é uma saudação isolada reconhecida. A mensagem inteira precisa ser só
// uma sequência desses átomos (separados por vírgula/ponto/"e"/espaço) pra contar como
// saudação — assim "Oi, boa tarde" ou "boa tarde a paz" ainda ativam o menu, mas "a paz,
// boa tarde. vou no ensaio hoje" não ativa, porque sobra texto que não é saudação.
const SAUDACAO_ATOM = String.raw`(?:oi+|ol[aá]+|olla+|a\s+paz\s+do\s+senhor|paz\s+do\s+senhor|a\s+paz+|paz+|bom\s+dia|boa\s+tarde|boa\s+noite|dia+|menu)`;
const SAUDACAO_SEPARADOR = String.raw`(?:\s*[,.!]*\s*(?:e\s+)?)`;
const SAUDACOES_REGEX = new RegExp(`^${SAUDACAO_SEPARADOR}${SAUDACAO_ATOM}(?:${SAUDACAO_SEPARADOR}${SAUDACAO_ATOM})*${SAUDACAO_SEPARADOR}$`, "i");
const HORARIO_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
const DATA_REGEX = /^([0-2]?[0-9]|3[01])\/(0?[1-9]|1[0-2])$/;
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const ENDERECO_IGREJA = "Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi";
const LOCAL_IGREJA_REGEX = /\bigreja\b|\btemplo\b|\bsal[aã]o\b/i;

function nomeContato(contato, numero) {
  return contato.pushname || contato.name || numero;
}

const CAMINHO_PDF_ATA = process.env.PDF_ATA_REUNIAO || "C:/Users/gabri/OneDrive/Documentos/Curados/Diretoria/Secretaria/Reuniões/Ata de Reunião - Curados.pdf";
const LINK_ATA_REUNIAO = "https://1drv.ms/b/c/2d13c458375b7950/IQD3kz6HjqElS6cehhlxZDlTAUVGcFL68r82pCsyE_y7qI0";

function formatarTituloReuniao(departamento) {
  const depto = (departamento || "").trim();
  if (/^de\s+/i.test(depto)) {
    return `Reunião ${depto}`;
  }
  return `Reunião de ${depto}`;
}

function resolverOpcaoLocalReuniao(texto) {
  const t = (texto || "").trim().toLowerCase();
  if (t === "1" || /^(?:1\s*[-–]\s*)?(?:na\s+igreja|igreja|no\s+templo|templo)$/i.test(t)) {
    return ENDERECO_IGREJA;
  }
  if (t === "2" || /^(?:2\s*[-–]\s*)?(?:online|on-line)$/i.test(t)) {
    return "Online";
  }
  return null;
}

function interpretarDataReuniao(texto) {
  if (!texto) return null;
  const t = texto.trim();
  const m = t.match(/^([0-2]?[0-9]|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?$/);
  if (!m) return null;
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  const agora = moment().tz("America/Sao_Paulo");
  let ano = m[3] ? parseInt(m[3], 10) : agora.year();

  const dataMoment = moment.tz(`${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`, "YYYY-MM-DD", "America/Sao_Paulo");
  if (!dataMoment.isValid() || dataMoment.date() !== dia || dataMoment.month() + 1 !== mes) {
    return null;
  }

  if (!m[3] && dataMoment.isBefore(agora.clone().startOf("day"))) {
    ano += 1;
  }

  return { dia, mes, ano, formatada: `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}` };
}

function normalizarHorarioReuniao(texto) {
  if (!texto) return null;
  const t = texto.trim().toLowerCase().replace(/\s+/g, "");
  const m = t.match(/^([01]?[0-9]|2[0-3])(?:[:h]([0-5][0-9]))?h?$/);
  if (!m) return null;
  const horas = m[1].padStart(2, "0");
  const minutos = m[2] ? m[2].padStart(2, "0") : "00";
  return `${horas}:${minutos}`;
}

async function enviarConfirmacaoReuniaoComAta(client, solicitanteId, feedback) {
  if (MessageMedia && fs.existsSync(CAMINHO_PDF_ATA)) {
    try {
      const media = MessageMedia.fromFilePath(CAMINHO_PDF_ATA);
      await client.sendMessage(solicitanteId, media, { caption: feedback });
      console.log(`[Reuniões] Confirmação com PDF da ata enviada para ${mascararTelefone(solicitanteId)}`);
      return;
    } catch (errPdf) {
      console.error("[Reuniões] Erro ao carregar/enviar PDF da ata de reunião:", errPdf);
    }
  }
  await client.sendMessage(solicitanteId, feedback);
  console.log(`[Reuniões] Confirmação em texto enviada para ${mascararTelefone(solicitanteId)}`);
}

// Se o líder disser que o evento é "na igreja"/"no templo"/"no salão", assume o
// endereço oficial. Qualquer outro texto é usado como o endereço informado
// (ex: a casa de alguém).
function resolverLocalEvento(texto) {
  const informado = (texto || "").trim();
  return LOCAL_IGREJA_REGEX.test(informado) ? ENDERECO_IGREJA : informado;
}

// Mascara o número de telefone para uso em logs, preservando apenas o DDI, o DDD
// e os 4 últimos dígitos (ex: "5511987654321@c.us" -> "+55 (11) *****-4321").
function mascararTelefone(numero) {
  const digitos = String(numero).replace(/\D/g, "");
  if (digitos.length < 8) return numero;

  const ddi = digitos.slice(0, 2);
  const ddd = digitos.slice(2, 4);
  const resto = digitos.slice(4);
  const ultimosQuatro = resto.slice(-4);
  const mascara = "*".repeat(Math.max(resto.length - 4, 0));

  return `+${ddi} (${ddd}) ${mascara}-${ultimosQuatro}`;
}

// Divide o texto de dia/horário em duas partes: dia e horário (ex: "segunda as 19h" -> dia: "segunda", horario: "19h")
function dividirDiaEHorario(texto) {
  if (!texto) return { dia: "", horario: "" };
  const textoLimpo = texto.trim();

  // Tenta separar usando conectivos comuns como " às ", " as ", " das ", " de ", " a ", " @ ", " - " ou ","
  // seguidos por uma hora (número inicial)
  const matchComSeparador = textoLimpo.match(/^(.*?)\s*(?:\s(?:às|as|das|de|a|@|-|para\s+as|para\s+às)\s+|\s*,\s*|\s+às\s+|\s+as\s+)(\d{1,2}(?:[hH\.:\s]|$).*)$/i);
  if (matchComSeparador) {
    return {
      dia: matchComSeparador[1].trim(),
      horario: matchComSeparador[2].trim()
    };
  }

  // Se não encontrar o separador explícito, mas achar uma hora no final (ex: "segunda-feira 19h" ou "segunda 19:30")
  const matchHoraFinal = textoLimpo.match(/^(.*)\s+(\d{1,2}(?:[:h]\d{2})?(?:\s*(?:horas?|hrs?|hs|min|h))?)$/i);
  if (matchHoraFinal) {
    return {
      dia: matchHoraFinal[1].trim(),
      horario: matchHoraFinal[2].trim()
    };
  }

  // Caso contrário, assume tudo como dia e deixa o horário vazio
  return {
    dia: textoLimpo,
    horario: ""
  };
}

// Formata a disponibilidade para mensagens negativas de forma natural
function formatarDisponibilidadeNegativa(disp) {
  if (!disp) return "";
  const limpo = disp.trim();
  const lower = limpo.toLowerCase();

  if (lower.startsWith("no ") || lower.startsWith("na ") || lower.startsWith("em ") || lower.startsWith("para ") || lower.startsWith("às ") || lower.startsWith("as ")) {
    return limpo;
  }

  if (lower.startsWith("segunda") || lower.startsWith("terça") || lower.startsWith("quarta") || lower.startsWith("quinta") || lower.startsWith("sexta")) {
    return `na ${limpo}`;
  }

  if (lower.startsWith("sábado") || lower.startsWith("sabado") || lower.startsWith("domingo")) {
    return `no ${limpo}`;
  }

  return `em ${limpo}`;
}

function extrairOuValidarData(texto, mesFallback, anoFallback) {
  if (!texto) return null;
  const t = texto.trim();
  const partes = t.split("/");
  if (partes.length === 1) {
    const dia = parseInt(partes[0], 10);
    if (isNaN(dia) || dia < 1 || dia > 31) return null;
    const m = moment.tz(`${dia}/${mesFallback}/${anoFallback}`, "D/M/YYYY", "America/Sao_Paulo");
    return m.isValid() && m.date() === dia ? m : null;
  }
  if (partes.length === 2) {
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10);
    if (isNaN(dia) || isNaN(mes)) return null;
    const m = moment.tz(`${dia}/${mes}/${anoFallback}`, "D/M/YYYY", "America/Sao_Paulo");
    return m.isValid() ? m : null;
  }
  if (partes.length === 3) {
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10);
    const ano = parseInt(partes[2], 10);
    if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return null;
    const m = moment.tz(`${dia}/${mes}/${ano}`, "D/M/YYYY", "America/Sao_Paulo");
    return m.isValid() ? m : null;
  }
  return null;
}

// Capitaliza a primeira letra de cada palavra em um nome
function capitalizarNome(nome) {
  if (!nome) return "";
  return nome.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// Monta a identificação padrão usada nos logs: nome do contato + telefone
// mascarado + papel do usuário (ex: "Taynara Diniz | +55 (11) *****-6727 (Líder, Pastor)").
function identificarUsuario(contato, numero, isLider, usuario = null) {
  let papel = isLider ? "Líder" : "Usuário";
  if (usuario && Array.isArray(usuario.cargos) && usuario.cargos.length > 0) {
    papel = usuario.cargos
      .map((c) => {
        const lower = String(c).toLowerCase().trim();
        if (lower === "lider") return "Líder";
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(", ");
  }
  return `${nomeContato(contato, numero)} | ${mascararTelefone(numero)} (${papel})`;
}

function temPermissao(usuario, permissao) {
  if (!usuario || !Array.isArray(usuario.cargos)) return false;
  return usuario.cargos.includes(String(permissao || "").toLowerCase().trim());
}

// msg.getChat() (assim como outras chamadas do whatsapp-web.js que avaliam JS dentro
// da página do WhatsApp Web via Puppeteer) falha esporadicamente por um soluço passageiro
// da sessão — sem relação com a mensagem em si. Tenta de novo uma vez, com uma pequena
// espera, antes de desistir e deixar a mensagem cair no catch de erro fatal.
async function comRetry(fn, { tentativas = 2, esperaMs = 1500 } = {}) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      if (i < tentativas - 1) await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
  throw ultimoErro;
}

async function processarFluxoInscricaoMulheres({
  msg,
  numero,
  info,
  client,
  etapas,
  fetchFn = global.fetch,
}) {
  const texto = (msg.body || "").trim();

  if (!info.dados) {
    info.dados = {};
  }

  // 1. Nome completo
  if (info.etapa === "coletar_nome") {
    if (!texto || texto.length < 3) {
      return msg.reply("❌ Por favor, digite o seu *nome completo*:");
    }
    info.dados.nome = texto;
    info.etapa = "coletar_email";
    return msg.reply(
      `✨ Prazer, *${info.dados.nome}*!\n\n` +
      `2️⃣ Agora, por favor, informe o seu *e-mail*:`
    );
  }

  // 2. E-mail
  if (info.etapa === "coletar_email") {
    const emailLimpo = texto.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      return msg.reply(
        "❌ Formato de e-mail inválido.\n\n" +
        "Por favor, digite um e-mail válido (ex: seuemail@gmail.com):"
      );
    }
    info.dados.email = emailLimpo;
    info.etapa = "coletar_telefone";
    return msg.reply(
      `📱 3️⃣ Para concluir, informe o seu *telefone para contato* (com DDD):\n\n` +
      `(Ex: 11999998888)`
    );
  }

  // 3. Telefone para contato
  if (info.etapa === "coletar_telefone") {
    const telDigitos = texto.replace(/\D/g, "");
    if (!telDigitos || telDigitos.length < 10) {
      return msg.reply(
        "❌ Telefone inválido.\n\n" +
        "Por favor, informe seu telefone com DDD (mínimo de 10 dígitos, ex: 11999998888):"
      );
    }
    info.dados.telefone = telDigitos;

    await msg.reply("⏳ Processando sua inscrição, aguarde só um instante...");

    const {
      enviarInscricaoPlanilhaMulheres,
      salvarInscricaoMulheres,
      montarMensagemConfirmacaoMulheres,
    } = require("../web/culto_mulheres");

    const resultado = await enviarInscricaoPlanilhaMulheres({
      nome: info.dados.nome,
      email: info.dados.email,
      telefone: info.dados.telefone,
      fetchFn,
    });

    if (resultado && resultado.ja_inscrito) {
      delete etapas[numero];
      return msg.reply(
        `⚠️ *Aviso de Inscrição*\n\n` +
        `O e-mail *${info.dados.email}* já está inscrito para o *Culto de Mulheres: O Vaso e o Oleiro*!\n\n` +
        `Se precisar de suporte, procure a secretaria da igreja ou a liderança da Rede de Mulheres.\n\n` +
        `Digite *menu* para voltar ao menu principal.`
      );
    }

    // Sucesso
    try {
      salvarInscricaoMulheres({
        nome: info.dados.nome,
        email: info.dados.email,
        telefone: info.dados.telefone,
        whatsappConfirmacaoEnviado: 1,
      });
    } catch (dbErr) {
      console.warn("[Culto Mulheres] Aviso ao salvar no banco local:", dbErr.message);
    }

    delete etapas[numero];
    const confirmacaoMsg = montarMensagemConfirmacaoMulheres({ nome: info.dados.nome });
    return msg.reply(confirmacaoMsg);
  }
}

async function processarRespostaEventoExterno({
  msg,
  numero,
  info,
  client,
  notificarSecretaria,
  etapas,
  usuario,
  contato,
}) {
  const texto = (msg.body || "").trim();

  if (info.etapa === "evento_externo_nome") {
    if (!texto) {
      return msg.reply("❌ Por favor, digite o *nome do evento*:");
    }
    info.nomeEvento = texto;
    info.etapa = "evento_externo_data_horario";
    return msg.reply(
      "📅 2️⃣ Qual é a *data e horário* do evento?\n\n" +
      "(Ex: 25/10 das 19:00 às 22:00, ou 25/10/2026 às 19h)"
    );
  }

  if (info.etapa === "evento_externo_data_horario") {
    if (!texto) {
      return msg.reply("❌ Por favor, informe a *data e horário* do evento:");
    }
    info.dataHorarioTexto = texto;

    const matchData = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (matchData) {
      const dia = parseInt(matchData[1], 10);
      const mes = parseInt(matchData[2], 10);
      const ano = matchData[3]
        ? (matchData[3].length === 2 ? 2000 + parseInt(matchData[3], 10) : parseInt(matchData[3], 10))
        : moment.tz("America/Sao_Paulo").year();
      info.dia = dia;
      info.mes = mes;
      info.ano = ano;
      info.dataFormatada = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
    }

    info.etapa = "evento_externo_local";
    return msg.reply(
      "📍 3️⃣ Qual é o *local* do evento?\n\n" +
      "(Digite o endereço completo ou informe se será na igreja/templo)"
    );
  }

  if (info.etapa === "evento_externo_local") {
    if (!texto) {
      return msg.reply("❌ Por favor, informe o *local* do evento:");
    }
    info.local = resolverLocalEvento(texto);
    info.etapa = "evento_externo_valores";
    return msg.reply(
      "💰 4️⃣ *Haverá entrada de valores ou repasse para o ministério?*\n\n" +
      "(Informe se haverá cobrança de inscrição, taxa, venda ou repasse, e qual o valor/descrição. Se não houver, responda *Não*)"
    );
  }

  if (info.etapa === "evento_externo_valores") {
    if (!texto) {
      return msg.reply("❌ Por favor, informe sobre a entrada de valores/repasse ou responda *Não*:");
    }
    info.valores = texto;
    info.etapa = "evento_externo_precisa_salao";
    return msg.reply(
      "🏛️ 5️⃣ *Vai precisar do salão antes do evento?*\n" +
      "(Ex: no dia anterior ou horas antes para montagem/decoração)\n\n" +
      "Digite *Sim* ou *Não*:"
    );
  }

  if (info.etapa === "evento_externo_precisa_salao") {
    const r = texto.toLowerCase();
    if (/^(sim|s|precisa|com certeza|positivo|vamos)/i.test(r)) {
      info.precisaSalaoAntes = true;
      info.etapa = "evento_externo_salao_detalhes";
      return msg.reply(
        "⏰ Em qual data e horário vai precisar do salão antes do evento para montagem/decoração?\n\n" +
        "(Ex: 24/10 das 14:00 às 18:00, ou no mesmo dia das 15h às 18h)"
      );
    }
    if (/^(n[aã]o|n|nenhum|nao precisa)/i.test(r)) {
      info.precisaSalaoAntes = false;
      info.salaoDetalhes = "Não";
      info.etapa = "evento_externo_termo";
      return msg.reply(TERMO_RESPONSABILIDADE_EVENTO_EXTERNO);
    }
    return msg.reply("❌ Por favor, responda *Sim* ou *Não*: vai precisar do salão antes do evento?");
  }

  if (info.etapa === "evento_externo_salao_detalhes") {
    if (!texto) {
      return msg.reply("❌ Por favor, informe quando precisará do salão antes do evento:");
    }
    info.salaoDetalhes = texto;
    info.etapa = "evento_externo_termo";
    return msg.reply(TERMO_RESPONSABILIDADE_EVENTO_EXTERNO);
  }

  if (info.etapa === "evento_externo_termo") {
    const concorda = /^(sim|s|concordo|aceito|afirmativo)$/i.test(texto);
    if (!concorda) {
      return msg.reply(
        "❌ Para solicitar o agendamento de um evento externo, é necessário aceitar o termo de responsabilidade.\n\n" +
        "Digite *SIM* para concordar e continuar, ou *menu* para cancelar."
      );
    }
    info.termoAceito = true;
    info.etapa = "evento_externo_observacoes";
    return msg.reply("📝 7️⃣ *Observações adicionais:*\n\nAlguma observação, detalhe extra ou necessidade técnica? (Ou responda *Nenhuma*)");
  }

  if (info.etapa === "evento_externo_observacoes") {
    info.observacoes = texto || "Nenhuma";

    const nomeSol = usuario?.nome || (contato ? nomeContato(contato, numero) : "Responsável");
    const dadosEventoExterno = {
      tipo: "evento_externo",
      solicitanteId: numero,
      nomeSolicitante: nomeSol,
      nomeEvento: info.nomeEvento,
      dataHorarioTexto: info.dataHorarioTexto,
      dia: info.dia,
      mes: info.mes,
      ano: info.ano,
      dataFormatada: info.dataFormatada || info.dataHorarioTexto,
      local: info.local,
      valores: info.valores,
      precisaSalaoAntes: Boolean(info.precisaSalaoAntes),
      salaoDetalhes: info.salaoDetalhes || "Não",
      termoAceito: true,
      observacoes: info.observacoes,
    };

    try {
      const codigo = salvarPendente(dadosEventoExterno);
      const resumoGrupo =
        `🌐 *NOVA SOLICITAÇÃO DE EVENTO EXTERNO*\n\n` +
        `👤 *Responsável:* ${nomeSol} (${numero})\n` +
        `📅 *Evento:* ${dadosEventoExterno.nomeEvento}\n` +
        `📆 *Data e Horário:* ${dadosEventoExterno.dataHorarioTexto}\n` +
        `📍 *Local:* ${dadosEventoExterno.local}\n` +
        `💰 *Valores / Repasse:* ${dadosEventoExterno.valores}\n` +
        `🏛️ *Salão antes do evento:* ${dadosEventoExterno.precisaSalaoAntes ? dadosEventoExterno.salaoDetalhes : "Não"}\n` +
        `📜 *Termo de Responsabilidade:* Aceito\n` +
        `📝 *Observações:* ${dadosEventoExterno.observacoes}\n\n` +
        `_Responda a este resumo com "aprovar evento externo" ou "recusar evento externo" para confirmar._\n\n` +
        `_Código: ${codigo}_`;

      await notificarSecretaria(client, resumoGrupo);

      const resumoLider =
        `✅ *Solicitação de Evento Externo Registrada!*\n\n` +
        `• *Evento:* ${dadosEventoExterno.nomeEvento}\n` +
        `• *Data e Horário:* ${dadosEventoExterno.dataHorarioTexto}\n` +
        `• *Local:* ${dadosEventoExterno.local}\n` +
        `• *Valores / Repasse:* ${dadosEventoExterno.valores}\n` +
        `• *Salão antes:* ${dadosEventoExterno.precisaSalaoAntes ? dadosEventoExterno.salaoDetalhes : "Não"}\n` +
        `• *Termo:* Aceito\n` +
        `• *Observações:* ${dadosEventoExterno.observacoes}\n\n` +
        `Sua solicitação foi enviada para a secretaria para análise e confirmação. Assim que confirmada, o documento oficial será gerado e o link enviado aqui para você! 🙏\n\n` +
        `Digite *menu* para voltar ao menu principal.`;

      delete etapas[numero];
      return msg.reply(resumoLider);
    } catch (errSalvar) {
      console.error("[Evento Externo] Erro ao registrar pendente:", errSalvar);
      delete etapas[numero];
      return msg.reply("⚠️ Ocorreu um erro ao registrar sua solicitação. Tente novamente em instantes.");
    }
  }

  delete etapas[numero];
  return msg.reply("❌ Etapa desconhecida. Digite *menu* para reiniciar.");
}

const pendentesRetornoLembrete = new Map();

async function finalizarEnvioRetornoLembrete({
  telDigitos,
  info,
  nomeResp,
  tipoDesc,
  eventoNome,
  dataEv,
  infoHorario,
  numero,
  client,
  notificarSecretaria,
  etapas,
}) {
  const pend = pendentesRetornoLembrete.get(telDigitos);
  pendentesRetornoLembrete.delete(telDigitos);
  delete etapas[numero];
  delete etapas[telDigitos];
  delete etapas[`${telDigitos}@c.us`];
  delete etapas[`${telDigitos}@s.whatsapp.net`];
  removerLembreteAguardandoResposta(telDigitos);

  const textoCompleto = (pend?.textos || []).filter(Boolean).join("\n").trim();
  if (!textoCompleto) return;

  // Regra: NÃO enviar nenhuma mensagem ao líder dizendo que foi recebida ou confirmada.
  // Apenas notificar a secretaria com o retorno do líder!
  if (info.tipoLembrete !== "atendimento" && notificarSecretaria && typeof notificarSecretaria === "function") {
    const msgSec =
      `🔔 *Retorno do Líder sobre ${tipoDesc}*\n\n` +
      `👤 *Líder:* ${nomeResp} (${mascararTelefone(numero)})\n` +
      `📅 *${tipoDesc}:* ${eventoNome}\n` +
      `📆 *Data:* ${dataEv}${infoHorario}\n` +
      `💬 *Mensagem recebida:*\n"${textoCompleto}"\n\n` +
      `_Favor verificar com o líder e providenciar os alinhamentos ou ajustes necessários._`;
    try {
      await notificarSecretaria(client, msgSec);
    } catch (errSec) {
      console.error(`[Lembretes] Erro ao notificar secretaria sobre retorno do líder:`, errSec.message);
    }
  }
}

async function processarRetornoLembrete({
  msg,
  numero,
  info,
  client,
  notificarSecretaria,
  etapas,
  usuario,
  contato,
  tempoEsperaConfigurado = (process.env.NODE_ENV === "test" ? 0 : 3500),
}) {
  const telDigitos = String(numero).replace(/\D/g, "");
  const textoLimpo = (msg.body || "").trim();
  const textoLower = textoLimpo.toLowerCase();

  // Se o usuário digitou "menu", cancela o estado de lembrete e deixa exibir o menu
  if (textoLower === "menu" || textoLower === "sair" || textoLower === "cancelar") {
    if (pendentesRetornoLembrete.has(telDigitos)) {
      clearTimeout(pendentesRetornoLembrete.get(telDigitos).timer);
      pendentesRetornoLembrete.delete(telDigitos);
    }
    delete etapas[numero];
    delete etapas[telDigitos];
    removerLembreteAguardandoResposta(telDigitos);
    return null;
  }

  const nomeResp = usuario?.nome || info.destinatarioNome || nomeContato(contato, numero);
  const tipoDesc = info.tipoLembrete === "atendimento"
    ? "Atendimento Pastoral"
    : (info.tipoLembrete === "reuniao" ? "Reunião" : (info.tipoLembrete === "itens_a_definir" ? "Itens a Definir" : "Evento"));
  const eventoNome = info.eventoNome || "Evento";
  const dataEv = info.dataEvento || "";
  const infoHorario = info.horarioEvento ? ` às ${info.horarioEvento}` : "";

  // Confirmação de atendimento pastoral (pastor no privado)
  if (info.tipoLembrete === "atendimento") {
    delete etapas[numero];
    delete etapas[telDigitos];
    removerLembreteAguardandoResposta(telDigitos);
    await msg.reply(`✅ *Atendimento Pastoral Confirmado!*\n\nObrigado pelo retorno, Pastor! A confirmação do atendimento foi registrada com sucesso. 🙏`);
    return;
  }

  // Para eventos e reuniões de líderes:
  // NÃO responder ao líder com nenhuma mensagem dizendo que foi recebida ou confirmada.
  // Agrupa mensagens consecutivas enviadas pelo líder dentro do tempo de espera e notifica a secretaria!
  if (pendentesRetornoLembrete.has(telDigitos)) {
    const pend = pendentesRetornoLembrete.get(telDigitos);
    if (pend.timer) clearTimeout(pend.timer);
    pend.textos.push(textoLimpo);

    if (tempoEsperaConfigurado > 0) {
      pend.timer = setTimeout(async () => {
        await finalizarEnvioRetornoLembrete({
          telDigitos,
          info,
          nomeResp,
          tipoDesc,
          eventoNome,
          dataEv,
          infoHorario,
          numero,
          client,
          notificarSecretaria,
          etapas,
        });
      }, tempoEsperaConfigurado);
      return;
    }
  }

  const pendenteInfo = {
    textos: [textoLimpo],
    timer: null,
  };

  if (tempoEsperaConfigurado > 0) {
    pendenteInfo.timer = setTimeout(async () => {
      await finalizarEnvioRetornoLembrete({
        telDigitos,
        info,
        nomeResp,
        tipoDesc,
        eventoNome,
        dataEv,
        infoHorario,
        numero,
        client,
        notificarSecretaria,
        etapas,
      });
    }, tempoEsperaConfigurado);
    pendentesRetornoLembrete.set(telDigitos, pendenteInfo);
    return;
  }

  // Execução imediata (tempoEsperaConfigurado <= 0)
  pendentesRetornoLembrete.set(telDigitos, pendenteInfo);
  await finalizarEnvioRetornoLembrete({
    telDigitos,
    info,
    nomeResp,
    tipoDesc,
    eventoNome,
    dataEv,
    infoHorario,
    numero,
    client,
    notificarSecretaria,
    etapas,
  });
}

function formatarDetalhesFichaEvento(formRow) {
  if (!formRow) return "Ficha não encontrada.";
  let payload = {};
  if (typeof formRow.payload === "string") {
    try {
      payload = JSON.parse(formRow.payload);
    } catch {}
  } else if (typeof formRow.payload === "object" && formRow.payload !== null) {
    payload = formRow.payload;
  }

  const dataFmt = formatarDataBrasil(formRow.data || payload.data);
  let txt = `📄 *Ficha do Evento: ${formRow.evento}*\n\n`;
  if (formRow.departamento || payload.departamento) {
    txt += `🏢 *Departamento/Ministério:* ${formRow.departamento || payload.departamento}\n`;
  }
  if (dataFmt) {
    txt += `📆 *Data:* ${dataFmt}\n`;
  }
  const hInicio = payload.horario_inicio || payload.horario_inicio_termino || "";
  const hFim = payload.horario_termino || "";
  if (hInicio || hFim) {
    txt += `⏰ *Horário:* ${hInicio}${hFim ? " às " + hFim : ""}\n`;
  }
  if (payload.local) {
    txt += `📍 *Local:* ${payload.local}\n`;
  }
  const lider = payload.nome_lider || payload.nomeSolicitante || "";
  if (lider) {
    txt += `👤 *Líder Responsável:* ${lider}\n`;
  }
  if (payload.horario_total && !/^(não|nao|nenhum|nenhuma|nada)$/i.test(String(payload.horario_total).trim())) {
    txt += `🧹 *Preparação/Limpeza:* ${payload.horario_total}\n`;
  }

  // Itens a definir destacados
  const itensADefinir = extrairItensADefinirFormulario(payload);
  if (itensADefinir.length > 0) {
    txt += `\n⚠️ *Itens a Definir / Decidir:*\n`;
    for (const it of itensADefinir) {
      txt += `• *${it.campo}:* _${it.valor}_\n`;
    }
  }

  // Demais detalhes preenchidos
  const detalhes = [];
  if (payload.tema && !REGEX_A_DEFINIR.test(payload.tema)) detalhes.push(`• *Tema:* ${payload.tema}`);
  if (payload.versiculo && !REGEX_A_DEFINIR.test(payload.versiculo)) detalhes.push(`• *Versículo:* ${payload.versiculo}`);
  if (payload.preletor && !REGEX_A_DEFINIR.test(payload.preletor)) detalhes.push(`• *Preletor(a):* ${payload.preletor}`);
  if (payload.louvor && !REGEX_A_DEFINIR.test(payload.louvor)) detalhes.push(`• *Louvor:* ${payload.louvor}`);
  if (payload.decoracao && !REGEX_A_DEFINIR.test(payload.decoracao)) detalhes.push(`• *Decoração:* ${payload.decoracao}`);
  if (payload.alimentacao && !REGEX_A_DEFINIR.test(payload.alimentacao)) detalhes.push(`• *Alimentação:* ${payload.alimentacao}`);
  if (payload.equipe && !REGEX_A_DEFINIR.test(payload.equipe)) detalhes.push(`• *Equipe:* ${payload.equipe}`);
  if (payload.materiais && !REGEX_A_DEFINIR.test(payload.materiais)) detalhes.push(`• *Materiais:* ${payload.materiais}`);
  if (payload.midias && !REGEX_A_DEFINIR.test(payload.midias)) detalhes.push(`• *Mídias:* ${payload.midias}`);
  if (payload.observacoes && !REGEX_A_DEFINIR.test(payload.observacoes)) detalhes.push(`• *Observações:* ${payload.observacoes}`);

  if (detalhes.length > 0) {
    txt += `\n📋 *Informações do Evento:*\n` + detalhes.join("\n") + `\n`;
  }

  if (formRow.docUrl) {
    txt += `\n📄 *Documento Oficial (Google Docs):*\n${formRow.docUrl}\n`;
  }

  txt += `\nDigite *voltar* para a lista de fichas ou *menu* para o início.`;
  return txt;
}

async function iniciarFluxoConsultaFichasEventos({
  msg,
  numero,
  etapas,
  origem = "pastoral",
}) {
  let rows = [];
  try {
    rows = db.prepare("SELECT * FROM formularios_eventos ORDER BY id DESC LIMIT 25").all();
  } catch (err) {
    console.error("[Fichas Eventos] Erro ao consultar banco:", err.message);
  }

  if (!rows || rows.length === 0) {
    return msg.reply(
      "ℹ️ Não há fichas de eventos registradas no momento.\n\n" +
      `Digite *voltar* para o menu anterior ou *menu* para o início.`
    );
  }

  const fichasUnificadas = [];
  const chavesVistas = new Set();
  for (const r of rows) {
    const nomeBase = extrairNomeBaseEvento(r.evento || "");
    const chave = `${nomeBase.toLowerCase()}|${(r.departamento || "").toLowerCase()}`;
    if (!chavesVistas.has(chave)) {
      chavesVistas.add(chave);
      fichasUnificadas.push({ ...r, evento: nomeBase });
    }
  }

  etapas[numero] = {
    fluxo: "consulta_fichas_eventos",
    etapa: "selecionar_evento",
    origem,
    fichas: fichasUnificadas,
  };

  let texto = "📄 *Fichas dos Eventos Cadastrados*\n\nEscolha o evento que deseja visualizar:\n\n";
  fichasUnificadas.forEach((r, idx) => {
    const dataFmt = formatarDataBrasil(r.data);
    const deptoStr = r.departamento ? ` (${r.departamento})` : "";
    const dataStr = dataFmt ? `[${dataFmt}] ` : "";
    texto += `${idx + 1}️⃣ *${dataStr}${r.evento}*${deptoStr}\n`;
  });
  texto += "\nDigite o número da opção desejada.\nDigite *voltar* para o menu anterior ou *menu* para o início.";

  return msg.reply(texto);
}

async function processarFluxoConsultaFichasEventos({
  msg,
  numero,
  info,
  etapas,
  isPastor,
  isDiretor,
}) {
  const texto = (msg.body || "").trim();
  const lower = texto.toLowerCase();

  if (lower === "voltar") {
    if (info.etapa === "ver_detalhes") {
      return await iniciarFluxoConsultaFichasEventos({
        msg,
        numero,
        etapas,
        origem: info.origem,
      });
    }

    delete etapas[numero];
    if (info.origem === "diretor") {
      etapas[numero] = { fluxo: "area_diretor", etapa: "diretor_sub_agenda" };
      return msg.reply(montarSubmenuDiretorAgenda());
    } else {
      etapas[numero] = { fluxo: "area_pastoral", etapa: "pastoral_sub_agenda" };
      return msg.reply(montarSubmenuPastoralAgenda());
    }
  }

  if (info.etapa === "selecionar_evento") {
    const idx = parseInt(texto, 10) - 1;
    if (isNaN(idx) || !info.fichas || !info.fichas[idx]) {
      return msg.reply("❌ Opção inválida. Digite o número correspondente ao evento da lista, *voltar* para o menu anterior ou *menu* para o início.");
    }

    const fichaSelecionada = info.fichas[idx];
    info.etapa = "ver_detalhes";
    info.fichaSelecionada = fichaSelecionada;

    const textoFicha = formatarDetalhesFichaEvento(fichaSelecionada);
    return msg.reply(textoFicha);
  }

  if (info.etapa === "ver_detalhes") {
    if (lower === "voltar") {
      return await iniciarFluxoConsultaFichasEventos({
        msg,
        numero,
        etapas,
        origem: info.origem,
      });
    }
    return msg.reply("Digite *voltar* para retornar à lista de fichas de eventos ou *menu* para o início.");
  }
}

function montarMenuLider() {
  return (
    "👑 *Área do Líder*\n\n" +
    "Escolha um subgrupo:\n\n" +
    "1️⃣ 📅 *Agenda, Eventos e Reuniões*\n" +
    "2️⃣ 📢 *Comunicação e Mídia*\n" +
    "3️⃣ 📋 *Inscrições de Eventos*\n\n" +
    "Digite *menu* para voltar ao menu principal."
  );
}

function montarSubmenuLiderAgenda() {
  return (
    "📅 *Agenda e Eventos*\n\n" +
    "Escolha o que deseja fazer:\n\n" +
    "1️⃣ 🎪 *Gestão de Eventos* (Agendar, alterar datas/sessões, cancelar, formulário e montagem)\n" +
    "2️⃣ 🤝 *Reuniões de Liderança* (Agendar, alterar ou desmarcar reunião)\n" +
    "3️⃣ 🔍 *Consultar Disponibilidade* (Ver dias e horários livres do salão)\n" +
    "4️⃣ 📋 *Inscrições & Fichas* (Ver inscritos, lista em PDF e formulários preenchidos)\n\n" +
    "Digite o número da opção desejada.\n" +
    "Digite *voltar* para o menu anterior ou *menu* para o início."
  );
}

function montarSubmenuLiderComunicacao() {
  return (
    "📢 *Comunicação e Mídia*\n\n" +
    "Escolha o que deseja fazer:\n\n" +
    "1️⃣ 📢 *Aviso / Comunicado no Culto*\n" +
    "2️⃣ 🎨 *Artes e Flyers*\n\n" +
    "Digite o número da opção desejada.\n" +
    "Digite *voltar* para o menu anterior ou *menu* para o início."
  );
}

function montarMenuPastoral() {
  return (
    "⛪ *Área Pastoral*\n" +
    "Graça e Paz, Pastor(a)!\n\n" +
    "Escolha um subgrupo:\n\n" +
    "1️⃣ 📅 *Agenda, Eventos e Reuniões*\n" +
    "2️⃣ 🤝 *Atendimento Pastoral*\n" +
    "3️⃣ 📢 *Comunicação e Mídia*\n" +
    "4️⃣ 📋 *Inscrições & Fichas de Eventos*\n\n" +
    "Digite *menu* para voltar ao menu principal."
  );
}

function montarSubmenuPastoralAgenda() {
  return (
    "📅 *Agenda e Eventos (Pastoral)*\n\n" +
    "Escolha o que deseja fazer:\n\n" +
    "1️⃣ 📖 *Ver Agenda Completa da Igreja*\n" +
    "2️⃣ 🎪 *Gestão de Eventos* (Agendar, alterar datas/sessões, cancelar, formulário e montagem)\n" +
    "3️⃣ 🤝 *Reuniões de Liderança* (Agendar, alterar ou desmarcar)\n" +
    "4️⃣ 🔍 *Consultar Disponibilidade* (Ver dias e horários livres do salão)\n" +
    "5️⃣ 📋 *Inscrições & Fichas* (Ver inscritos, lista em PDF e formulários preenchidos)\n\n" +
    "Digite o número da opção desejada.\n" +
    "Digite *voltar* para o menu pastoral ou *menu* para o início."
  );
}

function montarSubmenuPastoralAtendimento() {
  return (
    "🤝 *Atendimento Pastoral*\n\n" +
    "Escolha o que deseja fazer:\n\n" +
    "1️⃣ Agendar novo atendimento pastoral\n" +
    "2️⃣ Alterar atendimento existente\n" +
    "3️⃣ Desmarcar atendimento existente\n" +
    "4️⃣ Consultar orientações pastorais\n\n" +
    "Digite o número da opção desejada.\n" +
    "Digite *voltar* para o menu pastoral ou *menu* para o início."
  );
}

function montarSubmenuPastoralComunicacao() {
  return (
    "📢 *Comunicação e Mídia*\n\n" +
    "Escolha o que deseja fazer:\n\n" +
    "1️⃣ 📢 *Aviso / Comunicado no Culto*\n" +
    "2️⃣ 🎨 *Artes e Flyers*\n\n" +
    "Digite o número da opção desejada.\n" +
    "Digite *voltar* para o menu pastoral ou *menu* para o início."
  );
}

function montarMenuDiretor() {
  return (
    "📋 *Área da Direção*\n\n" +
    "Escolha um subgrupo:\n\n" +
    "1️⃣ 📅 *Agenda, Eventos e Reuniões*\n" +
    "2️⃣ 📢 *Comunicação e Mídia*\n" +
    "3️⃣ 📋 *Inscrições & Fichas de Eventos*\n\n" +
    "Digite *menu* para voltar ao menu principal."
  );
}

function montarSubmenuDiretorAgenda() {
  return (
    "📅 *Agenda e Eventos (Direção)*\n\n" +
    "Escolha o que deseja fazer:\n\n" +
    "1️⃣ 📖 *Ver Todos os Eventos da Igreja* (Agenda completa)\n" +
    "2️⃣ 🎪 *Gestão de Eventos* (Agendar, alterar datas/sessões, cancelar, formulário e montagem)\n" +
    "3️⃣ 🤝 *Reuniões de Liderança* (Agendar, alterar ou desmarcar)\n" +
    "4️⃣ 🔍 *Consultar Disponibilidade* (Ver dias e horários livres do salão)\n" +
    "5️⃣ 📋 *Inscrições & Fichas* (Ver inscritos, lista em PDF e formulários preenchidos)\n\n" +
    "Digite o número da opção desejada.\n" +
    "Digite *voltar* para o menu da direção ou *menu* para o início."
  );
}

function montarSubmenuDiretorComunicacao() {
  return (
    "📢 *Comunicação e Mídia*\n\n" +
    "Escolha o que deseja fazer:\n\n" +
    "1️⃣ 📢 *Aviso / Comunicado no Culto*\n" +
    "2️⃣ 🎨 *Artes e Flyers*\n\n" +
    "Digite o número da opção desejada.\n" +
    "Digite *voltar* para o menu da direção ou *menu* para o início."
  );
}

function montarMenuEventos() {
  return (
    "🎪 *Gestão de Eventos da Igreja*\n\n" +
    "Escolha o que você deseja fazer:\n\n" +
    "1 - 📅 *Agendar novo evento* (Dia único, repetição semanal/quinzenal ou vários dias)\n" +
    "2 - 🔄 *Alterar evento existente* (Mudar datas, horários, sessões ou adicionar dias)\n" +
    "3 - 🗑️ *Cancelar evento existente* (Cancelar sessão específica ou evento todo)\n" +
    "4 - 📝 *Atualizar dados do formulário do evento* (Tema, verba, valores e detalhes)\n" +
    "5 - 🌐 *Agendar evento externo*\n" +
    "6 - 🏛️ *Informar uso do salão antes ou dia anterior* (Montagem/decoração/limpeza)\n\n" +
    "Digite o número da opção desejada.\n" +
    "Digite *voltar* para o menu anterior ou *menu* para o início."
  );
}

function montarMenuInscricoesOuFichas() {
  return (
    "📋 *Inscrições & Fichas de Eventos*\n\n" +
    "Escolha o que deseja consultar:\n\n" +
    "1️⃣ 👥 *Lista de Inscritos* (Ver pessoas inscritas e gerar lista em PDF)\n" +
    "2️⃣ 📄 *Fichas dos Eventos* (Ver formulários preenchidos e links de documentos)\n\n" +
    "Digite *1* ou *2* (ou digite *voltar* para o menu anterior):"
  );
}

function montarTextoMenuPrincipal({
  isMembro = false,
  isPastor = false,
  isDiretor = false,
  isLider = false,
  incluirPalavraMenu = false,
} = {}) {
  let menu = `Olá! 👋
Secretaria da Comunidade Cristã Curados.

Escolha uma opção:

1️⃣ Quem somos
2️⃣ Horário dos cultos
3️⃣ Ver agenda da igreja
4️⃣ Atendimento pastoral`;

  if (isMembro) {
    menu += `\n5️⃣ Solicitar uso do salão`;
    menu += `\n6️⃣ Falar com a secretaria`;
  } else {
    menu += `\n5️⃣ Falar com a secretaria`;
  }

  if (isPastor) {
    menu += `\n7️⃣ Área Pastoral`;
  } else if (isDiretor) {
    menu += `\n7️⃣ Área da Direção`;
  } else if (isLider) {
    menu += `\n7️⃣ Área do Líder`;
  }

  if (incluirPalavraMenu) {
    menu += `\n\nDigite *menu* a qualquer momento para voltar ao menu principal.`;
  } else {
    menu += `\n\n_Envie o número correspondente à opção desejada._`;
  }

  return menu;
}

/**
 * Monta o handler de mensagens do bot (menu principal + fluxos de conversa).
 * Todas as dependências que envolvem I/O real (WhatsApp, Google Calendar) são
 * injetadas, para permitir testar a lógica de conversa inteira sem precisar
 * subir o Puppeteer ou chamar a API do Google de verdade.
 *
 * @param {object} deps
 * @param {object} deps.client - cliente whatsapp-web.js (usado para enviar mensagens diretas e notificar a secretaria)
 * @param {object} deps.calendar - cliente googleapis Calendar (usado para gravar o agendamento aprovado)
 * @param {string[]} deps.agendasParaLer - IDs das agendas do Google, na mesma ordem de `redes.js`
 * @param {string[]} deps.lideres - números de telefone com acesso às opções de líder
 * @param {object} deps.etapas - mapa mutável "número -> estado da conversa", compartilhado entre reconexões
 * @param {(inicio: string, fim: string, agendaId?: string) => Promise<object[]>} deps.buscarEventos
 * @param {() => object[]} [deps.listLideres] - retorna os líderes cadastrados no painel ({ nome, telefone, cargos }),
 *   usado para identificar o solicitante nos resumos de evento pelo nome cadastrado (não o nome do contato salvo no celular)
 * @param {(payload: object) => Promise<object>} [deps.enviarWebhook]
 * @param {(payload: object) => Promise<object>} [deps.enviarWebhookExterno]
 */
function createMessageHandler({
  client,
  calendar,
  agendasParaLer,
  lideres,
  etapas,
  buscarEventos,
  listLideres = () => [],
  enviarWebhook = enviarWebhookGoogleDocs,
  enviarWebhookExterno = enviarWebhookGoogleDocsExternos,
  tempoEsperaSaudacaoMs,
  tempoEsperaRetornoMs,
  notificarSecretaria = notificarSecretariaDefault,
}) {
  const pendentesSaudacao = new Map();
  const tempoEsperaConfigurado = typeof tempoEsperaSaudacaoMs !== "undefined"
    ? tempoEsperaSaudacaoMs
    : (typeof process.env.TEMPO_ESPERA_SAUDACAO_MS !== "undefined"
        ? parseInt(process.env.TEMPO_ESPERA_SAUDACAO_MS, 10)
        : (process.env.NODE_ENV === "test" ? 0 : 10000));
  const tempoEsperaRetornoConfigurado = typeof tempoEsperaRetornoMs !== "undefined"
    ? tempoEsperaRetornoMs
    : 0;
  function resolverUsuario(numeroComDdi) {
    const numeroDigitos = String(numeroComDdi || "").replace(/\D/g, "");
    const cadastrados = (typeof listLideres === "function" ? listLideres() : []) || [];
    const encontrado = cadastrados.find((u) => {
      const telDigitos = String(u.telefone || "").replace(/\D/g, "");
      return telDigitos && (numeroDigitos.includes(telDigitos) || telDigitos.includes(numeroDigitos));
    });
    if (encontrado) {
      const cargos = Array.isArray(encontrado.cargos)
        ? encontrado.cargos.map((c) => String(c).toLowerCase().trim()).filter(Boolean)
        : (encontrado.cargos ? [String(encontrado.cargos).toLowerCase().trim()] : ["lider"]);
      const deptos = Array.isArray(encontrado.departamentos)
        ? encontrado.departamentos
        : (encontrado.departamento ? [encontrado.departamento] : []);
      return {
        nome: (encontrado.nome || "").trim(),
        telefone: encontrado.telefone,
        cargos: cargos.length > 0 ? cargos : ["lider"],
        departamentos: deptos,
        departamento: deptos.join(", "),
        registradoNoBanco: true,
      };
    }
    const ehLiderArray = lideres.some((l) => {
      const telLider = String(l || "").replace(/\D/g, "");
      return telLider && numeroDigitos.includes(telLider);
    });
    if (ehLiderArray) {
      return {
        nome: "",
        telefone: numeroDigitos,
        cargos: ["lider"],
        departamentos: [],
        departamento: "",
        registradoNoBanco: false,
      };
    }
    return {
      nome: "",
      telefone: numeroDigitos,
      cargos: [],
      departamentos: [],
      departamento: "",
      registradoNoBanco: false,
    };
  }

  // Identifica o solicitante de um evento (criar/alterar/cancelar) pelo nome
  // cadastrado no painel de líderes, já que o nome salvo no celular do líder
  // (nomeContato) pode divergir do nome oficial usado pela secretaria. Sem
  // correspondência (ou nome cadastrado vazio), cai de volta no nome do contato.
  function nomeSolicitante(contato, numero) {
    const usuario = resolverUsuario(numero);
    if (usuario && usuario.nome && usuario.nome.trim()) return usuario.nome.trim();
    return nomeContato(contato, numero);
  }

  function isAgendaOcultaOuInterna(calendarId) {
    if (!calendarId) return false;
    if (isAgendaInterna(calendarId)) return true;
    const index = agendasParaLer.indexOf(calendarId);
    return index >= 11;
  }

  function identificarMesEntrada(texto) {
    if (!texto) return null;
    const t = String(texto).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const mapa = {
      "janeiro": 1, "jan": 1,
      "fevereiro": 2, "fev": 2,
      "marco": 3, "mar": 3,
      "abril": 4, "abr": 4,
      "maio": 5, "mai": 5,
      "junho": 6, "jun": 6,
      "julho": 7, "jul": 7,
      "agosto": 8, "ago": 8,
      "setembro": 9, "set": 9,
      "outubro": 10, "out": 10,
      "novembro": 11, "nov": 11,
      "dezembro": 12, "dez": 12,
    };
    if (mapa[t]) return mapa[t];
    const match = t.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/);
    if (match && mapa[match[1]]) return mapa[match[1]];
    return null;
  }

  // Busca, filtra e entrega a listagem de agenda para um período, deixando o
  // fluxo pronto para receber o número de um item ou outro mês na próxima mensagem.
  async function entregarAgenda(numero, info, inicioBusca, fimBusca, tituloPeriodo, msg) {
    try {
      const todosEventosRaw = await buscarEventos(inicioBusca, fimBusca);
      const calendarIdExternos = agendasParaLer[mapearRedeParaAgendaIndex("Eventos Externos")];
      const isEventoOculto = (ev) =>
        Boolean(calendarIdExternos && ev.calendarId === calendarIdExternos) ||
        ev.calendarId === "18e7b84e62b7f4155bb98458b8c750099b937bed118a572d51d9a21b87aaaa3e@group.calendar.google.com" ||
        isAgendaOcultaOuInterna(ev.calendarId) ||
        ehEventoPreparacaoLimpeza(ev);

      const deveIncluirInternas = Boolean(info && info.agendaCompleta);
      const agora = moment.tz("America/Sao_Paulo");
      const todosEventos = todosEventosRaw.filter(ev => {
        if (!isEventoFuturo(ev, agora)) {
          return false;
        }
        if (ev.calendarId === agendasParaLer[0] && ev.summary && ev.summary.toLowerCase().includes("sábado livre")) {
          return false;
        }
        if (!deveIncluirInternas && isEventoOculto(ev)) {
          return false;
        }
        return true;
      });

      if (todosEventos.length === 0) {
        info.itensAgenda = [];
        info.etapa = "detalhe_evento";
        return msg.reply(
          `📅 Não há eventos abertos ao público programados para *${tituloPeriodo}*.\n\n` +
          `Para consultar outro mês, digite o *nome do mês* (ex: Novembro, Dezembro) ou o número correspondente.\n` +
          `Digite *menu* para voltar ao menu principal.`
        );
      }

      const itens = agruparEventosAgenda(todosEventos, { abertoAoPublico: !deveIncluirInternas });
      info.itensAgenda = itens;
      info.etapa = "detalhe_evento";

      if (deveIncluirInternas) {
        return msg.reply(montarMensagemAgendaCompletaPorSecoes(itens, tituloPeriodo, AGENDAS_INTERNAS, { isPastor: Boolean(info && info.isPastor) }));
      }
      return msg.reply(montarMensagemAgenda(itens, tituloPeriodo));
    } catch (e) {
      console.error(`[ALERTA:google-calendar] Erro ao buscar agenda para ${mascararTelefone(numero)}:`, e);
      delete etapas[numero];
      return msg.reply("⚠️ Erro ao carregar agenda.");
    }
  }

  // Agendas internas não devem interferir na disponibilidade do agendamento de eventos
  function filtrarEventosAgendamento(eventos) {
    return eventos.filter(ev => !isAgendaOcultaOuInterna(ev.calendarId));
  }

  async function checarConcorrenciaAtendimentoPastoral({
    dia,
    mes,
    ano,
    horarioInicio,
    horarioFim,
    isDiaInteiro = false,
  }) {
    try {
      const anoNum = ano || moment.tz("America/Sao_Paulo").year();
      const idAtendimento = AGENDAS_INTERNAS.ATENDIMENTO || agendasParaLer[12];

      const inicioDia = moment.tz([anoNum, mes - 1, dia, 0, 0, 0], "America/Sao_Paulo").format();
      const fimDia = moment.tz([anoNum, mes - 1, dia, 23, 59, 59], "America/Sao_Paulo").format();

      const eventos = await buscarEventos(inicioDia, fimDia, idAtendimento);
      if (!eventos || eventos.length === 0) return [];

      const conflitos = [];
      for (const ev of eventos) {
        if (ev.status === "cancelled") continue;
        const evCalId = ev.calendarId || "";
        const summaryLower = (ev.summary || "").toLowerCase();
        const ehDeFatoAtendimento = evCalId === idAtendimento || summaryLower.includes("atendimento");
        if (!ehDeFatoAtendimento) continue;

        const evStartRaw = ev.start?.dateTime || ev.start?.date;
        const evEndRaw = ev.end?.dateTime || ev.end?.date;
        if (!evStartRaw || !evEndRaw) continue;

        if (isDiaInteiro) {
          conflitos.push(ev);
          continue;
        }

        const mEvStart = moment.tz(evStartRaw, "America/Sao_Paulo");
        const mEvEnd = moment.tz(evEndRaw, "America/Sao_Paulo");

        if (horarioInicio && horarioFim) {
          const [hi, mi] = horarioInicio.split(":").map(Number);
          const [hf, mf] = horarioFim.split(":").map(Number);
          const mSolStart = mEvStart.clone().hour(hi).minute(mi).second(0);
          const mSolEnd = mEvStart.clone().hour(hf).minute(mf).second(0);

          if (mSolStart.isBefore(mEvEnd) && mSolEnd.isAfter(mEvStart)) {
            conflitos.push(ev);
          }
        } else {
          conflitos.push(ev);
        }
      }
      return conflitos;
    } catch (err) {
      console.error("[Pastoral] Erro ao checar concorrência com atendimento pastoral:", err);
      return [];
    }
  }

  function obterPastorDoAtendimento(at) {
    if (!at) return null;
    const desc = at.description || "";
    const summary = at.summary || "";

    // a) Tenta extrair nome do discípulo da descrição ou do summary
    let discipulo = "";
    const matchDisc = desc.match(/(?:Disc[ií]pulo|Membro|Pessoa|Com)\s*:\s*([^\n\r,]+)/i);
    if (matchDisc) {
      discipulo = matchDisc[1].trim();
    } else {
      const matchDiscSummary = summary.match(/(?:Atendimento(?:\s*Pastoral)?\s*[-–—:]?\s*(?:com\s+)?)([^\n\r,\)\-]+)/i);
      if (matchDiscSummary) {
        discipulo = matchDiscSummary[1].trim();
      }
    }

    // b) Busca no banco agendamentos_pastorais pelo ID do evento ou nome do discípulo
    const agendamento = buscarPastorAgendamento(at.id, discipulo);
    if (agendamento && agendamento.pastorTelefone) {
      return {
        telefone: String(agendamento.pastorTelefone).replace(/\D/g, ""),
        nome: agendamento.pastorNome || "Pastor",
      };
    }

    // c) Tenta extrair telefone do pastor na descrição do evento (ex: "Telefone Pastor: 5511...", "Pastor: Gabriel (5511...)")
    const matchTelPastor = desc.match(/(?:Telefone\s*Pastor|Pastor(?:\s*Respons[aá]vel)?)[^0-9]*((?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9\d{4}[-\s]?\d{4})/i)
      || desc.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9\d{4}[-\s]?\d{4}/);
    if (matchTelPastor) {
      const matchNomePastor = desc.match(/(?:Pastor|Pr\.?)\s*:\s*([^\n\r,]+)/i)
        || summary.match(/(?:Pastor|Pr\.?)\s*([^\n\r,\)\-]+)/i);
      return {
        telefone: (matchTelPastor[1] || matchTelPastor[0]).replace(/\D/g, ""),
        nome: matchNomePastor ? matchNomePastor[1].trim() : "Pastor",
      };
    }

    // d) Tenta extrair nome do pastor na descrição ou no título e buscar em líderes/usuários
    const matchNomePastor = desc.match(/(?:Pastor|Pr\.?)\s*:\s*([^\n\r,]+)/i)
      || summary.match(/(?:Pastor|Pr\.?)\s*([^\n\r,\)\-]+)/i);
    if (matchNomePastor) {
      const nomePastor = matchNomePastor[1].trim();
      try {
        const cadastrados = (typeof listLideres === "function" ? listLideres() : []) || [];
        const encontrado = cadastrados.find((u) => (u.nome || "").toLowerCase().includes(nomePastor.toLowerCase()));
        if (encontrado && encontrado.telefone) {
          return {
            telefone: String(encontrado.telefone).replace(/\D/g, ""),
            nome: encontrado.nome,
          };
        }
        const pastorRow = db.prepare("SELECT * FROM lideres WHERE LOWER(nome) LIKE '%' || LOWER(?) || '%'").get(nomePastor);
        if (pastorRow && pastorRow.telefone) {
          return {
            telefone: String(pastorRow.telefone).replace(/\D/g, ""),
            nome: pastorRow.nome,
          };
        }
      } catch (_) { }
    }

    // e) Fallback: busca pastor em listLideres() ou no banco SQLite
    try {
      const cadastrados = (typeof listLideres === "function" ? listLideres() : []) || [];
      const pastorCad = cadastrados.find((u) => {
        const c = Array.isArray(u.cargos) ? u.cargos.join(" ") : String(u.cargos || "");
        return c.toLowerCase().includes("pastor");
      });
      if (pastorCad && pastorCad.telefone) {
        return {
          telefone: String(pastorCad.telefone).replace(/\D/g, ""),
          nome: pastorCad.nome,
        };
      }
      const pastorRow = db.prepare("SELECT * FROM lideres WHERE LOWER(cargos) LIKE '%pastor%' LIMIT 1").get();
      if (pastorRow && pastorRow.telefone) {
        return {
          telefone: String(pastorRow.telefone).replace(/\D/g, ""),
          nome: pastorRow.nome,
        };
      }
    } catch (_) { }

    return null;
  }

  async function consultarPastorConcorrenciaSalao({
    pastor,
    atendimento,
    solicitante,
    tipoAtividade,
    nomeAtividade,
    dataFormatada,
    horario,
    codigo,
  }) {
    if (!pastor || !pastor.telefone) return false;
    const atStart = atendimento?.start?.dateTime ? moment.tz(atendimento.start.dateTime, "America/Sao_Paulo").format("HH:mm") : "";
    const atEnd = atendimento?.end?.dateTime ? moment.tz(atendimento.end.dateTime, "America/Sao_Paulo").format("HH:mm") : "";
    const horarioAtendimento = atStart && atEnd ? `${atStart} às ${atEnd}` : (atStart || "Horário agendado");

    const jidPastor = pastor.telefone.includes("@") ? pastor.telefone : `${pastor.telefone}@c.us`;
    const saudacao = pastor.nome ? `Olá, Pastor *${pastor.nome}*!` : "Olá, Pastor!";

    const msgConsulta =
      `⚠️ *CONSULTA PASTORAL - CONCORRÊNCIA COM EVENTO*\n\n` +
      `${saudacao}\n\n` +
      `Consta um Atendimento Pastoral seu agendado:\n` +
      `📌 *Atendimento:* ${atendimento?.summary || "Atendimento Pastoral"}\n` +
      `📆 *Data:* ${dataFormatada}\n` +
      `⏰ *Horário do Atendimento:* ${horarioAtendimento}\n\n` +
      `🏛️ *Nova Solicitação Usando o Salão da Igreja:*\n` +
      `👤 *Solicitante:* ${solicitante}\n` +
      `🏢 *Atividade:* ${tipoAtividade} - ${nomeAtividade}\n` +
      `⏰ *Horário Solicitado no Salão:* ${horario}\n\n` +
      `❓ *Pastor, você autoriza o uso do salão da igreja neste mesmo horário do atendimento pastoral?*\n\n` +
      `Por favor, responda diretamente a esta mensagem com:\n` +
      `👉 *SIM* (para autorizar o uso do salão)\n` +
      `👉 *NÃO* (para recusar o uso do salão)\n\n` +
      `_Código: ${codigo}_`;

    try {
      await client.sendMessage(jidPastor, msgConsulta);
      console.log(`[Pastoral] Consulta de concorrência enviada no privado do pastor ${pastor.nome} (${mascararTelefone(pastor.telefone)}) para "${nomeAtividade}".`);
      return true;
    } catch (errSend) {
      console.error(`[ALERTA:whatsapp] Falha ao enviar consulta de concorrência ao pastor ${mascararTelefone(pastor.telefone)}:`, errSend.message);
      return false;
    }
  }

  // Monta e envia o resumo de "novo evento" pro solicitante e o pedido de
  // aprovação pro grupo da secretaria. Compartilhado pelos dois caminhos de
  // busca de data (por dia da semana + horário, ou por data específica).
  async function finalizarNovoAgendamento({ msg, numero, contato, info, dataFinal, isLider }) {
    try {
      const dataFormatada = moment(dataFinal).format("DD/MM");
      const usaSalao = !info.local || !(/online|externo/i.test(info.local));

      let conflitosPastoral = [];
      if (usaSalao) {
        conflitosPastoral = await checarConcorrenciaAtendimentoPastoral({
          dia: dataFinal.getDate(),
          mes: dataFinal.getMonth() + 1,
          ano: dataFinal.getFullYear(),
          horarioInicio: info.horarioInicio,
          horarioFim: info.horarioFim,
          isDiaInteiro: info.isDiaInteiro,
        });
      }

      const pastorResponsavel = conflitosPastoral.length > 0 ? obterPastorDoAtendimento(conflitosPastoral[0]) : null;
      const temConflitoPastoral = conflitosPastoral.length > 0 && Boolean(pastorResponsavel);

      const tipoDuracao = info.tipoDuracao || "unico";
      let cronogramaResumo = "";
      if (tipoDuracao === "consecutivo") {
        cronogramaResumo = `\n📆 *Período:* ${info.dataInicio} às ${info.horaInicio} até ${info.dataFim} às ${info.horaFim}`;
      } else if (tipoDuracao === "multiplo" && Array.isArray(info.blocosHorarios)) {
        const sessoesStr = info.blocosHorarios.map((b, idx) => `\n  • Sessão ${idx + 1}: ${b.data} (${b.inicio} às ${b.fim})`).join("");
        cronogramaResumo = `\n📋 *Sessões Agendadas:*${sessoesStr}`;
      } else {
        cronogramaResumo = `\n📆 *Data:* ${dataFormatada}\n⏰ *Horário:* ${info.horarioInicio} - ${info.horarioFim}`;
      }

      // Gera a descrição com IA se ainda não existir
      const descricaoGerada = info.descricao || gerarDescricaoEvento({
        evento: info.nome,
        tipoDuracao,
        horarios: tipoDuracao === "multiplo" ? info.blocosHorarios : (tipoDuracao === "consecutivo" ? { dataInicio: info.dataInicio, horaInicio: info.horaInicio, dataFim: info.dataFim, horaFim: info.horaFim } : [{ data: dataFormatada, inicio: info.horarioInicio, fim: info.horarioFim }]),
        departamento: info.rede,
        local: info.local
      });

      // Salva no banco de dados SQLite para consultas instantâneas no chat
      salvarDescricaoEvento({
        evento: info.nome,
        departamento: info.rede,
        local: info.local,
        tipoDuracao,
        horarios: tipoDuracao === "multiplo" ? info.blocosHorarios : (tipoDuracao === "consecutivo" ? { dataInicio: info.dataInicio, horaInicio: info.horaInicio, dataFim: info.dataFim, horaFim: info.horaFim } : [{ data: dataFormatada, inicio: info.horarioInicio, fim: info.horarioFim }]),
        descricao: descricaoGerada
      });

      const dadosAgendamento = {
        solicitanteId: numero,
        solicitanteNome: nomeSolicitante(contato, numero),
        evento: info.nome,
        local: info.local,
        rede: info.rede,
        dia: dataFinal.getDate(),
        mes: dataFinal.getMonth() + 1,
        ano: dataFinal.getFullYear(),
        dataFormatada,
        horarioInicio: info.horarioInicio,
        horarioFim: info.horarioFim,
        isDiaInteiro: false,
        tipoDuracao,
        dataInicio: info.dataInicio,
        dataFim: info.dataFim,
        horaInicio: info.horaInicio,
        horaFim: info.horaFim,
        blocos: info.blocosHorarios,
        descricao: descricaoGerada
      };

      if (temConflitoPastoral) {
        dadosAgendamento.aguardandoPastor = true;
        dadosAgendamento.pastorTelefone = pastorResponsavel.telefone;
        dadosAgendamento.pastorNome = pastorResponsavel.nome;
        dadosAgendamento.conflitoAtendimentoSummary = conflitosPastoral[0].summary || "Atendimento Pastoral";
        dadosAgendamento.horarioConflito = `${info.horarioInicio} - ${info.horarioFim}`;

        const codigo = salvarPendente(dadosAgendamento);

        await consultarPastorConcorrenciaSalao({
          pastor: pastorResponsavel,
          atendimento: conflitosPastoral[0],
          solicitante: nomeSolicitante(contato, numero),
          tipoAtividade: "Evento",
          nomeAtividade: info.nome,
          dataFormatada,
          horario: `${info.horarioInicio} às ${info.horarioFim}`,
          codigo,
        });

        const avisoLider =
          `⏳ *Solicitação em Análise Pastoral*\n\n` +
          `*Evento:* ${info.nome}\n*Local:* ${info.local}\n*Departamento:* ${info.rede}${cronogramaResumo}\n\n` +
          `⚠️ Consta um Atendimento Pastoral agendado para o mesmo horário. Uma consulta foi enviada diretamente ao Pastor responsável (*${pastorResponsavel.nome || "Pastor"}*) no WhatsApp privado dele.\n\n` +
          `Assim que o Pastor responder autorizando, sua solicitação será encaminhada para confirmação da Secretaria! 🙏\n\n` +
          `Digite *menu* para voltar ao menu principal.`;

        console.log(`Agendamento de evento aguardando aprovação do pastor ${pastorResponsavel.nome} para ${identificarUsuario(contato, numero, isLider)}`);
        return await msg.reply(avisoLider);
      }

      // Sem conflito pastoral: salva e envia diretamente para a secretaria
      const codigo = salvarPendente(dadosAgendamento);
      const resumoGrupo = `🔔 *NOVO AGENDAMENTO SOLICITADO*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n📅 *Evento:* ${info.nome}\n📍 *Local:* ${info.local}\n🏢 *Depto:* ${info.rede}${cronogramaResumo}\n\n_Responda a este resumo com "marcar evento" ou "não marcar" para realizar o agendamento automático._\n\n_Código: ${codigo}_`;
      await notificarSecretaria(client, resumoGrupo);

      const resumo = `✅ *Solicitação de Agendamento Enviada!*\n\n*Evento:* ${info.nome}\n*Local:* ${info.local}\n*Departamento:* ${info.rede}${cronogramaResumo}\n\n🧹 *Compromisso com o Salão e Dependências:*\nLembramos que o salão deve ser entregue após o evento exatamente da mesma forma como foi encontrado (organização das cadeiras, lixo recolhido e limpeza geral).\n\nAguarde a confirmação da secretaria!\n\nDigite *menu* para voltar ao menu principal.`;
      console.log(`Agendamento solicitado por ${identificarUsuario(contato, numero, isLider)}: ${resumo.replace(/\n/g, ' | ')}`);
      await msg.reply(resumo);
    } catch (e) {
      console.error(`[ALERTA:persistencia] Erro ao registrar solicitação de agendamento para ${identificarUsuario(contato, numero, isLider)}:`, e);
      await msg.reply("⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes.");
    }
  }

  return async function handleMessage(msg) {
    try {
      if (!msg) return;
      if (msg.body === undefined || msg.body === null) {
        msg.body = "";
      }

      // Ignora mensagens de status e mensagens enviadas pelo próprio bot
      if (msg.from === 'status@broadcast' || msg.fromMe) {
        return;
      }

      // Lógica para mensagens em grupo:
      // 1. Confirmação / Aprovação da Secretaria ou Pastoral (requer citação + palavra-chave)
      // 2. Transmissão (Broadcast) do grupo 'Mensagens Secretaria' (captura imagem/texto e transmite)
      if (msg.from.endsWith("@g.us")) {
        const textoMsg = (msg.body || "").toLowerCase().trim();
        const PALAVRAS_CHAVE_APROVACAO = [
          "marcar evento", "não marcar", "nao marcar",
          "marcar reuniao", "marcar reunião",
          "confirmar reuniao", "confirmar reunião",
          "aprovar salão", "aprovar salao",
          "marcar salão", "marcar salao",
          "confirmar salão", "confirmar salao",
          "recusar salão", "recusar salao",
          "não aprovar salão", "nao aprovar salao",
          "aprovar evento externo", "aprovar evento", "confirmar evento externo", "confirmar evento", "marcar evento externo",
          "recusar evento externo", "recusar evento", "não aprovar evento externo", "nao aprovar evento externo",
          "alterar evento", "não alterar", "nao alterar",
          "alterar reuniao", "alterar reunião",
          "cancelar evento", "manter evento",
          "desmarcar reuniao", "desmarcar reunião",
          "cancelar reuniao", "cancelar reunião",
          "manter reuniao", "manter reunião",
          "não confirmar", "nao confirmar", "recusar",
          "pode", "pode sim", "pode marcar", "autorizado", "autorizo",
          "não pode", "nao pode", "não autorizo", "nao autorizo", "recusado",
        ];
        let ehPalavraChave = PALAVRAS_CHAVE_APROVACAO.includes(textoMsg);
        if (!ehPalavraChave) {
          const bodyTrimmedLower = (msg.body || "").trim().toLowerCase();
          ehPalavraChave =
            bodyTrimmedLower === "confirmar" ||
            bodyTrimmedLower === "confirmado" ||
            bodyTrimmedLower.startsWith("confirmar ") ||
            bodyTrimmedLower.startsWith("confirmado ") ||
            bodyTrimmedLower.startsWith("pode ") ||
            bodyTrimmedLower.startsWith("autorizado ") ||
            bodyTrimmedLower.startsWith("autorizo ") ||
            bodyTrimmedLower.startsWith("não pode ") ||
            bodyTrimmedLower.startsWith("nao pode ");
        }

        const cachedSecretaria = obterJidCached(NOME_GRUPO_SECRETARIA);
        let ehGrupoSecretaria = Boolean(cachedSecretaria && msg.from === cachedSecretaria);

        // Se o cache do grupo Secretaria ainda não foi populado, tenta resolver via getChat() apenas se necessário
        if (!ehGrupoSecretaria && !cachedSecretaria) {
          try {
            const chatTemp = await comRetry(() => msg.getChat());
            const nomeChatNormalizado = chatTemp?.name ? chatTemp.name.trim().toLowerCase() : "";
            if (nomeChatNormalizado.includes(NOME_GRUPO_SECRETARIA.trim().toLowerCase())) {
              ehGrupoSecretaria = true;
              atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, msg.from);
            }
          } catch (_) { }
        }

        // Se for resposta citada com palavra-chave de aprovação, segue o fluxo de aprovação
        const ehRespostaAprovacao = ehPalavraChave && Boolean(msg.hasQuotedMsg);

        if (!ehRespostaAprovacao) {
          // Se veio do grupo "Mensagens Secretaria" e NÃO é resposta a aprovação
          if (ehGrupoSecretaria) {
            // Função de broadcast do grupo da secretaria desativada por padrão
            if (!BROADCAST_CONFIG.ativo && process.env.BROADCAST_ATIVO !== "true") {
              return;
            }

            // Se for apenas uma palavra-chave de aprovação isolada sem mídia (ex: "marcar evento" ou "recusar"),
            // é provável esquecimento de usar "Responder" no pedido do bot
            if (!msg.hasMedia && PALAVRAS_CHAVE_APROVACAO.includes(textoMsg)) {
              console.log(`[Grupo] Palavra-chave "${textoMsg}" digitada sem usar "Responder" (de: ${mascararTelefone(msg.from)}) — ignorada.`); // NOSONAR
              return;
            }

            // Captura de mídia (imagem/foto/documento) com retries inteligentes e persistência em disco
            let media = null;
            const temMidia = Boolean(msg.hasMedia || msg.type === "image" || msg.type === "document" || msg.type === "video");
            if (temMidia || typeof msg.downloadMedia === "function") {
              media = await baixarMidiaComRetry(msg, {
                client,
                contexto: "Broadcast",
                tentativas: 5,
                esperaMs: 2000,
                salvarEmDisco: true,
              });
            }

            const textoBroadcast = (msg.caption || msg.body || "").trim();
            if (!media && !textoBroadcast) {
              return;
            }

            console.log(`[Broadcast] Mensagem capturada no grupo '${NOME_GRUPO_SECRETARIA}' (mídia: ${Boolean(media)}, texto: "${textoBroadcast.slice(0, 60)}")`);
            const resBroadcast = await executarBroadcast({
              client,
              media,
              texto: textoBroadcast,
              listLideres,
            });

            if (typeof msg.react === "function") {
              msg.react("📢").catch(() => { });
            }

            return resBroadcast;
          }

          // Para outros grupos:
          if (ehPalavraChave && !msg.hasQuotedMsg) {
            console.log(`[Grupo] Palavra-chave "${textoMsg}" digitada sem usar "Responder" (de: ${mascararTelefone(msg.from)}) — ignorada.`); // NOSONAR
          }
          return; // Mensagem comum de outros grupos — ignora em silêncio
        }

        // Daqui para baixo: ehRespostaAprovacao === true (fluxo de aprovação existente)
        const cachedPastoral = obterJidCached(NOME_GRUPO_PASTORAL);
        const cachedMultimidia = obterJidCached(NOME_GRUPO_MULTIMIDIA);

        let grupoPertence = null;
        if (ehGrupoSecretaria) {
          grupoPertence = NOME_GRUPO_SECRETARIA;
        } else if (msg.from === cachedPastoral) {
          grupoPertence = NOME_GRUPO_PASTORAL;
        } else if (msg.from === cachedMultimidia) {
          grupoPertence = NOME_GRUPO_MULTIMIDIA;
        }

        let chat = null;
        if (!grupoPertence) {
          try {
            chat = await comRetry(() => msg.getChat());
            const nomeChatNormalizado = chat.name ? chat.name.trim().toLowerCase() : "";
            if (nomeChatNormalizado.includes(NOME_GRUPO_SECRETARIA.trim().toLowerCase())) {
              grupoPertence = NOME_GRUPO_SECRETARIA;
              atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, msg.from);
            } else if (nomeChatNormalizado.includes(NOME_GRUPO_PASTORAL.trim().toLowerCase())) {
              grupoPertence = NOME_GRUPO_PASTORAL;
              atualizarCacheGrupo(NOME_GRUPO_PASTORAL, msg.from);
            } else if (nomeChatNormalizado.includes("multim") || nomeChatNormalizado.includes(NOME_GRUPO_MULTIMIDIA.trim().toLowerCase())) {
              grupoPertence = NOME_GRUPO_MULTIMIDIA;
              atualizarCacheGrupo(NOME_GRUPO_MULTIMIDIA, msg.from);
            }
          } catch (err) {
            console.warn(`[Grupo] Não foi possível carregar o chat de uma mensagem (de: ${mascararTelefone(msg.from)}, id: ${msg.id?._serialized}) — ignorando. Detalhe: ${err.message}`);
            return;
          }
        }

        if (!grupoPertence) {
          return; // Não pertence a nenhum dos grupos monitorados
        }

        if (grupoPertence === NOME_GRUPO_MULTIMIDIA) {
          atualizarCacheGrupo(NOME_GRUPO_MULTIMIDIA, msg.from);
          console.log(`[Multimídia] Mensagem recebida no grupo Multimídias (de: ${mascararTelefone(msg.from)})`);
          return;
        }

        const nomeParaExibicao = chat?.name || grupoPertence;
        console.log(`[Grupo] "${nomeParaExibicao}" | Resposta a outra mensagem: ${msg.hasQuotedMsg} | Texto: "${msg.body}"`);

        // 🟢 Tenta obter a mensagem citada de forma totalmente segura (evitando o 'id undefined')
        let quotedMsg = null;
        try {
          quotedMsg = await comRetry(() => msg.getQuotedMessage());
        } catch (errQuoted) {
          console.warn(`[${grupoPertence}] Falha ao executar getQuotedMessage(), tentando ler do payload direto:`, errQuoted.message);
        }

        const textoQuoted = quotedMsg?.body
          || msg.quotedMsg?.body
          || msg._data?.quotedMsg?.body
          || msg._data?.quotedMsg?.caption
          || "";

        const ehMensagemDoBot = quotedMsg ? quotedMsg.fromMe : (msg.quotedMsg?.fromMe || msg._data?.quotedMsg?.fromMe);

        if (grupoPertence === NOME_GRUPO_SECRETARIA) {
          atualizarCacheGrupo(NOME_GRUPO_SECRETARIA, msg.from);

          const isMarcar =
            textoMsg === "marcar evento" ||
            textoMsg === "marcar reuniao" ||
            textoMsg === "marcar reunião" ||
            textoMsg === "confirmar reuniao" ||
            textoMsg === "confirmar reunião" ||
            textoMsg === "aprovar salão" ||
            textoMsg === "aprovar salao" ||
            textoMsg === "marcar salão" ||
            textoMsg === "marcar salao" ||
            textoMsg === "confirmar salão" ||
            textoMsg === "confirmar salao" ||
            textoMsg === "aprovar evento externo" ||
            textoMsg === "aprovar evento" ||
            textoMsg === "confirmar evento externo" ||
            textoMsg === "confirmar evento" ||
            textoMsg === "marcar evento externo";
          const isRecusarMarcar =
            textoMsg === "não marcar" ||
            textoMsg === "nao marcar" ||
            textoMsg === "não confirmar" ||
            textoMsg === "nao confirmar" ||
            textoMsg === "recusar" ||
            textoMsg === "recusar salão" ||
            textoMsg === "recusar salao" ||
            textoMsg === "não aprovar salão" ||
            textoMsg === "nao aprovar salao" ||
            textoMsg === "recusar evento externo" ||
            textoMsg === "recusar evento" ||
            textoMsg === "não aprovar evento externo" ||
            textoMsg === "nao aprovar evento externo";

          const isAlterar =
            textoMsg === "alterar evento" ||
            textoMsg === "alterar reuniao" ||
            textoMsg === "alterar reunião";
          const isNaoAlterar =
            textoMsg === "não alterar" ||
            textoMsg === "nao alterar";

          const isCancelar =
            textoMsg === "cancelar evento" ||
            textoMsg === "cancelar reuniao" ||
            textoMsg === "cancelar reunião" ||
            textoMsg === "desmarcar reuniao" ||
            textoMsg === "desmarcar reunião";
          const isManter =
            textoMsg === "manter evento" ||
            textoMsg === "manter reuniao" ||
            textoMsg === "manter reunião";

          if (isMarcar || isRecusarMarcar) {
            if (ehMensagemDoBot || textoQuoted.includes("CÓDIGO") || textoQuoted.includes("Código")) {
              const codigo = extrairCodigo(textoQuoted);
              const dados = codigo ? buscarPendente(codigo) : null;
              if (!dados) {
                return msg.reply("❌ Não encontrei essa solicitação (código inválido ou já respondido antes).");
              }

              if (dados.tipo === "evento_externo") {
                const { solicitanteId } = dados;
                if (isMarcar) {
                  try {
                    const calendarIdExternos = agendasParaLer[AGENDA_INDEX_EVENTOS_EXTERNOS] || agendasParaLer[10];
                    const ano = dados.ano || moment().tz("America/Sao_Paulo").year();
                    const mes = dados.mes || (moment().tz("America/Sao_Paulo").month() + 1);
                    const dia = dados.dia || moment().tz("America/Sao_Paulo").date();

                    const dataIsoInicio = moment.tz(
                      `${dia}/${mes}/${ano} 19:00`,
                      "D/M/YYYY HH:mm",
                      "America/Sao_Paulo"
                    ).format();
                    const dataIsoFim = moment.tz(
                      `${dia}/${mes}/${ano} 22:00`,
                      "D/M/YYYY HH:mm",
                      "America/Sao_Paulo"
                    ).format();

                    const resourceExterno = {
                      summary: `Evento Externo - ${dados.nomeEvento}`,
                      description:
                        `Evento Externo agendado via Bot.\n` +
                        `👤 Responsável: ${dados.nomeSolicitante}\n` +
                        `📞 Contato: ${dados.solicitanteId}\n` +
                        `📆 Data/Horário Solicitado: ${dados.dataHorarioTexto}\n` +
                        `📍 Local: ${dados.local}\n` +
                        `💰 Valores / Repasse: ${dados.valores}\n` +
                        `🏛️ Salão antes do evento: ${dados.precisaSalaoAntes ? dados.salaoDetalhes : "Não"}\n` +
                        `📝 Observações: ${dados.observacoes}\n` +
                        `📜 Termo de responsabilidade aceito.`,
                      location: dados.local,
                      start: { dateTime: dataIsoInicio, timeZone: "America/Sao_Paulo" },
                      end: { dateTime: dataIsoFim, timeZone: "America/Sao_Paulo" },
                    };

                    if (calendar && calendar.events && typeof calendar.events.insert === "function") {
                      await calendar.events.insert({ calendarId: calendarIdExternos, resource: resourceExterno });
                    }

                    if (dados.precisaSalaoAntes) {
                      const resourceSalao = {
                        summary: `[Preparação] Salão (Evento Externo) - ${dados.nomeEvento}`,
                        description:
                          `Uso do Salão antes/depois do Evento Externo (${dados.nomeEvento}).\n` +
                          `👤 Responsável: ${dados.nomeSolicitante} (${dados.solicitanteId})\n` +
                          `⏰ Período: ${dados.salaoDetalhes}\n` +
                          `🧹 Compromisso: Salão deve ser entregue limpo e organizado como encontrado.`,
                        location: ENDERECO_IGREJA,
                        start: { dateTime: dataIsoInicio, timeZone: "America/Sao_Paulo" },
                        end: { dateTime: dataIsoFim, timeZone: "America/Sao_Paulo" },
                      };
                      if (calendar && calendar.events && typeof calendar.events.insert === "function") {
                        await calendar.events.insert({ calendarId: calendarIdExternos, resource: resourceSalao });
                      }
                    }

                    const payloadExterno = montarPayloadEventoExterno(dados);
                    let linkDoc = "";
                    try {
                      const resultado = await enviarWebhookExterno(payloadExterno);
                      linkDoc = resultado?.url || "";
                    } catch (errWebhook) {
                      console.error("[Evento Externo] Erro no webhook Google Apps Script:", errWebhook);
                    }

                    salvarFormularioEvento({
                      evento: dados.nomeEvento,
                      departamento: "Eventos Externos",
                      data: dados.dataHora,
                      solicitanteId: dados.solicitanteId,
                      payload: payloadExterno,
                      docUrl: linkDoc,
                    });

                    removerPendente(codigo);

                    const feedbackUsuario =
                      `✅ *Solicitação de Evento Externo Aprovada!*\n\n` +
                      `Sua solicitação para o evento "*${dados.nomeEvento}*" foi aprovada pela secretaria e confirmada na agenda oficial! 🙏\n\n` +
                      (linkDoc
                        ? `📄 *Documento Oficial Gerado (Google Docs):*\n${linkDoc}\n\n`
                        : "") +
                      `Digite *menu* para voltar ao menu principal.`;

                    try {
                      await client.sendMessage(solicitanteId, feedbackUsuario);
                      console.log(`[Secretaria] Confirmação de evento externo enviada para ${mascararTelefone(solicitanteId)}`);
                    } catch (sendErr) {
                      console.error(`[ALERTA:whatsapp] Erro ao enviar confirmação de evento externo para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                    }

                    const confirmacaoGrupo =
                      `✅ *Evento Externo Aprovado e Documento Criado com Sucesso!*\n\n` +
                      `• *Evento:* ${dados.nomeEvento}\n` +
                      `• *Responsável:* ${dados.nomeSolicitante}\n` +
                      `• *Data/Horário:* ${dados.dataHorarioTexto}\n` +
                      `• *Local:* ${dados.local}\n` +
                      (linkDoc ? `📄 *Link do Documento Gerado:*\n${linkDoc}` : `⚠️ Documento gerado sem URL de retorno.`);

                    return msg.reply(confirmacaoGrupo);
                  } catch (err) {
                    console.error("[ALERTA:evento-externo] Erro ao aprovar evento externo:", err);
                    return msg.reply("❌ Erro ao salvar o evento externo na agenda do Google. Responda de novo a esta mensagem após corrigir.");
                  }
                } else {
                  removerPendente(codigo);
                  const feedbackRecusa =
                    `❌ *Solicitação de Evento Externo*\n\n` +
                    `Infelizmente não pudemos aprovar sua solicitação para o evento "*${dados.nomeEvento}*".\n` +
                    `Por favor, entre em contato diretamente com a secretaria para mais informações.\n\n` +
                    `Digite *menu* para voltar ao menu principal.`;

                  try {
                    await client.sendMessage(solicitanteId, feedbackRecusa);
                    console.log(`[Secretaria] Recusa de evento externo enviada para ${mascararTelefone(solicitanteId)}`);
                  } catch (sendErr) {
                    console.error(`[ALERTA:whatsapp] Erro ao enviar recusa de evento externo para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                  }
                  return msg.reply(`✅ Solicitante notificado sobre a recusa do evento externo.`);
                }
              }

              if (dados.tipo === "uso_salao") {
                const { solicitanteId } = dados;
                if (isMarcar) {
                  try {
                    const ano = dados.ano || moment().tz("America/Sao_Paulo").year();
                    const dataIsoInicio = moment.tz(
                      `${dados.dia}/${dados.mes}/${ano} ${dados.horarioInicio}`,
                      "D/M/YYYY HH:mm",
                      "America/Sao_Paulo"
                    ).format();
                    const dataIsoFim = moment.tz(
                      `${dados.dia}/${dados.mes}/${ano} ${dados.horarioFim}`,
                      "D/M/YYYY HH:mm",
                      "America/Sao_Paulo"
                    ).format();

                    const resource = {
                      summary: `Uso do Salão - ${dados.nomeSolicitante || "Membro"}`,
                      description: `Uso do Salão solicitado por membro.\n👤 Solicitante: ${dados.nomeSolicitante}\n📞 Contato: ${dados.solicitanteId}\n🎯 Finalidade: ${dados.finalidade || "Uso Geral"}\n📜 Termo de responsabilidade aceito.`,
                      location: ENDERECO_IGREJA,
                      start: { dateTime: dataIsoInicio, timeZone: "America/Sao_Paulo" },
                      end: { dateTime: dataIsoFim, timeZone: "America/Sao_Paulo" },
                    };

                    const calendarId = AGENDAS_INTERNAS.USO_SALAO || agendasParaLer[15];
                    await calendar.events.insert({ calendarId, resource });
                    removerPendente(codigo);

                    const feedback =
                      `✅ *Solicitação de Uso do Salão Aprovada!*\n\n` +
                      `Sua solicitação para uso do salão no dia *${dados.dataFormatada}* das *${dados.horarioInicio} às ${dados.horarioFim}* foi *aprovada* pela secretaria!\n\n` +
                      `⚠️ *Lembrete Importante:* Todas as coisas e dependências do salão devem ser mantidas intactas e o espaço deve ser entregue limpo e organizado nas mesmas condições em que for encontrado. 🙏\n\n` +
                      `Digite *menu* para voltar ao menu principal.`;
                    try {
                      await client.sendMessage(solicitanteId, feedback);
                      console.log(`[Secretaria] Confirmação de uso do salão enviada para ${mascararTelefone(solicitanteId)}`);
                    } catch (sendErr) {
                      console.error(`[ALERTA:whatsapp] Erro ao enviar confirmação de salão para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                    }
                    return msg.reply(`✅ Uso do Salão aprovado, registrado na agenda do salão e membro notificado com sucesso.`);
                  } catch (err) {
                    console.error("[ALERTA:google-calendar] Erro no agendamento de uso do salão:", err);
                    return msg.reply("❌ Erro ao salvar na agenda do Google. A permissão ou conflito impediu a gravação automática. Responda de novo a esta mesma mensagem depois de resolvido.");
                  }
                } else {
                  removerPendente(codigo);
                  const feedback =
                    `❌ *Solicitação de Uso do Salão*\n\n` +
                    `Infelizmente não pudemos aprovar sua solicitação para uso do salão no dia *${dados.dataFormatada}*. Para mais informações, entre em contato diretamente com a secretaria.\n\n` +
                    `Digite *menu* para voltar ao menu principal.`;
                  try {
                    await client.sendMessage(solicitanteId, feedback);
                    console.log(`[Secretaria] Recusa de uso do salão enviada para ${mascararTelefone(solicitanteId)}`);
                  } catch (sendErr) {
                    console.error(`[ALERTA:whatsapp] Erro ao enviar recusa de salão para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                  }
                  return msg.reply(`✅ Solicitante notificado sobre a recusa do uso do salão.`);
                }
              }

              if (dados.tipo === "reuniao") {
                const { solicitanteId, departamento } = dados;

                if (isMarcar) {
                  try {
                    const ano = dados.ano || moment().tz("America/Sao_Paulo").year();
                    const tituloEvento = formatarTituloReuniao(departamento);
                    const resource = {
                      summary: tituloEvento,
                      description: `Agendado via Bot - Departamento: ${departamento}\nSolicitante: ${dados.solicitanteNome || ""}\nTelefone: ${solicitanteId || ""}`,
                      location: dados.local || ENDERECO_IGREJA,
                      start: {
                        dateTime: moment.tz(`${dados.dia}/${dados.mes}/${ano} ${dados.horarioInicio}`, "D/M/YYYY HH:mm", "America/Sao_Paulo").format(),
                        timeZone: "America/Sao_Paulo",
                      },
                      end: {
                        dateTime: moment.tz(`${dados.dia}/${dados.mes}/${ano} ${dados.horarioFim}`, "D/M/YYYY HH:mm", "America/Sao_Paulo").format(),
                        timeZone: "America/Sao_Paulo",
                      },
                    };

                    await calendar.events.insert({ calendarId: AGENDAS_INTERNAS.REUNIOES, resource });
                    try {
                      salvarFormularioEvento({
                        evento: tituloEvento,
                        departamento: departamento,
                        data: `${dados.dia}/${dados.mes}/${ano}`,
                        solicitanteId: solicitanteId,
                        payload: {
                          nomeSolicitante: dados.solicitanteNome || "",
                          departamento,
                          data: `${dados.dia}/${dados.mes}/${ano}`,
                          horario: `${dados.horarioInicio} às ${dados.horarioFim}`,
                        },
                      });
                    } catch (eForm) {
                      console.error("[Secretaria] Erro ao registrar formulário inicial de reunião:", eForm.message);
                    }
                    removerPendente(codigo);

                    const feedback = `✅ *Reunião Confirmada e Agendada!*\n\nSua reunião foi aprovada pela secretaria e já consta na agenda de Reuniões. 🙏\n\n📋 *Ata de Reunião:*\nO arquivo da Ata de Reunião foi enviado em anexo e também pode ser acessado pelo link:\n${LINK_ATA_REUNIAO}\n\nEle deve ser impresso e preenchido com as informações da reunião e assinaturas, e depois entregue para uma das secretárias para arquivar.`;
                    await enviarConfirmacaoReuniaoComAta(client, solicitanteId, feedback);
                    console.log(`[Secretaria] Reunião agendada automaticamente para ${mascararTelefone(solicitanteId)}`);
                    return msg.reply(`✅ Reunião gravada na agenda de *Reuniões* e líder notificado com a Ata.`);
                  } catch (err) {
                    console.error("[ALERTA:google-calendar] Erro no agendamento de reunião:", err);
                    return msg.reply("❌ Erro ao salvar na agenda do Google. A permissão ou conflito impediu a gravação automática. Responda de novo a esta mesma mensagem depois de resolvido.");
                  }
                } else {
                  removerPendente(codigo);
                  const feedback = "❌ *Aviso de Solicitação de Reunião*\n\nInfelizmente não pudemos confirmar sua solicitação de reunião para esta data. Por favor, entre em contato com a secretaria para verificar outras opções.\n\nDigite *menu* para voltar ao menu principal.";
                  try {
                    await client.sendMessage(solicitanteId, feedback);
                    console.log(`[Secretaria] Feedback de recusa de reunião enviado para ${mascararTelefone(solicitanteId)}`);
                  } catch (sendErr) {
                    console.error(`[ALERTA:whatsapp] Erro ao enviar feedback de reunião para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                  }
                  return msg.reply(`✅ Líder notificado sobre a recusa da reunião.`);
                }
              }

              const { solicitanteId, rede } = dados;

              if (isMarcar) {
                try {
                  const ano = moment().tz("America/Sao_Paulo").year();
                  const agendaId = agendasParaLer[mapearRedeParaAgendaIndex(rede)];

                  if (dados.tipoDuracao === "multiplo" && Array.isArray(dados.blocos)) {
                    const resources = montarResourcesMultiplosBlocos(dados, ano);
                    for (const resItem of resources) {
                      await calendar.events.insert({ calendarId: agendaId, resource: resItem });
                    }
                  } else {
                    const resource = montarResourceEvento(dados, ano);
                    await calendar.events.insert({ calendarId: agendaId, resource });
                  }

                  if (dados.descricao) {
                    salvarDescricaoEvento({
                      evento: dados.evento || dados.nomeEvento,
                      departamento: rede,
                      local: dados.local,
                      tipoDuracao: dados.tipoDuracao || "unico",
                      horarios: dados.blocos || { inicio: dados.horarioInicio, fim: dados.horarioFim },
                      descricao: dados.descricao
                    });
                  }
                  try {
                    salvarFormularioEvento({
                      evento: dados.nomeEvento,
                      departamento: rede,
                      data: `${dados.dia}/${dados.mes}/${ano}`,
                      solicitanteId: solicitanteId,
                      payload: {
                        nomeSolicitante: dados.solicitanteNome || "",
                        nome_lider: dados.solicitanteNome || "",
                        departamento: rede,
                        data: `${dados.dia}/${dados.mes}/${ano}`,
                        horario_inicio: dados.horarioInicio,
                        horario_termino: dados.horarioFim,
                        local: dados.local || "",
                      },
                    });
                  } catch (eForm) {
                    console.error("[Secretaria] Erro ao registrar formulário inicial de evento:", eForm.message);
                  }
                  removerPendente(codigo);

                  const feedback = "✅ *Agendamento Confirmado e Gravado!*\n\nSua solicitação foi aprovada e já consta na agenda oficial. 🙏";
                  await client.sendMessage(solicitanteId, feedback);
                  await iniciarFormularioEvento({ etapas, solicitanteId, dadosIniciais: dados, client });
                  console.log(`[Secretaria] Agendamento automático realizado e formulário iniciado para ${mascararTelefone(solicitanteId)}`);
                  return msg.reply(`✅ Evento gravado na agenda de *${rede}*, líder notificado e formulário iniciado.`);
                } catch (err) {
                  console.error("[ALERTA:google-calendar] Erro no agendamento automático:", err);
                  return msg.reply("❌ Erro ao salvar na agenda do Google. A permissão ou conflito impediu a gravação automática. Responda de novo a esta mesma mensagem depois de resolvido.");
                }
              } else {
                removerPendente(codigo);
                const feedback = "❌ *Aviso de Agendamento*\n\nInfelizmente não pudemos confirmar sua solicitação de evento para esta data. Por favor, entre em contato com a secretaria para verificar outras opções.\n\nDigite *menu* para voltar ao menu principal.";
                try {
                  await client.sendMessage(solicitanteId, feedback);
                  console.log(`[Secretaria] Feedback de recusa enviado para ${mascararTelefone(solicitanteId)}`);
                } catch (sendErr) {
                  console.error(`[ALERTA:whatsapp] Erro ao enviar feedback para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                }
                return msg.reply(`✅ Líder notificado sobre a recusa.`);
              }
            }
          } else if (isAlterar || isNaoAlterar) {
            if (ehMensagemDoBot || textoQuoted.includes("CÓDIGO") || textoQuoted.includes("Código")) {
              const codigo = extrairCodigo(textoQuoted);
              const dados = codigo ? buscarPendente(codigo) : null;
              if (!dados) {
                return msg.reply("❌ Não encontrei essa solicitação (código inválido ou já respondido antes).");
              }

              if (dados.tipo === "adicionar_sessao") {
                const { solicitanteId } = dados;
                if (isAlterar) {
                  try {
                    const resource = {
                      summary: dados.tituloSessao || `${dados.evento} - Sessão ${dados.numeroSessao}`,
                      description: dados.description || `Sessão adicional do evento ${dados.evento}\nSolicitante: ${dados.solicitanteNome || ""}`,
                      location: dados.local || ENDERECO_IGREJA,
                      start: { dateTime: dados.startIso, timeZone: "America/Sao_Paulo" },
                      end: { dateTime: dados.endIso, timeZone: "America/Sao_Paulo" }
                    };
                    if (calendar && calendar.events && typeof calendar.events.insert === "function") {
                      await calendar.events.insert({ calendarId: dados.calendarId, resource });
                    }
                    removerPendente(codigo);
                    const feedback = `✅ *Novo Dia/Sessão Aprovado e Adicionado!*\n\nO novo dia para o evento "*${dados.evento}*" (${dados.dataFormatada} das ${dados.horarioInicio} às ${dados.horarioFim}) foi aprovado pela secretaria e adicionado à agenda oficial! 🙏\n\nDigite *menu* para voltar ao menu principal.`;
                    try {
                      await client.sendMessage(solicitanteId, feedback);
                    } catch (eSend) {
                      console.error(`[ALERTA:whatsapp] Erro ao enviar feedback de nova sessão:`, eSend.message);
                    }
                    return msg.reply(`✅ Novo dia/sessão adicionado à agenda e líder notificado.`);
                  } catch (err) {
                    console.error("[ALERTA:google-calendar] Erro ao adicionar nova sessão:", err);
                    return msg.reply("❌ Erro ao adicionar o novo dia na agenda do Google. Responda de novo a esta mesma mensagem depois de resolvido.");
                  }
                } else {
                  removerPendente(codigo);
                  const feedback = `❌ *Solicitação de Novo Dia Não Aprovada*\n\nInfelizmente sua solicitação de adicionar um novo dia ao evento "*${dados.evento}*" não pôde ser aprovada. Por favor, entre em contato com a secretaria.\n\nDigite *menu* para voltar ao menu principal.`;
                  try {
                    await client.sendMessage(solicitanteId, feedback);
                  } catch (eSend) {
                    console.error(`[ALERTA:whatsapp] Erro ao enviar feedback de recusa de nova sessão:`, eSend.message);
                  }
                  return msg.reply(`✅ Solicitante notificado sobre a recusa do novo dia.`);
                }
              }

              if (dados.tipo === "reuniao_alterar") {
                const { solicitanteId, evento } = dados;

                if (isAlterar) {
                  const resourcePatch = dados.campo ? montarResourcePatchAlteracao(dados) : null;

                  if (resourcePatch) {
                    try {
                      await calendar.events.patch({ calendarId: dados.calendarId, eventId: dados.eventId, resource: resourcePatch });
                      removerPendente(codigo);

                      const feedback = `✅ *Alteração de Reunião Aprovada!*\n\nSua solicitação de alteração para a reunião "*${evento}*" foi aprovada e já foi atualizada na agenda oficial. 🙏\n\nDigite *menu* para voltar ao menu principal.`;
                      await client.sendMessage(solicitanteId, feedback);
                      console.log(`[Secretaria] Alteração de reunião aplicada para ${mascararTelefone(solicitanteId)}`);
                      return msg.reply(`✅ Alteração aplicada na agenda de Reuniões e líder notificado.`);
                    } catch (err) {
                      console.error("[ALERTA:google-calendar] Erro ao aplicar alteração de reunião:", err);
                      return msg.reply("❌ Erro ao aplicar a alteração na agenda do Google. Responda de novo a esta mesma mensagem depois de resolvido.");
                    }
                  }

                  removerPendente(codigo);
                  const feedback = `✅ *Alteração de Reunião Aprovada!*\n\nSua solicitação de alteração para a reunião "*${evento}*" foi aprovada pela secretaria. 🙏\n\nDigite *menu* para voltar ao menu principal.`;
                  try {
                    await client.sendMessage(solicitanteId, feedback);
                  } catch (sendErr) {
                    console.error(`[ALERTA:whatsapp] Erro ao enviar feedback de alteração para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                  }
                  return msg.reply(`✅ Solicitante notificado sobre a aprovação da alteração de reunião.`);
                } else {
                  removerPendente(codigo);
                  const feedback = `❌ *Alteração de Reunião Não Aprovada*\n\nInfelizmente sua solicitação de alteração para a reunião "*${evento}*" não pôde ser aprovada. Por favor, entre em contato com a secretaria.\n\nDigite *menu* para voltar ao menu principal.`;
                  try {
                    await client.sendMessage(solicitanteId, feedback);
                  } catch (sendErr) {
                    console.error(`[ALERTA:whatsapp] Erro ao enviar feedback de recusa para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                  }
                  return msg.reply(`✅ Solicitante notificado sobre a recusa da alteração de reunião.`);
                }
              }

              const { solicitanteId, evento } = dados;

              if (isAlterar) {
                // Alterações estruturadas (horário/data/nome/local) carregam "campo" e
                // conseguem ser aplicadas automaticamente. O texto livre ("outro") não
                // tem como ser interpretado com segurança, então continua manual.
                const resourcePatch = dados.campo ? montarResourcePatchAlteracao(dados) : null;

                if (resourcePatch) {
                  try {
                    await calendar.events.patch({ calendarId: dados.calendarId, eventId: dados.eventId, resource: resourcePatch });
                    removerPendente(codigo);

                    const feedback = `✅ *Alteração Aprovada e Aplicada!*\n\nSua solicitação de alteração para o evento "*${evento}*" foi aprovada e já foi atualizada na agenda oficial. 🙏\n\nDigite *menu* para voltar ao menu principal.`;
                    await client.sendMessage(solicitanteId, feedback);
                    console.log(`[Secretaria] Alteração automática aplicada para ${mascararTelefone(solicitanteId)}`);
                    return msg.reply(`✅ Alteração aplicada na agenda e líder notificado.`);
                  } catch (err) {
                    console.error("[ALERTA:google-calendar] Erro ao aplicar alteração automática:", err);
                    return msg.reply("❌ Erro ao aplicar a alteração na agenda do Google. A permissão ou conflito impediu a gravação automática. Responda de novo a esta mesma mensagem depois de resolvido.");
                  }
                }

                removerPendente(codigo);
                const feedback = `✅ *Alteração Aprovada!*\n\nSua solicitação de alteração para o evento "*${evento}*" foi aprovada pela secretaria. 🙏\n\nDigite *menu* para voltar ao menu principal.`;
                try {
                  await client.sendMessage(solicitanteId, feedback);
                  console.log(`[Secretaria] Feedback de alteração aprovada enviado para ${mascararTelefone(solicitanteId)}`);
                } catch (sendErr) {
                  console.error(`[ALERTA:whatsapp] Erro ao enviar feedback de alteração para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                }
                return msg.reply(`✅ Solicitante notificado sobre a aprovação da alteração.`);
              } else {
                removerPendente(codigo);
                const feedback = `❌ *Alteração Não Aprovada*\n\nInfelizmente sua solicitação de alteração para o evento "*${evento}*" não pôde ser aprovada. Por favor, entre em contato com a secretaria para mais detalhes.\n\nDigite *menu* para voltar ao menu principal.`;
                try {
                  await client.sendMessage(solicitanteId, feedback);
                  console.log(`[Secretaria] Feedback de alteração recusada enviado para ${mascararTelefone(solicitanteId)}`);
                } catch (sendErr) {
                  console.error(`[ALERTA:whatsapp] Erro ao enviar feedback de alteração para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                }
                return msg.reply(`✅ Solicitante notificado sobre a recusa da alteração.`);
              }
            }
          } else if (isCancelar || isManter) {
            if (ehMensagemDoBot || textoQuoted.includes("CÓDIGO") || textoQuoted.includes("Código")) {
              const codigo = extrairCodigo(textoQuoted);
              const dados = codigo ? buscarPendente(codigo) : null;
              if (!dados) {
                return msg.reply("❌ Não encontrei essa solicitação (código inválido ou já respondido antes).");
              }

              if (dados.tipo === "reuniao_cancelar") {
                const { solicitanteId, evento, calendarId, eventId } = dados;

                if (isCancelar) {
                  try {
                    await calendar.events.delete({ calendarId, eventId });
                    removerPendente(codigo);

                    const feedback = `❌ *Reunião Desmarcada*\n\nSua solicitação para desmarcar a reunião "*${evento}*" foi aprovada e ela foi removida da agenda oficial.\n\nDigite *menu* para voltar ao menu principal.`;
                    await client.sendMessage(solicitanteId, feedback);
                    console.log(`[Secretaria] Reunião desmarcada automaticamente para ${mascararTelefone(solicitanteId)}`);
                    return msg.reply(`✅ Reunião desmarcada na agenda e líder notificado.`);
                  } catch (err) {
                    console.error("[ALERTA:google-calendar] Erro ao desmarcar reunião:", err);
                    return msg.reply("❌ Erro ao desmarcar a reunião na agenda do Google. Responda de novo a esta mesma mensagem depois de resolvido.");
                  }
                } else {
                  removerPendente(codigo);
                  const feedback = `✅ *Reunião Mantida*\n\nSua solicitação para desmarcar a reunião "*${evento}*" não foi aprovada — a reunião continua marcada normalmente.\n\nDigite *menu* para voltar ao menu principal.`;
                  try {
                    await client.sendMessage(solicitanteId, feedback);
                  } catch (sendErr) {
                    console.error(`[ALERTA:whatsapp] Erro ao enviar feedback de reunião mantida para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                  }
                  return msg.reply(`✅ Líder notificado que a reunião foi mantida.`);
                }
              }

              const { solicitanteId, evento, calendarId, eventId, eventIds } = dados;

              if (isCancelar) {
                try {
                  if (eventIds && Array.isArray(eventIds) && eventIds.length > 0) {
                    for (const idSess of eventIds) {
                      try {
                        await calendar.events.delete({ calendarId, eventId: idSess });
                      } catch (errDel) {
                        console.warn(`[Secretaria] Erro ao cancelar sessao ${idSess}:`, errDel.message);
                      }
                    }
                  } else {
                    await calendar.events.delete({ calendarId, eventId });
                  }
                  removerPendente(codigo);

                  const feedback = `❌ *Evento Cancelado*\n\nSua solicitação de cancelamento do evento "*${evento}*" foi aprovada e o evento foi removido da agenda oficial.\n\nDigite *menu* para voltar ao menu principal.`;
                  await client.sendMessage(solicitanteId, feedback);
                  console.log(`[Secretaria] Cancelamento automático realizado para ${mascararTelefone(solicitanteId)}`);
                  return msg.reply(`✅ Evento cancelado na agenda e líder notificado.`);
                } catch (err) {
                  console.error("[ALERTA:google-calendar] Erro no cancelamento automático:", err);
                  return msg.reply("❌ Erro ao cancelar o evento na agenda do Google. A permissão ou conflito impediu a exclusão automática. Responda de novo a esta mesma mensagem depois de resolvido.");
                }
              } else {
                removerPendente(codigo);
                const feedback = `✅ *Evento Mantido*\n\nSua solicitação de cancelamento do evento "*${evento}*" não foi aprovada — o evento continua marcado normalmente.\n\nDigite *menu* para voltar ao menu principal.`;
                try {
                  await client.sendMessage(solicitanteId, feedback);
                  console.log(`[Secretaria] Feedback de manutenção de evento enviado para ${mascararTelefone(solicitanteId)}`);
                } catch (sendErr) {
                  console.error(`[ALERTA:whatsapp] Erro ao enviar feedback de manutenção para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
                }
                return msg.reply(`✅ Líder notificado que o evento foi mantido.`);
              }
            }
          }
        } else if (grupoPertence === NOME_GRUPO_PASTORAL) {
          atualizarCacheGrupo(NOME_GRUPO_PASTORAL, msg.from);

          if (ehMensagemDoBot || textoQuoted.includes("CÓDIGO") || textoQuoted.includes("Código")) {
            const codigo = extrairCodigo(textoQuoted);
            const dados = codigo ? buscarPendente(codigo) : null;

            if (dados && dados.tipo !== "pastoral") {
              const bodyLower = msg.body.trim().toLowerCase();
              const isAutorizado = /^(pode|sim|autoriz|liberado|ok)/i.test(bodyLower) || /pode marcar|autorizo/i.test(bodyLower);
              const isRecusado = /^(n[aã]o|recus|desautoriz)/i.test(bodyLower) || /n[aã]o pode/i.test(bodyLower);

              if (isAutorizado) {
                const nomeAtiv = dados.evento || dados.nomeEvento || dados.finalidade || "Atividade no Salão";
                const msgSec = `📢 *PASTORES AUTORIZARAM O USO DO SALÃO*\n\nOs pastores autorizaram a realização de *${nomeAtiv}* no salão da igreja durante o horário do Atendimento Pastoral.\nCódigo: ${codigo}`;
                await notificarSecretaria(client, msgSec);
                return msg.reply(`✅ Resposta dos pastores registrada! O uso do salão para *${nomeAtiv}* foi autorizado e a secretaria foi comunicada.`);
              }

              if (isRecusado) {
                const nomeAtiv = dados.evento || dados.nomeEvento || dados.finalidade || "Atividade no Salão";
                const msgSec = `⚠️ *PASTORES NÃO AUTORIZARAM O USO DO SALÃO*\n\nOs pastores NÃO autorizaram a realização de *${nomeAtiv}* no salão durante o horário do Atendimento Pastoral.\nCódigo: ${codigo}`;
                await notificarSecretaria(client, msgSec);
                return msg.reply(`❌ Resposta dos pastores registrada! A secretaria foi informada de que o salão NÃO poderá ser usado neste horário.`);
              }
            }

            if (!dados || dados.tipo !== "pastoral") {
              return msg.reply("❌ Não encontrei essa solicitação de atendimento (código inválido ou já respondido antes).");
            }

            const { solicitanteId, nome } = dados;

            const bodyTrimmed = msg.body.trim();
            const bodyLower = bodyTrimmed.toLowerCase();
            let diaHorario = "";

            if (bodyLower.startsWith("confirmar ")) {
              diaHorario = bodyTrimmed.slice("confirmar ".length).trim();
            } else if (bodyLower.startsWith("confirmado ")) {
              diaHorario = bodyTrimmed.slice("confirmado ".length).trim();
            }

            if (diaHorario) {
              removerPendente(codigo);

              const { dia, horario } = dividirDiaEHorario(diaHorario);
              const nomeCapitalizado = capitalizarNome(nome);

              let feedback = `Olá, ${nomeCapitalizado}! Tudo bem?\n\nSeu Atendimento Pastoral foi confirmado! 🙌\n\n🗓️ Dia: ${dia}`;
              if (horario) {
                feedback += `\n\n⏰ Horário: ${horario}`;
              }
              feedback += `\n\nCaso aconteça algum imprevisto, pedimos a gentileza de nos avisar com antecedência. Que Deus abençoe! 🙏`;

              const autorJid = msg.author || msg.from;
              const pastorNumero = autorJid.replace(/\D/g, "");
              const userPastor = resolverUsuario(pastorNumero);
              const nomePastorRegistrado = userPastor?.nome || "";
              registrarAgendamentoPastoral({
                pastorTelefone: pastorNumero,
                pastorNome: nomePastorRegistrado,
                discipulo: nome,
                dataHora: diaHorario,
              });

              try {
                await client.sendMessage(solicitanteId, feedback);
                console.log(`[Pastoral] Atendimento confirmado para ${nome} (${mascararTelefone(solicitanteId)}): ${diaHorario}`);
              } catch (sendErr) {
                console.error(`[ALERTA:whatsapp] Erro ao enviar confirmação de pastoral para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
              }
              return msg.reply(`✅ Atendimento de *${nome}* confirmado para *${diaHorario}*. O discípulo foi notificado.`);

            } else if (textoMsg === "não confirmar" || textoMsg === "recusar") {
              removerPendente(codigo);

              const nomeCapitalizado = capitalizarNome(nome);
              const dispFormatada = formatarDisponibilidadeNegativa(dados.disponibilidade);

              const feedback = `Olá, ${nomeCapitalizado}! Tudo bem?\n\nInfelizmente não teremos disponibilidade para o Atendimento Pastoral ${dispFormatada} no momento.\n\nVocê teria outro dia ou horário disponível para verificarmos novamente com a equipe?\n\nFicamos no aguardo e continuamos à disposição! 🙏`;

              try {
                await client.sendMessage(solicitanteId, feedback);
                console.log(`[Pastoral] Atendimento recusado para ${nome} (${mascararTelefone(solicitanteId)})`);
              } catch (sendErr) {
                console.error(`[ALERTA:whatsapp] Erro ao enviar recusa de pastoral para ${mascararTelefone(solicitanteId)}:`, sendErr.message);
              }
              return msg.reply(`❌ Atendimento de *${nome}* não confirmado e discípulo notificado.`);

            } else {
              return msg.reply("❌ Comando inválido para atendimento pastoral. Responda com \"confirmar [dia/horário]\" ou \"não confirmar\".");
            }
          }
        }
        return; // Ignora outras mensagens em grupos
      }

      const contato = await msg.getContact();
      const numero = (contato && contato.id && (contato.id._serialized || contato.id.user)) || msg.from || "";
      const texto = (msg.body || "").toLowerCase().trim();
      const usuario = resolverUsuario(numero);
      const isLider = temPermissao(usuario, "lider") || lideres.some((l) => numero.includes(l));
      const isPastor = temPermissao(usuario, "pastor");
      const isDiretor = temPermissao(usuario, "diretor");
      const isMembro = temPermissao(usuario, "membro");

      console.log(`[Mensagem Recebida] De: ${identificarUsuario(contato, numero, isLider, usuario)} | Texto: "${msg.body}"`);



      // Intercepta resposta do Pastor à consulta de concorrência com o Salão (no privado)
      let codigoPastor = null;
      if (msg.hasQuotedMsg) {
        try {
          const quoted = await comRetry(() => msg.getQuotedMessage());
          if (quoted && quoted.body) {
            codigoPastor = extrairCodigo(quoted.body);
          }
        } catch (_) { }
      }
      if (!codigoPastor) {
        codigoPastor = extrairCodigo(msg.body);
      }

      const pendentePastor = buscarPendentePorPastor(numero, codigoPastor);
      if (pendentePastor) {
        const bodyTrim = (msg.body || "").trim().toLowerCase();
        const isAutorizado =
          /^(sim|pode|autoriz|autorizado|autorizo|liberado|ok|pode marcar)/i.test(bodyTrim) ||
          bodyTrim.includes("pode marcar") ||
          bodyTrim.includes("autorizo");
        const isRecusado =
          /^(n[aã]o|nao|recus|recuso|recusado|n[aã]o pode|nao pode|n[aã]o autorizo|nao autorizo)/i.test(bodyTrim) ||
          bodyTrim.includes("não pode") ||
          bodyTrim.includes("nao pode") ||
          bodyTrim.includes("não autorizo") ||
          bodyTrim.includes("nao autorizo");

        if (isAutorizado) {
          pendentePastor.aguardandoPastor = false;
          pendentePastor.pastorAutorizou = true;
          pendentePastor.autorizadoPorPastorEm = new Date().toISOString();
          atualizarPendente(pendentePastor.codigo, pendentePastor);

          const nomeAtiv = pendentePastor.evento || pendentePastor.nomeEvento || pendentePastor.finalidade || "Atividade no Salão";
          await msg.reply(`✅ Obrigado, Pastor! Sua autorização para a realização de *${nomeAtiv}* no salão foi registrada com sucesso.\n\nA solicitação agora foi encaminhada para a aprovação final da Secretaria.`);

          // Notifica o solicitante
          try {
            const feedbackSolicitante =
              `✅ *Pastor Autorizou o Uso do Salão!*\n\n` +
              `O Pastor responsável pelo atendimento no mesmo horário autorizou a realização da sua atividade (*${nomeAtiv}*).\n\n` +
              `Sua solicitação foi encaminhada agora para a Secretaria para confirmação e agendamento oficial. Aguarde a confirmação final! 🙏\n\n` +
              `Digite *menu* para voltar ao menu principal.`;
            await client.sendMessage(pendentePastor.solicitanteId, feedbackSolicitante);
          } catch (errSol) {
            console.error(`[ALERTA:whatsapp] Erro ao avisar solicitante sobre autorização do pastor:`, errSol.message);
          }

          // Encaminha agora para o grupo da Secretaria com a autorização confirmada
          try {
            let resumoSecretaria = "";
            if (pendentePastor.tipo === "uso_salao") {
              resumoSecretaria =
                `🏛️ *NOVA SOLICITAÇÃO DE USO DO SALÃO*\n\n` +
                `👤 *Solicitante:* ${pendentePastor.nomeSolicitante}\n` +
                `📆 *Data:* ${pendentePastor.dataFormatada}\n` +
                `⏰ *Horário:* ${pendentePastor.horarioInicio} às ${pendentePastor.horarioFim}\n` +
                `📝 *Finalidade:* ${pendentePastor.finalidade}\n` +
                `📜 *Termo de Responsabilidade:* Aceito pelo solicitante.\n\n` +
                `👔 *Autorização Pastoral:* O Pastor ${pendentePastor.pastorNome || ""} já autorizou o uso do salão no horário do atendimento pastoral. ✅\n\n` +
                `_Responda a este resumo com "aprovar salão" ou "recusar salão" para confirmar._\n\n` +
                `_Código: ${pendentePastor.codigo}_`;
            } else if (pendentePastor.tipo === "reuniao") {
              resumoSecretaria =
                `🤝 *NOVA REUNIÃO SOLICITADA*\n\n` +
                `👤 *Solicitante:* ${pendentePastor.solicitanteNome || pendentePastor.solicitanteId}\n` +
                `🏢 *Departamento:* ${pendentePastor.departamento}\n` +
                `📆 *Data:* ${pendentePastor.dataFormatada}\n` +
                `⏰ *Horário:* ${pendentePastor.horarioInicio} - ${pendentePastor.horarioFim}\n` +
                `📍 *Local:* ${pendentePastor.local || "Igreja"}\n\n` +
                `👔 *Autorização Pastoral:* O Pastor ${pendentePastor.pastorNome || ""} já autorizou o uso do salão no horário do atendimento pastoral. ✅\n\n` +
                `_Responda a este resumo com "marcar reunião" ou "não marcar" para aprovar._\n\n` +
                `_Código: ${pendentePastor.codigo}_`;
            } else {
              resumoSecretaria =
                `🔔 *NOVO AGENDAMENTO SOLICITADO*\n\n` +
                `👤 *Solicitante:* ${pendentePastor.solicitanteNome || pendentePastor.solicitanteId}\n` +
                `📅 *Evento:* ${pendentePastor.evento}\n` +
                `📍 *Local:* ${pendentePastor.local}\n` +
                `🏢 *Depto:* ${pendentePastor.rede}\n` +
                `📆 *Data:* ${pendentePastor.dataFormatada}\n` +
                `⏰ *Horário:* ${pendentePastor.horarioInicio} - ${pendentePastor.horarioFim}\n\n` +
                `👔 *Autorização Pastoral:* O Pastor ${pendentePastor.pastorNome || ""} já autorizou o uso do salão no horário do atendimento pastoral. ✅\n\n` +
                `_Responda a este resumo com "marcar evento" ou "não marcar" para realizar o agendamento automático._\n\n` +
                `_Código: ${pendentePastor.codigo}_`;
            }
            await notificarSecretaria(client, resumoSecretaria);
          } catch (errSec) {
            console.error(`[ALERTA:secretaria] Erro ao enviar resumo autorizado para a secretaria:`, errSec.message);
          }

          return;
        } else if (isRecusado) {
          removerPendente(pendentePastor.codigo);
          const nomeAtiv = pendentePastor.evento || pendentePastor.nomeEvento || pendentePastor.finalidade || "Atividade no Salão";
          await msg.reply(`❌ Resposta registrada! A solicitação de uso do salão para *${nomeAtiv}* foi recusada e cancelada.`);

          // Notifica o solicitante sobre a recusa do pastor
          try {
            const feedbackRecusa =
              `❌ *Solicitação Não Autorizada*\n\n` +
              `Infelizmente o Pastor responsável pelo atendimento pastoral agendado no mesmo horário não pôde autorizar o uso do salão para "*${nomeAtiv}*".\n\n` +
              `Por favor, escolha outro dia ou horário para realizar sua atividade.\n\n` +
              `Digite *menu* para voltar ao menu principal.`;
            await client.sendMessage(pendentePastor.solicitanteId, feedbackRecusa);
          } catch (errSol) {
            console.error(`[ALERTA:whatsapp] Erro ao avisar solicitante sobre recusa do pastor:`, errSol.message);
          }

          // NÃO envia para a secretaria!
          return;
        }
      }

      // Se há um lembrete de evento pendente aguardando resposta desse número (em memória ou no banco SQLite)
      const telDigitos = String(numero).replace(/\D/g, "");
      let lembreteDb = null;
      let isQuotedLembrete = false;
      let eventoQuoted = "";
      if (!etapas[numero] && !etapas[telDigitos]) {
        if (msg.hasQuotedMsg) {
          try {
            const quoted = await comRetry(() => msg.getQuotedMessage());
            if (quoted && quoted.body && /Lembrete de Evento Se Aproximando|Passando para saber:.*está confirmad/i.test(quoted.body)) {
              isQuotedLembrete = true;
              const matchEv = quoted.body.match(/📅\s*\*Evento:\*\s*([^\n\r]+)/i) || quoted.body.match(/reunião\s*["“\*]([^"”\*]+)["”\*]/i);
              if (matchEv) eventoQuoted = matchEv[1].trim();
            }
          } catch (_) { }
        }

        lembreteDb = buscarLembreteAguardandoResposta(telDigitos);
        if (lembreteDb || isQuotedLembrete) {
          if (texto !== "menu" && !(texto.length <= 50 && SAUDACOES_REGEX.test(texto))) {
            const infoLembrete = {
              fluxo: "resposta_lembrete",
              etapa: "aguardando_resposta",
              ...(lembreteDb || {}),
              eventoNome: lembreteDb?.eventoNome || eventoQuoted || "Evento",
              tipoLembrete: lembreteDb?.tipoLembrete || "evento",
              destinatarioNome: lembreteDb?.destinatarioNome || usuario?.nome || "",
            };
            etapas[numero] = infoLembrete;
            const resRetorno = await processarRetornoLembrete({
              msg,
              numero,
              info: infoLembrete,
              client,
              notificarSecretaria,
              etapas,
              usuario,
              contato,
              tempoEsperaConfigurado: tempoEsperaRetornoConfigurado,
            });
            if (resRetorno !== null) {
              return resRetorno;
            }
          } else if (lembreteDb) {
            removerLembreteAguardandoResposta(telDigitos);
          }
        }
      }

      // Se a mensagem está respondendo uma mensagem que enviamos anteriormente (quoted message)
      // fora de qualquer fluxo automático ou lembrete:
      // "as vzes ela esta mandando msg respondendo uma msg que mandamos"
      if (!etapas[numero] && !etapas[telDigitos] && msg.hasQuotedMsg && !lembreteDb && !isQuotedLembrete) {
        let textoCitado = "";
        try {
          const quoted = await comRetry(() => msg.getQuotedMessage());
          if (quoted && quoted.body) {
            textoCitado = `\n📌 *Em resposta a:* "${quoted.body.slice(0, 100).replace(/[\r\n]+/g, ' ')}..."`;
          }
        } catch (_) {}

        console.log(`[Mensagem Quoted] De: ${identificarUsuario(contato, numero, isLider, usuario)} | Resposta a mensagem da equipe: "${msg.body}"`);

        const avisoSecretaria =
          `🔔 *RESPOSTA RECEBIDA A MENSAGEM ENVIADA*\n\n` +
          `👤 *Contato:* ${nomeContato(contato, numero)}\n` +
          `📞 *WhatsApp:* ${mascararTelefone(numero)}\n` +
          `💬 *Resposta do usuário:* "${msg.body}"${textoCitado}\n\n` +
          `⚠️ _O usuário respondeu a uma mensagem nossa. O menu automático foi silenciado para atendimento pela equipe._`;

        if (typeof notificarSecretaria === "function") {
          try {
            await notificarSecretaria(client, avisoSecretaria);
          } catch (err) {
            console.error("[Quoted] Erro ao notificar secretaria:", err);
          }
        }
        return;
      }

      // Se já havia uma saudação recente pendente aguardando para ver se o usuário enviava mais mensagens
      if (pendentesSaudacao.has(numero)) {
        const pendente = pendentesSaudacao.get(numero);
        clearTimeout(pendente.timer);
        pendentesSaudacao.delete(numero);

        const ehOutraSaudacao = texto !== "menu" && texto.length <= 50 && SAUDACOES_REGEX.test(texto);
        if (ehOutraSaudacao) {
          pendente.textos.push(msg.body);
          const tempoEspera = tempoEsperaConfigurado;

          if (tempoEspera > 0) {
            pendente.timer = setTimeout(async () => {
              pendentesSaudacao.delete(numero);
              try {
                delete etapas[numero];
                const menu = montarTextoMenuPrincipal({
                  isMembro: pendente.isMembro,
                  isPastor: pendente.isPastor,
                  isDiretor: pendente.isDiretor,
                  isLider: pendente.isLider,
                  incluirPalavraMenu: false,
                });
                await pendente.msg.reply(menu);
              } catch (err) {
                console.error("[Saudação] Erro ao enviar menu após espera:", err);
              }
            }, tempoEspera);
            pendentesSaudacao.set(numero, pendente);
            return;
          } else {
            delete etapas[numero];
            const menu = montarTextoMenuPrincipal({
              isMembro: pendente.isMembro,
              isPastor: pendente.isPastor,
              isDiretor: pendente.isDiretor,
              isLider: pendente.isLider,
              incluirPalavraMenu: false,
            });
            return msg.reply(menu);
          }
        }

        // Se for uma das opções numéricas do menu que o usuário já enviou
        if (/^[1-7]$/.test(texto)) {
          // Deixa fluir normalmente para a opção escolhida abaixo
        } else {
          // "se mandar algo que seja outro contexto vc ignora a mensagem e avisa a gente"
          const todasMsgs = [...pendente.textos, msg.body].filter(Boolean).join("\n↳ ");
          console.log(`[Saudação -> Outro Contexto] De: ${identificarUsuario(contato, numero, isLider, usuario)} | Mensagens: "${todasMsgs}"`);

          const avisoSecretaria =
            `🔔 *NOVA MENSAGEM RECEBIDA (ATENDIMENTO HUMANO)*\n\n` +
            `👤 *Contato:* ${nomeContato(contato, numero)}\n` +
            `📞 *WhatsApp:* ${mascararTelefone(numero)}\n` +
            `💬 *Mensagem do usuário:*\n↳ ${todasMsgs}\n\n` +
            `⚠️ _O usuário enviou uma mensagem em outro contexto após a saudação. O menu automático foi cancelado para atendimento pela equipe._`;

          if (typeof notificarSecretaria === "function") {
            try {
              await notificarSecretaria(client, avisoSecretaria);
            } catch (err) {
              console.error("[Saudação] Erro ao notificar secretaria:", err);
            }
          }
          return;
        }
      }

      const ehComandoMenu = texto === "menu";
      const ehSaudacao = !ehComandoMenu && texto.length <= 50 && SAUDACOES_REGEX.test(texto);

      if (ehComandoMenu) {
        delete etapas[numero];
        const menu = montarTextoMenuPrincipal({
          isMembro,
          isPastor,
          isDiretor,
          isLider,
          incluirPalavraMenu: false,
        });
        return msg.reply(menu);
      }

      if (ehSaudacao) {
        delete etapas[numero];

        const tempoEspera = tempoEsperaConfigurado;

        if (tempoEspera <= 0) {
          const menu = montarTextoMenuPrincipal({
            isMembro,
            isPastor,
            isDiretor,
            isLider,
            incluirPalavraMenu: false,
          });
          return msg.reply(menu);
        }

        const timer = setTimeout(async () => {
          pendentesSaudacao.delete(numero);
          try {
            delete etapas[numero];
            const menu = montarTextoMenuPrincipal({
              isMembro,
              isPastor,
              isDiretor,
              isLider,
              incluirPalavraMenu: false,
            });
            await msg.reply(menu);
          } catch (err) {
            console.error("[Saudação] Erro ao enviar menu após espera:", err);
          }
        }, tempoEspera);

        pendentesSaudacao.set(numero, {
          timer,
          msg,
          contato,
          usuario,
          isMembro,
          isPastor,
          isDiretor,
          isLider,
          textos: [msg.body],
        });
        return;
      }

      if (etapas[numero]) {
        const info = etapas[numero];
        console.log(`[Fluxo Ativo] ${identificarUsuario(contato, numero, isLider, usuario)} | Fluxo: ${info.fluxo} | Etapa: ${info.etapa}`);

        if (info.fluxo === "resposta_lembrete") {
          const resRetorno = await processarRetornoLembrete({
            msg,
            numero,
            info,
            client,
            notificarSecretaria,
            etapas,
            usuario,
            contato,
            tempoEsperaConfigurado: tempoEsperaRetornoConfigurado,
          });
          if (resRetorno !== null) {
            return resRetorno;
          }
        }

        if (info.fluxo === "inscricao_mulheres") {
          return await processarFluxoInscricaoMulheres({
            msg,
            numero,
            info,
            client,
            etapas,
          });
        }

        if (info.fluxo === "consulta_inscricoes") {
          return await processarFluxoConsultaInscricoes({
            msg,
            numero,
            info,
            client,
            etapas,
            usuario,
            isPastor,
            isDiretor,
            isLider,
            menuLiderFn: montarMenuLider,
            menuPastoralFn: montarMenuPastoral,
            menuDiretorFn: montarMenuDiretor,
          });
        }

        if (info.fluxo === "consulta_fichas_eventos") {
          return await processarFluxoConsultaFichasEventos({
            msg,
            numero,
            info,
            etapas,
            isPastor,
            isDiretor,
          });
        }

        if (info.fluxo === "evento_externo") {
          return await processarRespostaEventoExterno({
            msg,
            numero,
            info,
            client,
            notificarSecretaria,
            etapas,
            usuario,
            contato,
          });
        }

        if (info.fluxo === "formulario_evento") {
          return await processarRespostaFormulario({
            msg,
            numero,
            info,
            client,
            notificarSecretaria,
            notificarMultimidia,
            etapas,
            enviarWebhook,
            calendar,
            agendasParaLer,
          });
        }

        if (info.fluxo === "agendamento") {
          // Lógica de agendamento (Opção 6)
          if (info.etapa === "evento_acao") {
            const entradaAcao = msg.body.trim().toLowerCase();
            if (entradaAcao === "voltar") {
              if (isPastor) {
                info.fluxo = "area_pastoral";
                info.etapa = "pastoral_sub_agenda";
                return msg.reply(montarSubmenuPastoralAgenda());
              } else if (isDiretor) {
                info.fluxo = "area_diretor";
                info.etapa = "diretor_sub_agenda";
                return msg.reply(montarSubmenuDiretorAgenda());
              } else {
                info.fluxo = "area_lider";
                info.etapa = "lider_sub_agenda";
                return msg.reply(montarSubmenuLiderAgenda());
              }
            }
            if (msg.body === "1" || /agendar|novo/i.test(entradaAcao)) {
              info.etapa = "evento_nome";
              console.log(`[Fluxo] ${identificarUsuario(contato, numero, isLider)} iniciou novo agendamento.`);
              return msg.reply("📅 *Novo Agendamento*\nQual o nome do evento?");
            } else if (msg.body === "2" || /alterar/i.test(entradaAcao)) {
              info.acaoEvento = "alterar";
              info.etapa = "alterar_departamento";
              const redesUsuario = obterRedesParaUsuario(usuario);
              info.redesDisponiveis = redesUsuario;
              console.log(`[Fluxo] ${identificarUsuario(contato, numero, isLider)} iniciou alteração de evento.`);
              return msg.reply(`🏢 De qual departamento é o evento que deseja alterar?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
            } else if (msg.body === "3" || /cancelar/i.test(entradaAcao)) {
              info.acaoEvento = "cancelar";
              info.etapa = "alterar_departamento";
              const redesUsuario = obterRedesParaUsuario(usuario);
              info.redesDisponiveis = redesUsuario;
              console.log(`[Fluxo] ${identificarUsuario(contato, numero, isLider)} iniciou cancelamento de evento.`);
              return msg.reply(`🏢 De qual departamento é o evento que deseja cancelar?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
            } else if (msg.body === "4" || /formul[aá]rio|atualizar/i.test(entradaAcao)) {
              info.acaoEvento = "atualizar_formulario";
              info.etapa = "form_alterar_departamento";
              const redesUsuario = obterRedesParaUsuario(usuario);
              info.redesDisponiveis = redesUsuario;
              console.log(`[Fluxo] ${identificarUsuario(contato, numero, isLider)} iniciou alteração de formulário de evento.`);
              return msg.reply(`📝 *Atualizar Formulário de Evento*\n\n🏢 De qual departamento é o evento que você deseja alterar o formulário?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
            } else if (msg.body === "5" || /externo/i.test(entradaAcao)) {
              info.fluxo = "evento_externo";
              info.etapa = "evento_externo_nome";
              return msg.reply("🌐 *Agendamento de Evento Externo*\n\n1️⃣ Qual é o *nome do evento*?\n\n_Digite *menu* a qualquer momento para cancelar._");
            } else if (msg.body === "6" || /montagem|decora|sal[aã]o|limpeza/i.test(entradaAcao)) {
              info.acaoEvento = "preparacao_espaco";
              info.etapa = "alterar_departamento";
              const redesUsuario = obterRedesParaUsuario(usuario);
              info.redesDisponiveis = redesUsuario;
              console.log(`[Fluxo] ${identificarUsuario(contato, numero, isLider)} iniciou informe de preparação/decoração de evento.`);
              return msg.reply(`🏢 De qual departamento é o evento que você precisa de horários para montagem/decoração?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
            } else {
              return msg.reply("❌ Opção inválida. Digite:\n1 - Agendar novo evento\n2 - Alterar evento existente\n3 - Cancelar evento existente\n4 - Atualizar formulário\n5 - Agendar evento externo\n6 - Informar montagem/decoração\n(Ou digite *voltar*):");
            }
          }

          if (info.etapa === "alterar_departamento") {
            const redesDisp = info.redesDisponiveis || obterRedesParaUsuario(usuario);
            const rede = obterRedeDaLista(msg.body.trim(), redesDisp);
            if (!rede) return msg.reply(`❌ Escolha um departamento da lista (1 a ${redesDisp.length}).`);

            info.departamento = rede.nome;
            info.calendarIdBusca = agendasParaLer[rede.agendaIndex];
            await msg.reply(`🔍 Buscando eventos de *${info.departamento}* em ${new Date().getFullYear()}...`);

            try {
              const agora = moment.tz("America/Sao_Paulo");
              // Começa em "hoje", não no início do ano — um evento que já passou não
              // pode ser alterado nem cancelado (precisaria virar um agendamento novo).
              const inicioBusca = agora.clone().startOf('day').subtract(1, 'minute').format();
              const fimAno = agora.clone().endOf('year').format();

              // Busca eventos especificamente na agenda do departamento selecionado
              const eventosBuscados = await buscarEventos(inicioBusca, fimAno, info.calendarIdBusca);
              const filtrados = (eventosBuscados || []).filter(
                (ev) => isEventoFuturo(ev, agora) && !/\[(?:prepara[çc][ãa]o|decora[çc][ãa]o|limpeza|montagem)[^\]]*\]/i.test(ev.summary || "")
              );

              if (filtrados.length === 0) {
                delete etapas[numero];
                return msg.reply(`📅 Não encontrei eventos futuros para o departamento ${info.departamento}.`);
              }

              const gruposUnificados = agruparEventosPorNomeBase(filtrados);
              info.eventosEncontrados = gruposUnificados.slice(0, 15); // Limita a 15 para não travar o zap
              info.etapa = "alterar_selecionar_evento";

              const acaoLabel = info.acaoEvento === "cancelar"
                ? "cancelar"
                : info.acaoEvento === "preparacao_espaco"
                  ? "informar montagem/decoração"
                  : "alterar";
              let lista = `📋 *Eventos de ${info.departamento}*\nQual você deseja ${acaoLabel}?\n\n`;
              info.eventosEncontrados.forEach((item, i) => {
                const sufixoSessoes = item.ehMultiplo ? ` (${item.totalSessoes} sessões)` : "";
                lista += `${i + 1} - ${item.resumoDatas}: ${item.nomeBase || item.summary}${sufixoSessoes}\n`;
              });
              return msg.reply(lista);
            } catch (e) {
              console.error("[ALERTA:google-calendar] Erro ao buscar eventos para alterar/cancelar:", e);
              delete etapas[numero];
              return msg.reply("⚠️ Erro ao buscar eventos.");
            }
          }

          if (info.etapa === "alterar_selecionar_evento") {
            const index = parseInt(msg.body) - 1;
            if (isNaN(index) || !info.eventosEncontrados[index]) return msg.reply("❌ Escolha um número válido da lista.");

            info.eventoParaAlterar = info.eventosEncontrados[index];

            if (info.acaoEvento === "cancelar") {
              if (info.eventoParaAlterar.ehMultiplo) {
                info.etapa = "cancelar_multiplo_escolha";
                let txt = `⚠️ *Cancelar Sessão ou Evento Completo*\n\nVocê selecionou: *${info.eventoParaAlterar.nomeBase}*\n\nQual sessão você deseja cancelar?\n\n`;
                info.eventoParaAlterar.eventos.forEach((evSess, idxSess) => {
                  const dSess = moment.tz(evSess.start.dateTime || evSess.start.date, "America/Sao_Paulo");
                  const hSess = evSess.start.dateTime ? ` às ${dSess.format("HH:mm")}` : "";
                  txt += `${idxSess + 1} - ${dSess.format("DD/MM")}${hSess} (${evSess.summary})\n`;
                });
                txt += `${info.eventoParaAlterar.eventos.length + 1} - 🗑️ Cancelar o evento TODO (todas as ${info.eventoParaAlterar.totalSessoes} sessões)\n\nDigite o número desejado ou *menu* para desistir:`;
                return msg.reply(txt);
              }

              info.etapa = "cancelar_confirmar";
              const d = moment.tz(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date, "America/Sao_Paulo");
              return msg.reply(`⚠️ Tem certeza que deseja *cancelar* o evento *${info.eventoParaAlterar.summary}* do dia ${d.format("DD/MM")}?\n\nDigite *SIM* para confirmar, ou *menu* para desistir.`);
            }

            if (info.acaoEvento === "preparacao_espaco") {
              info.etapa = "preparacao_informar_horarios";
              return msg.reply(
                `🏛️ *Uso do salão antes, depois ou no dia anterior:*\n\n` +
                `Você selecionou: *${info.eventoParaAlterar.nomeBase || info.eventoParaAlterar.summary}*\n\n` +
                `Por favor, informe os horários adicionais que precisará do espaço:\n` +
                `(Ex: *Dia anterior das 18h às 21h para decoração, e no dia das 17h às 19h para montagem e 22h às 23h para limpeza*)\n\n` +
                `Digite os horários necessários ou *menu* para desistir:`
              );
            }

            if (info.eventoParaAlterar.ehMultiplo) {
              info.etapa = "alterar_multiplo_menu";
              let txt = `📝 *${info.eventoParaAlterar.nomeBase}* (${info.eventoParaAlterar.resumoDatas})\n\n`;
              txt += `📆 *Sessões/Dias programados:*\n`;
              info.eventoParaAlterar.eventos.forEach((evSess, idxSess) => {
                const dSess = moment.tz(evSess.start.dateTime || evSess.start.date, "America/Sao_Paulo");
                const hSess = evSess.start.dateTime ? ` às ${dSess.format("HH:mm")}` : "";
                txt += `• *Sessão ${idxSess + 1}:* ${dSess.format("DD/MM")}${hSess}\n`;
              });
              txt += `\nO que você deseja fazer?\n\n`;
              txt += `1 - Alterar data/horário de uma sessão específica\n`;
              txt += `2 - Adicionar mais um dia/sessão ao evento\n`;
              txt += `3 - Cancelar uma sessão/semana específica deste evento\n`;
              txt += `4 - Alterar dados gerais (Nome ou Local)\n`;
              txt += `5 - Outra alteração (descreva em texto livre)`;
              return msg.reply(txt);
            }

            info.etapa = "alterar_o_que";
            return msg.reply(
              `📝 Você selecionou: *${info.eventoParaAlterar.summary}*\n\n` +
              `O que você deseja alterar?\n\n` +
              `1 - Horário\n` +
              `2 - Data\n` +
              `3 - Adicionar mais um dia/sessão ao evento\n` +
              `4 - Nome do evento\n` +
              `5 - Local\n` +
              `6 - Outra alteração (descreva em texto livre)`
            );
          }

          if (info.etapa === "cancelar_multiplo_escolha") {
            const num = parseInt(msg.body.trim(), 10);
            const total = info.eventoParaAlterar.eventos ? info.eventoParaAlterar.eventos.length : 0;
            if (isNaN(num) || num < 1 || num > total + 1) {
              return msg.reply(`❌ Escolha uma opção válida de 1 a ${total + 1}.`);
            }

            if (num === total + 1) {
              info.cancelarTodasSessoes = true;
              info.etapa = "cancelar_confirmar";
              return msg.reply(
                `⚠️ Tem certeza que deseja cancelar *TODAS AS ${total} SESSÕES* do evento *${info.eventoParaAlterar.nomeBase}*?\n\nDigite *SIM* para confirmar, ou *menu* para desistir.`
              );
            }

            const sessao = info.eventoParaAlterar.eventos[num - 1];
            info.eventoParaAlterar = sessao;
            info.cancelarTodasSessoes = false;
            info.etapa = "cancelar_confirmar";
            const d = moment.tz(sessao.start.dateTime || sessao.start.date, "America/Sao_Paulo");
            return msg.reply(`⚠️ Tem certeza que deseja *cancelar* a sessão *${sessao.summary}* do dia ${d.format("DD/MM")}?\n\nDigite *SIM* para confirmar, ou *menu* para desistir.`);
          }

          if (info.etapa === "alterar_multiplo_menu") {
            const opcao = msg.body.trim();

            if (opcao === "1") {
              info.etapa = "alterar_multiplo_escolher_sessao";
              let txt = `📅 *Escolha a sessão que deseja alterar a data ou horário:*\n\n`;
              info.eventoParaAlterar.eventos.forEach((evSess, idxSess) => {
                const dSess = moment.tz(evSess.start.dateTime || evSess.start.date, "America/Sao_Paulo");
                const hSess = evSess.start.dateTime ? ` às ${dSess.format("HH:mm")}` : "";
                txt += `${idxSess + 1} - ${dSess.format("DD/MM")}${hSess} (${evSess.summary})\n`;
              });
              txt += `\nDigite o número da sessão desejada ou *menu* para desistir:`;
              return msg.reply(txt);
            }

            if (opcao === "2") {
              info.etapa = "alterar_adicionar_data";
              return msg.reply(`📅 Qual a *data* do novo dia/sessão que deseja adicionar? (Use DD/MM, ex: 06/12)`);
            }

            if (opcao === "3") {
              info.acaoEvento = "cancelar";
              info.etapa = "cancelar_multiplo_escolha";
              let txt = `⚠️ *Cancelar Sessão ou Semana Específica*\n\nVocê selecionou: *${info.eventoParaAlterar.nomeBase}*\n\nQual sessão/semana você deseja cancelar?\n\n`;
              info.eventoParaAlterar.eventos.forEach((evSess, idxSess) => {
                const dSess = moment.tz(evSess.start.dateTime || evSess.start.date, "America/Sao_Paulo");
                const hSess = evSess.start.dateTime ? ` às ${dSess.format("HH:mm")}` : "";
                txt += `${idxSess + 1} - ${dSess.format("DD/MM")}${hSess} (${evSess.summary})\n`;
              });
              txt += `${info.eventoParaAlterar.eventos.length + 1} - 🗑️ Cancelar o evento TODO (todas as ${info.eventoParaAlterar.totalSessoes} sessões)\n\nDigite o número da sessão que deseja cancelar (ou digite *menu* para desistir):`;
              return msg.reply(txt);
            }

            if (opcao === "4") {
              info.etapa = "alterar_multiplo_dados_gerais";
              return msg.reply(`📝 Qual dado geral você deseja alterar?\n\n1 - Nome do evento\n2 - Local`);
            }

            if (opcao === "5") {
              info.etapa = "alterar_detalhes";
              return msg.reply(`📝 Descreva a alteração que você precisa no evento *${info.eventoParaAlterar.nomeBase}*:`);
            }

            return msg.reply("❌ Opção inválida. Escolha um número de 1 a 5.");
          }

          if (info.etapa === "alterar_multiplo_escolher_sessao") {
            const sessaoIdx = parseInt(msg.body.trim(), 10) - 1;
            if (isNaN(sessaoIdx) || !info.eventoParaAlterar.eventos || !info.eventoParaAlterar.eventos[sessaoIdx]) {
              return msg.reply(`❌ Escolha um número válido da lista de sessões.`);
            }

            const sessao = info.eventoParaAlterar.eventos[sessaoIdx];
            info.sessaoOriginal = sessao;
            info.eventoParaAlterar = sessao;
            info.etapa = "alterar_o_que_sessao";

            const dSess = moment.tz(sessao.start.dateTime || sessao.start.date, "America/Sao_Paulo");
            const hSess = sessao.start.dateTime ? ` às ${dSess.format("HH:mm")}` : "";
            return msg.reply(
              `📝 Você selecionou: *${sessao.summary}* (${dSess.format("DD/MM")}${hSess})\n\n` +
              `O que deseja alterar nesta sessão?\n\n` +
              `1 - Horário\n` +
              `2 - Data`
            );
          }

          if (info.etapa === "alterar_o_que_sessao") {
            const opcao = msg.body.trim();
            const eventoEhDiaInteiro = !info.eventoParaAlterar.start.dateTime;

            if (opcao === "1") {
              if (eventoEhDiaInteiro) return msg.reply("❌ Essa sessão é de dia inteiro (sem horário definido). Escolha *2* para mudar a data.");
              info.campoAlterado = "horario";
              info.etapa = "alterar_novo_horario_inicio";
              return msg.reply("⏰ Qual o novo *horário de início* dessa sessão? (Ex: 19:30)");
            }
            if (opcao === "2") {
              info.campoAlterado = "data";
              info.etapa = "alterar_nova_data";
              return msg.reply("📅 Qual a nova *data* dessa sessão? (Ex: 25/12)");
            }
            return msg.reply("❌ Opção inválida. Escolha 1 para Horário ou 2 para Data.");
          }

          if (info.etapa === "alterar_multiplo_dados_gerais") {
            const opcao = msg.body.trim();
            if (opcao === "1") {
              info.campoAlterado = "nome";
              info.etapa = "alterar_novo_nome";
              return msg.reply("📝 Qual o novo *nome* do evento?");
            }
            if (opcao === "2") {
              info.campoAlterado = "local";
              info.etapa = "alterar_novo_local";
              return msg.reply("📍 Qual o novo *local*? Digite o endereço, ou apenas *igreja* se for no templo.");
            }
            return msg.reply("❌ Opção inválida. Digite 1 para Nome ou 2 para Local.");
          }

          if (info.etapa === "preparacao_informar_horarios") {
            const textoHorarios = msg.body.trim();
            if (!textoHorarios || /^(?:cancelar|desistir)$/i.test(textoHorarios)) {
              delete etapas[numero];
              return msg.reply("Operação cancelada. Digite *menu* para voltar.");
            }

            try {
              const dataOriginal = moment.tz(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date, "America/Sao_Paulo");
              let dataBloco = dataOriginal.clone();
              if (/dia anterior|v[eé]spera/i.test(textoHorarios)) {
                dataBloco = dataBloco.subtract(1, "day");
              }
              const dataIsoIni = dataBloco.clone().set({ hour: 18, minute: 0, second: 0 }).format();
              const dataIsoFim = dataBloco.clone().set({ hour: 21, minute: 0, second: 0 }).format();

              const resourceExtra = {
                summary: `[Preparação/Decoração] ${info.eventoParaAlterar.summary}`,
                description: `Horários de uso do espaço para montagem, preparação, decoração ou limpeza.\nEvento Principal: ${info.eventoParaAlterar.summary}\nSolicitante: ${nomeSolicitante(contato, numero)}\nHorários informados: ${textoHorarios}\n🧹 Compromisso: Salão deve ser entregue limpo e organizado como encontrado.`,
                location: info.eventoParaAlterar.location || ENDERECO_IGREJA,
                start: { dateTime: dataIsoIni, timeZone: "America/Sao_Paulo" },
                end: { dateTime: dataIsoFim, timeZone: "America/Sao_Paulo" },
              };

              if (calendar && calendar.events && typeof calendar.events.insert === "function") {
                await calendar.events.insert({ calendarId: info.calendarIdBusca, resource: resourceExtra });
              }

              const resumoGrupo = `🏛️ *HORÁRIOS DE MONTAGEM/DECORAÇÃO INFORMADOS*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n🏢 *Depto:* ${info.departamento}\n📅 *Evento:* ${info.eventoParaAlterar.summary}\n📆 *Data do Evento:* ${dataOriginal.format("DD/MM")}\n⏱️ *Horários Adicionais:* ${textoHorarios}\n\n🧹 *Aviso de Limpeza:* O líder foi orientado sobre a devolução do espaço organizado e limpo.`;
              await notificarSecretaria(client, resumoGrupo);

              delete etapas[numero];
              return msg.reply(
                `✅ *Horários de Preparação/Decoração Registrados com Sucesso!*\n\n` +
                `• *Evento:* ${info.eventoParaAlterar.summary}\n` +
                `• *Horários:* ${textoHorarios}\n\n` +
                `Os horários foram registrados na agenda de ${info.departamento} e a secretaria foi avisada. 🙏\n\n` +
                `🧹 *Compromisso de Limpeza e Organização:*\n` +
                `Lembramos que o salão deve ser entregue após o evento exatamente da mesma forma como foi encontrado (cadeiras organizadas, lixo recolhido e limpeza geral).\n\n` +
                `Digite *menu* para voltar ao menu principal.`
              );
            } catch (errPrep) {
              console.error("[Agendamento] Erro ao gravar horários de preparação:", errPrep);
              delete etapas[numero];
              return msg.reply("⚠️ Ocorreu um erro ao registrar os horários de preparação. Tente novamente em instantes.");
            }
          }

          if (info.etapa === "cancelar_confirmar") {
            if (msg.body.trim().toLowerCase() !== "sim") {
              return msg.reply("❌ Cancelamento não confirmado. Digite *SIM* para confirmar, ou *menu* para desistir.");
            }

            try {
              if (info.cancelarTodasSessoes && info.eventoParaAlterar.ehMultiplo) {
                const dadosCancelamento = {
                  solicitanteId: numero,
                  evento: info.eventoParaAlterar.nomeBase,
                  calendarId: info.calendarIdBusca,
                  eventIds: info.eventoParaAlterar.eventos.map(e => e.id),
                };

                const resumo = `🗑️ *Solicitação de Cancelamento Total*\n\n*Evento:* ${info.eventoParaAlterar.nomeBase} (todas as ${info.eventoParaAlterar.totalSessoes} sessões)\n*Datas:* ${info.eventoParaAlterar.resumoDatas}\n\nAguarde a confirmação da secretaria!\n\nDigite *menu* para voltar ao menu principal.`;
                const codigoCancelamento = salvarPendente(dadosCancelamento);
                const resumoGrupo = `🗑️ *PEDIDO DE CANCELAMENTO TOTAL*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n🏢 *Depto:* ${info.departamento}\n📅 *Evento:* ${info.eventoParaAlterar.nomeBase} (todas as ${info.eventoParaAlterar.totalSessoes} sessões)\n📆 *Datas:* ${info.eventoParaAlterar.resumoDatas}\n\n_Responda a este resumo com "cancelar evento" para confirmar o cancelamento, ou "manter evento" para negar._\n\n_Código: ${codigoCancelamento}_`;
                await notificarSecretaria(client, resumoGrupo);

                console.log(`Cancelamento total solicitado por ${identificarUsuario(contato, numero, isLider)}: ${resumo.replace(/\n/g, ' | ')}`);
                await msg.reply(resumo);
                delete etapas[numero];
                return;
              }

              const dataOriginal = moment.tz(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date, "America/Sao_Paulo");
              const dadosCancelamento = {
                solicitanteId: numero,
                evento: info.eventoParaAlterar.summary,
                eventId: info.eventoParaAlterar.id,
                calendarId: info.calendarIdBusca,
              };

              const resumo = `🗑️ *Solicitação de Cancelamento*\n\n*Evento:* ${info.eventoParaAlterar.summary}\n*Data:* ${dataOriginal.format("DD/MM")}\n\nAguarde a confirmação da secretaria!\n\nDigite *menu* para voltar ao menu principal.`;
              const codigoCancelamento = salvarPendente(dadosCancelamento);
              const resumoGrupo = `🗑️ *PEDIDO DE CANCELAMENTO*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n🏢 *Depto:* ${info.departamento}\n📅 *Evento:* ${info.eventoParaAlterar.summary}\n📆 *Data:* ${dataOriginal.format("DD/MM")}\n\n_Responda a este resumo com "cancelar evento" para confirmar o cancelamento, ou "manter evento" para negar._\n\n_Código: ${codigoCancelamento}_`;
              await notificarSecretaria(client, resumoGrupo);

              console.log(`Cancelamento solicitado por ${identificarUsuario(contato, numero, isLider)}: ${resumo.replace(/\n/g, ' | ')}`);
              await msg.reply(resumo);
            } catch (e) {
              console.error(`[ALERTA:persistencia] Erro ao registrar solicitação de cancelamento para ${identificarUsuario(contato, numero, isLider)}:`, e);
              await msg.reply("⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes.");
            }
            delete etapas[numero];
            return;
          }

          if (info.etapa === "alterar_o_que") {
            const eventoEhDiaInteiro = !info.eventoParaAlterar.start.dateTime;
            const opcao = msg.body.trim();

            if (opcao === "1") {
              if (eventoEhDiaInteiro) return msg.reply("❌ Esse evento é de dia inteiro (sem horário definido). Escolha *2* para mudar a data, ou *6* para descrever outra alteração.");
              info.campoAlterado = "horario";
              info.etapa = "alterar_novo_horario_inicio";
              return msg.reply("⏰ Qual o novo *horário de início*? (Ex: 19:30)");
            }
            if (opcao === "2") {
              info.campoAlterado = "data";
              info.etapa = "alterar_nova_data";
              return msg.reply("📅 Qual a nova *data*? (Ex: 25/12)");
            }
            if (opcao === "3") {
              info.etapa = "alterar_adicionar_data";
              return msg.reply("📅 Qual a *data* do novo dia/sessão que deseja adicionar? (Use DD/MM, ex: 06/12)");
            }
            if (opcao === "4") {
              info.campoAlterado = "nome";
              info.etapa = "alterar_novo_nome";
              return msg.reply("📝 Qual o novo *nome* do evento?");
            }
            if (opcao === "5") {
              info.campoAlterado = "local";
              info.etapa = "alterar_novo_local";
              return msg.reply("📍 Qual o novo *local*? Digite o endereço, ou apenas *igreja* se for no templo.");
            }
            if (opcao === "6") {
              info.etapa = "alterar_detalhes";
              return msg.reply(`📝 Descreva a alteração que você precisa (Ex: Mudar horário para 20h, alterar data para o dia seguinte, etc):`);
            }
            return msg.reply("❌ Opção inválida. Escolha um número de 1 a 6.");
          }

          if (info.etapa === "alterar_adicionar_data") {
            const match = msg.body.trim().match(DATA_REGEX);
            if (!match) return msg.reply("❌ Formato inválido. Use DD/MM (ex: 06/12).");

            const novoDia = parseInt(match[1]);
            const novoMes = parseInt(match[2]);
            const anoOriginal = moment.tz(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date, "America/Sao_Paulo").year();
            const novaDataTeste = moment.tz(`${novoDia}/${novoMes}/${anoOriginal}`, "D/M/YYYY", "America/Sao_Paulo");

            if (!novaDataTeste.isValid() || novaDataTeste.date() !== novoDia) {
              return msg.reply("❌ Data inválida. Use DD/MM (ex: 06/12).");
            }
            if (novaDataTeste.isBefore(moment.tz("America/Sao_Paulo").startOf("day"))) {
              return msg.reply("❌ Data inválida: esse dia já passou. Escolha uma data a partir de hoje.");
            }

            info.novoDiaAdicionar = novoDia;
            info.novoMesAdicionar = novoMes;
            info.etapa = "alterar_adicionar_horario_inicio";
            return msg.reply("⏰ Qual o *horário de início* deste novo dia? (Ex: 19:30)");
          }

          if (info.etapa === "alterar_adicionar_horario_inicio") {
            const entrada = msg.body.trim();
            if (!HORARIO_REGEX.test(entrada)) return msg.reply("❌ Formato inválido. Use HH:MM (ex: 19:30).");
            info.novoHorarioInicioAdicionar = entrada;
            info.etapa = "alterar_adicionar_horario_fim";
            return msg.reply("⏰ E o *horário de término* deste novo dia? (Ex: 21:30)");
          }

          if (info.etapa === "alterar_adicionar_horario_fim") {
            const entrada = msg.body.trim();
            if (!HORARIO_REGEX.test(entrada)) return msg.reply("❌ Formato inválido. Use HH:MM (ex: 21:30).");

            const [hInicio, mInicio] = info.novoHorarioInicioAdicionar.split(":").map(Number);
            const [hFim, mFim] = entrada.split(":").map(Number);
            const tempInicio = moment.tz("America/Sao_Paulo").set({ hour: hInicio, minute: mInicio, second: 0, millisecond: 0 });
            const tempFim = moment.tz("America/Sao_Paulo").set({ hour: hFim, minute: mFim, second: 0, millisecond: 0 });
            if (tempFim.isSameOrBefore(tempInicio)) return msg.reply("❌ O horário de término deve ser depois do horário de início.");

            info.novoHorarioFimAdicionar = entrada;

            try {
              const nomeBase = info.eventoParaAlterar.nomeBase || extrairNomeBaseEvento(info.eventoParaAlterar.summary);
              const totalExistente = info.eventoParaAlterar.eventos ? info.eventoParaAlterar.eventos.length : 1;
              const proximaSessao = totalExistente + 1;
              const ano = moment.tz(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date, "America/Sao_Paulo").year();
              const dataFmt = `${String(info.novoDiaAdicionar).padStart(2, "0")}/${String(info.novoMesAdicionar).padStart(2, "0")}`;

              const startIso = moment.tz(`${dataFmt}/${ano} ${info.novoHorarioInicioAdicionar}`, "DD/MM/YYYY HH:mm", "America/Sao_Paulo").format();
              const endIso = moment.tz(`${dataFmt}/${ano} ${info.novoHorarioFimAdicionar}`, "DD/MM/YYYY HH:mm", "America/Sao_Paulo").format();

              const dadosNovaSessao = {
                tipo: "adicionar_sessao",
                solicitanteId: numero,
                solicitanteNome: nomeSolicitante(contato, numero),
                departamento: info.departamento,
                evento: nomeBase,
                calendarId: info.calendarIdBusca,
                numeroSessao: proximaSessao,
                tituloSessao: `${nomeBase} - Sessão ${proximaSessao}`,
                dataFormatada: dataFmt,
                horarioInicio: info.novoHorarioInicioAdicionar,
                horarioFim: info.novoHorarioFimAdicionar,
                startIso,
                endIso,
                local: info.eventoParaAlterar.location || ENDERECO_IGREJA,
                description: `Sessão ${proximaSessao} de ${nomeBase}\nSolicitante: ${nomeSolicitante(contato, numero)}`,
              };

              const codigoSessao = salvarPendente(dadosNovaSessao);
              const resumoSecretaria =
                `⚠️ *PEDIDO DE NOVO DIA / SESSÃO DE EVENTO*\n\n` +
                `👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n` +
                `🏢 *Depto:* ${info.departamento}\n` +
                `📅 *Evento:* ${nomeBase}\n` +
                `📆 *Novo Dia Adicional:* ${dataFmt} (Sessão ${proximaSessao})\n` +
                `⏰ *Horário:* ${info.novoHorarioInicioAdicionar} às ${info.novoHorarioFimAdicionar}\n` +
                `📍 *Local:* ${dadosNovaSessao.local}\n\n` +
                `_Responda a este resumo com "alterar evento" para adicionar automaticamente à agenda, ou "não alterar" para recusar._\n\n` +
                `_Código: ${codigoSessao}_`;
              await notificarSecretaria(client, resumoSecretaria);

              const resumoUsuario =
                `➕ *Solicitação de Novo Dia / Sessão Enviada!*\n\n` +
                `*Evento:* ${nomeBase}\n` +
                `*Nova Sessão:* ${dataFmt} das ${info.novoHorarioInicioAdicionar} às ${info.novoHorarioFimAdicionar} (Sessão ${proximaSessao})\n\n` +
                `Aguarde a confirmação da secretaria!\n\n` +
                `Digite *menu* para voltar ao menu principal.`;
              await msg.reply(resumoUsuario);
            } catch (errAdd) {
              console.error("[Agendamento] Erro ao registrar novo dia de evento:", errAdd);
              await msg.reply("⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes.");
            }
            delete etapas[numero];
            return;
          }

          if (info.etapa === "alterar_novo_horario_inicio") {
            const entrada = msg.body.trim();
            if (!HORARIO_REGEX.test(entrada)) return msg.reply("❌ Formato inválido. Use HH:MM (ex: 19:30).");
            info.novoHorarioInicio = entrada;
            info.etapa = "alterar_novo_horario_fim";
            return msg.reply("⏰ E o novo *horário de término*? (Ex: 21:00)");
          }

          if (info.etapa === "alterar_novo_horario_fim") {
            const entrada = msg.body.trim();
            if (!HORARIO_REGEX.test(entrada)) return msg.reply("❌ Formato inválido. Use HH:MM (ex: 21:00).");

            const [hInicio, mInicio] = info.novoHorarioInicio.split(":").map(Number);
            const [hFim, mFim] = entrada.split(":").map(Number);
            const tempInicio = moment.tz("America/Sao_Paulo").set({ hour: hInicio, minute: mInicio, second: 0, millisecond: 0 });
            const tempFim = moment.tz("America/Sao_Paulo").set({ hour: hFim, minute: mFim, second: 0, millisecond: 0 });
            if (tempFim.isSameOrBefore(tempInicio)) return msg.reply("❌ O horário de término deve ser depois do horário de início.");

            info.novoHorarioFim = entrada;
            info.etapa = "alterar_finalizar_estruturado";
            // Não retorna aqui, deixa o fluxo cair para a próxima etapa
          }

          if (info.etapa === "alterar_nova_data") {
            const match = msg.body.trim().match(DATA_REGEX);
            if (!match) return msg.reply("❌ Formato inválido. Use DD/MM (ex: 25/12).");

            const novoDia = parseInt(match[1]);
            const novoMes = parseInt(match[2]);
            // A nova data herda o ano do evento original (mesma regra de
            // montarResourcePatchAlteracao), então valida contra esse ano — não o atual.
            const anoOriginal = moment.tz(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date, "America/Sao_Paulo").year();
            const novaDataTeste = moment.tz(`${novoDia}/${novoMes}/${anoOriginal}`, "D/M/YYYY", "America/Sao_Paulo");

            if (!novaDataTeste.isValid() || novaDataTeste.date() !== novoDia) {
              return msg.reply("❌ Data inválida. Use DD/MM (ex: 25/12).");
            }
            if (novaDataTeste.isBefore(moment.tz("America/Sao_Paulo").startOf("day"))) {
              return msg.reply("❌ Data inválida: esse dia já passou. Escolha uma data a partir de hoje.");
            }

            info.novoDia = novoDia;
            info.novoMes = novoMes;
            info.etapa = "alterar_finalizar_estruturado";
            // Não retorna aqui, deixa o fluxo cair para a próxima etapa
          }

          if (info.etapa === "alterar_novo_nome") {
            info.novoNome = msg.body.trim();
            info.etapa = "alterar_finalizar_estruturado";
            // Não retorna aqui, deixa o fluxo cair para a próxima etapa
          }

          if (info.etapa === "alterar_novo_local") {
            info.novoLocal = resolverLocalEvento(msg.body);
            info.etapa = "alterar_finalizar_estruturado";
            // Não retorna aqui, deixa o fluxo cair para a próxima etapa
          }

          if (info.etapa === "alterar_finalizar_estruturado") {
            try {
              const dataOriginal = moment.tz(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date, "America/Sao_Paulo");

              const dadosAlteracao = {
                solicitanteId: numero,
                evento: info.eventoParaAlterar.summary,
                eventId: info.eventoParaAlterar.id,
                calendarId: info.calendarIdBusca,
                campo: info.campoAlterado,
                isDiaInteiroOriginal: !info.eventoParaAlterar.start.dateTime,
                inicioOriginal: info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date,
                fimOriginal: info.eventoParaAlterar.end.dateTime || info.eventoParaAlterar.end.date,
              };

              let descricaoMudanca;
              if (info.campoAlterado === "horario") {
                descricaoMudanca = `Novo horário: ${info.novoHorarioInicio} - ${info.novoHorarioFim}`;
                dadosAlteracao.novoHorarioInicio = info.novoHorarioInicio;
                dadosAlteracao.novoHorarioFim = info.novoHorarioFim;
              } else if (info.campoAlterado === "data") {
                descricaoMudanca = `Nova data: ${info.novoDia}/${info.novoMes}`;
                dadosAlteracao.novoDia = info.novoDia;
                dadosAlteracao.novoMes = info.novoMes;
              } else if (info.campoAlterado === "nome") {
                descricaoMudanca = `Novo nome: ${info.novoNome}`;
                dadosAlteracao.novoNome = info.novoNome;
              } else if (info.campoAlterado === "local") {
                descricaoMudanca = `Novo local: ${info.novoLocal}`;
                dadosAlteracao.novoLocal = info.novoLocal;
              }

              const resumo = `🔄 *Solicitação de Alteração*\n\n*Evento:* ${info.eventoParaAlterar.summary}\n*Data Original:* ${dataOriginal.format("DD/MM")}\n*Mudança:* ${descricaoMudanca}\n\nAguarde a confirmação da secretaria!\n\nDigite *menu* para voltar ao menu principal.`;
              const codigoAlteracao = salvarPendente(dadosAlteracao);
              const resumoGrupo = `⚠️ *PEDIDO DE ALTERAÇÃO*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n🏢 *Depto:* ${info.departamento}\n📅 *Evento:* ${info.eventoParaAlterar.summary}\n📆 *Data Atual:* ${dataOriginal.format("DD/MM")}\n📝 *Mudança:* ${descricaoMudanca}\n\n_Responda a este resumo com "alterar evento" para aplicar automaticamente na agenda, ou "não alterar" para recusar._\n\n_Código: ${codigoAlteracao}_`;
              await notificarSecretaria(client, resumoGrupo);

              console.log(`Alteração estruturada solicitada por ${identificarUsuario(contato, numero, isLider)}: ${resumo.replace(/\n/g, ' | ')}`);
              await msg.reply(resumo);
            } catch (e) {
              console.error(`[ALERTA:persistencia] Erro ao registrar solicitação de alteração para ${identificarUsuario(contato, numero, isLider)}:`, e);
              await msg.reply("⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes.");
            }
            delete etapas[numero];
            return;
          }

          if (info.etapa === "alterar_detalhes") {
            info.detalhesAlteracao = msg.body;

            try {
              const dataOriginal = moment.tz(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date, "America/Sao_Paulo");
              const dataOriginalFmt = dataOriginal.format("DD/MM");

              const resumo = `🔄 *Solicitação de Alteração*\n\n*Evento:* ${info.eventoParaAlterar.summary}\n*Data Original:* ${dataOriginalFmt}\n*Solicitação:* ${info.detalhesAlteracao}\n\nAguarde a confirmação da secretaria!\n\nDigite *menu* para voltar ao menu principal.`;

              const dadosAlteracao = {
                solicitanteId: numero,
                evento: info.eventoParaAlterar.summary,
              };
              const codigoAlteracaoLivre = salvarPendente(dadosAlteracao);
              const resumoGrupo = `⚠️ *PEDIDO DE ALTERAÇÃO*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n🏢 *Depto:* ${info.departamento}\n📅 *Evento:* ${info.eventoParaAlterar.summary}\n📆 *Data Atual:* ${dataOriginalFmt}\n📝 *Mudança:* ${info.detalhesAlteracao}\n\n_Responda com "alterar evento" para confirmar ou "não alterar" para recusar._\n\n_Código: ${codigoAlteracaoLivre}_`;
              await notificarSecretaria(client, resumoGrupo);

              await msg.reply(resumo);
            } catch (e) {
              console.error(`[ALERTA:persistencia] Erro ao registrar solicitação de alteração (texto livre) para ${identificarUsuario(contato, numero, isLider)}:`, e);
              await msg.reply("⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes.");
            }
            delete etapas[numero];
            return;
          }

          if (info.etapa === "form_alterar_departamento") {
            const redesDisp = info.redesDisponiveis || obterRedesParaUsuario(usuario);
            const rede = obterRedeDaLista(msg.body.trim(), redesDisp);
            if (!rede) return msg.reply(`❌ Escolha um departamento da lista (1 a ${redesDisp.length}).`);

            info.departamento = rede.nome;
            info.calendarIdBusca = agendasParaLer[rede.agendaIndex];
            await msg.reply(`🔍 Buscando eventos de *${info.departamento}*...`);

            try {
              const agora = moment.tz("America/Sao_Paulo");
              const inicioBusca = agora.clone().startOf("day").subtract(1, "minute").format();
              const fimAno = agora.clone().endOf("year").add(1, "year").format();

              const eventosBuscados = await buscarEventos(inicioBusca, fimAno, info.calendarIdBusca);
              const filtrados = (eventosBuscados || []).filter(
                (ev) => isEventoFuturo(ev, agora) && !/\[(?:prepara[çc][ãa]o|decora[çc][ãa]o|limpeza|montagem)[^\]]*\]/i.test(ev.summary || "")
              );

              if (filtrados.length === 0) {
                delete etapas[numero];
                return msg.reply(`📅 Não encontrei eventos futuros para o departamento ${info.departamento}. Digite *menu* para voltar.`);
              }

              const gruposUnificados = agruparEventosPorNomeBase(filtrados);
              info.eventosEncontrados = gruposUnificados.slice(0, 15);
              info.etapa = "form_alterar_selecionar_evento";

              let lista = `📋 *Eventos de ${info.departamento}*\nQual evento você deseja alterar o formulário?\n\n`;
              info.eventosEncontrados.forEach((item, i) => {
                const sufixoSessoes = item.ehMultiplo ? ` (${item.totalSessoes} sessões)` : "";
                lista += `${i + 1} - ${item.resumoDatas}: ${item.nomeBase || item.summary}${sufixoSessoes}\n`;
              });
              lista += `\nDigite o número do evento desejado:`;
              return msg.reply(lista);
            } catch (e) {
              console.error("[Formulário] Erro ao buscar eventos para alterar formulário:", e);
              delete etapas[numero];
              return msg.reply("⚠️ Erro ao buscar eventos. Digite *menu* para voltar.");
            }
          }

          if (info.etapa === "form_alterar_selecionar_evento") {
            const index = parseInt(msg.body.trim(), 10) - 1;
            if (isNaN(index) || !info.eventosEncontrados[index]) return msg.reply("❌ Escolha um número válido da lista.");

            info.eventoParaAlterar = info.eventosEncontrados[index];
            info.etapa = "form_alterar_campo";

            const menuCampos =
              `📝 *Atualizar Formulário do Evento: ${info.eventoParaAlterar.summary}*\n\n` +
              `Qual informação você deseja atualizar?\n\n` +
              `1 - Horário total de montagem/desmontagem\n` +
              `2 - Público-alvo\n` +
              `3 - Valor de inscrição / taxa\n` +
              `4 - Verba do ministério / apoio da tesouraria\n` +
              `5 - Tema ou Versículo\n` +
              `6 - Identidade visual (cores / estilo)\n` +
              `7 - Convidado / Louvor / Preletor\n` +
              `8 - Decoração ou Alimentação\n` +
              `9 - Equipe ou Materiais necessários\n` +
              `10 - Prazo da imagem e início da divulgação\n` +
              `11 - Cronograma ou Observações\n` +
              `12 - Objetivo espiritual\n` +
              `13 - Outra alteração (descreva livremente)\n` +
              `14 - Preencher novamente o formulário completo\n\n` +
              `Digite o número da opção desejada:`;
            return msg.reply(menuCampos);
          }

          if (info.etapa === "form_alterar_campo") {
            const escolha = msg.body.trim();

            if (escolha === "14") {
              const d = moment.tz(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date, "America/Sao_Paulo");
              const dFim = moment.tz(
                info.eventoParaAlterar.end?.dateTime || info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date,
                "America/Sao_Paulo"
              );
              const dadosIniciais = {
                rede: info.departamento,
                evento: info.eventoParaAlterar.summary,
                dataFormatada: d.format("DD/MM/YYYY"),
                horarioInicio: d.format("HH:mm"),
                horarioFim: dFim.format("HH:mm"),
                local: info.eventoParaAlterar.location || ENDERECO_IGREJA,
              };
              delete etapas[numero];
              await msg.reply("🔄 Reiniciando o formulário para este evento...");
              return await iniciarFormularioEvento({ etapas, solicitanteId: numero, dadosIniciais, client });
            }

            const MAPA_CAMPOS = {
              "1": { id: "horario_total", label: "Horário total de montagem/desmontagem", prompt: "⏱️ Qual é o novo *horário total necessário* no local? (Ex: Das 17h às 23h)" },
              "2": { id: "publico", label: "Público-alvo", prompt: "🎯 Qual é o novo *público-alvo* do evento? (Ex: Toda a Igreja, Casais, Jovens)" },
              "3": { id: "valor_inscricao", label: "Valor de inscrição / taxa", prompt: "💰 Qual é o novo *valor de inscrição*? (Ex: Gratuito, R$ 20,00)" },
              "4": { id: "precisa_valor_ministerio", label: "Verba do ministério / tesouraria", prompt: "🏛️ O evento precisará de verba do ministério? (Responda *Sim* ou *Não*)" },
              "5": { id: "tema_versiculo", label: "Tema ou Versículo", prompt: "📖 Qual é o novo *tema e/ou versículo* base do evento?" },
              "6": { id: "identidade_visual", label: "Identidade visual (cores / estilo)", prompt: "🎨 Quais são as novas cores / estilo visual do evento?" },
              "7": { id: "convidado_louvor", label: "Convidado / Louvor / Preletor", prompt: "🎤 Informe os novos detalhes sobre convidados, preletor ou louvor:" },
              "8": { id: "decoracao_alimentacao", label: "Decoração ou Alimentação", prompt: "☕ Informe os novos detalhes sobre decoração e alimentação:" },
              "9": { id: "equipe_materiais", label: "Equipe ou Materiais necessários", prompt: "📦 Informe os novos detalhes sobre equipe e materiais necessários:" },
              "10": { id: "prazo_imagem", label: "Prazo da imagem e início da divulgação", prompt: "📢 Qual é a data máxima para início da divulgação e prazo da arte? (Ex: 15/12 ou DD/MM/AAAA)" },
              "11": { id: "cronograma_observacoes", label: "Cronograma ou Observações", prompt: "⏱️ Digite o novo cronograma e/ou observações do evento:" },
              "12": { id: "objetivo_espiritual", label: "Objetivo espiritual", prompt: "🙏 Qual é o novo objetivo espiritual do evento?" },
              "13": { id: "outros", label: "Outra alteração no formulário", prompt: "📝 Descreva detalhadamente o que deseja alterar ou atualizar no formulário:" },
            };

            const campo = MAPA_CAMPOS[escolha];
            if (!campo) {
              return msg.reply("❌ Opção inválida. Escolha um número de 1 a 14, ou digite *menu* para voltar.");
            }

            info.campoParaAtualizar = campo;
            info.etapa = "form_alterar_novo_valor";
            return msg.reply(campo.prompt);
          }

          if (info.etapa === "form_alterar_novo_valor") {
            const novoValor = msg.body.trim();
            const campo = info.campoParaAtualizar;
            const evento = info.eventoParaAlterar;
            const d = moment.tz(evento.start.dateTime || evento.start.date, "America/Sao_Paulo");
            const dFim = moment.tz(evento.end?.dateTime || evento.start.dateTime || evento.start.date, "America/Sao_Paulo");

            const querTesouraria = campo.id === "precisa_valor_ministerio" && precisaDeValorDoMinisterio(novoValor);

            const avisoTesourariaLider = querTesouraria
              ? `\n\n💰 *Aviso da Tesouraria:*\nComo você informou que precisará de recursos do ministério, por favor entre em contato com a tesouraria para alinhamento: *${CONTATO_TESOURARIA}*`
              : "";

            // 1. Carrega formulário existente ou cria base de dados a partir do evento
            const formExistente = obterFormularioEvento(evento.summary);
            let payload;
            if (formExistente && formExistente.payload) {
              payload = { ...formExistente.payload };
            } else {
              payload = {
                nome_lider: nomeSolicitante(contato, numero),
                departamento: info.departamento || "",
                nome_evento: evento.summary,
                data: d.format("DD/MM/YYYY"),
                data_solicitada: d.format("DD/MM/YYYY"),
                horario_inicio: d.format("HH:mm"),
                horario_termino: dFim.format("HH:mm"),
                horario_inicio_termino: `${d.format("HH:mm")} às ${dFim.format("HH:mm")}`,
                local: evento.location || ENDERECO_IGREJA,
              };
            }

            // Atualiza campos no payload
            if (campo.id === "horario_total") {
              payload.horario_total = novoValor;
            } else if (campo.id === "publico") {
              payload.publico = novoValor;
            } else if (campo.id === "valor_inscricao") {
              payload.valor_inscricao = novoValor;
              payload.valor = novoValor;
            } else if (campo.id === "precisa_valor_ministerio") {
              payload.precisa_valor_ministerio = novoValor;
              payload.contato_tesouraria = querTesouraria ? CONTATO_TESOURARIA : "";
              payload.aviso_tesouraria = querTesouraria ? `Entrar em contato com a tesouraria: ${CONTATO_TESOURARIA}` : "";
            } else if (campo.id === "tema_versiculo") {
              payload.tema = novoValor;
              payload.versiculo = novoValor;
            } else if (campo.id === "identidade_visual") {
              payload.paleta = novoValor;
              payload.cores = novoValor;
              payload.estilo = novoValor;
              payload.midias = novoValor;
            } else if (campo.id === "convidado_louvor") {
              payload.convidado = novoValor;
              payload.louvor = novoValor;
            } else if (campo.id === "decoracao_alimentacao") {
              payload.decoracao = novoValor;
              payload.alimentacao = novoValor;
            } else if (campo.id === "equipe_materiais") {
              payload.equipe = novoValor;
              payload.materiais = novoValor;
            } else if (campo.id === "prazo_imagem") {
              payload.prazo_imagem = novoValor;
              payload.divulgacao = novoValor;
              const { extrairDataIso } = require("./formularioEvento");
              const dataIso = extrairDataIso(novoValor);
              if (dataIso) {
                payload.data_maxima_divulgacao = novoValor;
                payload.dataMaximaDivulgacao = dataIso;
              }
            } else if (campo.id === "data_maxima_divulgacao") {
              payload.data_maxima_divulgacao = novoValor;
              const { extrairDataIso } = require("./formularioEvento");
              payload.dataMaximaDivulgacao = extrairDataIso(novoValor) || novoValor;
            } else if (campo.id === "cronograma_observacoes") {
              payload.cronograma = novoValor;
              payload.observacoes = novoValor;
            } else if (campo.id === "objetivo_espiritual") {
              payload.objetivo_espiritual = novoValor;
              payload.resultado_esperado = novoValor;
            } else {
              payload[campo.id] = novoValor;
              payload.observacoes = payload.observacoes ? `${payload.observacoes} | ${novoValor}` : novoValor;
            }

            let linkDoc = formExistente?.docUrl || "";
            let erroDoc = false;

            try {
              const resDoc = await enviarWebhook(payload);
              if (resDoc && resDoc.url) {
                linkDoc = resDoc.url;
              }
            } catch (errDoc) {
              console.error("[Formulário Evento] Erro ao atualizar documento no Webhook:", errDoc);
              erroDoc = true;
            }

            salvarFormularioEvento({
              evento: evento.summary,
              departamento: info.departamento,
              data: d.format("DD/MM/YYYY"),
              dataMaximaDivulgacao: payload.dataMaximaDivulgacao || payload.data_maxima_divulgacao,
              solicitanteId: numero,
              payload,
              docUrl: linkDoc,
            });

            // Monta o bloco de mídia e divulgação para o grupo da secretaria
            const coresVal = payload.cores || payload.paleta;
            const midiasVal = payload.midias || payload.estilo;
            const divulgacaoVal = payload.divulgacao || payload.prazo_imagem;
            const temaVal = payload.tema;
            const versiculoVal = payload.versiculo;

            const blocoMidiaSecretaria =
              `\n\n📢 *INFORMAÇÕES DE MÍDIA & COMUNICAÇÃO:*\n` +
              `📅 *Evento:* ${evento.summary}\n` +
              `⏰ *Horário:* ${payload.horario_inicio_termino || `${payload.horario_inicio} às ${payload.horario_termino}`}\n` +
              `📍 *Endereço / Local:* ${payload.local || evento.location || ENDERECO_IGREJA}` +
              (temaVal ? `\n✨ *Tema:* ${temaVal}` : "") +
              (versiculoVal ? `\n📖 *Versículo Base:* ${versiculoVal}` : "") +
              (coresVal ? `\n🎨 *Cores:* ${coresVal}` : "") +
              (midiasVal ? `\n📱 *Mídias:* ${midiasVal}` : "") +
              (divulgacaoVal ? `\n📢 *Divulgação:* ${divulgacaoVal}` : "") +
              (payload.data_maxima_divulgacao ? `\n🗓️ *Início da Divulgação:* ${payload.data_maxima_divulgacao}` : "");

            const linhaDocSecretaria = linkDoc
              ? `\n\n📄 *Documento Oficial Atualizado (Google Docs):*\n${linkDoc}`
              : (erroDoc ? `\n\n⚠️ *Aviso:* Houve instabilidade ao atualizar o Google Docs automaticamente.` : "");

            const notifSecretaria =
              `📝 *ATUALIZAÇÃO DE FORMULÁRIO DE EVENTO*\n\n` +
              `👤 *Líder:* ${nomeSolicitante(contato, numero)}\n` +
              `📅 *Evento:* ${evento.summary}\n` +
              `🏢 *Depto:* ${info.departamento}\n` +
              `📆 *Data:* ${d.format("DD/MM/YYYY")}\n` +
              `✏️ *Informação Atualizada:* ${campo.label}\n` +
              `📝 *Novo Conteúdo:* ${novoValor}` +
              linhaDocSecretaria +
              blocoMidiaSecretaria +
              (querTesouraria ? `\n\n💰 *Tesouraria:* O líder informou necessidade de verba do ministério. Contato: ${CONTATO_TESOURARIA}` : "");

            await notificarSecretaria(client, notifSecretaria);

            // Notifica o grupo MULTIMÍDIAS quando a alteração envolver demandas de comunicação/mídia (desde que a arte não tenha sido feita previamente)
            const camposMidia = ["midias", "cores", "divulgacao", "tema", "versiculo", "paleta", "estilo", "prazo_imagem", "data_maxima_divulgacao"];
            const { isMidiaJaFeita: checkMidiaJaFeita } = require("./formularioEvento");
            const midiaJaPronta = typeof checkMidiaJaFeita === "function" ? checkMidiaJaFeita(payload) : false;
            if (!midiaJaPronta && (camposMidia.includes(campo.chave) || midiasVal || divulgacaoVal)) {
              const notifMultimidia =
                `📢 *ATUALIZAÇÃO DE MÍDIA / FORMULÁRIO DE EVENTO*\n\n` +
                `👤 *Líder:* ${nomeSolicitante(contato, numero)}\n` +
                `📅 *Evento:* ${evento.summary}\n` +
                `🏢 *Depto:* ${info.departamento}\n` +
                `📆 *Data:* ${d.format("DD/MM/YYYY")}\n` +
                `✏️ *Informação Atualizada:* ${campo.label}\n` +
                `📝 *Novo Conteúdo:* ${novoValor}` +
                blocoMidiaSecretaria +
                linhaDocSecretaria;
              try {
                await notificarMultimidia(client, notifMultimidia);
              } catch (errM) {
                console.error("[Multimídia] Erro ao notificar alteração de mídia:", errM);
              }
            }

            if (querTesouraria) {
              const msgTesouraria =
                `🏛️ *AVISO DE EVENTO - DEMANDA DA TESOURARIA*\n\n` +
                `Olá! Um líder atualizou o formulário de evento informando *necessidade de verba/apoio do ministério*:\n\n` +
                `👤 *Líder:* ${nomeSolicitante(contato, numero)}\n` +
                `📅 *Evento:* ${evento.summary}\n` +
                `🏢 *Depto:* ${info.departamento}\n` +
                `📆 *Data:* ${d.format("DD/MM/YYYY")}\n` +
                `📝 *Detalhes:* ${novoValor}\n\n` +
                (linkDoc ? `📄 *Documento Oficial (Google Docs):*\n${linkDoc}\n\n` : "") +
                `O líder foi orientado a entrar em contato com você. 🙏`;
              await notificarTesouraria(client, msgTesouraria);
            }

            delete etapas[numero];
            const msgDocLider = linkDoc ? `\n\n📄 *Documento Oficial Atualizado (Google Docs):*\n${linkDoc}` : "";
            return msg.reply(
              `✅ *Formulário Atualizado com Sucesso!*\n\n` +
              `• *Evento:* ${evento.summary}\n` +
              `• *Item Alterado:* ${campo.label}\n` +
              `• *Novo Valor:* ${novoValor}${msgDocLider}\n\n` +
              `A secretaria foi notificada com a sua atualização. 🙏${avisoTesourariaLider}\n\n` +
              `Digite *menu* para voltar ao menu principal.`
            );
          }

          if (info.etapa === "evento_nome") {
            console.log(`[Agendamento] Nome do evento: ${msg.body}`);
            info.nome = msg.body;
            info.etapa = "evento_local";
            return msg.reply(`📍 Onde será o evento?\n\nDigite o endereço completo, ou apenas *igreja* se for no templo.`);
          }

          if (info.etapa === "evento_local") {
            info.local = resolverLocalEvento(msg.body);
            console.log(`[Agendamento] Local do evento: ${info.local}`);
            info.etapa = "evento_rede";
            const redesUsuario = obterRedesParaUsuario(usuario);
            info.redesDisponiveis = redesUsuario;
            return msg.reply(`🏢 Qual departamento está organizando?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
          }

          if (info.etapa === "evento_rede") {
            const redesDisp = info.redesDisponiveis || obterRedesParaUsuario(usuario);
            const rede = obterRedeDaLista(msg.body.trim(), redesDisp);
            if (!rede) return msg.reply(`❌ Escolha um departamento da lista (1 a ${redesDisp.length}).`);

            info.rede = rede.nome;
            console.log(`[Agendamento] Rede selecionada: ${info.rede}`);
            info.etapa = "evento_mes";
            return msg.reply("📅 Para qual *mês* você quer agendar?\nDigite o número (ex: 5 para Maio, meses como *11 e 1*, ou digite *contínuo* para o ano todo):");
          }

          if (info.etapa === "evento_mes") {
            const textoMes = msg.body.trim();
            const mesesRecorrentes = interpretarMesesRecorrencia(textoMes, moment().tz("America/Sao_Paulo"));
            if (mesesRecorrentes && mesesRecorrentes.length > 0 && (mesesRecorrentes.length > 1 || mesesRecorrentes.isContinuo || /repet|seman|quinzen|recorren|cont[ií]nuo|ano\s*todo/i.test(textoMes))) {
              info.tipoDuracao = "multiplo";
              info.repeteMesesInfo = mesesRecorrentes;
              info.etapa = "evento_repete_frequencia";
              return msg.reply(
                "🔄 *Evento que se repete*\n\n" +
                "Qual é a frequência de repetição do evento?\n\n" +
                "1️⃣ *Toda semana* (ex: toda segunda, todo domingo)\n" +
                "2️⃣ *A cada 15 dias (Quinzenal)*\n" +
                "3️⃣ *Uma vez por mês* (ex: todo 2º sábado)\n\n" +
                "Digite o número da opção (ou digite direto, ex: *toda segunda* ou *todas as sextas*):"
              );
            }

            const mes = parseInt(textoMes);
            if (isNaN(mes) || mes < 1 || mes > 12) {
              return msg.reply("❌ Mês inválido. Digite um número de 1 a 12 (ou os meses de repetição, ex: *11 e 1*, ou *contínuo* para o ano todo).");
            }
            console.log(`[Agendamento] Mês: ${mes}`);
            info.mes = mes;
            info.etapa = "evento_modo_busca";
            return msg.reply(
              "📅 *Qual o formato e duração do evento?*\n\n" +
              "1 - Evento de 1 dia\n" +
              "2 - Evento consecutivo de vários dias (ex: retiro de Sexta a Domingo)\n" +
              "3 - Evento não consecutivo (múltiplos dias/horários espalhados - ex: conferência)\n" +
              "4 - Evento que se repete (ex: todas as sextas, todos os domingos, quinzenal)"
            );
          }

          if (info.etapa === "evento_modo_busca") {
            const opcao = msg.body.trim().toLowerCase();
            if (opcao === "1" || /1\s*dia|[\u00faun]nico/i.test(opcao)) {
              info.tipoDuracao = "unico";
              info.etapa = "evento_tipo_data_unico";
              return msg.reply(
                "📅 *Sobre a data do evento:*\n\n" +
                "1 - Já tenho uma data específica\n" +
                "2 - Quero ver de acordo com a disponibilidade\n\n" +
                "_Digite 1 ou 2:_"
              );
            }
            if (opcao === "2" || /consecutivo/i.test(opcao)) {
              info.tipoDuracao = "consecutivo";
              info.etapa = "evento_consecutivo_data_inicio";
              return msg.reply(`📅 Qual a *data de início* do evento? (Ex: 10/${String(info.mes).padStart(2, "0")} ou 10/${String(info.mes).padStart(2, "0")}/${moment().tz("America/Sao_Paulo").year()})`);
            }
            if (opcao === "3" || /n[aã]o\s+consecutivo|m[uú]ltiplo/i.test(opcao)) {
              info.tipoDuracao = "multiplo";
              info.blocosHorarios = [];
              info.etapa = "evento_multiplo_data";
              return msg.reply(`📅 Vamos cadastrar o *1º dia/bloco* do evento.\n\nQual a *data* deste primeiro dia? (Ex: 16/${String(info.mes).padStart(2, "0")})`);
            }
            if (opcao === "4" || /repet|seman|quinzen|recorren/i.test(opcao)) {
              info.tipoDuracao = "multiplo";
              info.etapa = "evento_repete_frequencia";
              return msg.reply(
                "🔄 *Evento que se repete*\n\n" +
                "Qual é a frequência de repetição do evento?\n\n" +
                "1️⃣ *Toda semana* (ex: todo domingo, toda sexta)\n" +
                "2️⃣ *A cada 15 dias (Quinzenal)*\n" +
                "3️⃣ *Uma vez por mês* (ex: todo 2º sábado)\n\n" +
                "Digite o número da opção (ou digite direto, ex: *todo domingo* ou *todas as sextas*):"
              );
            }
            return msg.reply("❌ Opção inválida. Digite:\n1 - Evento de 1 dia\n2 - Evento consecutivo de vários dias\n3 - Evento não consecutivo (múltiplos dias/horários espalhados)\n4 - Evento que se repete");
          }

          // Fluxo de evento que se repete (Recorrência flexível com múltiplos meses e exclusões)
          if (info.etapa === "evento_repete_frequencia") {
            const texto = msg.body.trim().toLowerCase();
            const apenasNumeroOpcao = /^[123]$/.test(texto);
            const diaInfo = apenasNumeroOpcao ? null : interpretarDiaSemana(texto);
            const isQuinzenal = /quinzen|15\s*dias?/i.test(texto) || texto === "2";
            const isMensal = /mensal|uma\s+vez\s+por\s+m[eê]s/i.test(texto) || texto === "3";
            info.repeteFrequencia = isQuinzenal ? "quinzenal" : (isMensal ? "mensal" : "semanal");

            if (diaInfo) {
              info.repeteDiaSemana = diaInfo.diaSemana;
              info.repeteDiaSemanaNome = diaInfo.nome;

              if (info.repeteFrequencia === "quinzenal") {
                info.etapa = "evento_repete_quinzenal_inicio";
                return msg.reply(`📅 Para a repetição quinzenal (${diaInfo.nome}), qual a data da *primeira sessão*? (Ex: 08/11 ou 08/11/2026):`);
              }

              if (info.repeteMesesInfo && info.repeteMesesInfo.length > 0) {
                info.datasRecorrentes = gerarDatasRecorrentes({
                  diaSemana: info.repeteDiaSemana,
                  mesesInfo: info.repeteMesesInfo,
                  quinzenal: false
                });
                info.etapa = "evento_repete_excecoes";
                const listaFormatada = formatarListaDatasInterativa(info.datasRecorrentes);
                return msg.reply(
                  `🗓️ *Datas encontradas para o evento (${info.datasRecorrentes.length} sessões):*\n\n` +
                  `${listaFormatada}\n\n` +
                  `❓ *Tem alguma data em que NÃO vai ter evento?* (Ex: primeiro domingo do mês, feriado ou recesso)\n\n` +
                  `• Para remover datas: digite os números separados por vírgula (ex: *1, 5* ou digite *primeiro domingo*).\n` +
                  `• Para adicionar uma data avulsa: digite *adicionar DD/MM* (ex: *adicionar 15/12*).\n` +
                  `• Se todas as datas estiverem certas, digite *confirmar* (ou *ok*).`
                );
              }

              info.etapa = "evento_repete_periodo";
              return msg.reply(
                "📆 *Em quais meses o evento vai acontecer?*\n\n" +
                "Você pode escolher:\n" +
                "• *Contínuo / Ano todo* (gera as datas para o ano inteiro a partir de hoje)\n" +
                "• Meses específicos (ex: *Novembro e Janeiro* ou *11 e 1*, *11 a 1*, *11*)\n\n" +
                "Digite os meses desejados ou digite *contínuo*:"
              );
            }

            if (texto === "1" || /semana/i.test(texto) || isQuinzenal || isMensal) {
              info.etapa = "evento_repete_dia_semana";
              return msg.reply(
                "📅 Em qual *dia da semana* o evento vai acontecer?\n\n" +
                "1 - Domingo\n" +
                "2 - Segunda-feira\n" +
                "3 - Terça-feira\n" +
                "4 - Quarta-feira\n" +
                "5 - Quinta-feira\n" +
                "6 - Sexta-feira\n" +
                "7 - Sábado\n\n" +
                "Digite o número (1 a 7) ou o nome do dia:"
              );
            }

            return msg.reply(
              "❌ Opção não reconhecida. Escolha:\n1 - Toda semana (ex: todo domingo, toda segunda)\n2 - A cada 15 dias (Quinzenal)\n3 - Uma vez por mês\n(Ou digite direto, ex: *toda segunda* ou *todas as sextas*):"
            );
          }

          if (info.etapa === "evento_repete_dia_semana") {
            const diaInfo = interpretarDiaSemana(msg.body.trim());
            if (!diaInfo) {
              return msg.reply("❌ Dia da semana inválido. Digite um número de 1 a 7 (1=Domingo, 2=Segunda, 6=Sexta, 7=Sábado) ou o nome do dia.");
            }
            info.repeteDiaSemana = diaInfo.diaSemana;
            info.repeteDiaSemanaNome = diaInfo.nome;

            if (info.repeteFrequencia === "quinzenal") {
              info.etapa = "evento_repete_quinzenal_inicio";
              return msg.reply(`📅 Para a repetição quinzenal (${diaInfo.nome}), qual a data da *primeira sessão*? (Ex: 08/11 ou 08/11/2026):`);
            }

            if (info.repeteMesesInfo && info.repeteMesesInfo.length > 0) {
              info.datasRecorrentes = gerarDatasRecorrentes({
                diaSemana: info.repeteDiaSemana,
                mesesInfo: info.repeteMesesInfo,
                quinzenal: false
              });
              info.etapa = "evento_repete_excecoes";
              const listaFormatada = formatarListaDatasInterativa(info.datasRecorrentes);
              const rotuloTotal = info.repeteMesesInfo.isContinuo
                ? `${info.datasRecorrentes.length} sessões contínuas durante o ano todo`
                : `${info.datasRecorrentes.length} sessões`;
              return msg.reply(
                `🗓️ *Datas encontradas para o evento (${rotuloTotal}):*\n\n` +
                `${listaFormatada}\n\n` +
                `❓ *Tem alguma data em que NÃO vai ter evento?* (Ex: primeiro domingo do mês, feriado ou recesso)\n\n` +
                `• Para remover datas: digite os números separados por vírgula (ex: *1, 5* ou digite *primeiro domingo*).\n` +
                `• Para adicionar uma data avulsa: digite *adicionar DD/MM* (ex: *adicionar 15/12*).\n` +
                `• Se todas as datas estiverem certas, digite *confirmar* (ou *ok*).`
              );
            }

            info.etapa = "evento_repete_periodo";
            return msg.reply(
              "📆 *Em quais meses o evento vai acontecer?*\n\n" +
              "Você pode escolher:\n" +
              "• *Contínuo / Ano todo* (gera as datas para o ano inteiro a partir de hoje)\n" +
              "• Meses específicos (ex: *Novembro e Janeiro* ou *11 e 1*, *11 a 1*, *11*)\n\n" +
              "Digite os meses desejados ou digite *contínuo*:"
            );
          }

          if (info.etapa === "evento_repete_quinzenal_inicio") {
            const agoraMom = moment().tz("America/Sao_Paulo");
            const anoPadrao = agoraMom.year();
            const m = moment.tz(msg.body.trim(), ["DD/MM/YYYY", "D/M/YYYY", "DD/MM", "D/M"], "America/Sao_Paulo");
            if (!m.isValid()) {
              return msg.reply("❌ Data inválida. Por favor digite no formato DD/MM ou DD/MM/AAAA (ex: 08/11 ou 08/11/2026):");
            }
            if (!msg.body.trim().match(/\d{4}/)) {
              m.year(anoPadrao);
            }
            info.dataInicioQuinzenal = m.format("DD/MM/YYYY");

            if (info.repeteMesesInfo && info.repeteMesesInfo.length > 0) {
              info.datasRecorrentes = gerarDatasRecorrentes({
                diaSemana: info.repeteDiaSemana,
                mesesInfo: info.repeteMesesInfo,
                quinzenal: true,
                dataInicioQuinzenal: info.dataInicioQuinzenal
              });
              info.etapa = "evento_repete_excecoes";
              const listaFormatada = formatarListaDatasInterativa(info.datasRecorrentes);
              const rotuloTotal = info.repeteMesesInfo.isContinuo
                ? `${info.datasRecorrentes.length} sessões contínuas durante o ano todo`
                : `${info.datasRecorrentes.length} sessões`;
              return msg.reply(
                `🗓️ *Datas encontradas para o evento (${rotuloTotal}):*\n\n` +
                `${listaFormatada}\n\n` +
                `❓ *Tem alguma data em que NÃO vai ter evento?* (Ex: primeiro domingo do mês, feriado ou recesso)\n\n` +
                `• Para remover datas: digite os números separados por vírgula (ex: *1, 5* ou digite *primeiro domingo*).\n` +
                `• Para adicionar uma data avulsa: digite *adicionar DD/MM* (ex: *adicionar 15/12*).\n` +
                `• Se todas as datas estiverem certas, digite *confirmar* (ou *ok*).`
              );
            }

            info.etapa = "evento_repete_periodo";
            return msg.reply(
              "📆 *Em quais meses o evento vai acontecer?*\n\n" +
              "Você pode escolher:\n" +
              "• *Contínuo / Ano todo* (gera as datas para o ano inteiro a partir de hoje)\n" +
              "• Meses específicos (ex: *Novembro e Janeiro* ou *11 e 1*, *11 a 1*, *11*)\n\n" +
              "Digite os meses desejados ou digite *contínuo*:"
            );
          }

          if (info.etapa === "evento_repete_periodo") {
            const mesesInfo = interpretarMesesRecorrencia(msg.body.trim(), moment().tz("America/Sao_Paulo"));
            if (!mesesInfo || mesesInfo.length === 0) {
              return msg.reply("❌ Não consegui identificar os meses. Por favor digite os números ou nomes dos meses (ex: *11 e 1* ou *Novembro e Janeiro*), ou digite *contínuo* para o ano todo.");
            }
            info.repeteMesesInfo = mesesInfo;
            info.datasRecorrentes = gerarDatasRecorrentes({
              diaSemana: info.repeteDiaSemana,
              mesesInfo: info.repeteMesesInfo,
              quinzenal: (info.repeteFrequencia === "quinzenal"),
              dataInicioQuinzenal: info.dataInicioQuinzenal
            });

            if (!info.datasRecorrentes || info.datasRecorrentes.length === 0) {
              return msg.reply("⚠️ Nenhuma data foi encontrada para os critérios informados. Digite outros meses ou digite *voltar*.");
            }

            info.etapa = "evento_repete_excecoes";
            const listaFormatada = formatarListaDatasInterativa(info.datasRecorrentes);
            const rotuloTotal = mesesInfo.isContinuo
              ? `${info.datasRecorrentes.length} sessões contínuas durante o ano todo`
              : `${info.datasRecorrentes.length} sessões`;
            return msg.reply(
              `🗓️ *Datas encontradas para o evento (${rotuloTotal}):*\n\n` +
              `${listaFormatada}\n\n` +
              `❓ *Tem alguma data em que NÃO vai ter evento?* (Ex: primeiro domingo do mês, feriado ou recesso)\n\n` +
              `• Para remover datas: digite os números separados por vírgula (ex: *1, 5* ou digite *primeiro domingo*).\n` +
              `• Para adicionar uma data avulsa: digite *adicionar DD/MM* (ex: *adicionar 15/12*).\n` +
              `• Se todas as datas estiverem certas, digite *confirmar* (ou *ok*).`
            );
          }

          if (info.etapa === "evento_repete_excecoes") {
            const texto = msg.body.trim();

            if (/^(confirmar|ok|sim|pronto|prosseguir|certo|nenhuma|nenhum|todas|seguir)$/i.test(texto)) {
              if (!info.datasRecorrentes || info.datasRecorrentes.length === 0) {
                return msg.reply("❌ Não há nenhuma data na lista. Digite *adicionar DD/MM* para incluir ao menos uma data, ou digite *voltar*.");
              }
              info.etapa = "evento_repete_horario_inicio";
              return msg.reply(`⏰ Qual o *horário de início* das sessões? (Ex: 16:00)`);
            }

            const matchAdd = texto.match(/^adicionar\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
            if (matchAdd) {
              const strData = matchAdd[1];
              const agoraMom = moment().tz("America/Sao_Paulo");
              const mAdd = moment.tz(strData, ["DD/MM/YYYY", "D/M/YYYY", "DD/MM", "D/M"], "America/Sao_Paulo");
              if (!mAdd.isValid()) {
                return msg.reply("❌ Data para adicionar inválida. Use o formato *adicionar DD/MM* ou *adicionar DD/MM/AAAA*.");
              }
              if (!strData.match(/\d{4}/)) {
                mAdd.year(agoraMom.year());
              }
              const dataFormatada = mAdd.format("DD/MM/YYYY");
              const diaSemanaNome = NOMES_DIAS_SEMANA[mAdd.day()];
              info.datasRecorrentes.push({
                data: dataFormatada,
                diaSemana: mAdd.day(),
                diaSemanaNome,
                ordemNoMes: "avulso",
                timestamp: mAdd.valueOf()
              });
              info.datasRecorrentes.sort((a, b) => a.timestamp - b.timestamp);
              return msg.reply(
                `✅ Data *${dataFormatada}* adicionada com sucesso!\n\n` +
                `🗓️ *Lista atualizada (${info.datasRecorrentes.length} sessões):*\n\n` +
                `${formatarListaDatasInterativa(info.datasRecorrentes)}\n\n` +
                `Mais alguma data para remover ou adicionar? Se estiver tudo pronto, digite *confirmar*.`
              );
            }

            const novaLista = removerDatasRecorrentes(info.datasRecorrentes, texto);
            if (novaLista.length < info.datasRecorrentes.length) {
              const qtdRemovidas = info.datasRecorrentes.length - novaLista.length;
              info.datasRecorrentes = novaLista;
              return msg.reply(
                `✅ ${qtdRemovidas} data(s) removida(s) com sucesso!\n\n` +
                `🗓️ *Lista atualizada (${info.datasRecorrentes.length} sessões):*\n\n` +
                `${formatarListaDatasInterativa(info.datasRecorrentes)}\n\n` +
                `Mais alguma data para remover ou adicionar? Se estiver tudo pronto, digite *confirmar*.`
              );
            }

            return msg.reply(
              "❓ Não identifiquei o que fazer. Você pode:\n" +
              "• Remover datas digitando os números (ex: *1, 5* ou *primeiro domingo*)\n" +
              "• Adicionar uma data avulsa (ex: *adicionar 15/12*)\n" +
              "• Ou confirmar todas as datas digitando *confirmar*:"
            );
          }

          if (info.etapa === "evento_repete_horario_inicio") {
            const entrada = msg.body.toUpperCase().trim();
            if (/dia\s*(todo|inteiro)/i.test(entrada)) {
              return msg.reply("❌ O horário de início é obrigatório. Por favor, use HH:MM (ex: 16:00).");
            }
            if (!HORARIO_REGEX.test(entrada)) {
              return msg.reply("❌ Formato de horário inválido. Por favor, use HH:MM (ex: 16:00).");
            }
            info.horarioInicio = entrada;
            info.etapa = "evento_repete_horario_fim";
            return msg.reply(`⏰ Qual o *horário de término* das sessões? (Ex: 18:00)`);
          }

          if (info.etapa === "evento_repete_horario_fim") {
            const entrada = msg.body.toUpperCase().trim();
            if (!HORARIO_REGEX.test(entrada)) {
              return msg.reply("❌ Formato de horário inválido. Por favor, use HH:MM (ex: 18:00).");
            }
            const [hIni, mIni] = info.horarioInicio.split(":").map(Number);
            const [hFim, mFim] = entrada.split(":").map(Number);
            if (hFim < hIni || (hFim === hIni && mFim <= mIni)) {
              return msg.reply("❌ O horário de término deve ser posterior ao horário de início.");
            }
            info.horarioFim = entrada;
            info.tipoDuracao = "multiplo";
            info.blocosHorarios = info.datasRecorrentes.map((d, idx) => ({
              data: d.data,
              inicio: info.horarioInicio,
              fim: info.horarioFim,
              titulo: `Sessão ${idx + 1}`
            }));
            const dataPrimeiroBloco = moment.tz(info.blocosHorarios[0].data, "DD/MM/YYYY", "America/Sao_Paulo").toDate();

            await finalizarNovoAgendamento({
              msg,
              numero,
              contato,
              info,
              dataFinal: dataPrimeiroBloco,
              isLider
            });
            delete etapas[numero];
            return;
          }


          if (info.etapa === "evento_tipo_data_unico") {
            const opcao = msg.body.trim();
            if (opcao === "1") {
              info.etapa = "evento_dia_especifico";
              return msg.reply(`📅 Qual o dia do mês? (Ex: 25, para o dia 25/${String(info.mes).padStart(2, "0")})`);
            }
            if (opcao === "2") {
              info.etapa = "evento_tipo_dia";
              return msg.reply("📅 Qual o dia da semana desejado?\n\n1 - Segunda-feira\n2 - Terça-feira\n3 - Quarta-feira\n4 - Quinta-feira\n5 - Sexta-feira\n6 - Sábado\n7 - Domingo\n8 - Todos os dias do mês");
            }
            return msg.reply("❌ Opção inválida. Digite:\n1 - Já tenho uma data específica\n2 - Quero ver de acordo com a disponibilidade");
          }

          // Formato 2: Consecutivo de vários dias
          if (info.etapa === "evento_consecutivo_data_inicio") {
            const m = extrairOuValidarData(msg.body, info.mes);
            if (!m) {
              return msg.reply("❌ Data de início inválida. Por favor, digite no formato DD/MM ou DD/MM/AAAA (ex: 10/10 ou 10/10/2026).");
            }
            info.dataInicioMom = m;
            info.dataInicio = m.format("DD/MM/YYYY");
            info.etapa = "evento_consecutivo_hora_inicio";
            return msg.reply("⏰ Qual o *horário de início* no primeiro dia? (Ex: 19:00)");
          }

          if (info.etapa === "evento_consecutivo_hora_inicio") {
            const entrada = msg.body.toUpperCase().trim();
            if (/dia\s*(todo|inteiro)/i.test(entrada)) {
              return msg.reply("❌ O horário de início é obrigatório mesmo para eventos de dia todo. Por favor, use HH:MM (ex: 08:00 ou 19:00).");
            }
            if (!HORARIO_REGEX.test(entrada)) {
              return msg.reply("❌ Formato de horário inválido. Por favor, use HH:MM (ex: 19:00).");
            }
            info.horaInicio = entrada;
            info.horarioInicio = entrada;
            info.etapa = "evento_consecutivo_data_fim";
            return msg.reply("📅 Qual a *data de término* do evento? (Ex: 12/10 ou 12/10/2026)");
          }

          if (info.etapa === "evento_consecutivo_data_fim") {
            const m = extrairOuValidarData(msg.body, info.mes);
            if (!m) {
              return msg.reply("❌ Data de término inválida. Por favor, digite no formato DD/MM ou DD/MM/AAAA (ex: 12/10 ou 12/10/2026).");
            }
            if (m.isBefore(info.dataInicioMom, "day")) {
              return msg.reply("❌ A data de término deve ser igual ou posterior à data de início.");
            }
            info.dataFimMom = m;
            info.dataFim = m.format("DD/MM/YYYY");
            info.etapa = "evento_consecutivo_hora_fim";
            return msg.reply("⏰ Qual o *horário de término* no último dia? (Ex: 17:00)");
          }

          if (info.etapa === "evento_consecutivo_hora_fim") {
            const entrada = msg.body.toUpperCase().trim();
            if (!HORARIO_REGEX.test(entrada)) {
              return msg.reply("❌ Formato de horário inválido. Por favor, use HH:MM (ex: 17:00).");
            }
            if (info.dataInicioMom.isSame(info.dataFimMom, "day")) {
              const [hIni, mIni] = info.horaInicio.split(":").map(Number);
              const [hFim, mFim] = entrada.split(":").map(Number);
              if (hFim < hIni || (hFim === hIni && mFim <= mIni)) {
                return msg.reply("❌ O horário de término deve ser posterior ao horário de início.");
              }
            }
            info.horaFim = entrada;
            info.horarioFim = entrada;

            await finalizarNovoAgendamento({
              msg,
              numero,
              contato,
              info,
              dataFinal: info.dataInicioMom.toDate(),
              isLider
            });
            delete etapas[numero];
            return;
          }

          // Formato 3: Múltiplos blocos de horários espalhados
          if (info.etapa === "evento_multiplo_data") {
            const m = extrairOuValidarData(msg.body, info.mes);
            if (!m) {
              return msg.reply("❌ Data inválida. Por favor, digite no formato DD/MM ou DD/MM/AAAA (ex: 16/10 ou 16/10/2026).");
            }
            info.tempBlocoDataMom = m;
            info.tempBlocoData = m.format("DD/MM/YYYY");
            info.etapa = "evento_multiplo_inicio";
            return msg.reply(`⏰ Qual o *horário de início* do dia ${info.tempBlocoData}? (Ex: 19:00)`);
          }

          if (info.etapa === "evento_multiplo_inicio") {
            const entrada = msg.body.toUpperCase().trim();
            if (/dia\s*(todo|inteiro)/i.test(entrada)) {
              return msg.reply("❌ O horário de início é obrigatório mesmo para eventos de dia todo. Por favor, use HH:MM (ex: 08:00 ou 19:00).");
            }
            if (!HORARIO_REGEX.test(entrada)) {
              return msg.reply("❌ Formato de horário inválido. Por favor, use HH:MM (ex: 19:00).");
            }
            info.tempBlocoInicio = entrada;
            info.etapa = "evento_multiplo_fim";
            return msg.reply(`⏰ Qual o *horário de término* do dia ${info.tempBlocoData}? (Ex: 21:30)`);
          }

          if (info.etapa === "evento_multiplo_fim") {
            const entrada = msg.body.toUpperCase().trim();
            if (!HORARIO_REGEX.test(entrada)) {
              return msg.reply("❌ Formato de horário inválido. Por favor, use HH:MM (ex: 21:30).");
            }
            const [hIni, mIni] = info.tempBlocoInicio.split(":").map(Number);
            const [hFim, mFim] = entrada.split(":").map(Number);
            if (hFim < hIni || (hFim === hIni && mFim <= mIni)) {
              return msg.reply("❌ O horário de término deve ser posterior ao horário de início.");
            }

            if (!Array.isArray(info.blocosHorarios)) {
              info.blocosHorarios = [];
            }
            info.blocosHorarios.push({
              data: info.tempBlocoData,
              inicio: info.tempBlocoInicio,
              fim: entrada
            });

            const listaBlocos = info.blocosHorarios.map((b, idx) => `  • Bloco ${idx + 1}: ${b.data} (${b.inicio} às ${b.fim})`).join("\n");
            info.etapa = "evento_multiplo_mais";
            return msg.reply(
              `📋 *Sessões cadastradas até o momento:*\n${listaBlocos}\n\n` +
              `Deseja adicionar mais um dia/bloco de horário para este evento?\n` +
              `1 - Sim, adicionar mais um dia/horário\n` +
              `2 - Não, concluir e agendar este evento`
            );
          }

          if (info.etapa === "evento_multiplo_mais") {
            const escolha = msg.body.trim();
            if (escolha === "1") {
              info.etapa = "evento_multiplo_data";
              return msg.reply(`📅 Qual a *data* do próximo dia do evento? (Ex: 17/${String(info.mes).padStart(2, "0")})`);
            }
            if (escolha === "2") {
              info.horarioInicio = info.blocosHorarios[0].inicio;
              info.horarioFim = info.blocosHorarios[0].fim;
              const dataPrimeiroBloco = moment.tz(info.blocosHorarios[0].data, "DD/MM/YYYY", "America/Sao_Paulo").toDate();
              await finalizarNovoAgendamento({
                msg,
                numero,
                contato,
                info,
                dataFinal: dataPrimeiroBloco,
                isLider
              });
              delete etapas[numero];
              return;
            }
            return msg.reply("❌ Opção inválida. Digite *1* para adicionar mais um bloco ou *2* para concluir e agendar.");
          }

          // Formato 1: Evento de 1 dia (data específica)
          if (info.etapa === "evento_dia_especifico") {
            const dia = parseInt(msg.body.trim());
            const ano = moment.tz("America/Sao_Paulo").year();
            const dataTeste = moment.tz(`${dia}/${info.mes}/${ano}`, "D/M/YYYY", "America/Sao_Paulo");

            if (isNaN(dia) || !dataTeste.isValid() || dataTeste.date() !== dia) {
              return msg.reply(`❌ Dia inválido para o mês ${MESES[info.mes - 1]}. Digite um número de dia válido.`);
            }

            info.diaEspecifico = dia;
            info.anoEspecifico = ano;
            await msg.reply("🔍 Verificando esse dia na agenda...");

            try {
              const inicioBusca = moment.tz([ano, info.mes - 1], "America/Sao_Paulo").startOf('month').subtract(1, 'minute').format();
              const fimBusca = moment.tz([ano, info.mes - 1], "America/Sao_Paulo").endOf('month').format();
              const todosEventosRaw = await buscarEventos(inicioBusca, fimBusca);
              const todosEventos = filtrarEventosAgendamento(todosEventosRaw);

              const resultado = verificarDataEspecifica({
                eventos: todosEventos,
                evangelismoCalendarId: agendasParaLer[0],
                ano, mes: info.mes, dia,
                rede: info.rede,
              });

              if (!resultado.disponivel) {
                delete etapas[numero];
                return msg.reply(montarMensagemDataEspecificaBloqueada(resultado));
              }

              info.eventosNoDiaEspecifico = resultado.eventosNoDia || [];
              info.etapa = "evento_horario_especifico";

              const janelas = calcularJanelasLivres({ eventosNoDia: info.eventosNoDiaEspecifico, ano, mes: info.mes, dia });
              const listaJanelas = janelas.length > 0
                ? janelas.map((j) => `${j.inicio} às ${j.fim}`).join("\n")
                : "(nenhum horário livre entre 07:00 e 22:00 nesse dia — considere outra data)";

              return msg.reply(`✅ O dia ${resultado.dataFormatada} está livre!\n\n⏰ *Horários livres nesse dia* (considerando 1h de intervalo antes/depois de outros eventos):\n${listaJanelas}\n\nQual o *horário de início* do seu evento? (Ex: 19:30)`);
            } catch (e) {
              console.error(`[ALERTA:google-calendar] Erro ao verificar data específica para ${identificarUsuario(contato, numero, isLider)}:`, e);
              delete etapas[numero];
              return msg.reply("⚠️ Erro ao acessar a agenda.");
            }
          }

          if (info.etapa === "evento_horario_especifico") {
            const entrada = msg.body.toUpperCase().trim();
            if (/dia\s*(todo|inteiro)/i.test(entrada)) {
              return msg.reply("❌ O horário de início é obrigatório mesmo para eventos de dia todo. Por favor, use HH:MM (ex: 08:00 ou 19:30).");
            }
            if (!HORARIO_REGEX.test(entrada)) {
              return msg.reply("❌ Formato de horário de início inválido. Por favor, use HH:MM (ex: 19:30).");
            }
            info.horarioInicio = entrada;
            info.isDiaInteiro = false;
            console.log(`[Agendamento] Horário de início (data específica): ${entrada}`);
            info.etapa = "evento_horario_fim_especifico";
            return msg.reply("⏰ Qual o *horário de término* do evento? (Ex: 21:00)");
          }

          if (info.etapa === "evento_horario_fim_especifico") {
            const entradaFim = msg.body.toUpperCase().trim();
            if (!HORARIO_REGEX.test(entradaFim)) return msg.reply("❌ Formato de horário de término inválido. Use HH:MM (ex: 21:00).");

            const [hInicio, mInicio] = info.horarioInicio.split(":").map(Number);
            const [hFim, mFim] = entradaFim.split(":").map(Number);
            const tempInicio = moment.tz("America/Sao_Paulo").set({ hour: hInicio, minute: mInicio, second: 0, millisecond: 0 });
            const tempFim = moment.tz("America/Sao_Paulo").set({ hour: hFim, minute: mFim, second: 0, millisecond: 0 });
            if (tempFim.isSameOrBefore(tempInicio)) return msg.reply("❌ O horário de término deve ser depois do horário de início.");

            info.horarioFim = entradaFim;
            info.etapa = "confirmar_data_especifica";
            // Não retorna aqui, deixa o fluxo cair para a próxima etapa
          }

          if (info.etapa === "confirmar_data_especifica") {
            try {
              const inicioBusca = moment.tz([info.anoEspecifico, info.mes - 1], "America/Sao_Paulo").startOf('month').subtract(1, 'minute').format();
              const fimBusca = moment.tz([info.anoEspecifico, info.mes - 1], "America/Sao_Paulo").endOf('month').format();
              const todosEventosRaw = await buscarEventos(inicioBusca, fimBusca);
              const todosEventos = filtrarEventosAgendamento(todosEventosRaw);

              const resultado = verificarDataEspecifica({
                eventos: todosEventos,
                evangelismoCalendarId: agendasParaLer[0],
                ano: info.anoEspecifico, mes: info.mes, dia: info.diaEspecifico,
                rede: info.rede,
                isDiaInteiro: false,
                horarioInicio: info.horarioInicio,
                horarioFim: info.horarioFim,
              });

              if (!resultado.disponivel) {
                delete etapas[numero];
                return msg.reply(montarMensagemDataEspecificaBloqueada(resultado));
              }

              const dataFinal = new Date(info.anoEspecifico, info.mes - 1, info.diaEspecifico);
              await finalizarNovoAgendamento({ msg, numero, contato, info, dataFinal, isLider });
              delete etapas[numero];
              return;
            } catch (e) {
              console.error(`[ALERTA:google-calendar] Erro ao confirmar data específica para ${identificarUsuario(contato, numero, isLider)}:`, e);
              delete etapas[numero];
              return msg.reply("⚠️ Erro ao acessar a agenda.");
            }
          }

          // Formato 1: Evento de 1 dia (por dia da semana)
          if (info.etapa === "evento_tipo_dia") {
            const escolha = msg.body;
            // Mapeamento: 1-Seg, 2-Ter, 3-Qua, 4-Qui, 5-Sex, 6-Sáb, 7-Dom, 8-Todos/Vários
            const diasMapa = {
              "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 0, "8": "TODOS"
            };

            if (diasMapa[escolha] === undefined) {
              return msg.reply("❌ Opção inválida. Por favor, escolha um número de 1 a 8.");
            }

            info.diaSemanaFiltro = diasMapa[escolha];
            console.log(`Dia da semana selecionado por ${identificarUsuario(contato, numero, isLider)}: ${escolha} (${info.diaSemanaFiltro})`);

            info.etapa = "evento_horario";
            return msg.reply("⏰ Qual o *horário de início* do evento? (Ex: 19:30)");
          }

          if (info.etapa === "evento_horario") {
            const entrada = msg.body.toUpperCase().trim();
            if (/dia\s*(todo|inteiro)/i.test(entrada)) {
              return msg.reply("❌ O horário de início é obrigatório mesmo para eventos de dia todo. Por favor, use HH:MM (ex: 08:00 ou 19:30).");
            }
            if (!HORARIO_REGEX.test(entrada)) {
              return msg.reply("❌ Formato de horário de início inválido. Por favor, use HH:MM (ex: 19:30).");
            }
            info.horarioInicio = entrada;
            info.isDiaInteiro = false;
            console.log(`[Agendamento] Horário de início: ${entrada}`);
            info.etapa = "evento_horario_fim";
            return msg.reply("⏰ Qual o *horário de término* do evento? (Ex: 21:00)");
          }

          if (info.etapa === "evento_horario_fim") {
            const entradaFim = msg.body.toUpperCase();
            info.horarioFim = entradaFim;

            // Valida o formato do horário de término
            if (!HORARIO_REGEX.test(info.horarioFim)) {
              return msg.reply("❌ Formato de horário de término inválido. Por favor, use HH:MM (ex: 21:00).");
            }

            // Compara os horários de início e fim
            const [hInicio, mInicio] = info.horarioInicio.split(":").map(Number);
            const [hFim, mFim] = info.horarioFim.split(":").map(Number);
            const tempStart = moment.tz("America/Sao_Paulo").set({ hour: hInicio, minute: mInicio, second: 0, millisecond: 0 });
            const tempEnd = moment.tz("America/Sao_Paulo").set({ hour: hFim, minute: mFim, second: 0, millisecond: 0 });
            if (tempEnd.isSameOrBefore(tempStart)) {
              return msg.reply("❌ O horário de término deve ser depois do horário de início.");
            }
            console.log(`[Agendamento] Horário de término: ${info.horarioFim}`);
            info.etapa = "consultar_disponibilidade"; // Prossegue para a consulta
            // Não retorna aqui, deixa o fluxo cair para a próxima etapa
          }

          // Etapa que centraliza a consulta de disponibilidade
          if (info.etapa === "consultar_disponibilidade") {

            await msg.reply("🔍 Consultando agenda...");
            console.log(`[Agenda] Consultando disponibilidades para ${identificarUsuario(contato, numero, isLider)}...`);

            try {
              const agora = moment.tz("America/Sao_Paulo");
              const ano = agora.year();
              const inicioBusca = moment.tz([ano, info.mes - 1], "America/Sao_Paulo").startOf('month').subtract(1, 'minute').format();
              const fimBusca = moment.tz([ano, info.mes - 1], "America/Sao_Paulo").endOf('month').format();

              const todosEventosRaw = await buscarEventos(inicioBusca, fimBusca);
              const todosEventos = filtrarEventosAgendamento(todosEventosRaw);

              const { disponiveis, conflito } = calcularDisponibilidade({
                eventos: todosEventos,
                evangelismoCalendarId: agendasParaLer[0],
                ano,
                mes: info.mes,
                diaSemanaFiltro: info.diaSemanaFiltro,
                isDiaInteiro: info.isDiaInteiro,
                horarioInicio: info.horarioInicio,
                horarioFim: info.horarioFim,
                rede: info.rede,
              });

              console.log(`Datas disponíveis para ${identificarUsuario(contato, numero, isLider)}: ${disponiveis.length}`);

              if (disponiveis.length === 0) {
                delete etapas[numero];
                return msg.reply(montarMensagemConflito(conflito));
              }

              info.datasEncontradas = disponiveis;
              info.etapa = "evento_finalizar";
              return msg.reply(montarMensagemDatasDisponiveis(disponiveis, info.mes));

            } catch (e) {
              console.error(`[ALERTA:google-calendar] Erro ao consultar agendas para ${identificarUsuario(contato, numero, isLider)}:`, e);
              delete etapas[numero];
              return msg.reply("⚠️ Erro ao acessar a agenda.");
            }
          }

          if (info.etapa === "evento_finalizar") {
            const escolha = parseInt(msg.body) - 1;
            if (isNaN(escolha) || !info.datasEncontradas[escolha]) return msg.reply("❌ Escolha um número da lista.");

            const dataFinal = info.datasEncontradas[escolha];
            await finalizarNovoAgendamento({ msg, numero, contato, info, dataFinal, isLider });
            delete etapas[numero];
            return;
          }
        } else if (info.fluxo === "comunicados") {
          // Lógica de comunicados (Opção 7)
          if (info.etapa === "texto_comunicado") {
            const comunicado = msg.body;
            const resumoUsuario = `📢 *Solicitação de Comunicado Enviada!*\n\nSua mensagem foi encaminhada para a secretaria analisar e incluir nos avisos do culto.\n\nDigite *menu* para voltar ao menu principal.`;

            const resumoGrupo = `📢 *NOVO COMUNICADO PARA O CULTO*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n📝 *Mensagem:* ${comunicado}`;
            await notificarSecretaria(client, resumoGrupo);

            await msg.reply(resumoUsuario);
            delete etapas[numero];
            return;
          }
        } else if (info.fluxo === "pastoral") {
          // Lógica de atendimento pastoral (Opção 3)
          if (info.etapa === "nome") {
            info.nome = msg.body;
            info.etapa = "disponibilidade";
            console.log(`[Pastoral] Nome recebido: ${info.nome} (${mascararTelefone(numero)}). Solicitando disponibilidade.`); // NOSONAR
            return msg.reply(`Obrigado, ${info.nome}. 🙏\nAgora, por favor, informe quais os *dias e horários* você tem disponível para o atendimento.`);
          }

          if (info.etapa === "disponibilidade") {
            info.disponibilidade = msg.body;

            const dadosPastoral = {
              tipo: "pastoral",
              solicitanteId: numero,
              nome: info.nome,
              disponibilidade: info.disponibilidade,
            };
            const codigo = salvarPendente(dadosPastoral);

            const resumoGrupo = `🔔 *NOVA SOLICITAÇÃO DE ATENDIMENTO PASTORAL*\n\n👤 *Discípulo:* ${info.nome}\n🗓️ *Disponibilidade:* ${info.disponibilidade}\n\n_Responda a esta mensagem com "confirmar [dia e horário]" (ex: confirmar segunda as 19h) ou "não confirmar" para responder ao discípulo._\n\n_Código: ${codigo}_`;
            await notificarPastoral(client, resumoGrupo);

            console.log(`[Pastoral] Pedido finalizado para ${info.nome} (${mascararTelefone(numero)}). Código: ${codigo}. Disponibilidade: ${info.disponibilidade}`); // NOSONAR
            await msg.reply(`Perfeito! Sua solicitação de atendimento pastoral foi registrada.\n\n👤 *Nome:* ${info.nome}\n🗓️ *Disponibilidade:* ${info.disponibilidade}\n\nEm breve entraremos em contato para confirmar o agendamento. 🙏\n\nDigite *menu* para voltar ao menu principal.`);
            delete etapas[numero];
            return;
          }
        } else if (info.fluxo === "ver_agenda") {
          // Lógica de consulta de agenda (Opção 2)
          if (info.etapa === "escolha_mes" || info.etapa === "detalhe_evento") {
            const corpoRaw = msg.body.trim();
            const agora = moment.tz("America/Sao_Paulo");

            if (corpoRaw === "0") {
              info.etapa = "periodo_personalizado";
              return msg.reply("🗓️ Digite as datas de início e fim que deseja consultar.\n\nExemplo: *10/07 a 20/07*");
            }

            // 1. Tenta identificar se o usuário digitou o nome de um mês (ex: "novembro", "dezembro")
            const mesPorNome = identificarMesEntrada(corpoRaw);
            if (mesPorNome) {
              const mesNome = MESES[mesPorNome - 1];
              const anoAtual = agora.year();
              const mesAtualNum = agora.month() + 1;
              const anoAlvo = mesPorNome < mesAtualNum ? anoAtual + 1 : anoAtual;

              const inicioBusca = moment.tz([anoAlvo, mesPorNome - 1], "America/Sao_Paulo").startOf("month").subtract(1, "minute").format();
              const fimBusca = moment.tz([anoAlvo, mesPorNome - 1], "America/Sao_Paulo").endOf("month").format();

              console.log(`[Agenda] Buscando eventos para ${identificarUsuario(contato, numero, isLider)} em ${mesNome}`);
              await msg.reply(`🔍 Consultando eventos de *${mesNome}*...`);
              return await entregarAgenda(numero, info, inicioBusca, fimBusca, mesNome, msg);
            }

            // 2. Se for um número correspondente a um dos eventos da lista atual
            const itens = info.itensAgenda || [];
            const index = parseInt(corpoRaw) - 1;
            if (!isNaN(index) && itens[index]) {
              return msg.reply(montarDetalheEvento(itens[index], {
                isPastor: Boolean(info && info.isPastor),
                agendasInternas: AGENDAS_INTERNAS
              }));
            }

            // 3. Se for um número de mês de 1 a 12
            const numMes = parseInt(corpoRaw);
            if (!isNaN(numMes) && numMes >= 1 && numMes <= 12) {
              const mesNome = MESES[numMes - 1];
              const anoAtual = agora.year();
              const mesAtualNum = agora.month() + 1;
              const anoAlvo = numMes < mesAtualNum ? anoAtual + 1 : anoAtual;

              const inicioBusca = moment.tz([anoAlvo, numMes - 1], "America/Sao_Paulo").startOf("month").subtract(1, "minute").format();
              const fimBusca = moment.tz([anoAlvo, numMes - 1], "America/Sao_Paulo").endOf("month").format();

              console.log(`[Agenda] Buscando eventos para ${identificarUsuario(contato, numero, isLider)} em ${mesNome}`);
              await msg.reply(`🔍 Consultando eventos de *${mesNome}*...`);
              return await entregarAgenda(numero, info, inicioBusca, fimBusca, mesNome, msg);
            }

            return msg.reply(
              "❌ Opção não reconhecida.\n\n" +
              "• Digite o *número* de um dos eventos para ver detalhes e o link de inscrição.\n" +
              "• Digite o *nome do mês* (ex: Novembro, Dezembro) para consultar os próximos meses.\n" +
              "• Digite *menu* para voltar ao menu principal."
            );
          }

          if (info.etapa === "periodo_personalizado") {
            const agora = moment.tz("America/Sao_Paulo");
            const resultado = interpretarPeriodoPersonalizado(msg.body, agora);

            if (!resultado.ok) {
              return msg.reply(resultado.mensagem);
            }

            const { inicio, fim } = resultado;
            const inicioBusca = inicio.clone().startOf("day").subtract(1, "minute").format();
            const fimBusca = fim.clone().endOf("day").format();
            const tituloPeriodo = `${inicio.format("DD/MM")} a ${fim.format("DD/MM")}`;

            console.log(`[Agenda] Buscando eventos para ${identificarUsuario(contato, numero, isLider)} no período ${tituloPeriodo}`);
            await msg.reply(`🔍 Consultando eventos de *${tituloPeriodo}*...`);

            return await entregarAgenda(numero, info, inicioBusca, fimBusca, tituloPeriodo, msg);
          }
        } else if (info.fluxo === "area_lider") {
          const escolha = msg.body.trim().toLowerCase();

          if (info.etapa === "menu_lider") {
            if (escolha === "voltar") {
              return msg.reply("Você já está na Área do Líder. Digite *menu* para voltar ao menu principal.");
            }
            if (escolha === "1" || /agenda|evento/i.test(escolha)) {
              info.etapa = "lider_sub_agenda";
              return msg.reply(montarSubmenuLiderAgenda());
            }
            if (escolha === "2" || /comunica|m[ií]dia/i.test(escolha)) {
              info.etapa = "lider_sub_comunicacao";
              return msg.reply(montarSubmenuLiderComunicacao());
            }

            if (/inscri[cç][õo]es|inscritos|inscritas/i.test(escolha)) {
              return await iniciarFluxoConsultaInscricoes({
                msg,
                numero,
                etapas,
                usuario,
                isPastor,
                isDiretor,
                isLider,
                client,
                origem: "lider",
              });
            }

            // Atalhos diretos preservados
            if (escolha === "3" || /artes|flyers/i.test(escolha)) {
              info.fluxo = "artes_flyers";
              info.etapa = "artes_departamento";
              const redesUsuario = obterRedesParaUsuario(usuario);
              info.redesDisponiveis = redesUsuario;
              return msg.reply(`🎨 *Solicitar artes e flyers*\n\n🏢 De qual departamento é a solicitação?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
            }
            if (escolha === "4" || /reuni[aã]o|reunioes/i.test(escolha)) {
              info.fluxo = "reunioes";
              info.etapa = "menu_reuniao";
              return msg.reply("🤝 *Reuniões*\n\nO que você deseja fazer?\n\n1 - Agendar reunião\n2 - Alterar reunião existente\n3 - Desmarcar reunião existente\n\nDigite *voltar* para o menu anterior ou *menu* para voltar ao início.");
            }
            if (escolha === "5" || /disponib/i.test(escolha)) {
              info.fluxo = "consulta_disponibilidade_lider";
              info.etapa = "escolha_mes";
              const agora = moment.tz("America/Sao_Paulo");
              const mesAtual = agora.month();
              let listaMeses = "📅 *Consulta de Disponibilidade*\n\nPara qual mês você deseja consultar?\n\n";
              for (let i = mesAtual; i < 12; i++) {
                listaMeses += `${i + 1} - ${MESES[i]}\n`;
              }
              return msg.reply(listaMeses + "\nDigite o número do mês desejado:");
            }
            if (escolha === "6" || /evento\s+externo/i.test(escolha)) {
              info.fluxo = "evento_externo";
              info.etapa = "evento_externo_nome";
              return msg.reply("🌐 *Agendamento de Evento Externo*\n\n1️⃣ Qual é o *nome do evento*?\n\n_Digite *menu* a qualquer momento para cancelar._");
            }

            return msg.reply("❌ Opção inválida. Escolha 1 para Agenda e Eventos ou 2 para Comunicação e Mídia (ou digite *menu* para voltar).");
          }

          if (info.etapa === "lider_sub_agenda") {
            if (escolha === "voltar") {
              info.etapa = "menu_lider";
              return msg.reply(montarMenuLider());
            }
            if (escolha === "1" || /evento/i.test(escolha)) {
              info.fluxo = "agendamento";
              info.etapa = "evento_acao";
              return msg.reply(montarMenuEventos());
            }
            if (escolha === "2" || /reuni/i.test(escolha)) {
              info.fluxo = "reunioes";
              info.etapa = "menu_reuniao";
              return msg.reply("🤝 *Reuniões*\n\nO que você deseja fazer?\n\n1 - Agendar reunião\n2 - Alterar reunião existente\n3 - Desmarcar reunião existente\n\nDigite *voltar* para o menu anterior ou *menu* para voltar ao início.");
            }
            if (escolha === "3" || /disponib/i.test(escolha)) {
              info.fluxo = "consulta_disponibilidade_lider";
              info.etapa = "escolha_mes";
              const agora = moment.tz("America/Sao_Paulo");
              const mesAtual = agora.month();
              let listaMeses = "📅 *Consulta de Disponibilidade*\n\nPara qual mês você deseja consultar?\n\n";
              for (let i = mesAtual; i < 12; i++) {
                listaMeses += `${i + 1} - ${MESES[i]}\n`;
              }
              return msg.reply(listaMeses + "\nDigite o número do mês desejado:");
            }
            if (escolha === "4" || /inscri[cç][õo]es|inscritos|inscritas|fichas?|formul[aá]rios?/i.test(escolha)) {
              info.etapa = "escolha_inscricoes_ou_fichas";
              info.origemInscricoesOuFichas = "lider";
              return msg.reply(montarMenuInscricoesOuFichas());
            }
            if (escolha === "5") {
              return await iniciarFluxoConsultaInscricoes({
                msg,
                numero,
                etapas,
                usuario,
                isPastor,
                isDiretor,
                isLider,
                client,
                origem: "lider",
              });
            }
            if (/montagem|decora/i.test(escolha)) {
              info.fluxo = "agendamento";
              info.etapa = "preparacao_informar_horarios";
              info.departamento = usuario?.departamento || "Evento";
              return msg.reply(
                "🏢 *Uso do Salão Antes / Montagem / Decoração*\n\n" +
                "Caso precise do salão horas antes do evento ou no dia anterior para montagem, decoração ou limpeza, por favor informe:\n\n" +
                "• *Nome do evento e departamento*\n" +
                "• *Data e horários* necessários (ex: dia anterior das 18:00 às 21:00 ou 2 horas antes do início)\n\n" +
                "_Essas informações serão registradas no departamento e encaminhadas à secretaria e equipe._"
              );
            }
            return msg.reply("❌ Opção inválida. Escolha uma opção de 1 a 4, digite *voltar* para o menu anterior ou *menu* para o início.");
          }

          if (info.etapa === "escolha_inscricoes_ou_fichas") {
            const escolhaOp = msg.body.trim().toLowerCase();
            const origem = info.origemInscricoesOuFichas || (isPastor ? "pastoral" : (isDiretor ? "diretor" : "lider"));

            if (escolhaOp === "voltar") {
              if (origem === "pastoral") {
                info.fluxo = "area_pastoral";
                info.etapa = "pastoral_sub_agenda";
                return msg.reply(montarSubmenuPastoralAgenda());
              } else if (origem === "diretor") {
                info.fluxo = "area_diretor";
                info.etapa = "diretor_sub_agenda";
                return msg.reply(montarSubmenuDiretorAgenda());
              } else {
                info.fluxo = "area_lider";
                info.etapa = "lider_sub_agenda";
                return msg.reply(montarSubmenuLiderAgenda());
              }
            }

            if (escolhaOp === "1" || /inscri[cç][õo]es|inscritos|inscritas|lista|pdf/i.test(escolhaOp)) {
              return await iniciarFluxoConsultaInscricoes({
                msg,
                numero,
                etapas,
                usuario,
                isPastor,
                isDiretor,
                isLider,
                client,
                origem,
              });
            }

            if (escolhaOp === "2" || /fichas?|formul[aá]rios?/i.test(escolhaOp)) {
              return await iniciarFluxoConsultaFichasEventos({
                msg,
                numero,
                etapas,
                origem,
              });
            }

            return msg.reply("❌ Opção inválida. Digite:\n1 - Lista de Inscritos (PDF)\n2 - Fichas dos Eventos (Formulários)\nOu digite *voltar*.");
          }

          if (info.etapa === "lider_sub_comunicacao") {
            if (escolha === "voltar") {
              info.etapa = "menu_lider";
              return msg.reply(montarMenuLider());
            }
            if (escolha === "1" || /aviso|comunicado/i.test(escolha)) {
              info.fluxo = "comunicados";
              info.etapa = "texto_comunicado";
              return msg.reply("📢 *Solicitar aviso / comunicado no culto*\n\nPor favor, digite abaixo o texto do comunicado que você deseja que seja lido ou exibido nos cultos:");
            }
            if (escolha === "2" || /arte|flyer/i.test(escolha)) {
              info.fluxo = "artes_flyers";
              info.etapa = "artes_departamento";
              const redesUsuario = obterRedesParaUsuario(usuario);
              info.redesDisponiveis = redesUsuario;
              return msg.reply(`🎨 *Solicitar artes e flyers*\n\n🏢 De qual departamento é a solicitação?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
            }
            return msg.reply("❌ Opção inválida. Escolha 1 para Aviso/Comunicado ou 2 para Artes e Flyers (ou digite *voltar*).");
          }
        } else if (info.fluxo === "area_pastoral") {
          const escolha = msg.body.trim().toLowerCase();

          if (info.etapa === "menu_pastoral") {
            if (escolha === "voltar") {
              return msg.reply("Você já está na Área Pastoral. Digite *menu* para voltar ao menu principal.");
            }
            if (escolha === "1" || /agenda|evento/i.test(escolha)) {
              info.etapa = "pastoral_sub_agenda";
              return msg.reply(montarSubmenuPastoralAgenda());
            }
            if (escolha === "2" || /atendimento|pastoral/i.test(escolha)) {
              info.etapa = "pastoral_menu_atendimento";
              return msg.reply(montarSubmenuPastoralAtendimento());
            }
            if (escolha === "3" || /comunica|m[ií]dia/i.test(escolha)) {
              info.etapa = "pastoral_sub_comunicacao";
              return msg.reply(montarSubmenuPastoralComunicacao());
            }
            if (escolha === "4" || /inscri[cç][õo]es|inscritos|inscritas/i.test(escolha)) {
              return await iniciarFluxoConsultaInscricoes({
                msg,
                numero,
                etapas,
                usuario,
                isPastor,
                isDiretor,
                isLider,
                client,
                origem: "pastoral",
              });
            }

            // Atalhos diretos preservados
            if (escolha === "5" || /aviso|comunicado/i.test(escolha)) {
              info.fluxo = "comunicados";
              info.etapa = "texto_comunicado";
              return msg.reply("📢 *Solicitar aviso / comunicado no culto*\n\nPor favor, digite abaixo o texto do comunicado que você deseja que seja lido ou exibido nos cultos:");
            }
            if (escolha === "5" || /artes|flyers/i.test(escolha)) {
              info.fluxo = "artes_flyers";
              info.etapa = "artes_departamento";
              const redesUsuario = obterRedesParaUsuario(usuario);
              info.redesDisponiveis = redesUsuario;
              return msg.reply(`🎨 *Solicitar artes e flyers*\n\n🏢 De qual departamento é a solicitação?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
            }
            if (escolha === "6" || /reuni[aã]o|reunioes/i.test(escolha)) {
              info.fluxo = "reunioes";
              info.etapa = "menu_reuniao";
              return msg.reply("🤝 *Reuniões*\n\nO que você deseja fazer?\n\n1 - Agendar reunião\n2 - Alterar reunião existente\n3 - Desmarcar reunião existente\n\nDigite *voltar* para o menu anterior ou *menu* para voltar ao início.");
            }
            if (escolha === "7" || /disponib/i.test(escolha)) {
              info.fluxo = "consulta_disponibilidade_lider";
              info.etapa = "escolha_mes";
              const agora = moment.tz("America/Sao_Paulo");
              const mesAtual = agora.month();
              let listaMeses = "📅 *Consulta de Disponibilidade*\n\nPara qual mês você deseja consultar?\n\n";
              for (let i = mesAtual; i < 12; i++) {
                listaMeses += `${i + 1} - ${MESES[i]}\n`;
              }
              return msg.reply(listaMeses + "\nDigite o número do mês desejado:");
            }
            if (escolha === "8" || /orienta/i.test(escolha)) {
              return msg.reply("📋 *Atendimentos Pastorais*\n\nOs pedidos de atendimento pastoral são enviados diretamente ao grupo oficial de pastores para alinhamento e confirmação.\n\nDigite *voltar* para o menu anterior ou *menu* para o início.");
            }
            if (escolha === "9" || /evento\s+externo/i.test(escolha)) {
              info.fluxo = "evento_externo";
              info.etapa = "evento_externo_nome";
              return msg.reply("🌐 *Agendamento de Evento Externo*\n\n1️⃣ Qual é o *nome do evento*?\n\n_Digite *menu* a qualquer momento para cancelar._");
            }

            return msg.reply("❌ Opção inválida. Escolha uma opção de 1 a 3 (ou digite *menu* para voltar).");
          }

          if (info.etapa === "pastoral_sub_agenda") {
            if (escolha === "voltar") {
              info.etapa = "menu_pastoral";
              return msg.reply(montarMenuPastoral());
            }
            if (escolha === "1" || /agenda\s+completa|todos/i.test(escolha)) {
              info.fluxo = "ver_agenda";
              info.agendaCompleta = true;
              info.isPastor = true;
              info.etapa = "escolha_mes";
              const hoje = new Date();
              const mesAtual = hoje.getMonth();
              let listaMeses = "📅 *Ver Agenda Completa*\n\nPara qual mês você deseja consultar?\n\n";
              for (let i = mesAtual; i < 12; i++) {
                listaMeses += `${i + 1} - ${MESES[i]}\n`;
              }
              listaMeses += "\n0 - Escolher um período específico";
              return msg.reply(listaMeses + "\n\nDigite o número do mês desejado, ou 0 para outro período:");
            }
            if (escolha === "2" || /evento/i.test(escolha)) {
              info.fluxo = "agendamento";
              info.etapa = "evento_acao";
              return msg.reply(montarMenuEventos());
            }
            if (escolha === "3" || /reuni/i.test(escolha)) {
              info.fluxo = "reunioes";
              info.etapa = "menu_reuniao";
              return msg.reply("🤝 *Reuniões*\n\nO que você deseja fazer?\n\n1 - Agendar reunião\n2 - Alterar reunião existente\n3 - Desmarcar reunião existente\n\nDigite *voltar* para o menu anterior ou *menu* para voltar ao início.");
            }
            if (escolha === "4" || /disponib/i.test(escolha)) {
              info.fluxo = "consulta_disponibilidade_lider";
              info.etapa = "escolha_mes";
              const agora = moment.tz("America/Sao_Paulo");
              const mesAtual = agora.month();
              let listaMeses = "📅 *Consulta de Disponibilidade*\n\nPara qual mês você deseja consultar?\n\n";
              for (let i = mesAtual; i < 12; i++) {
                listaMeses += `${i + 1} - ${MESES[i]}\n`;
              }
              return msg.reply(listaMeses + "\nDigite o número do mês desejado:");
            }
            if (escolha === "5" || /inscri[cç][õo]es|inscritos|inscritas|fichas?|formul[aá]rios?/i.test(escolha)) {
              info.etapa = "escolha_inscricoes_ou_fichas";
              info.origemInscricoesOuFichas = "pastoral";
              return msg.reply(montarMenuInscricoesOuFichas());
            }
            if (escolha === "6") {
              return await iniciarFluxoConsultaInscricoes({
                msg,
                numero,
                etapas,
                usuario,
                isPastor,
                isDiretor,
                isLider,
                client,
                origem: "pastoral",
              });
            }
            if (escolha === "7") {
              return await iniciarFluxoConsultaFichasEventos({
                msg,
                numero,
                etapas,
                origem: "pastoral",
              });
            }
            if (/montagem|decora/i.test(escolha)) {
              info.fluxo = "agendamento";
              info.etapa = "preparacao_informar_horarios";
              info.departamento = usuario?.departamento || "Evento";
              return msg.reply(
                "🏢 *Uso do Salão Antes / Montagem / Decoração*\n\n" +
                "Caso precise do salão horas antes do evento ou no dia anterior para montagem, decoração ou limpeza, por favor informe:\n\n" +
                "• *Nome do evento e departamento*\n" +
                "• *Data e horários* necessários (ex: dia anterior das 18:00 às 21:00 ou 2 horas antes do início)\n\n" +
                "_Essas informações serão registradas no departamento e encaminhadas à secretaria e equipe._"
              );
            }
            return msg.reply("❌ Opção inválida. Escolha uma opção de 1 a 5, digite *voltar* para o menu pastoral ou *menu* para o início.");
          }

          if (info.etapa === "pastoral_sub_comunicacao") {
            if (escolha === "voltar") {
              info.etapa = "menu_pastoral";
              return msg.reply(montarMenuPastoral());
            }
            if (escolha === "1" || /aviso|comunicado/i.test(escolha)) {
              info.fluxo = "comunicados";
              info.etapa = "texto_comunicado";
              return msg.reply("📢 *Solicitar aviso / comunicado no culto*\n\nPor favor, digite abaixo o texto do comunicado que você deseja que seja lido ou exibido nos cultos:");
            }
            if (escolha === "2" || /arte|flyer/i.test(escolha)) {
              info.fluxo = "artes_flyers";
              info.etapa = "artes_departamento";
              const redesUsuario = obterRedesParaUsuario(usuario);
              info.redesDisponiveis = redesUsuario;
              return msg.reply(`🎨 *Solicitar artes e flyers*\n\n🏢 De qual departamento é a solicitação?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
            }
            return msg.reply("❌ Opção inválida. Escolha 1 para Aviso/Comunicado ou 2 para Artes e Flyers (ou digite *voltar*).");
          }

          if (info.etapa === "pastoral_menu_atendimento") {
            const opc = msg.body.trim().toLowerCase();
            if (opc === "voltar") {
              info.etapa = "menu_pastoral";
              return msg.reply(montarMenuPastoral());
            }
            if (opc === "4" || /orienta/i.test(opc)) {
              return msg.reply("📋 *Atendimentos Pastorais*\n\nOs pedidos de atendimento pastoral são enviados diretamente ao grupo oficial de pastores para alinhamento e confirmação.\n\nDigite *voltar* para o menu anterior ou *menu* para o início.");
            }
            if (opc === "1") {
              info.etapa = "pastoral_add_nome";
              return msg.reply("🤝 *Adicionar Atendimento Pastoral*\n\nQual é o nome da pessoa / discípulo a ser atendido(a)?");
            } else if (opc === "2" || opc === "3") {
              info.acaoPastoral = opc === "3" ? "desmarcar" : "alterar";
              await msg.reply("🔍 Buscando atendimentos agendados...");
              try {
                const agora = moment.tz("America/Sao_Paulo");
                const inicioBusca = agora.clone().startOf("day").toISOString();
                const fimAno = agora.clone().endOf("year").toISOString();
                const calendarId = AGENDAS_INTERNAS.ATENDIMENTO || agendasParaLer[11];
                const eventos = await buscarEventos(inicioBusca, fimAno, calendarId);
                const filtrados = (eventos || []).filter(e => e.status !== "cancelled" && isEventoFuturo(e, agora));
                if (filtrados.length === 0) {
                  delete etapas[numero];
                  return msg.reply("ℹ️ Não há atendimentos pastorais agendados no momento.\n\nDigite *menu* para voltar ao menu principal.");
                }

                info.eventosEncontrados = filtrados.slice(0, 15);
                info.etapa = info.acaoPastoral === "desmarcar" ? "pastoral_desmarcar_selecionar" : "pastoral_alterar_selecionar";
                const acaoVerbo = info.acaoPastoral === "desmarcar" ? "desmarcar" : "alterar";
                let lista = `📋 *Atendimentos Pastorais Agendados*\nQual atendimento você deseja ${acaoVerbo}?\n\n`;
                info.eventosEncontrados.forEach((ev, i) => {
                  const d = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo");
                  lista += `${i + 1} - ${d.format("DD/MM [às] HH:mm")}: ${ev.summary}\n`;
                });
                lista += `\nDigite o número do atendimento ou *menu* para voltar.`;
                return msg.reply(lista);
              } catch (errList) {
                console.error("[Pastoral] Erro ao listar atendimentos:", errList);
                delete etapas[numero];
                return msg.reply("⚠️ Erro ao acessar a agenda de atendimentos. Tente novamente mais tarde.");
              }
            } else {
              return msg.reply("❌ Opção inválida. Escolha 1 para agendar, 2 para alterar ou 3 para desmarcar (ou digite *menu* para voltar).");
            }
          }

          // Subfluxo Desmarcar Atendimento Pastoral
          if (info.etapa === "pastoral_desmarcar_selecionar") {
            const index = parseInt(msg.body.trim()) - 1;
            if (isNaN(index) || !info.eventosEncontrados[index]) {
              return msg.reply("❌ Escolha um número válido da lista.");
            }
            info.atendimentoSelecionado = info.eventosEncontrados[index];
            info.etapa = "pastoral_desmarcar_confirmar";
            const d = moment.tz(info.atendimentoSelecionado.start.dateTime || info.atendimentoSelecionado.start.date, "America/Sao_Paulo");
            return msg.reply(`⚠️ Confirma o cancelamento do atendimento pastoral:\n\n📌 *${info.atendimentoSelecionado.summary}*\n🗓️ *Data:* ${d.format("DD/MM/YYYY [às] HH:mm")}\n\nDigite *SIM* para confirmar ou *menu* para desistir.`);
          }

          if (info.etapa === "pastoral_desmarcar_confirmar") {
            if (msg.body.trim().toLowerCase() !== "sim") {
              return msg.reply("❌ Desmarcação não confirmada. Digite *SIM* para confirmar ou *menu* para desistir.");
            }
            const calendarId = AGENDAS_INTERNAS.ATENDIMENTO || agendasParaLer[11];
            const eventId = info.atendimentoSelecionado.id;
            try {
              if (calendar && calendar.events && typeof calendar.events.delete === "function") {
                await calendar.events.delete({ calendarId, eventId });
              }
              const nomePastor = usuario?.nome || (contato ? nomeContato(contato, numero) : "Pastor");
              const d = moment.tz(info.atendimentoSelecionado.start.dateTime || info.atendimentoSelecionado.start.date, "America/Sao_Paulo");
              const msgGrupo = `🗑️ *ATENDIMENTO PASTORAL DESMARCADO*\n\n👤 *Pastor:* ${nomePastor}\n📌 *Atendimento:* ${info.atendimentoSelecionado.summary}\n📆 *Data Original:* ${d.format("DD/MM/YYYY [às] HH:mm")}`;
              await notificarPastoral(client, msgGrupo);

              delete etapas[numero];
              return msg.reply(`✅ *Atendimento Pastoral Desmarcado com Sucesso!*\n\nO atendimento foi removido da agenda e a equipe pastoral foi comunicada. 🙏\n\nDigite *menu* para voltar ao menu principal.`);
            } catch (errDel) {
              console.error("[Pastoral] Erro ao desmarcar atendimento:", errDel);
              delete etapas[numero];
              return msg.reply("⚠️ Ocorreu um erro ao desmarcar o atendimento na agenda do Google. Tente novamente em instantes.");
            }
          }

          // Subfluxo Alterar Atendimento Pastoral
          if (info.etapa === "pastoral_alterar_selecionar") {
            const index = parseInt(msg.body.trim()) - 1;
            if (isNaN(index) || !info.eventosEncontrados[index]) {
              return msg.reply("❌ Escolha um número válido da lista.");
            }
            info.atendimentoSelecionado = info.eventosEncontrados[index];
            info.etapa = "pastoral_alterar_o_que";
            return msg.reply(`📝 Você selecionou: *${info.atendimentoSelecionado.summary}*\n\nO que você deseja alterar?\n\n1 - Horário\n2 - Data\n3 - Local\n\nDigite o número da opção desejada ou *menu* para cancelar:`);
          }

          if (info.etapa === "pastoral_alterar_o_que") {
            const opc = msg.body.trim();
            if (opc === "1") {
              info.etapa = "pastoral_alterar_novo_horario";
              return msg.reply("⏰ Digite o *novo horário de início* do atendimento (ex: 15:00 ou 19:30):");
            } else if (opc === "2") {
              info.etapa = "pastoral_alterar_nova_data";
              return msg.reply("📆 Digite a *nova data* do atendimento (ex: 25/10 ou 25/10/2026):");
            } else if (opc === "3") {
              info.etapa = "pastoral_alterar_novo_local";
              return msg.reply("📍 Qual será o *novo local* do atendimento? (Ex: *Gabinete Pastoral*, *Igreja*, *Online*, etc):");
            } else {
              return msg.reply("❌ Opção inválida. Escolha 1 para Horário, 2 para Data ou 3 para Local.");
            }
          }

          if (info.etapa === "pastoral_alterar_novo_horario") {
            const horario = msg.body.trim();
            if (!HORARIO_REGEX.test(horario)) {
              return msg.reply("❌ Formato inválido. Use HH:MM (ex: 15:00 ou 19:30).");
            }
            info.novoHorario = horario;
            info.campoAlterar = "horario";
            info.etapa = "pastoral_alterar_finalizar";
          }

          if (info.etapa === "pastoral_alterar_nova_data") {
            const entrada = msg.body.trim();
            const partes = entrada.split("/");
            if (partes.length < 2) {
              return msg.reply("❌ Formato de data inválido. Use DD/MM (ex: 25/10) ou DD/MM/AAAA (ex: 25/10/2026).");
            }
            const dia = parseInt(partes[0], 10);
            const mes = parseInt(partes[1], 10);
            const ano = partes[2] ? parseInt(partes[2], 10) : moment.tz("America/Sao_Paulo").year();
            if (isNaN(dia) || isNaN(mes) || dia < 1 || dia > 31 || mes < 1 || mes > 12) {
              return msg.reply("❌ Data inválida. Digite uma data real no formato DD/MM (ex: 25/10).");
            }
            info.novoDia = dia;
            info.novoMes = mes;
            info.novoAno = ano;
            info.novaDataFormatada = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
            info.campoAlterar = "data";
            info.etapa = "pastoral_alterar_finalizar";
          }

          if (info.etapa === "pastoral_alterar_novo_local") {
            let local = msg.body.trim();
            if (/^(?:1\s*[-–]\s*)?(?:na\s+igreja|igreja|no\s+templo|templo)$/i.test(local)) {
              local = ENDERECO_IGREJA;
            } else if (!local) {
              local = "Gabinete Pastoral";
            }
            info.novoLocal = local;
            info.campoAlterar = "local";
            info.etapa = "pastoral_alterar_finalizar";
          }

          if (info.etapa === "pastoral_alterar_finalizar") {
            const calendarId = AGENDAS_INTERNAS.ATENDIMENTO || agendasParaLer[11];
            const eventId = info.atendimentoSelecionado.id;
            const nomePastor = usuario?.nome || (contato ? nomeContato(contato, numero) : "Pastor");
            const dataOriginal = moment.tz(info.atendimentoSelecionado.start.dateTime || info.atendimentoSelecionado.start.date, "America/Sao_Paulo");
            const patchResource = {};
            let descricaoDetalhe = "";

            if (info.campoAlterar === "horario") {
              const [h, m] = info.novoHorario.split(":").map(Number);
              const dataIsoIni = dataOriginal.clone().hour(h).minute(m).second(0).format();
              const dataIsoFim = dataOriginal.clone().hour((h + 1) % 24).minute(m).second(0).format();
              patchResource.start = { dateTime: dataIsoIni, timeZone: "America/Sao_Paulo" };
              patchResource.end = { dateTime: dataIsoFim, timeZone: "America/Sao_Paulo" };
              descricaoDetalhe = `⏰ *Novo Horário:* ${info.novoHorario}`;
            } else if (info.campoAlterar === "data") {
              const hora = dataOriginal.hour();
              const minuto = dataOriginal.minute();
              const novaDataIni = moment.tz(
                `${info.novoDia}/${info.novoMes}/${info.novoAno} ${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`,
                "D/M/YYYY HH:mm",
                "America/Sao_Paulo"
              );
              patchResource.start = { dateTime: novaDataIni.format(), timeZone: "America/Sao_Paulo" };
              patchResource.end = { dateTime: novaDataIni.clone().add(1, "hour").format(), timeZone: "America/Sao_Paulo" };
              descricaoDetalhe = `📆 *Nova Data:* ${info.novaDataFormatada}`;
            } else if (info.campoAlterar === "local") {
              patchResource.location = info.novoLocal;
              descricaoDetalhe = `📍 *Novo Local:* ${info.novoLocal}`;
            }

            try {
              if (calendar && calendar.events && typeof calendar.events.patch === "function") {
                await calendar.events.patch({ calendarId, eventId, resource: patchResource });
              }

              const msgGrupo =
                `🔄 *ATENDIMENTO PASTORAL ALTERADO*\n\n` +
                `👤 *Pastor:* ${nomePastor}\n` +
                `📌 *Atendimento:* ${info.atendimentoSelecionado.summary}\n` +
                `${descricaoDetalhe}`;
              await notificarPastoral(client, msgGrupo);

              delete etapas[numero];
              return msg.reply(
                `✅ *Atendimento Pastoral Alterado com Sucesso!*\n\n` +
                `• *Atendimento:* ${info.atendimentoSelecionado.summary}\n` +
                `• ${descricaoDetalhe}\n\n` +
                `A alteração foi gravada na agenda e comunicada à equipe pastoral. 🙏\n\n` +
                `Digite *menu* para voltar ao menu principal.`
              );
            } catch (errPatch) {
              console.error("[Pastoral] Erro ao alterar atendimento:", errPatch);
              delete etapas[numero];
              return msg.reply("⚠️ Ocorreu um erro ao atualizar o atendimento na agenda do Google. Tente novamente em instantes.");
            }
          }

          if (info.etapa === "pastoral_add_nome") {
            const nome = msg.body.trim();
            if (!nome) return msg.reply("❌ Por favor, digite o nome da pessoa a ser atendida.");
            info.nomeAtendido = nome;
            info.etapa = "pastoral_add_data";
            return msg.reply(`📅 Qual é a *data* do atendimento para *${info.nomeAtendido}*? (Ex: 25/10 ou 25/10/2026)`);
          }

          if (info.etapa === "pastoral_add_data") {
            const entrada = msg.body.trim();
            const partes = entrada.split("/");
            if (partes.length < 2) {
              return msg.reply("❌ Formato de data inválido. Use DD/MM (ex: 25/10) ou DD/MM/AAAA (ex: 25/10/2026).");
            }
            const dia = parseInt(partes[0], 10);
            const mes = parseInt(partes[1], 10);
            const ano = partes[2] ? parseInt(partes[2], 10) : moment.tz("America/Sao_Paulo").year();

            if (isNaN(dia) || isNaN(mes) || dia < 1 || dia > 31 || mes < 1 || mes > 12) {
              return msg.reply("❌ Data inválida. Digite uma data real no formato DD/MM (ex: 25/10).");
            }

            info.diaAtendimento = dia;
            info.mesAtendimento = mes;
            info.anoAtendimento = ano;
            info.dataFormatada = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
            info.etapa = "pastoral_add_horario";
            return msg.reply(`⏰ Qual é o *horário de início* do atendimento? (Ex: 15:00 ou 19:30)`);
          }

          if (info.etapa === "pastoral_add_horario") {
            const horario = msg.body.trim();
            if (!HORARIO_REGEX.test(horario)) {
              return msg.reply("❌ Formato inválido. Use HH:MM (ex: 15:00 ou 19:30).");
            }
            info.horarioInicio = horario;

            const [h, m] = horario.split(":").map(Number);
            const horaFim = (h + 1) % 24;
            info.horarioFim = `${String(horaFim).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

            info.etapa = "pastoral_add_espaco";
            return msg.reply(
              "📍 *Qual espaço da igreja será utilizado?*\n\n" +
              "A igreja conta com 3 espaços: *Gabinete Pastoral*, *Salão* e *Sala Infantil*.\n\n" +
              "1 - Somente o Gabinete Pastoral (mantém o Salão livre)\n" +
              "2 - Todo o espaço da igreja (reserva Salão e dependências)\n" +
              "3 - Outro local (Online, visita domiciliar, etc)\n\n" +
              "Digite o número da opção desejada:"
            );
          }

          const executarSalvarAtendimentoPastoral = async () => {
            const nomePastor = usuario?.nome || (contato ? nomeContato(contato, numero) : "Pastor");
            const dataIsoInicio = moment.tz(
              `${info.diaAtendimento}/${info.mesAtendimento}/${info.anoAtendimento} ${info.horarioInicio}`,
              "D/M/YYYY HH:mm",
              "America/Sao_Paulo"
            ).format();
            const dataIsoFim = moment.tz(
              `${info.diaAtendimento}/${info.mesAtendimento}/${info.anoAtendimento} ${info.horarioFim}`,
              "D/M/YYYY HH:mm",
              "America/Sao_Paulo"
            ).format();

            const resource = {
              summary: `Atendimento Pastoral - ${info.nomeAtendido}`,
              description: `Atendimento Pastoral agendado diretamente pelo Pastor.\n👤 Discípulo: ${info.nomeAtendido}\n👔 Pastor: ${nomePastor}\n📱 Telefone Pastor: ${numero}\n📍 Espaço/Local: ${info.localAtendimento}`,
              location: info.localAtendimento,
              start: { dateTime: dataIsoInicio, timeZone: "America/Sao_Paulo" },
              end: { dateTime: dataIsoFim, timeZone: "America/Sao_Paulo" },
            };

            const calendarId = AGENDAS_INTERNAS.ATENDIMENTO || agendasParaLer[11];

            try {
              let resInsert = null;
              if (calendar && calendar.events && typeof calendar.events.insert === "function") {
                resInsert = await calendar.events.insert({ calendarId, resource });
              }
              const eventoCriadoId = resInsert?.data?.id || "";
              registrarAgendamentoPastoral({
                eventoId: eventoCriadoId,
                pastorTelefone: numero,
                pastorNome: nomePastor,
                discipulo: info.nomeAtendido,
                dataHora: `${info.dataFormatada} ${info.horarioInicio}`,
              });

              const msgGrupo =
                `⛪ *NOVO ATENDIMENTO PASTORAL AGENDADO*\n\n` +
                `👤 *Pastor:* ${nomePastor}\n` +
                `👥 *Pessoa:* ${info.nomeAtendido}\n` +
                `📅 *Data:* ${info.dataFormatada}\n` +
                `⏰ *Horário:* ${info.horarioInicio} às ${info.horarioFim}\n` +
                `📍 *Local:* ${info.localAtendimento}`;

              await notificarPastoral(client, msgGrupo);

              delete etapas[numero];
              return msg.reply(
                `✅ *Atendimento Pastoral Agendado com Sucesso!*\n\n` +
                `• *Pessoa:* ${info.nomeAtendido}\n` +
                `• *Data:* ${info.dataFormatada}\n` +
                `• *Horário:* ${info.horarioInicio} às ${info.horarioFim}\n` +
                `• *Local:* ${info.localAtendimento}\n\n` +
                `O atendimento foi gravado na agenda de Atendimentos e informado à equipe pastoral. 🙏\n\n` +
                `Digite *menu* para voltar ao menu principal.`
              );
            } catch (errCal) {
              console.error("[Pastoral] Erro ao gravar atendimento na agenda do Google:", errCal);
              delete etapas[numero];
              return msg.reply("⚠️ Ocorreu um erro ao salvar o atendimento na agenda do Google. A equipe foi avisada. Tente novamente em instantes.");
            }
          };

          if (info.etapa === "pastoral_add_espaco") {
            const escolhaEspaco = msg.body.trim();
            const dataIsoInicio = moment.tz(
              `${info.diaAtendimento}/${info.mesAtendimento}/${info.anoAtendimento} ${info.horarioInicio}`,
              "D/M/YYYY HH:mm",
              "America/Sao_Paulo"
            ).format();
            const dataIsoFim = moment.tz(
              `${info.diaAtendimento}/${info.mesAtendimento}/${info.anoAtendimento} ${info.horarioFim}`,
              "D/M/YYYY HH:mm",
              "America/Sao_Paulo"
            ).format();

            if (escolhaEspaco === "1" || /gabinete/i.test(escolhaEspaco)) {
              info.localAtendimento = "Gabinete Pastoral";

              let eventosConcorrentes = [];
              try {
                const todos = await buscarEventos(dataIsoInicio, dataIsoFim);
                const idAtendimentos = AGENDAS_INTERNAS.ATENDIMENTO || agendasParaLer[11];
                eventosConcorrentes = (todos || []).filter(e => e.status !== "cancelled" && e.calendarId !== idAtendimentos);
              } catch (e) {
                console.error("[Pastoral] Erro ao verificar atividades concorrentes:", e);
              }

              const conflitoDomingo = verificarConflitoCultoDomingo({
                ano: info.anoAtendimento,
                mes: info.mesAtendimento,
                dia: info.diaAtendimento,
                isDiaInteiro: false,
                horarioInicio: info.horarioInicio,
                horarioFim: info.horarioFim,
              });
              if (conflitoDomingo.conflito) {
                eventosConcorrentes.push({ summary: conflitoDomingo.subtipo === "ceia" ? "Culto de Santa Ceia" : "Culto de Celebração" });
              }

              if (eventosConcorrentes.length > 0) {
                const nomes = eventosConcorrentes.map(e => e.summary || "Atividade").slice(0, 3).join(", ");
                info.etapa = "pastoral_confirmar_conflito_gabinete";
                return msg.reply(
                  `⚠️ *Aviso de Atividade Concorrente*\n\n` +
                  `Pastor, no mesmo horário (${info.horarioInicio} às ${info.horarioFim}), haverá na igreja:\n` +
                  `📌 *${nomes}*\n\n` +
                  `Como o atendimento será no *Gabinete Pastoral*, o Salão permanece livre.\n\n` +
                  `Há algum problema para o atendimento realizar-se neste horário?\n\n` +
                  `1 - Não há problema, confirmar atendimento\n` +
                  `2 - Prefiro escolher outro horário ou data`
                );
              }

              return await executarSalvarAtendimentoPastoral();
            }

            if (escolhaEspaco === "2" || /todo/i.test(escolhaEspaco)) {
              info.localAtendimento = "Todo o espaço da igreja";

              const conflitoDomingo = verificarConflitoCultoDomingo({
                ano: info.anoAtendimento,
                mes: info.mesAtendimento,
                dia: info.diaAtendimento,
                isDiaInteiro: false,
                horarioInicio: info.horarioInicio,
                horarioFim: info.horarioFim,
              });
              if (conflitoDomingo.conflito) {
                info.etapa = "pastoral_add_horario";
                return msg.reply(conflitoDomingo.mensagem);
              }

              let eventosConcorrentes = [];
              try {
                const todos = await buscarEventos(dataIsoInicio, dataIsoFim);
                const idAtendimentos = AGENDAS_INTERNAS.ATENDIMENTO || agendasParaLer[11];
                eventosConcorrentes = (todos || []).filter(e => e.status !== "cancelled" && e.calendarId !== idAtendimentos);
              } catch (e) {
                console.error("[Pastoral] Erro ao verificar disponibilidade total:", e);
              }

              if (eventosConcorrentes.length > 0) {
                const nomes = eventosConcorrentes.map(e => e.summary || "Atividade").slice(0, 3).join(", ");
                info.etapa = "pastoral_add_horario";
                return msg.reply(
                  `❌ *Espaço Indisponível*\n\n` +
                  `Não é possível reservar todo o espaço da igreja pois já consta agendado:\n` +
                  `📌 *${nomes}*\n\n` +
                  `Por favor, digite outro horário de início para o atendimento (ex: 15:00 ou 19:30), ou digite *menu* para voltar.`
                );
              }

              return await executarSalvarAtendimentoPastoral();
            }

            if (escolhaEspaco === "3" || /outro/i.test(escolhaEspaco)) {
              info.etapa = "pastoral_add_outro_local";
              return msg.reply("📍 Onde será o atendimento? (Ex: *Online*, *Visita domiciliar*, etc):");
            }

            return msg.reply(
              "❌ Opção inválida. Por favor, escolha:\n" +
              "1 - Somente o Gabinete Pastoral\n" +
              "2 - Todo o espaço da igreja\n" +
              "3 - Outro local\n\n" +
              "Ou digite *menu* para voltar."
            );
          }

          if (info.etapa === "pastoral_confirmar_conflito_gabinete") {
            const resp = msg.body.trim();
            if (resp === "1" || /sim|confirmar|sem problema|pode/i.test(resp)) {
              return await executarSalvarAtendimentoPastoral();
            }
            if (resp === "2" || /n[aã]o|outro|remarcar/i.test(resp)) {
              info.etapa = "pastoral_add_data";
              return msg.reply("Entendido, Pastor! Vamos escolher outro momento.\n\n📅 Por favor, informe a nova *data* do atendimento (ex: 15/04 ou 20/04/2026):");
            }
            return msg.reply("❌ Por favor, responda com:\n1 - Não há problema, confirmar atendimento\n2 - Prefiro escolher outro horário ou data\n\nOu digite *menu* para cancelar.");
          }

          if (info.etapa === "pastoral_add_outro_local") {
            info.localAtendimento = msg.body.trim() || "Outro local";
            return await executarSalvarAtendimentoPastoral();
          }

          if (info.etapa === "pastoral_add_local") {
            let local = msg.body.trim();
            if (/^(?:1\s*[-–]\s*)?(?:na\s+igreja|igreja|no\s+templo|templo)$/i.test(local)) {
              local = ENDERECO_IGREJA;
            } else if (!local) {
              local = "Gabinete Pastoral";
            }
            info.localAtendimento = local;
            return await executarSalvarAtendimentoPastoral();
          }
        } else if (info.fluxo === "area_diretor") {
          const escolha = msg.body.trim().toLowerCase();

          if (info.etapa === "menu_diretor") {
            if (escolha === "voltar") {
              return msg.reply("Você já está na Área da Direção. Digite *menu* para voltar ao menu principal.");
            }
            if (escolha === "1" || /agenda|evento/i.test(escolha)) {
              info.etapa = "diretor_sub_agenda";
              return msg.reply(montarSubmenuDiretorAgenda());
            }
            if (escolha === "2" || /comunica|m[ií]dia/i.test(escolha)) {
              info.etapa = "diretor_sub_comunicacao";
              return msg.reply(montarSubmenuDiretorComunicacao());
            }

            if (escolha === "3" || /inscri[cç][õo]es|inscritos|inscritas/i.test(escolha)) {
              return await iniciarFluxoConsultaInscricoes({
                msg,
                numero,
                etapas,
                usuario,
                isPastor,
                isDiretor,
                isLider,
                client,
                origem: "diretor",
              });
            }

            // Atalhos diretos preservados
            if (escolha === "4" || /aviso|comunicado/i.test(escolha)) {
              info.fluxo = "comunicados";
              info.etapa = "texto_comunicado";
              return msg.reply("📢 *Solicitar aviso / comunicado no culto*\n\nPor favor, digite abaixo o texto do comunicado que você deseja que seja lido ou exibido nos cultos:");
            }
            if (escolha === "4" || /artes|flyers/i.test(escolha)) {
              info.fluxo = "artes_flyers";
              info.etapa = "artes_departamento";
              const redesUsuario = obterRedesParaUsuario(usuario);
              info.redesDisponiveis = redesUsuario;
              return msg.reply(`🎨 *Solicitar artes e flyers*\n\n🏢 De qual departamento é a solicitação?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
            }
            if (escolha === "5" || /reuni[aã]o|reunioes/i.test(escolha)) {
              info.fluxo = "reunioes";
              info.etapa = "menu_reuniao";
              return msg.reply("🤝 *Reuniões*\n\nO que você deseja fazer?\n\n1 - Agendar reunião\n2 - Alterar reunião existente\n3 - Desmarcar reunião existente\n\nDigite *voltar* para o menu anterior ou *menu* para voltar ao início.");
            }
            if (escolha === "6" || /disponib/i.test(escolha)) {
              info.fluxo = "consulta_disponibilidade_lider";
              info.etapa = "escolha_mes";
              const agora = moment.tz("America/Sao_Paulo");
              const mesAtual = agora.month();
              let listaMeses = "📅 *Consulta de Disponibilidade*\n\nPara qual mês você deseja consultar?\n\n";
              for (let i = mesAtual; i < 12; i++) {
                listaMeses += `${i + 1} - ${MESES[i]}\n`;
              }
              return msg.reply(listaMeses + "\nDigite o número do mês desejado:");
            }
            if (escolha === "8" || /evento\s+externo/i.test(escolha)) {
              info.fluxo = "evento_externo";
              info.etapa = "evento_externo_nome";
              return msg.reply("🌐 *Agendamento de Evento Externo*\n\n1️⃣ Qual é o *nome do evento*?\n\n_Digite *menu* a qualquer momento para cancelar._");
            }

            return msg.reply("❌ Opção inválida. Escolha 1 para Agenda e Eventos ou 2 para Comunicação e Mídia (ou digite *menu* para voltar).");
          }

          if (info.etapa === "diretor_sub_agenda") {
            if (escolha === "voltar") {
              info.etapa = "menu_diretor";
              return msg.reply(montarMenuDiretor());
            }
            if (escolha === "1" || /todos|completa/i.test(escolha)) {
              info.fluxo = "ver_agenda";
              info.agendaCompleta = true;
              info.isPastor = isPastor;
              info.etapa = "escolha_mes";
              const hoje = new Date();
              const mesAtual = hoje.getMonth();
              let listaMeses = "📅 *Ver Todos os Eventos da Igreja*\n\nPara qual mês você deseja consultar?\n\n";
              for (let i = mesAtual; i < 12; i++) {
                listaMeses += `${i + 1} - ${MESES[i]}\n`;
              }
              listaMeses += "\n0 - Escolher um período específico";
              return msg.reply(listaMeses + "\n\nDigite o número do mês desejado, ou 0 para outro período:");
            }
            if (escolha === "2" || /evento/i.test(escolha)) {
              info.fluxo = "agendamento";
              info.etapa = "evento_acao";
              return msg.reply(montarMenuEventos());
            }
            if (escolha === "3" || /reuni/i.test(escolha)) {
              info.fluxo = "reunioes";
              info.etapa = "menu_reuniao";
              return msg.reply("🤝 *Reuniões*\n\nO que você deseja fazer?\n\n1 - Agendar reunião\n2 - Alterar reunião existente\n3 - Desmarcar reunião existente\n\nDigite *voltar* para o menu anterior ou *menu* para o início.");
            }
            if (escolha === "4" || /disponib/i.test(escolha)) {
              info.fluxo = "consulta_disponibilidade_lider";
              info.etapa = "escolha_mes";
              const agora = moment.tz("America/Sao_Paulo");
              const mesAtual = agora.month();
              let listaMeses = "📅 *Consulta de Disponibilidade*\n\nPara qual mês você deseja consultar?\n\n";
              for (let i = mesAtual; i < 12; i++) {
                listaMeses += `${i + 1} - ${MESES[i]}\n`;
              }
              return msg.reply(listaMeses + "\nDigite o número do mês desejado:");
            }
            if (escolha === "5" || /inscri[cç][õo]es|inscritos|inscritas|fichas?|formul[aá]rios?/i.test(escolha)) {
              info.etapa = "escolha_inscricoes_ou_fichas";
              info.origemInscricoesOuFichas = "diretor";
              return msg.reply(montarMenuInscricoesOuFichas());
            }
            if (escolha === "6") {
              return await iniciarFluxoConsultaInscricoes({
                msg,
                numero,
                etapas,
                usuario,
                isPastor,
                isDiretor,
                isLider,
                client,
                origem: "diretor",
              });
            }
            if (escolha === "7") {
              return await iniciarFluxoConsultaFichasEventos({
                msg,
                numero,
                etapas,
                origem: "diretor",
              });
            }
            if (/montagem|decora/i.test(escolha)) {
              info.fluxo = "agendamento";
              info.etapa = "preparacao_informar_horarios";
              info.departamento = usuario?.departamento || "Evento";
              return msg.reply(
                "🏢 *Uso do Salão Antes / Montagem / Decoração*\n\n" +
                "Caso precise do salão horas antes do evento ou no dia anterior para montagem, decoração ou limpeza, por favor informe:\n\n" +
                "• *Nome do evento e departamento*\n" +
                "• *Data e horários* necessários (ex: dia anterior das 18:00 às 21:00 ou 2 horas antes do início)\n\n" +
                "_Essas informações serão registradas no departamento e encaminhadas à secretaria e equipe._"
              );
            }
            return msg.reply("❌ Opção inválida. Escolha uma opção de 1 a 5, digite *voltar* para o menu da direção ou *menu* para o início.");
          }

          if (info.etapa === "diretor_sub_comunicacao") {
            if (escolha === "voltar") {
              info.etapa = "menu_diretor";
              return msg.reply(montarMenuDiretor());
            }
            if (escolha === "1" || /aviso|comunicado/i.test(escolha)) {
              info.fluxo = "comunicados";
              info.etapa = "texto_comunicado";
              return msg.reply("📢 *Solicitar aviso / comunicado no culto*\n\nPor favor, digite abaixo o texto do comunicado que você deseja que seja lido ou exibido nos cultos:");
            }
            if (escolha === "2" || /arte|flyer/i.test(escolha)) {
              info.fluxo = "artes_flyers";
              info.etapa = "artes_departamento";
              const redesUsuario = obterRedesParaUsuario(usuario);
              info.redesDisponiveis = redesUsuario;
              return msg.reply(`🎨 *Solicitar artes e flyers*\n\n🏢 De qual departamento é a solicitação?\n\n${montarListaRedesParaUsuario(redesUsuario)}`);
            }
            return msg.reply("❌ Opção inválida. Escolha 1 para Aviso/Comunicado ou 2 para Artes e Flyers (ou digite *voltar*).");
          }
        } else if (info.fluxo === "artes_flyers") {
          if (info.etapa === "artes_departamento") {
            const redesDisp = info.redesDisponiveis || obterRedesParaUsuario(usuario);
            const rede = obterRedeDaLista(msg.body.trim(), redesDisp);
            if (!rede) return msg.reply(`❌ Escolha um departamento da lista (1 a ${redesDisp.length}).`);

            info.departamento = rede.nome;
            info.etapa = "artes_tipo";
            return msg.reply("📌 Qual o *tipo de material* que você precisa?\n\n1 - Flyer / Arte para Redes Sociais\n2 - Aviso / Comunicado Geral\n3 - Lembrancinha / Tag / Material Impresso\n4 - Outro");
          }

          if (info.etapa === "artes_tipo") {
            const tipos = {
              "1": "Flyer / Arte para Redes Sociais",
              "2": "Aviso / Comunicado Geral",
              "3": "Lembrancinha / Tag / Material Impresso",
              "4": "Outro"
            };
            const tipoEscolhido = tipos[msg.body.trim()];
            if (!tipoEscolhido) return msg.reply("❌ Escolha uma opção de 1 a 4.");

            info.tipoMaterial = tipoEscolhido;
            info.etapa = "artes_detalhes";
            return msg.reply("📝 O que *deve constar na arte/material*?\n\nDigite todo o texto e detalhes necessários (frases, datas, horários, versículo, preletor, cores ou formatos):");
          }

          if (info.etapa === "artes_detalhes") {
            info.detalhesArte = msg.body.trim();
            info.etapa = "artes_foto";
            return msg.reply("📷 Você tem alguma *foto, logotipo ou referência visual* para usar?\n\n👉 Envie a imagem agora pelo WhatsApp.\n👉 Se não precisar de imagem, apenas responda com *NÃO*.");
          }

          if (info.etapa === "artes_foto") {
            const temMidia = Boolean(msg.hasMedia || msg.type === "image" || msg.type === "document");
            if (temMidia) {
              const media = await baixarMidiaComRetry(msg, {
                client,
                contexto: "Artes",
                tentativas: 5,
                esperaMs: 2000,
                salvarEmDisco: true,
              });
              if (media && media.data) {
                info.midiaAnexa = media;
                info.etapa = "artes_prazo";
                return msg.reply("📷 ✅ *Imagem recebida com sucesso!*\n\n⏳ Para qual *data máxima* você precisa desse material pronto? (Ex: 22/08)");
              } else {
                return msg.reply("❌ Não foi possível carregar a imagem enviada. Por favor, tente enviar a imagem novamente ou responda com *NÃO* para continuar sem imagem.");
              }
            } else if ((msg.body || "").trim().toLowerCase() === "não" || (msg.body || "").trim().toLowerCase() === "nao") {
              info.midiaAnexa = null;
              info.etapa = "artes_prazo";
              return msg.reply("⏳ Para qual *data máxima* você precisa desse material pronto? (Ex: 22/08)");
            } else {
              return msg.reply("❌ Por favor, envie uma *foto/imagem* pelo WhatsApp ou responda com *NÃO* se não tiver imagem.");
            }
          }

          if (info.etapa === "artes_prazo") {
            info.prazoEntrega = msg.body.trim();

            const resumoGrupo = `🎨 *NOVA SOLICITAÇÃO DE ARTE/FLYER*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n🏢 *Depto/Rede:* ${info.departamento}\n📌 *Tipo de Material:* ${info.tipoMaterial}\n⏳ *Prazo de Entrega:* ${info.prazoEntrega}\n📝 *Detalhes/Texto:* ${info.detalhesArte}`;

            try {
              if (info.midiaAnexa) {
                await notificarMultimidia(client, resumoGrupo, info.midiaAnexa);
                console.log(`[Artes] Solicitação com imagem enviada para o grupo MULTIMÍDIAS.`);
              } else {
                await notificarMultimidia(client, resumoGrupo);
                console.log(`[Artes] Solicitação enviada para o grupo MULTIMÍDIAS.`);
              }
            } catch (errSend) {
              console.error("[Artes] Erro ao notificar grupo MULTIMÍDIAS:", errSend);
              await notificarMultimidia(client, resumoGrupo + "\n\n⚠️ _Nota: Não foi possível enviar a imagem anexa devido a uma falha de transmissão._");
            }

            await msg.reply(`✅ *Solicitação enviada com sucesso!*\n\nSeu pedido de arte/material foi encaminhado para a equipe com o prazo de *${info.prazoEntrega}*. 🙏\n\nDigite *menu* para voltar ao menu principal.`);
            delete etapas[numero];
            return;
          }
        } else if (info.fluxo === "reunioes") {
          if (info.etapa === "menu_reuniao") {
            const escolha = msg.body.trim();
            if (escolha.toLowerCase() === "voltar") {
              if (isPastor) {
                info.fluxo = "area_pastoral";
                info.etapa = "pastoral_sub_agenda";
                return msg.reply(montarSubmenuPastoralAgenda());
              } else if (isDiretor) {
                info.fluxo = "area_diretor";
                info.etapa = "diretor_sub_agenda";
                return msg.reply(montarSubmenuDiretorAgenda());
              } else {
                info.fluxo = "area_lider";
                info.etapa = "lider_sub_agenda";
                return msg.reply(montarSubmenuLiderAgenda());
              }
            }
            if (escolha === "1") {
              info.etapa = "reuniao_departamento";
              return msg.reply("🤝 *Agendar Reunião*\n\n1️⃣ Qual é o *departamento* da reunião? (Ex: Jovens, Mulheres, Diáconos, etc.)");
            } else if (escolha === "2" || escolha === "3") {
              info.acaoReuniao = escolha === "3" ? "desmarcar" : "alterar";
              await msg.reply("🔍 Buscando reuniões agendadas...");
              try {
                const agora = moment.tz("America/Sao_Paulo");
                const inicioBusca = agora.clone().startOf("day").toISOString();
                const fimAno = agora.clone().endOf("year").toISOString();
                const eventos = await buscarEventos(inicioBusca, fimAno, AGENDAS_INTERNAS.REUNIOES);
                const filtrados = (eventos || []).filter(e => e.status !== "cancelled" && isEventoFuturo(e, agora));
                if (filtrados.length === 0) {
                  delete etapas[numero];
                  return msg.reply("ℹ️ Não há reuniões agendadas no momento.\n\nDigite *menu* para voltar ao menu principal.");
                }

                info.eventosEncontrados = filtrados.slice(0, 15);
                info.etapa = info.acaoReuniao === "desmarcar" ? "reuniao_desmarcar_selecionar" : "reuniao_alterar_selecionar";
                const acaoVerbo = info.acaoReuniao === "desmarcar" ? "desmarcar" : "alterar";
                let lista = `📋 *Reuniões Agendadas*\nQual reunião você deseja ${acaoVerbo}?\n\n`;
                info.eventosEncontrados.forEach((ev, i) => {
                  const d = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo");
                  lista += `${i + 1} - ${d.format("DD/MM [às] HH:mm")}: ${ev.summary}\n`;
                });
                lista += `\nDigite o número da reunião ou *menu* para voltar.`;
                return msg.reply(lista);
              } catch (errList) {
                console.error("[Reuniões] Erro ao listar reuniões:", errList);
                delete etapas[numero];
                return msg.reply("⚠️ Erro ao acessar a agenda de reuniões. Tente novamente mais tarde.");
              }
            } else {
              return msg.reply("❌ Opção inválida. Escolha 1 para agendar, 2 para alterar ou 3 para desmarcar (ou digite *menu* para voltar).");
            }
          }

          // Subfluxo Agendar Reunião
          if (info.etapa === "reuniao_departamento") {
            const depto = msg.body.trim();
            if (!depto) return msg.reply("❌ Por favor, informe o departamento da reunião:");
            info.reuniaoDepartamento = depto;
            info.etapa = "reuniao_data";
            return msg.reply("2️⃣ Para qual *data* seria a reunião? (Ex: 25/10 ou 25/10/2026)");
          }

          if (info.etapa === "reuniao_data") {
            const dataObj = interpretarDataReuniao(msg.body);
            if (!dataObj) {
              return msg.reply("❌ Formato de data inválido. Use DD/MM ou DD/MM/AAAA (ex: 25/10 ou 25/10/2026).");
            }
            info.reuniaoData = dataObj;
            info.etapa = "reuniao_horario_inicio";
            return msg.reply("3️⃣ Qual é o *horário de início* da reunião? (Ex: 19h ou 19:30)");
          }

          if (info.etapa === "reuniao_horario_inicio") {
            const hInicio = normalizarHorarioReuniao(msg.body);
            if (!hInicio) {
              return msg.reply("❌ Formato de horário inválido. Use HH:MM ou HHh (ex: 19h ou 19:30).");
            }
            info.reuniaoHorarioInicio = hInicio;
            info.etapa = "reuniao_horario_fim";
            return msg.reply("4️⃣ Qual é o *horário previsto de término* da reunião? (Ex: 21h ou 21:30)");
          }

          if (info.etapa === "reuniao_horario_fim") {
            const hFim = normalizarHorarioReuniao(msg.body);
            if (!hFim) {
              return msg.reply("❌ Formato de horário de término inválido. Use HH:MM ou HHh (ex: 21h ou 21:30).");
            }
            const [hi, mi] = info.reuniaoHorarioInicio.split(":").map(Number);
            const [hf, mf] = hFim.split(":").map(Number);
            if (hf < hi || (hf === hi && mf <= mi)) {
              return msg.reply("❌ O horário de término deve ser posterior ao horário de início. Digite novamente:");
            }

            const conflitoDomingo = verificarConflitoCultoDomingo({
              ano: info.reuniaoData.ano,
              mes: info.reuniaoData.mes,
              dia: info.reuniaoData.dia,
              isDiaInteiro: false,
              horarioInicio: info.reuniaoHorarioInicio,
              horarioFim: hFim,
            });
            if (conflitoDomingo.conflito) {
              return msg.reply(conflitoDomingo.mensagem);
            }

            info.reuniaoHorarioFim = hFim;
            info.etapa = "reuniao_local";
            return msg.reply("5️⃣ Qual será o *local* da reunião?\n\n1 - Na Igreja\n2 - Online");
          }

          if (info.etapa === "reuniao_local") {
            const local = resolverOpcaoLocalReuniao(msg.body);
            if (!local) {
              return msg.reply("❌ Opção inválida. Por favor, escolha o local da reunião:\n\n1 - Na Igreja\n2 - Online");
            }
            info.reuniaoLocal = local;

            const tituloReuniao = formatarTituloReuniao(info.reuniaoDepartamento);
            const dadosReuniao = {
              tipo: "reuniao",
              solicitanteId: numero,
              evento: tituloReuniao,
              departamento: info.reuniaoDepartamento,
              local: info.reuniaoLocal,
              dia: info.reuniaoData.dia,
              mes: info.reuniaoData.mes,
              ano: info.reuniaoData.ano,
              horarioInicio: info.reuniaoHorarioInicio,
              horarioFim: info.reuniaoHorarioFim,
              isDiaInteiro: false,
            };

            try {
              // Concorrência com Atendimento Pastoral: obrigatório consultar o pastor quando reunião é presencial na igreja/salão
              let conflitosPastoral = [];
              if (info.reuniaoLocal !== "Online") {
                conflitosPastoral = await checarConcorrenciaAtendimentoPastoral({
                  dia: info.reuniaoData.dia,
                  mes: info.reuniaoData.mes,
                  ano: info.reuniaoData.ano,
                  horarioInicio: info.reuniaoHorarioInicio,
                  horarioFim: info.reuniaoHorarioFim,
                  isDiaInteiro: false,
                });
              }

              const pastorResponsavel = conflitosPastoral.length > 0 ? obterPastorDoAtendimento(conflitosPastoral[0]) : null;
              const temConflitoPastoral = conflitosPastoral.length > 0 && Boolean(pastorResponsavel);

              if (temConflitoPastoral) {
                dadosReuniao.aguardandoPastor = true;
                dadosReuniao.pastorTelefone = pastorResponsavel.telefone;
                dadosReuniao.pastorNome = pastorResponsavel.nome;
                dadosReuniao.conflitoAtendimentoSummary = conflitosPastoral[0].summary || "Atendimento Pastoral";
                dadosReuniao.horarioConflito = `${info.reuniaoHorarioInicio} às ${info.reuniaoHorarioFim}`;
                dadosReuniao.dataFormatada = info.reuniaoData.formatada;
                dadosReuniao.solicitanteNome = nomeSolicitante(contato, numero);

                const codigo = salvarPendente(dadosReuniao);

                await consultarPastorConcorrenciaSalao({
                  pastor: pastorResponsavel,
                  atendimento: conflitosPastoral[0],
                  solicitante: nomeSolicitante(contato, numero),
                  tipoAtividade: "Reunião",
                  nomeAtividade: tituloReuniao,
                  dataFormatada: info.reuniaoData.formatada,
                  horario: `${info.reuniaoHorarioInicio} às ${info.reuniaoHorarioFim}`,
                  codigo,
                });

                const resumoLider =
                  `⏳ *Solicitação de Reunião em Análise Pastoral*\n\n` +
                  `🏢 *Departamento:* ${info.reuniaoDepartamento}\n` +
                  `📆 *Data:* ${info.reuniaoData.formatada}\n` +
                  `⏰ *Horário:* ${info.reuniaoHorarioInicio} - ${info.reuniaoHorarioFim}\n` +
                  `📍 *Local:* ${info.reuniaoLocal}\n\n` +
                  `⚠️ Consta um Atendimento Pastoral agendado para o mesmo horário. Uma consulta foi enviada diretamente ao Pastor responsável (*${pastorResponsavel.nome || "Pastor"}*) no WhatsApp privado dele.\n\n` +
                  `Assim que o Pastor responder autorizando, sua reunião será encaminhada para a aprovação final da Secretaria! 🙏\n\n` +
                  `Digite *menu* para voltar ao menu principal.`;

                delete etapas[numero];
                return msg.reply(resumoLider);
              }

              // Sem conflito pastoral: salva e envia diretamente para a secretaria
              const codigo = salvarPendente(dadosReuniao);
              const resumoGrupo = `🤝 *NOVA REUNIÃO SOLICITADA*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n🏢 *Departamento:* ${info.reuniaoDepartamento}\n📆 *Data:* ${info.reuniaoData.formatada}\n⏰ *Horário:* ${info.reuniaoHorarioInicio} - ${info.reuniaoHorarioFim}\n📍 *Local:* ${info.reuniaoLocal}\n\n_Responda a este resumo com "marcar reunião" ou "não marcar" para aprovar._\n\n_Código: ${codigo}_`;
              await notificarSecretaria(client, resumoGrupo);

              const resumoLider = `✅ *Solicitação de Reunião Enviada!*\n\n🏢 *Departamento:* ${info.reuniaoDepartamento}\n📆 *Data:* ${info.reuniaoData.formatada}\n⏰ *Horário:* ${info.reuniaoHorarioInicio} - ${info.reuniaoHorarioFim}\n📍 *Local:* ${info.reuniaoLocal}\n\nSua solicitação foi enviada para aprovação da secretaria. Assim que confirmada, você receberá a confirmação e a Ata de Reunião. 🙏\n\nDigite *menu* para voltar ao menu principal.`;
              delete etapas[numero];
              return msg.reply(resumoLider);
            } catch (errSalvar) {
              console.error("[Reuniões] Erro ao salvar solicitação de reunião:", errSalvar);
              delete etapas[numero];
              return msg.reply("⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes.");
            }
          }

          // Subfluxo Desmarcar Reunião
          if (info.etapa === "reuniao_desmarcar_selecionar") {
            const index = parseInt(msg.body.trim()) - 1;
            if (isNaN(index) || !info.eventosEncontrados[index]) {
              return msg.reply("❌ Escolha um número válido da lista.");
            }
            info.reuniaoSelecionada = info.eventosEncontrados[index];
            info.etapa = "reuniao_desmarcar_confirmar";
            const d = moment.tz(info.reuniaoSelecionada.start.dateTime || info.reuniaoSelecionada.start.date, "America/Sao_Paulo");
            return msg.reply(`⚠️ Confirma a solicitação para *desmarcar* a reunião:\n\n📌 *${info.reuniaoSelecionada.summary}*\n🗓️ *Data:* ${d.format("DD/MM/YYYY [às] HH:mm")}\n\nDigite *SIM* para confirmar ou *menu* para desistir.`);
          }

          if (info.etapa === "reuniao_desmarcar_confirmar") {
            if (msg.body.trim().toLowerCase() !== "sim") {
              return msg.reply("❌ Desmarcação não confirmada. Digite *SIM* para confirmar ou *menu* para desistir.");
            }
            try {
              const dataOriginal = moment.tz(info.reuniaoSelecionada.start.dateTime || info.reuniaoSelecionada.start.date, "America/Sao_Paulo");
              const dadosDesmarcar = {
                tipo: "reuniao_cancelar",
                solicitanteId: numero,
                evento: info.reuniaoSelecionada.summary,
                eventId: info.reuniaoSelecionada.id,
                calendarId: AGENDAS_INTERNAS.REUNIOES,
              };
              const codigoCancelamento = salvarPendente(dadosDesmarcar);
              const resumoGrupo = `🗑️ *PEDIDO PARA DESMARCAR REUNIÃO*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n📅 *Reunião:* ${info.reuniaoSelecionada.summary}\n📆 *Data:* ${dataOriginal.format("DD/MM/YYYY [às] HH:mm")}\n\n_Responda a este resumo com "desmarcar reunião" para confirmar ou "manter reunião" para negar._\n\n_Código: ${codigoCancelamento}_`;
              await notificarSecretaria(client, resumoGrupo);

              const resumoLider = `🗑️ *Solicitação para Desmarcar Reunião Enviada*\n\n*Reunião:* ${info.reuniaoSelecionada.summary}\n*Data:* ${dataOriginal.format("DD/MM/YYYY [às] HH:mm")}\n\nAguarde a confirmação da secretaria!\n\nDigite *menu* para voltar ao menu principal.`;
              delete etapas[numero];
              return msg.reply(resumoLider);
            } catch (errCancel) {
              console.error("[Reuniões] Erro ao registrar solicitação de desmarcação:", errCancel);
              delete etapas[numero];
              return msg.reply("⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes.");
            }
          }

          // Subfluxo Alterar Reunião
          if (info.etapa === "reuniao_alterar_selecionar") {
            const index = parseInt(msg.body.trim()) - 1;
            if (isNaN(index) || !info.eventosEncontrados[index]) {
              return msg.reply("❌ Escolha um número válido da lista.");
            }
            info.reuniaoSelecionada = info.eventosEncontrados[index];
            info.etapa = "reuniao_alterar_o_que";
            return msg.reply(`📝 Você selecionou: *${info.reuniaoSelecionada.summary}*\n\nO que você deseja alterar?\n\n1 - Horário\n2 - Data\n3 - Local\n4 - Outra alteração (descreva em texto livre)`);
          }

          if (info.etapa === "reuniao_alterar_o_que") {
            const opc = msg.body.trim();
            if (opc === "1") {
              info.etapa = "reuniao_alterar_novo_horario_inicio";
              return msg.reply("⏰ Digite o *novo horário de início* da reunião (ex: 19h ou 19:30):");
            } else if (opc === "2") {
              info.etapa = "reuniao_alterar_nova_data";
              return msg.reply("📆 Digite a *nova data* da reunião (ex: 25/10 ou 25/10/2026):");
            } else if (opc === "3") {
              info.etapa = "reuniao_alterar_novo_local";
              return msg.reply("📍 Qual será o *novo local* da reunião?\n\n1 - Na Igreja\n2 - Online");
            } else if (opc === "4") {
              info.etapa = "reuniao_alterar_outro";
              return msg.reply("✍️ Descreva em detalhes o que você deseja alterar nesta reunião:");
            } else {
              return msg.reply("❌ Opção inválida. Escolha uma opção de 1 a 4.");
            }
          }

          if (info.etapa === "reuniao_alterar_novo_horario_inicio") {
            const hInicio = normalizarHorarioReuniao(msg.body);
            if (!hInicio) {
              return msg.reply("❌ Formato de horário inválido. Use HH:MM ou HHh (ex: 19h ou 19:30).");
            }
            info.novoHorarioInicio = hInicio;
            info.etapa = "reuniao_alterar_novo_horario_fim";
            return msg.reply("⏰ Digite o *novo horário previsto de término* (ex: 21h ou 21:30):");
          }

          if (info.etapa === "reuniao_alterar_novo_horario_fim") {
            const hFim = normalizarHorarioReuniao(msg.body);
            if (!hFim) {
              return msg.reply("❌ Formato de horário de término inválido. Use HH:MM ou HHh (ex: 21h ou 21:30).");
            }
            const [hi, mi] = info.novoHorarioInicio.split(":").map(Number);
            const [hf, mf] = hFim.split(":").map(Number);
            if (hf < hi || (hf === hi && mf <= mi)) {
              return msg.reply("❌ O horário de término deve ser posterior ao horário de início. Digite novamente:");
            }

            const dOriginal = moment.tz(info.reuniaoSelecionada.start.dateTime || info.reuniaoSelecionada.start.date, "America/Sao_Paulo");
            const conflitoDomingo = verificarConflitoCultoDomingo({
              ano: dOriginal.year(),
              mes: dOriginal.month() + 1,
              dia: dOriginal.date(),
              isDiaInteiro: false,
              horarioInicio: info.novoHorarioInicio,
              horarioFim: hFim,
            });
            if (conflitoDomingo.conflito) {
              return msg.reply(conflitoDomingo.mensagem);
            }

            info.novoHorarioFim = hFim;
            info.campoAlterar = "horario";
            info.descricaoAlteracao = `Novo horário: ${info.novoHorarioInicio} às ${info.novoHorarioFim}`;
            info.etapa = "reuniao_alterar_finalizar";
          }

          if (info.etapa === "reuniao_alterar_nova_data") {
            const dataObj = interpretarDataReuniao(msg.body);
            if (!dataObj) {
              return msg.reply("❌ Formato de data inválido. Use DD/MM ou DD/MM/AAAA (ex: 25/10 ou 25/10/2026).");
            }
            info.novoDia = dataObj.dia;
            info.novoMes = dataObj.mes;
            info.novoAno = dataObj.ano;
            info.campoAlterar = "data";
            info.descricaoAlteracao = `Nova data: ${dataObj.formatada}`;
            info.etapa = "reuniao_alterar_finalizar";
          }

          if (info.etapa === "reuniao_alterar_novo_local") {
            const local = resolverOpcaoLocalReuniao(msg.body);
            if (!local) {
              return msg.reply("❌ Opção inválida. Por favor, escolha o novo local:\n\n1 - Na Igreja\n2 - Online");
            }
            info.novoLocal = local;
            info.campoAlterar = "local";
            info.descricaoAlteracao = `Novo local: ${info.novoLocal}`;
            info.etapa = "reuniao_alterar_finalizar";
          }

          if (info.etapa === "reuniao_alterar_outro") {
            const descricao = msg.body.trim();
            if (!descricao) return msg.reply("❌ Por favor, descreva o que deseja alterar:");
            info.campoAlterar = "outro";
            info.descricaoAlteracao = descricao;
            info.etapa = "reuniao_alterar_finalizar";
          }

          if (info.etapa === "reuniao_alterar_finalizar") {
            try {
              const dataOriginal = moment.tz(info.reuniaoSelecionada.start.dateTime || info.reuniaoSelecionada.start.date, "America/Sao_Paulo");
              const dadosAlteracao = {
                tipo: "reuniao_alterar",
                solicitanteId: numero,
                evento: info.reuniaoSelecionada.summary,
                eventId: info.reuniaoSelecionada.id,
                calendarId: AGENDAS_INTERNAS.REUNIOES,
                campo: info.campoAlterar !== "outro" ? info.campoAlterar : undefined,
                novoDia: info.novoDia,
                novoMes: info.novoMes,
                novoHorarioInicio: info.novoHorarioInicio,
                novoHorarioFim: info.novoHorarioFim,
                novoLocal: info.novoLocal,
                detalhes: info.descricaoAlteracao,
                isDiaInteiroOriginal: false,
                inicioOriginal: info.reuniaoSelecionada.start.dateTime || info.reuniaoSelecionada.start.date,
                fimOriginal: info.reuniaoSelecionada.end.dateTime || info.reuniaoSelecionada.end.date,
              };

              const codigoAlteracao = salvarPendente(dadosAlteracao);
              const resumoGrupo = `🔄 *PEDIDO DE ALTERAÇÃO DE REUNIÃO*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n📅 *Reunião:* ${info.reuniaoSelecionada.summary}\n📆 *Data Original:* ${dataOriginal.format("DD/MM/YYYY [às] HH:mm")}\n✏️ *Alteração:* ${info.descricaoAlteracao}\n\n_Responda a este resumo com "alterar reunião" para confirmar ou "não alterar" para negar._\n\n_Código: ${codigoAlteracao}_`;
              await notificarSecretaria(client, resumoGrupo);

              const resumoLider = `🔄 *Solicitação de Alteração de Reunião Enviada*\n\n*Reunião:* ${info.reuniaoSelecionada.summary}\n*Data Original:* ${dataOriginal.format("DD/MM/YYYY [às] HH:mm")}\n*Alteração Solicitada:* ${info.descricaoAlteracao}\n\nAguarde a confirmação da secretaria!\n\nDigite *menu* para voltar ao menu principal.`;
              delete etapas[numero];
              return msg.reply(resumoLider);
            } catch (errAlt) {
              console.error("[Reuniões] Erro ao registrar solicitação de alteração:", errAlt);
              delete etapas[numero];
              return msg.reply("⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes.");
            }
          }
        } else if (info.fluxo === "consulta_disponibilidade_lider") {
          if (info.etapa === "escolha_mes") {
            const agora = moment.tz("America/Sao_Paulo");
            const mesAtual = agora.month() + 1;
            const escolha = parseInt(msg.body.trim());

            if (isNaN(escolha) || escolha < mesAtual || escolha > 12) {
              return msg.reply(`❌ Opção inválida. Escolha um mês de ${mesAtual} a 12.`);
            }

            info.mes = escolha;
            info.etapa = "escolha_dia_semana";

            const promptDia = `🗓️ Para *${MESES[escolha - 1]}*, qual *dia da semana* você deseja consultar?\n\n1 - Segunda-feira\n2 - Terça-feira\n3 - Quarta-feira\n4 - Quinta-feira\n5 - Sexta-feira\n6 - Sábado\n7 - Domingo\n8 - Todos os dias da semana\n\nDigite o número da opção desejada:`;
            return msg.reply(promptDia);
          }

          if (info.etapa === "escolha_dia_semana") {
            const entrada = msg.body.trim().toLowerCase();
            const mapaDias = {
              "1": 1, "segunda": 1, "segunda-feira": 1, "seg": 1, "segundas": 1,
              "2": 2, "terça": 2, "terca": 2, "terça-feira": 2, "terca-feira": 2, "ter": 2, "terças": 2, "tercas": 2,
              "3": 3, "quarta": 3, "quarta-feira": 3, "qua": 3, "quartas": 3,
              "4": 4, "quinta": 4, "quinta-feira": 4, "qui": 4, "quintas": 4,
              "5": 5, "sexta": 5, "sexta-feira": 5, "sex": 5, "sextas": 5,
              "6": 6, "sábado": 6, "sabado": 6, "sab": 6, "sábados": 6, "sabados": 6,
              "7": 0, "domingo": 0, "dom": 0, "domingos": 0,
              "8": "TODOS", "todos": "TODOS", "todos os dias": "TODOS",
            };

            const diaSemanaFiltro = mapaDias[entrada];
            if (diaSemanaFiltro === undefined) {
              return msg.reply("❌ Opção inválida. Escolha um número de 1 a 8 para o dia da semana.");
            }

            const rotulosDias = {
              1: "Segundas-feiras",
              2: "Terças-feiras",
              3: "Quartas-feiras",
              4: "Quintas-feiras",
              5: "Sextas-feiras",
              6: "Sábados",
              0: "Domingos",
              "TODOS": "Todos os dias da semana",
            };
            const diaSemanaTexto = rotulosDias[diaSemanaFiltro];
            const mesNome = MESES[info.mes - 1];

            await msg.reply(`🔍 Consultando disponibilidade para *${diaSemanaTexto}* em *${mesNome}*...`);

            try {
              const agora = moment.tz("America/Sao_Paulo");
              const ano = agora.year();
              const inicioBusca = moment.tz([ano, info.mes - 1], "America/Sao_Paulo").startOf("month").subtract(1, "minute").format();
              const fimBusca = moment.tz([ano, info.mes - 1], "America/Sao_Paulo").endOf("month").format();

              const todosEventos = await buscarEventos(inicioBusca, fimBusca);
              const dias = consultarDisponibilidadeMesDiaSemana({
                eventos: todosEventos,
                evangelismoCalendarId: agendasParaLer[0],
                ano,
                mes: info.mes,
                diaSemanaFiltro,
                agora,
              });

              const relatorio = formatarRelatorioDisponibilidade({ dias, mesNome, diaSemanaTexto });
              delete etapas[numero];
              return msg.reply(relatorio);
            } catch (errDisp) {
              console.error(`[Disponibilidade] Erro ao consultar disponibilidade para ${identificarUsuario(contato, numero, isLider)}:`, errDisp);
              delete etapas[numero];
              return msg.reply("⚠️ Erro ao consultar disponibilidade na agenda. Tente novamente mais tarde.");
            }
          }
        } else if (info.fluxo === "uso_salao") {
          if (info.etapa === "uso_salao_data") {
            const entrada = msg.body.trim();
            const partes = entrada.split("/");
            if (partes.length < 2) {
              return msg.reply("❌ Formato de data inválido. Use DD/MM (ex: 25/10) ou DD/MM/AAAA (ex: 25/10/2026).");
            }
            const dia = parseInt(partes[0], 10);
            const mes = parseInt(partes[1], 10);
            const ano = partes[2] ? parseInt(partes[2], 10) : moment.tz("America/Sao_Paulo").year();

            if (isNaN(dia) || isNaN(mes) || dia < 1 || dia > 31 || mes < 1 || mes > 12) {
              return msg.reply("❌ Data inválida. Digite uma data real no formato DD/MM (ex: 25/10).");
            }

            const agora = moment.tz("America/Sao_Paulo");
            const dataEscolhida = moment.tz(`${dia}/${mes}/${ano}`, "D/M/YYYY", "America/Sao_Paulo").endOf("day");
            if (dataEscolhida.isBefore(agora)) {
              return msg.reply("❌ Essa data já passou! Por favor, informe uma data futura para o uso do salão:");
            }

            info.dia = dia;
            info.mes = mes;
            info.ano = ano;
            info.dataFormatada = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
            info.etapa = "uso_salao_horario_inicio";
            return msg.reply(`⏰ Qual é o *horário de início* do uso do salão? (Ex: 14:00 ou 18h)`);
          }

          if (info.etapa === "uso_salao_horario_inicio") {
            const hInicio = normalizarHorarioReuniao(msg.body) || (HORARIO_REGEX.test(msg.body.trim()) ? msg.body.trim() : null);
            if (!hInicio) {
              return msg.reply("❌ Formato inválido. Use HH:MM ou HHh (ex: 14:00 ou 18h).");
            }
            info.horarioInicio = hInicio;
            info.etapa = "uso_salao_horario_fim";
            return msg.reply(`⏰ Qual é o *horário total / término* do uso do salão? (Ex: 18:00 ou 22h)`);
          }

          if (info.etapa === "uso_salao_horario_fim") {
            const hFim = normalizarHorarioReuniao(msg.body) || (HORARIO_REGEX.test(msg.body.trim()) ? msg.body.trim() : null);
            if (!hFim) {
              return msg.reply("❌ Formato de horário de término inválido. Use HH:MM ou HHh (ex: 18:00 ou 22h).");
            }
            const [hi, mi] = info.horarioInicio.split(":").map(Number);
            const [hf, mf] = hFim.split(":").map(Number);
            if (hf < hi || (hf === hi && mf <= mi)) {
              return msg.reply("❌ O horário de término deve ser posterior ao horário de início. Digite novamente:");
            }

            const conflitoDomingo = verificarConflitoCultoDomingo({
              ano: info.ano,
              mes: info.mes,
              dia: info.dia,
              isDiaInteiro: false,
              horarioInicio: info.horarioInicio,
              horarioFim: hFim,
            });
            if (conflitoDomingo.conflito) {
              return msg.reply(conflitoDomingo.mensagem);
            }

            info.horarioFim = hFim;
            info.etapa = "uso_salao_finalidade";
            return msg.reply(`📝 Qual será a *finalidade* do uso do salão? (Ex: Aniversário, Confraternização, Ensaio, Reunião de família, etc.)`);
          }

          if (info.etapa === "uso_salao_finalidade") {
            const finalidade = msg.body.trim();
            if (!finalidade) {
              return msg.reply("❌ Por favor, informe a finalidade ou motivo do uso do salão:");
            }
            info.finalidade = finalidade;
            info.etapa = "uso_salao_termo";
            const termoTexto =
              `📜 *Termo de Uso e Responsabilidade do Salão*\n\n` +
              `⚠️ *Atenção aos cuidados com a Casa de Deus:*\n` +
              `• Todas as coisas do salão devem ser mantidas intactas.\n` +
              `• O salão deve ser entregue nas mesmas condições em que for encontrado.\n` +
              `• O solicitante é responsável pela integridade e conservação de todo o espaço durante o uso.\n\n` +
              `Você concorda com estes termos e se compromete a zelar pelo salão?\n\n` +
              `Digite *SIM* para aceitar e enviar a solicitação à secretaria, ou *menu* para cancelar.`;
            return msg.reply(termoTexto);
          }

          if (info.etapa === "uso_salao_termo") {
            if (msg.body.trim().toLowerCase() !== "sim") {
              return msg.reply("❌ Para solicitar o uso do salão, é necessário aceitar o termo de responsabilidade.\n\nDigite *SIM* para concordar e enviar a solicitação, ou *menu* para cancelar.");
            }

            const nomeSol = usuario?.nome || (contato ? nomeContato(contato, numero) : "Membro");
            const dadosUso = {
              tipo: "uso_salao",
              solicitanteId: numero,
              nomeSolicitante: nomeSol,
              dia: info.dia,
              mes: info.mes,
              ano: info.ano,
              dataFormatada: info.dataFormatada,
              horarioInicio: info.horarioInicio,
              horarioFim: info.horarioFim,
              finalidade: info.finalidade,
            };

            try {
              // Concorrência com Atendimento Pastoral: obrigatório consultar o pastor no uso do salão
              const conflitosPastoral = await checarConcorrenciaAtendimentoPastoral({
                dia: info.dia,
                mes: info.mes,
                ano: info.ano,
                horarioInicio: info.horarioInicio,
                horarioFim: info.horarioFim,
                isDiaInteiro: false,
              });

              const pastorResponsavel = conflitosPastoral.length > 0 ? obterPastorDoAtendimento(conflitosPastoral[0]) : null;
              const temConflitoPastoral = conflitosPastoral.length > 0 && Boolean(pastorResponsavel);

              if (temConflitoPastoral) {
                dadosUso.aguardandoPastor = true;
                dadosUso.pastorTelefone = pastorResponsavel.telefone;
                dadosUso.pastorNome = pastorResponsavel.nome;
                dadosUso.conflitoAtendimentoSummary = conflitosPastoral[0].summary || "Atendimento Pastoral";
                dadosUso.horarioConflito = `${dadosUso.horarioInicio} às ${dadosUso.horarioFim}`;

                const codigo = salvarPendente(dadosUso);

                await consultarPastorConcorrenciaSalao({
                  pastor: pastorResponsavel,
                  atendimento: conflitosPastoral[0],
                  solicitante: nomeSol,
                  tipoAtividade: "Uso do Salão",
                  nomeAtividade: info.finalidade,
                  dataFormatada: dadosUso.dataFormatada,
                  horario: `${dadosUso.horarioInicio} às ${dadosUso.horarioFim}`,
                  codigo,
                });

                const resumoMembro =
                  `⏳ *Solicitação de Uso do Salão em Análise Pastoral*\n\n` +
                  `📆 *Data:* ${dadosUso.dataFormatada}\n` +
                  `⏰ *Horário:* ${dadosUso.horarioInicio} às ${dadosUso.horarioFim}\n` +
                  `📝 *Finalidade:* ${dadosUso.finalidade}\n\n` +
                  `⚠️ Consta um Atendimento Pastoral agendado para o mesmo horário. Uma consulta foi enviada diretamente ao Pastor responsável (*${pastorResponsavel.nome || "Pastor"}*) no WhatsApp privado dele.\n\n` +
                  `Assim que o Pastor responder autorizando, sua solicitação será encaminhada para a aprovação final da Secretaria! 🙏\n\n` +
                  `Digite *menu* para voltar ao menu principal.`;

                delete etapas[numero];
                return msg.reply(resumoMembro);
              }

              // Sem conflito pastoral: segue direto para a Secretaria
              const codigo = salvarPendente(dadosUso);
              const resumoGrupo =
                `🏛️ *NOVA SOLICITAÇÃO DE USO DO SALÃO*\n\n` +
                `👤 *Solicitante:* ${nomeSol}\n` +
                `📆 *Data:* ${dadosUso.dataFormatada}\n` +
                `⏰ *Horário:* ${dadosUso.horarioInicio} às ${dadosUso.horarioFim}\n` +
                `📝 *Finalidade:* ${dadosUso.finalidade}\n` +
                `📜 *Termo de Responsabilidade:* Aceito pelo solicitante.\n\n` +
                `_Responda a este resumo com "aprovar salão" ou "recusar salão" para confirmar._\n\n` +
                `_Código: ${codigo}_`;
              await notificarSecretaria(client, resumoGrupo);

              const resumoMembro =
                `✅ *Solicitação de Uso do Salão Enviada!*\n\n` +
                `📆 *Data:* ${dadosUso.dataFormatada}\n` +
                `⏰ *Horário:* ${dadosUso.horarioInicio} às ${dadosUso.horarioFim}\n` +
                `📝 *Finalidade:* ${dadosUso.finalidade}\n\n` +
                `Sua solicitação foi enviada para a secretaria para análise e confirmação. Você receberá uma notificação assim que for aprovada! 🙏\n\n` +
                `Digite *menu* para voltar ao menu principal.`;

              delete etapas[numero];
              return msg.reply(resumoMembro);
            } catch (errSalvar) {
              console.error("[Uso do Salão] Erro ao salvar solicitação:", errSalvar);
              delete etapas[numero];
              return msg.reply("⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes.");
            }
          }
        }
        return;
      }

      if (texto === "1" || texto === "quem somos") {
        console.log(`Opção 1 (Quem somos) selecionada por ${identificarUsuario(contato, numero, isLider)}`);
        const mensagemQuemSomos = `🏛️ *Comunidade Cristã Curados*

Conheça mais sobre quem somos, nossa história, visão e valores acessando o nosso site oficial:

🌐 https://www.comunidadecristacurados.com.br/home

Lá você encontra todas as informações sobre nossa igreja e nossos ministérios! 🙏✨

Digite *menu* para voltar ao menu principal.`;
        return msg.reply(mensagemQuemSomos);
      }

      if (texto === "2" || texto === "cultos" || texto === "horário dos cultos" || texto === "horario dos cultos") {
        console.log(`Opção 2 (Horário dos cultos) selecionada por ${identificarUsuario(contato, numero, isLider)}`);
        const mensagemCultos = `✨ *Celebre Conosco!* ✨

Estamos esperando por você e sua família em nossos encontros:

⛪ *Culto de Celebração*
🗓️ Todos os Domingos
⏰ Às *18h*

🍞 *Santa Ceia*
🗓️ Todo 1º Domingo do Mês
⏰ Às *08h30*

📍 *Endereço:* Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi

Venha viver um tempo precioso na presença de Deus! 🙏🙌

Digite *menu* para voltar ao menu principal.`;
        return msg.reply(mensagemCultos);
      }



      if (texto === "3" || texto === "agenda" || texto === "ver agenda" || texto === "ver eventos" || texto === "eventos") {
        console.log(`Opção 3 (Ver agenda/eventos) selecionada por ${identificarUsuario(contato, numero, isLider)}`);
        const agora = moment.tz("America/Sao_Paulo");
        const mesIndex = agora.month();
        const mesNome = MESES[mesIndex];
        const ano = agora.year();

        const inicioBusca = moment.tz([ano, mesIndex], "America/Sao_Paulo").startOf("month").subtract(1, "minute").format();
        const fimBusca = moment.tz([ano, mesIndex], "America/Sao_Paulo").endOf("month").format();

        etapas[numero] = { fluxo: "ver_agenda", etapa: "detalhe_evento", isPastor };
        await msg.reply(`🔍 Consultando eventos de *${mesNome}*...`);
        return await entregarAgenda(numero, etapas[numero], inicioBusca, fimBusca, mesNome, msg);
      }

      if (texto === "4" || texto === "atendimento pastoral" || texto === "pastoral") {
        console.log(`Opção 4 (Atendimento pastoral) selecionada por ${identificarUsuario(contato, numero, isLider)}, iniciando atendimento pastoral`);
        etapas[numero] = { fluxo: "pastoral", etapa: "nome" };
        return msg.reply("🙏 *Atendimento Pastoral*\n\n📝 Qual é o seu *nome*?");
      }

      if (texto === "5") {
        if (isMembro) {
          console.log(`[Uso do Salão] Opção 5 selecionada por membro ${identificarUsuario(contato, numero, isLider, usuario)}`);
          etapas[numero] = { fluxo: "uso_salao", etapa: "uso_salao_data" };
          return msg.reply(
            `🏛️ *Solicitação de Uso do Salão*\n\n` +
            `Para solicitar o uso do salão da igreja, vamos precisar de algumas informações.\n\n` +
            `📅 Qual é a *data* desejada? (Ex: 25/10 ou 25/10/2026)\n\n` +
            `Digite *menu* a qualquer momento para cancelar.`
          );
        }
        console.log(`Opção 5 (Secretaria) selecionada por visitante ${identificarUsuario(contato, numero, isLider, usuario)}`);
        const avisoSecretaria = `📞 *PEDIDO DE ATENDIMENTO*\n\n👤 *Solicitante:* ${nomeContato(contato, numero)}\n\nO usuário solicitou falar com a secretaria.`;
        await notificarSecretaria(client, avisoSecretaria);
        return msg.reply(`📞 *Secretaria*\n\nUm atendente responderá em breve.\nAtendimento: Terça a Sábado, 08h às 18h.\n\nDigite *menu* para voltar ao menu principal.`);
      }

      if (texto === "6") {
        console.log(`Opção 6 (Secretaria) selecionada por ${identificarUsuario(contato, numero, isLider, usuario)}`);
        const avisoSecretaria = `📞 *PEDIDO DE ATENDIMENTO*\n\n👤 *Solicitante:* ${nomeContato(contato, numero)}\n\nO usuário solicitou falar com a secretaria.`;
        await notificarSecretaria(client, avisoSecretaria);
        return msg.reply(`📞 *Secretaria*\n\nUm atendente responderá em breve.\nAtendimento: Terça a Sábado, 08h às 18h.\n\nDigite *menu* para voltar ao menu principal.`);
      }

      if ((texto === "7" || texto === "8") && isPastor) {
        console.log(`Opção Pastoral selecionada por ${identificarUsuario(contato, numero, isLider, usuario)}, iniciando Área Pastoral`);
        etapas[numero] = { fluxo: "area_pastoral", etapa: "menu_pastoral" };
        return msg.reply(montarMenuPastoral());
      }

      if ((texto === "7" || texto === "9") && isDiretor && !isPastor) {
        console.log(`Opção Direção selecionada por ${identificarUsuario(contato, numero, isLider, usuario)}, iniciando Área da Direção`);
        etapas[numero] = { fluxo: "area_diretor", etapa: "menu_diretor" };
        return msg.reply(montarMenuDiretor());
      }

      if (texto === "7" && isLider && !isPastor && !isDiretor) {
        console.log(`Opção 7 selecionada por ${identificarUsuario(contato, numero, isLider, usuario)}, iniciando Área do Líder`);
        etapas[numero] = { fluxo: "area_lider", etapa: "menu_lider" };
        return msg.reply(montarMenuLider());
      }

      if (isMembro && /^(?:solicitar\s+)?(?:uso\s+do\s+)?sal[aã]o$/i.test(texto.trim())) {
        console.log(`[Uso do Salão] Iniciado por ${identificarUsuario(contato, numero, isLider, usuario)}`);
        etapas[numero] = { fluxo: "uso_salao", etapa: "uso_salao_data" };
        return msg.reply(
          `🏛️ *Solicitação de Uso do Salão*\n\n` +
          `Para solicitar o uso do salão da igreja, vamos precisar de algumas informações.\n\n` +
          `📅 Qual é a *data* desejada? (Ex: 25/10 ou 25/10/2026)\n\n` +
          `Digite *menu* a qualquer momento para cancelar.`
        );
      }

      if ((isLider || isPastor || isDiretor) && /^(?:consultar\s+|ver\s+)?inscri[cç][õo]es(?:\s+de\s+eventos?)?$/i.test(texto.trim())) {
        console.log(`[Inscrições Eventos] Atalho acionado por ${identificarUsuario(contato, numero, isLider, usuario)}`);
        return await iniciarFluxoConsultaInscricoes({
          msg,
          numero,
          etapas,
          usuario,
          isPastor,
          isDiretor,
          isLider,
          client,
          origem: isPastor ? "pastoral" : (isDiretor ? "diretor" : "lider"),
        });
      }

      if (isLider && /^(pedir|solicitar)?\s*(m[ií]dias?|artes?|flyers?)$/i.test(texto.trim())) {
        console.log(`[Atalho Mídia] Iniciado por ${identificarUsuario(contato, numero, isLider, usuario)}`);
        etapas[numero] = { fluxo: "artes_flyers", etapa: "artes_departamento" };
        return msg.reply(`🎨 *Solicitar artes e flyers*\n\n🏢 De qual departamento é a solicitação?\n\n${montarListaRedes()}`);
      }

      if ((isLider || isPastor || isDiretor) && /^(?:prepara[cç][aã]o|decora[cç][aã]o|montagem|uso\s+antes)$/i.test(texto.trim())) {
        console.log(`[Atalho Preparação] Iniciado por ${identificarUsuario(contato, numero, isLider, usuario)}`);
        etapas[numero] = { fluxo: "agendamento", etapa: "preparacao_informar_horarios", departamento: usuario?.departamento || "Evento" };
        return msg.reply(
          "🏢 *Uso do Salão Antes / Montagem / Decoração*\n\n" +
          "Caso precise do salão horas antes do evento ou no dia anterior para montagem, decoração ou limpeza, por favor informe:\n\n" +
          "• *Nome do evento e departamento*\n" +
          "• *Data e horários* necessários (ex: dia anterior das 18:00 às 21:00 ou 2 horas antes do início)\n\n" +
          "_Essas informações serão registradas no departamento e encaminhadas à secretaria e equipe._"
        );
      }

      // Consulta de informações sobre evento com descrição gerada por IA
      const matchPerguntaEvento = texto.match(/^(?:mais\s+)?(?:informa[cç][õo]es|detalhes|como\s+vai\s+ser|quando\s+vai\s+ser|onde\s+vai\s+ser|sobre\s+o\s+evento|sobre)\s+(?:sobre\s+)?(?:o\s+evento\s+|a\s+)?(.+)$/i);
      if (matchPerguntaEvento) {
        const termoBusca = matchPerguntaEvento[1].trim();
        const descRegistro = buscarDescricaoEvento(termoBusca);
        if (descRegistro) {
          console.log(`[Info Evento] Descrição encontrada para "${termoBusca}": ${descRegistro.evento}`);
          return msg.reply(descRegistro.descricao + "\n\nDigite *menu* para voltar ao menu principal.");
        }
      } else {
        const descRegistro = buscarDescricaoEvento(texto);
        if (descRegistro && (texto.includes("evento") || texto.includes("horário") || texto.includes("horario") || texto.includes("quando") || texto.includes("onde") || texto.includes("informação") || texto.includes("informacao") || texto.includes("detalhe"))) {
          return msg.reply(descRegistro.descricao + "\n\nDigite *menu* para voltar ao menu principal.");
        }
      }

      // Nenhuma opção reconhecida e nenhum fluxo ativo. Se a mensagem for só
      // números, é provavelmente uma tentativa de usar o menu (ex: "9"), então
      // orientamos a digitar *menu*. Já texto livre (ex: "hoje não vou
      // conseguir ir") pode ser parte de uma conversa com a secretaria fora do
      // fluxo do bot, então é melhor não interromper com uma mensagem de erro.
      if (!/^\d+$/.test(texto)) {
        console.log(`[Mensagem ignorada] De: ${identificarUsuario(contato, numero, isLider, usuario)} | Texto: "${msg.body}"`);
        return;
      }

      console.log(`[Mensagem não reconhecida] De: ${identificarUsuario(contato, numero, isLider, usuario)} | Texto: "${msg.body}"`);
      return msg.reply("❓ Não entendi sua mensagem. Digite *menu* para ver as opções disponíveis.");
    } catch (err) {
      console.error(`[ALERTA:fatal] Erro Fatal no Listener de Mensagens (de: ${msg?.from ? mascararTelefone(msg.from) : "?"}, id: ${msg?.id?._serialized}):`, err);
    }
  };
}

module.exports = {
  createMessageHandler,
  nomeContato,
  LINK_ATA_REUNIAO,
  formatarTituloReuniao,
  resolverOpcaoLocalReuniao,
  temPermissao,
  identificarUsuario,
  processarFluxoInscricaoMulheres,
  processarRespostaEventoExterno,
  processarRetornoLembrete,
  montarMenuLider,
  montarSubmenuLiderAgenda,
  montarSubmenuLiderComunicacao,
  montarMenuPastoral,
  montarSubmenuPastoralAgenda,
  montarSubmenuPastoralAtendimento,
  montarSubmenuPastoralComunicacao,
  montarMenuDiretor,
  montarSubmenuDiretorAgenda,
  montarSubmenuDiretorComunicacao,
  montarMenuEventos,
  montarMenuInscricoesOuFichas,
  montarTextoMenuPrincipal,
  iniciarFluxoConsultaInscricoes,
  processarFluxoConsultaInscricoes,
  iniciarFluxoConsultaFichasEventos,
  processarFluxoConsultaFichasEventos,
  formatarDetalhesFichaEvento,
};
