const fs = require("fs");
const path = require("path");
const os = require("os");
let MessageMedia;
try {
  MessageMedia = require("whatsapp-web.js").MessageMedia;
} catch {
  MessageMedia = null;
}
let puppeteer;
try {
  puppeteer = require("puppeteer");
} catch {
  puppeteer = null;
}

const cultoMulheres = require("../web/culto_mulheres");
const diaDasCriancas = require("../web/dia_das_criancas");
const saudeMulher = require("../web/saude_mulher");
const treinamentoIntercessao = require("../web/treinamento_intercessao");

const CATALOGO_EVENTOS = [
  {
    id: "culto_mulheres",
    nome: "Culto de Mulheres: O Vaso e o Oleiro",
    icone: "🌸",
    dataEvento: "2026-10-24 15:00",
    departamentos: ["Rede de Mulheres", "Mulheres"],
    verificarPermissao: (usuario, isPastor, isDiretor) => {
      if (isPastor || isDiretor) return true;
      const deptos = (
        Array.isArray(usuario?.departamentos)
          ? usuario.departamentos
          : [usuario?.departamento || ""]
      ).map((d) => String(d || "").toLowerCase().trim());
      return deptos.some((d) => /mulher/i.test(d));
    },
  },
  {
    id: "saude_mulher",
    nome: "Saúde da Mulher — Palestra + Aula de Pilates",
    icone: "🧘‍♀️",
    dataEvento: "2026-10-31 15:00",
    departamentos: ["Rede de Mulheres", "Mulheres", "Saúde"],
    verificarPermissao: (usuario, isPastor, isDiretor) => {
      if (isPastor || isDiretor) return true;
      const deptos = (
        Array.isArray(usuario?.departamentos)
          ? usuario.departamentos
          : [usuario?.departamento || ""]
      ).map((d) => String(d || "").toLowerCase().trim());
      return deptos.some((d) => /mulher|sa[uú]de|pilates/i.test(d));
    },
  },
  {
    id: "dia_das_criancas",
    nome: "Especial Dia das Crianças",
    icone: "🎈",
    dataEvento: "2026-10-17 14:00",
    departamentos: [
      "Ministério Infantil",
      "Infantil",
      "Crianças",
      "Kids",
    ],
    verificarPermissao: (usuario, isPastor, isDiretor) => {
      if (isPastor || isDiretor) return true;
      const deptos = (
        Array.isArray(usuario?.departamentos)
          ? usuario.departamentos
          : [usuario?.departamento || ""]
      ).map((d) => String(d || "").toLowerCase().trim());
      return deptos.some((d) =>
        /infantil|crian[cç]a|kids/i.test(d)
      );
    },
  },
  {
    id: "treinamento_intercessao",
    nome: "Treinamento de Intercessão",
    icone: "🙏",
    dataEvento: "2026-11-15 16:00",
    departamentos: [
      "Intercessão",
      "Oração",
      "Ministério de Intercessão",
    ],
    verificarPermissao: (usuario, isPastor, isDiretor) => {
      if (isPastor || isDiretor) return true;
      const deptos = (
        Array.isArray(usuario?.departamentos)
          ? usuario.departamentos
          : [usuario?.departamento || ""]
      ).map((d) => String(d || "").toLowerCase().trim());
      return deptos.some((d) =>
        /intercess[aã]o|ora[cç][aã]o/i.test(d)
      );
    },
  },
];

function isEventoExpirado(ev) {
  if (!ev || !ev.dataEvento) return false;
  try {
    const moment = require("moment-timezone");
    const hoje = moment.tz("America/Sao_Paulo").startOf("day");
    const dataStr = ev.dataEvento.slice(0, 10);
    const d = moment.tz(dataStr, "YYYY-MM-DD", "America/Sao_Paulo");
    if (d.isValid()) {
      return d.isBefore(hoje, "day"); // No dia seguinte ao evento já expira e é apagado/ocultado
    }
  } catch (_) {}
  return false;
}

/**
 * Retorna a lista de eventos com inscrição acessíveis ao usuário
 * conforme seu cargo e departamento.
 */
