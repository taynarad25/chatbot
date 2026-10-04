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
    const res = await fetchFn(URL_WEBAPP_CRIANCAS, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (data && typeof data.total === "number") {
      cacheCriancas.total = data.total;
      cacheCriancas.ultimaAtualizacao = Date.now();
    }
  } catch (err) {
    console.warn("[Crianças] Erro ao sincronizar com Google Apps Script:", err.message);
  }
  return cacheCriancas;
}

function gerarResumoDiaDasCriancas() {
  const total = cacheCriancas.total || 0;

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

  } else if (eventoId === "dia_das_criancas") {
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dia das Crianças</title></head><body><h1>Especial Dia das Crianças</h1><p>Lista oficial de inscrições (Google Forms).</p></body></html>`;
    filename = "Lista_Inscricoes_Dia_das_Criancas.pdf";
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

/**
 * Retorna os links oficiais do Google Sheets / Google Docs / PDF para o evento
 */
function obterLinksDocumentos(eventoId) {
  if (eventoId === "culto_mulheres") {
    const ssId =
      process.env.MULHERES_SPREADSHEET_ID ||
      "12OfRGFDbMYxUdxJ9WJJ7LlsfdqRbWOvI8n13cULIMd4";
    return {
      spreadsheetId: ssId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${ssId}/edit?usp=sharing`,
      pdfUrl: `https://docs.google.com/spreadsheets/d/${ssId}/export?format=pdf&portrait=true&size=a4&gridlines=true`,
    };
  }



  if (eventoId === "dia_das_criancas") {
    const ssId =
      process.env.CRIANCAS_SPREADSHEET_ID ||
      "11-WWQL2485gSCcM5N4XnWX8sfIj-knQCBUi5koGG6F8";
    return {
      spreadsheetId: ssId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${ssId}/edit?usp=sharing`,
      pdfUrl: `https://docs.google.com/spreadsheets/d/${ssId}/export?format=pdf&portrait=true&size=a4&gridlines=true`,
    };
  }

  return { spreadsheetId: null, spreadsheetUrl: null, pdfUrl: null };
}

/**
 * Envia o resumo conciso (cabeçalho, estatísticas e links oficiais da planilha)
 */
async function enviarInscricoesComPdf({ client, msg, numero, eventoId }) {
  // Sincroniza com o Google Sheets em produção para garantir dados frescos
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
    eventoId === "dia_das_criancas"
  ) {
    try {
      await sincronizarInscricoesCriancas();
    } catch {}
  }

  let resumoTexto = "";
  if (eventoId === "culto_mulheres") {
    resumoTexto = gerarResumoCultoMulheres();

  } else if (eventoId === "dia_das_criancas") {
    resumoTexto = gerarResumoDiaDasCriancas();
  }

  // Link oficial da planilha do Google Sheets
  const links = obterLinksDocumentos(eventoId);

  let blocoLinks = "";
  if (links.spreadsheetUrl) {
    blocoLinks = `\n📊 *Planilha de Inscrições:*\n${links.spreadsheetUrl}\n`;
  }

  const corpoMensagem =
    resumoTexto +
    blocoLinks +
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
          (/mulher/i.test(escolha) && e.id === "culto_mulheres")
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
        `• Digite *atualizar* para reenviar os dados mais recentes e o PDF.\n` +
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
  gerarResumoTheChosen: () => "",
  gerarPdfEvento,
  enviarInscricoesComPdf,
  iniciarFluxoConsultaInscricoes,
  processarFluxoConsultaInscricoes,
};