function obterEventosInscricaoParaUsuario({
  usuario,
  isPastor = false,
  isDiretor = false,
  isLider = false,
}) {
  return CATALOGO_EVENTOS.filter((ev) =>
    !isEventoExpirado(ev) && ev.verificarPermissao(usuario, isPastor, isDiretor)
  );
}

function gerarResumoCultoMulheres() {
  const stats = cultoMulheres.obterEstatisticasMulheres();

  return (
    `🌸 *Inscrições - Culto de Mulheres: O Vaso e o Oleiro*\n\n` +
    `📊 *Estatísticas das Inscrições:*\n` +
    `• Total de Inscritas: *${stats.total}*\n` +
    `• Confirmações WhatsApp: *${stats.whatsappConfirmados}*\n` +
    `• Pendentes de Confirmação: *${stats.pendentesConfirmacao}*\n`
  );
}



const URL_WEBAPP_CRIANCAS =
  process.env.CRIANCAS_WEBAPP_URL ||
  "https://script.google.com/macros/s/AKfycbwVKUZxE7mzupcvdPjDck4tACDeUCvMFl2xH5XzzmxNVtb2HZhxtsK8wDjsr23jqmPLJA/exec";

let cacheCriancas = {
  total: 0,
  ultimaAtualizacao: 0,
};

async function sincronizarInscricoesCriancas(fetchFn = globalThis.fetch) {
  try {
    const res = await diaDasCriancas.sincronizarInscricoesComNuvem(URL_WEBAPP_CRIANCAS, fetchFn);
    if (res && typeof res.total === "number") {
      cacheCriancas.total = res.total;
      cacheCriancas.ultimaAtualizacao = Date.now();
    }
  } catch (err) {
    console.warn("[Crianças] Erro ao sincronizar com Google Apps Script:", err.message);
  }
  return cacheCriancas;
}

function gerarResumoDiaDasCriancas() {
  const stats = diaDasCriancas.obterEstatisticasCriancas();
  const total = stats.total || cacheCriancas.total || 0;

  return (
    `🎈 *Inscrições - Especial Dia das Crianças*\n\n` +
    `📊 *Estatísticas das Inscrições:*\n` +
    `• Total de Crianças Inscritas: *${total}*\n\n` +
    `🗓️ *Data:* Sábado, 17/10/2026 às 14:00\n` +
    `📍 *Local:* R. Benedicto de Abreu Júnior, 40 - Jd. Nova Itapevi\n\n` +
    `📝 *Formulário de Inscrição Oficial:*\n` +
    `https://forms.gle/jb3ytK348u3keMi8A\n`
  );
}

function gerarResumoSaudeMulher() {
  const stats = saudeMulher.obterEstatisticasSaudeMulher();

  return (
    `🧘‍♀️ *Inscrições & Anamnese — Saúde da Mulher (Pilates)*\n\n` +
    `📊 *Estatísticas das Inscrições:*\n` +
    `• Total de Alunas Inscritas: *${stats.total}*\n` +
    `• Com alguma condição de saúde: *${stats.comCondicaoSaude}*\n` +
    `• Com dores ou lesões: *${stats.comLesaoDor}*\n` +
    `• Já realizaram cirurgia: *${stats.comCirurgia}*\n` +
    `• Gestantes: *${stats.gestantes}*\n` +
    `• Praticam atividade física: *${stats.praticamAtividade}*\n` +
    `• Confirmações de WhatsApp: *${stats.whatsappConfirmados}*\n\n` +
    `🗓️ *Data:* Sábado, 31/10/2026 às 15:00\n` +
    `📍 *Local:* Comunidade Cristã Curados — Templo Principal\n`
  );
}

function gerarResumoIntercessao() {
  const stats = treinamentoIntercessao.obterEstatisticasIntercessao();

  return (
    `🙏 *Treinamento de Intercessão*\n\n` +
    `📊 *Estatísticas das Inscrições:*\n` +
    `• Total de Inscritos: *${stats.total}*\n` +
    `• Já têm experiência / curso: *${stats.comExperiencia}*\n` +
    `• Primeira vez no ministério: *${stats.semExperiencia}*\n` +
    `• Confirmações de WhatsApp: *${stats.whatsappConfirmado}*\n\n` +
    `🗓️ *Início:* Domingo, 15/11/2026 às 16:00 (Todos os Domingos)\n` +
    `📍 *Local:* Comunidade Cristã Curados — Templo Principal\n` +
    `📖 _"e serás chamado reparador de brechas e restaurador de veredas"_ (Isaías 58:12)\n`
  );
}

/**
 * Monta lista nominal em texto caso o PDF falhe ou para consulta rápida
 */
function montarListaInscritosTexto(eventoId) {
  if (eventoId === "culto_mulheres") {
    const lista =
      typeof cultoMulheres.listarInscricoesMulheres === "function"
        ? cultoMulheres.listarInscricoesMulheres()
        : [];
    if (!lista || lista.length === 0) {
      return "_Nenhuma inscrição registrada até o momento._";
    }
    const maxExibir = 40;
    const itens = lista.slice(0, maxExibir).map((item, idx) => {
      const tel = item.telefone ? `📞 ${item.telefone}` : "";
      const email = item.email ? `✉️ ${item.email}` : "";
      const info = [tel, email].filter(Boolean).join(" | ");
      return `${idx + 1}. *${item.nome}*${info ? `\n   ${info}` : ""}`;
    });
    let texto = itens.join("\n\n");
    if (lista.length > maxExibir) {
      texto += `\n\n_... e mais ${lista.length - maxExibir} inscritos (consulte a lista completa no painel da secretaria)._`;
    }
    return texto;
  }

  if (eventoId === "saude_mulher") {
    const lista =
      typeof saudeMulher.listarInscricoesSaudeMulher === "function"
        ? saudeMulher.listarInscricoesSaudeMulher()
        : [];
    if (!lista || lista.length === 0) {
      return "_Nenhuma aluna inscrita até o momento._";
    }
    const maxExibir = 40;
    const itens = lista.slice(0, maxExibir).map((item, idx) => {
      const idade = item.idade ? ` (${item.idade} anos)` : "";
      const tel = item.telefone ? `📞 ${item.telefone}` : "";
      const alertas = [];
      if (item.gravida === "Sim") alertas.push("🤰 *Gestante*");
      if (item.lesaoDor === "Sim") alertas.push(`⚡ Dor/Lesão: ${item.lesaoDorDetalhes || "Sim"}`);
      if (item.cirurgia === "Sim") alertas.push(`🩹 Cirurgia: ${item.cirurgiaDetalhes || "Sim"}`);
      if (item.limitacao === "Sim") alertas.push(`⚠️ Limitação: ${item.limitacaoDetalhes || "Sim"}`);
      if (item.condicoesSaude && item.condicoesSaude !== "Nenhuma" && item.condicoesSaude !== "Não" && item.condicoesSaude !== "nao") alertas.push(`🩺 ${item.condicoesSaude}`);

      const blocoAlerta = alertas.length > 0 ? `\n   ⚠️ _Atenção:_ ${alertas.join(" | ")}` : "\n   ✅ _Sem queixas ou restrições registradas_";
      return `${idx + 1}. *${item.nome}*${idade}\n   ${tel}${blocoAlerta}`;
    });
    let texto = itens.join("\n\n");
    if (lista.length > maxExibir) {
      texto += `\n\n_... e mais ${lista.length - maxExibir} alunas (consulte as fichas completas no painel)._`;
    }
    return texto;
  }

  if (eventoId === "dia_das_criancas") {
    const lista =
      typeof diaDasCriancas.listarInscricoesCriancas === "function"
        ? diaDasCriancas.listarInscricoesCriancas()
        : [];
    if (!lista || lista.length === 0) {
      return "_Nenhuma inscrição de criança registrada até o momento._";
    }
    const maxExibir = 40;
    const itens = lista.slice(0, maxExibir).map((item, idx) => {
      const resp = item.nomeResponsavel ? `👩‍👧 Resp: ${item.nomeResponsavel}` : "";
      const idade = item.idade ? `🎂 Idade: ${item.idade}` : "";
      const tel = item.telefone ? `📞 ${item.telefone}` : "";
      const info = [idade, resp, tel].filter(Boolean).join(" | ");
      return `${idx + 1}. *${item.nomeCrianca}*${info ? `\n   ${info}` : ""}`;
    });
    let texto = itens.join("\n\n");
    if (lista.length > maxExibir) {
      texto += `\n\n_... e mais ${lista.length - maxExibir} crianças (consulte a lista completa no painel da secretaria)._`;
    }
    return texto;
  }

  if (eventoId === "treinamento_intercessao") {
    const lista =
      typeof treinamentoIntercessao.listarInscricoesIntercessao === "function"
        ? treinamentoIntercessao.listarInscricoesIntercessao()
        : [];
    if (!lista || lista.length === 0) {
      return "_Nenhum participante inscrito no momento._";
    }
    const maxExibir = 40;
    const itens = lista.slice(0, maxExibir).map((item, idx) => {
      const tel = item.telefone ? `📞 ${item.telefone}` : "";
      const ehSim = /^sim/i.test(item.experienciaIntercessao || "");
      const expTag = ehSim ? " [🛡️ Já atuou/curso]" : " [🌱 1ª Vez]";
      const detalhes = item.experienciaDetalhes && item.experienciaDetalhes !== "-" ? `\n   📝 _${item.experienciaDetalhes}_` : "";
      return `${idx + 1}. *${item.nome}*${expTag}\n   ${tel}${detalhes}`;
    });
    let texto = itens.join("\n\n");
    if (lista.length > maxExibir) {
      texto += `\n\n_... e mais ${lista.length - maxExibir} participantes (consulte no site)._`;
    }
    return texto;
  }

  return "";
}

/**
 * Obtém argumentos de inicialização seguros para Puppeteer em qualquer SO / VPS
 */
function getPuppeteerLaunchArgs() {
  const opts = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--disable-extensions",
    ],
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  } else if (fs.existsSync("/usr/bin/chromium")) {
    opts.executablePath = "/usr/bin/chromium";
  } else if (fs.existsSync("/usr/bin/google-chrome-stable")) {
    opts.executablePath = "/usr/bin/google-chrome-stable";
  } else if (fs.existsSync("/usr/bin/chromium-browser")) {
    opts.executablePath = "/usr/bin/chromium-browser";
  }

  return opts;
}

/**
 * Gera o buffer PDF correspondente ao evento usando Puppeteer
 */
async function gerarPdfEvento({ eventoId, client }) {
  let html = "";
  let filename = "";

  if (eventoId === "culto_mulheres") {
    html = cultoMulheres.renderMulheresPdfHtml();
    filename = "Lista_Inscricoes_Culto_Mulheres.pdf";

  } else if (eventoId === "saude_mulher") {
    html = saudeMulher.renderSaudeMulherPdfHtml();
    filename = "Fichas_Anamnese_Pilates_Saude_da_Mulher.pdf";

  } else if (eventoId === "dia_das_criancas") {
    html = diaDasCriancas.renderCriancasPdfHtml();
    filename = "Lista_Inscricoes_Dia_das_Criancas.pdf";

  } else if (eventoId === "treinamento_intercessao") {
    html = treinamentoIntercessao.renderIntercessaoPdfHtml();
    filename = "Lista_Inscritos_Treinamento_Intercessao.pdf";
  } else {
    return { ok: false, error: "Evento não reconhecido." };
  }

  let browser = null;
  let fecharBrowser = false;

  try {
    // 1. Prioriza instância Puppeteer isolada para não afetar o WhatsApp Web
    if (puppeteer && typeof puppeteer.launch === "function") {
      try {
        browser = await puppeteer.launch(getPuppeteerLaunchArgs());
        fecharBrowser = true;
      } catch (launchErr) {
        console.warn(
          "[Inscrições PDF] Falha ao iniciar Puppeteer isolado, tentando pupBrowser do client:",
          launchErr.message
        );
      }
    }

    // 2. Fallback: reaproveita client.pupBrowser se estiver conectado
    if (!browser && client?.pupBrowser) {
      if (
        typeof client.pupBrowser.isConnected !== "function" ||
        client.pupBrowser.isConnected()
      ) {
        browser = client.pupBrowser;
        fecharBrowser = false;
      }
    }

    if (!browser) {
      return {
        ok: false,
        error: "Navegador indisponível para renderização do PDF.",
      };
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });
    const rawBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
    });
    await page.close().catch(() => {});

    if (fecharBrowser) {
      await browser.close().catch(() => {});
    }

    const buffer = Buffer.from(rawBuffer);
    return { ok: true, buffer, filename };
  } catch (err) {
    if (fecharBrowser && browser) {
      await browser.close().catch(() => {});
    }
    console.warn(
      `[Inscrições PDF] Erro ao gerar PDF de ${eventoId}:`,
      err.message
    );
    return { ok: false, error: err.message };
  }
}

function formatarLinkSite(caminho) {
  const base = (process.env.SITE_URL || process.env.BASE_URL || "").replace(/\/$/, "");
  if (!base) return caminho;
  return `${base}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
}

/**
 * Retorna os links oficiais no site / fichas / PDF para o evento
 * (Substitui links crus de planilhas por páginas organizadas do site)
 */
function obterLinksDocumentos(eventoId) {
  if (eventoId === "culto_mulheres") {
    return {
      siteUrl: formatarLinkSite("/mulheres/fichas"),
      fichasUrl: formatarLinkSite("/mulheres/fichas"),
      pdfUrl: `/mulheres/api/relatorio-pdf`,
    };
  }

  if (eventoId === "saude_mulher") {
    return {
      siteUrl: formatarLinkSite("/saude-da-mulher/fichas"),
      fichasUrl: formatarLinkSite("/saude-da-mulher/fichas"),
      pdfUrl: `/saude-mulher/api/relatorio-pdf`,
    };
  }

  if (eventoId === "dia_das_criancas") {
    return {
      siteUrl: formatarLinkSite("/criancas/fichas"),
      fichasUrl: formatarLinkSite("/criancas/fichas"),
      pdfUrl: `/criancas/api/relatorio-pdf`,
    };
  }

  if (eventoId === "treinamento_intercessao") {
    return {
      siteUrl: formatarLinkSite("/intercessao/fichas"),
      fichasUrl: formatarLinkSite("/intercessao/fichas"),
      pdfUrl: `/intercessao/api/relatorio-pdf`,
    };
  }

  return { siteUrl: null, fichasUrl: null, pdfUrl: null };
}

/**
 * Envia o resumo conciso (cabeçalho, estatísticas e link do site com fichas)
 */
async function enviarInscricoesComPdf({ client, msg, numero, eventoId }) {
  // Sincroniza com a nuvem / Google Sheets em produção para garantir dados frescos
  if (
    process.env.NODE_ENV !== "test" &&
    eventoId === "culto_mulheres" &&
    typeof cultoMulheres.sincronizarInscricoesComNuvem === "function"
  ) {
    try {
      await cultoMulheres.sincronizarInscricoesComNuvem();
    } catch {}

  } else if (
    process.env.NODE_ENV !== "test" &&
    eventoId === "saude_mulher" &&
    typeof saudeMulher.sincronizarInscricoesComNuvemSaudeMulher === "function"
  ) {
    try {
      await saudeMulher.sincronizarInscricoesComNuvemSaudeMulher();
    } catch {}

  } else if (
    process.env.NODE_ENV !== "test" &&
    eventoId === "dia_das_criancas"
  ) {
    try {
      await sincronizarInscricoesCriancas();
    } catch {}

  } else if (
    process.env.NODE_ENV !== "test" &&
    eventoId === "treinamento_intercessao" &&
    typeof treinamentoIntercessao.sincronizarInscricoesComNuvemIntercessao === "function"
  ) {
    try {
      await treinamentoIntercessao.sincronizarInscricoesComNuvemIntercessao();
    } catch {}
  }

  let resumoTexto = "";
  if (eventoId === "culto_mulheres") {
    resumoTexto = gerarResumoCultoMulheres();

  } else if (eventoId === "saude_mulher") {
    resumoTexto = gerarResumoSaudeMulher();

  } else if (eventoId === "dia_das_criancas") {
    resumoTexto = gerarResumoDiaDasCriancas();

  } else if (eventoId === "treinamento_intercessao") {
    resumoTexto = gerarResumoIntercessao();
  }

  // Link oficial do painel no site com fichas organizadas (ao invés de mandar a planilha Google)
  const links = obterLinksDocumentos(eventoId);

  let blocoLinks = "";
  if (eventoId === "saude_mulher") {
    blocoLinks += `\n📑 *Ver Fichas Organizadas da Professora (Celular):*\n${links.fichasUrl || links.siteUrl}\n`;
  } else if (links.siteUrl) {
    blocoLinks += `\n🌐 *Ver Inscrições no Site (Celular):*\n${links.siteUrl}\n`;
  }

  const dicaTipo = eventoId === "saude_mulher" ? "as alunas com seus alertas de saúde" : "os inscritos";
  const corpoMensagem =
    resumoTexto +
    blocoLinks +
    `\n💡 *Dica:* Digite *fichas* ou *lista* para ver ${dicaTipo} diretamente aqui no WhatsApp.\n` +
    `\nDigite *menu* para voltar ao menu principal.`;

  await msg.reply(corpoMensagem);
}

/**
 * Inicia o fluxo de consulta de inscrições pela Área do Líder / Pastoral / Direção
 */
async function iniciarFluxoConsultaInscricoes({
  msg,
  numero,
  etapas,
  usuario,
  isPastor = false,
  isDiretor = false,
  isLider = false,
  client,
  origem = "lider",
}) {
  const eventos = obterEventosInscricaoParaUsuario({
    usuario,
    isPastor,
    isDiretor,
    isLider,
  });

  if (!eventos || eventos.length === 0) {
    const deptoStr =
      usuario?.departamento ||
      (Array.isArray(usuario?.departamentos)
        ? usuario.departamentos.join(", ")
        : "seu departamento");
    return msg.reply(
      `⚠️ *Inscrições de Eventos*\n\n` +
        `No momento não há eventos com inscrições ativas cadastrados para o seu departamento (*${deptoStr || "seu departamento"}*).\n\n` +
        `_Líderes têm acesso aos eventos dos seus departamentos, enquanto Pastores e Diretores têm acesso a todos os eventos da igreja._\n\n` +
        `Digite *voltar* para o menu anterior ou *menu* para o início.`
    );
  }

  // Se o usuário tiver acesso a exatamente 1 evento (ex: Líder de Mulheres acessando Culto de Mulheres)
  if (eventos.length === 1) {
    etapas[numero] = {
      fluxo: "consulta_inscricoes",
      etapa: "visualizando_evento",
      eventosDisponiveis: eventos,
      eventoSelecionado: eventos[0].id,
      origem,
    };
    return await enviarInscricoesComPdf({
      client,
      msg,
      numero,
      eventoId: eventos[0].id,
    });
  }

  // Se houver mais de um evento (ex: Pastores e Diretores)
  etapas[numero] = {
    fluxo: "consulta_inscricoes",
    etapa: "escolher_evento",
    eventosDisponiveis: eventos,
    origem,
  };

  let menuTxt =
    `📋 *Inscrições de Eventos*\n\n` +
    `Escolha o evento que você deseja consultar:\n\n`;
  eventos.forEach((ev, idx) => {
    menuTxt += `${idx + 1}️⃣ ${ev.icone} *${ev.nome}*\n`;
  });
  menuTxt +=
    `\nDigite o número do evento desejado para ver o resumo e receber o PDF.\n` +
    `Digite *voltar* para o menu anterior ou *menu* para o início.`;

  return msg.reply(menuTxt);
}

/**
 * Processa as mensagens dentro do fluxo de consulta de inscrições
 */
async function processarFluxoConsultaInscricoes({
  msg,
  numero,
  info,
  client,
  etapas,
  usuario,
  isPastor = false,
  isDiretor = false,
  isLider = false,
  menuLiderFn,
  menuPastoralFn,
  menuDiretorFn,
}) {
  const escolha = (msg.body || "").trim().toLowerCase();

  if (escolha === "voltar") {
    if (info.origem === "pastoral" || isPastor) {
      etapas[numero] = { fluxo: "area_pastoral", etapa: "menu_pastoral" };
      return msg.reply(
        typeof menuPastoralFn === "function"
          ? menuPastoralFn()
          : "Retornando à Área Pastoral. Digite *menu* para o início."
      );
    }
    if (info.origem === "diretor" || isDiretor) {
      etapas[numero] = { fluxo: "area_diretor", etapa: "menu_diretor" };
      return msg.reply(
        typeof menuDiretorFn === "function"
          ? menuDiretorFn()
          : "Retornando à Área da Direção. Digite *menu* para o início."
      );
    }
    etapas[numero] = { fluxo: "area_lider", etapa: "menu_lider" };
    return msg.reply(
      typeof menuLiderFn === "function"
        ? menuLiderFn()
        : "Retornando à Área do Líder. Digite *menu* para o início."
    );
  }

  if (info.etapa === "escolher_evento") {
    const eventos = info.eventosDisponiveis || [];
    let selecionado = null;

    const idx = parseInt(escolha, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < eventos.length) {
      selecionado = eventos[idx];
    } else {
      selecionado = eventos.find(
        (e) =>
          escolha.includes(e.id) ||
          (/pilates|sa[uú]de/i.test(escolha) && e.id === "saude_mulher") ||
          (/culto.*mulher|mulher/i.test(escolha) && !/pilates|sa[uú]de/i.test(escolha) && e.id === "culto_mulheres") ||
          (/crian[cç]|infantil|kids/i.test(escolha) && e.id === "dia_das_criancas") ||
          (/intercess[aã]o|ora[cç][aã]o/i.test(escolha) && e.id === "treinamento_intercessao")
      );
    }

    if (!selecionado) {
      return msg.reply(
        `❌ Opção inválida. Digite o número correspondente ao evento desejado (de 1 a ${eventos.length}) ou *voltar* para o menu anterior:`
      );
    }

    info.eventoSelecionado = selecionado.id;
    info.etapa = "visualizando_evento";
    return await enviarInscricoesComPdf({
      client,
      msg,
      numero,
      eventoId: selecionado.id,
    });
  }

  if (info.etapa === "visualizando_evento") {
    if (
      escolha === "atualizar" ||
      escolha === "pdf" ||
      escolha === "sync" ||
      escolha === "novamente"
    ) {
      return await enviarInscricoesComPdf({
        client,
        msg,
        numero,
        eventoId: info.eventoSelecionado,
      });
    }

    if (
      escolha === "lista" ||
      escolha === "fichas" ||
      escolha === "alunas" ||
      escolha === "anamnese" ||
      escolha === "nomes"
    ) {
      const listaTexto = montarListaInscritosTexto(info.eventoSelecionado);
      return await msg.reply(
        `📋 *Lista Nominal & Fichas das Alunas:*\n\n${listaTexto}\n\n` +
          `• Digite *atualizar* para ver o resumo geral.\n` +
          `• Digite *voltar* para o menu anterior.`
      );
    }

    // Se houver mais de um evento e digitar o número do outro evento
    const eventos = info.eventosDisponiveis || [];
    const idx = parseInt(escolha, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < eventos.length) {
      info.eventoSelecionado = eventos[idx].id;
      return await enviarInscricoesComPdf({
        client,
        msg,
        numero,
        eventoId: eventos[idx].id,
      });
    }

    return msg.reply(
      `📌 *Inscrições de Eventos*\n\n` +
        `• Digite *fichas* ou *lista* para ver as alunas e alertas de saúde.\n` +
        `• Digite *atualizar* para reenviar os dados mais recentes.\n` +
        (eventos.length > 1
          ? `• Digite o número de outro evento para consultá-lo.\n`
          : "") +
        `• Digite *voltar* para o menu anterior ou *menu* para o início.`
    );
  }
}

module.exports = {
  CATALOGO_EVENTOS,
  obterEventosInscricaoParaUsuario,
  isEventoExpirado,
  gerarResumoCultoMulheres,
  gerarResumoDiaDasCriancas,
  gerarResumoTheChosen: () => "",
  montarListaInscritosTexto,
  gerarPdfEvento,
  enviarInscricoesComPdf,
  iniciarFluxoConsultaInscricoes,
  processarFluxoConsultaInscricoes,
};
