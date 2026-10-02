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
const theChosen = require("../web/the_chosen");

const CATALOGO_EVENTOS = [
  {
    id: "culto_mulheres",
    nome: "Culto de Mulheres: O Vaso e o Oleiro",
    icone: "🌸",
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
    id: "the_chosen",
    nome: "Pré-estreia The Chosen - Temporada 6",
    icone: "🎬",
    departamentos: [
      "Geral",
      "Pastoral",
      "Direção",
      "Comunicação",
      "Multimídia",
      "Eventos",
    ],
    verificarPermissao: (usuario, isPastor, isDiretor) => {
      if (isPastor || isDiretor) return true;
      const deptos = (
        Array.isArray(usuario?.departamentos)
          ? usuario.departamentos
          : [usuario?.departamento || ""]
      ).map((d) => String(d || "").toLowerCase().trim());
      return deptos.some((d) =>
        /geral|dire[cç][aã]o|pastoral|comunica|m[ií]dia|evento/i.test(d)
      );
    },
  },
];

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
    ev.verificarPermissao(usuario, isPastor, isDiretor)
  );
}

function gerarResumoCultoMulheres() {
  const inscricoes = cultoMulheres.listarInscricoesMulheres();
  const stats = cultoMulheres.obterEstatisticasMulheres();

  let texto =
    `🌸 *Culto de Mulheres: O Vaso e o Oleiro*\n` +
    `🗓️ *Data:* Sábado, 24/10/2026 às 15:00\n` +
    `📍 *Local:* R. Benedicto de Abreu Júnior, 40 - Jd. Nova Itapevi\n\n` +
    `📊 *Estatísticas das Inscrições:*\n` +
    `• Total de Inscritas: *${stats.total}*\n` +
    `• Confirmações WhatsApp: *${stats.whatsappConfirmados}*\n` +
    `• Pendentes de Confirmação: *${stats.pendentesConfirmacao}*\n\n`;

  if (inscricoes.length === 0) {
    texto += `_Nenhuma inscrição registrada até o momento._\n\n`;
  } else {
    texto += `📋 *Inscritas Recentes:*\n`;
    const exibicao = inscricoes.slice(0, 15);
    exibicao.forEach((item, idx) => {
      const tel = item.telefone
        ? ` (${String(item.telefone).replace(/\D/g, "")})`
        : "";
      texto += `${idx + 1}. *${item.nome || "Participante"}*${tel}\n`;
    });
    if (inscricoes.length > 15) {
      texto += `_... e mais ${inscricoes.length - 15} participante(s) no documento PDF anexo._\n\n`;
    } else {
      texto += `\n`;
    }
  }

  return texto;
}

function gerarResumoTheChosen() {
  const inscricoes = theChosen.carregarInscricoes();
  const statusVagas = theChosen.obterStatusVagas();

  let texto =
    `🎬 *Pré-estreia The Chosen - Temporada 6*\n` +
    `🗓️ *Data:* Sábado, 03/10/2026 às 19:00\n` +
    `📍 *Local:* Templo da Comunidade Cristã Curados\n\n` +
    `📊 *Estatísticas das Inscrições:*\n` +
    `• Vagas Ocupadas: *${statusVagas.preenchidas} / ${statusVagas.total}*\n` +
    `• Vagas Restantes: *${statusVagas.restantes}*\n\n`;

  if (inscricoes.length === 0) {
    texto += `_Nenhuma inscrição registrada até o momento._\n\n`;
  } else {
    texto += `📋 *Inscrições Recentes:*\n`;
    const exibicao = inscricoes.slice(0, 15);
    exibicao.forEach((item, idx) => {
      const qtd = Number(item.quantidade) || 1;
      const tel = item.telefone
        ? ` (${String(item.telefone).replace(/\D/g, "")})`
        : "";
      texto += `${idx + 1}. *${item.titular || item.nome || "Participante"}* (${qtd} vaga${qtd > 1 ? "s" : ""})${tel}\n`;
    });
    if (inscricoes.length > 15) {
      texto += `_... e mais ${inscricoes.length - 15} inscrição(ões) no documento PDF anexo._\n\n`;
    } else {
      texto += `\n`;
    }
  }

  return texto;
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

  if (eventoId === "the_chosen") {
    const lista =
      typeof theChosen.listarInscricoes === "function"
        ? theChosen.listarInscricoes()
        : [];
    if (!lista || lista.length === 0) {
      return "_Nenhuma inscrição registrada até o momento._";
    }
    const maxExibir = 40;
    const itens = lista.slice(0, maxExibir).map((item, idx) => {
      const tel = item.telefone ? `📞 ${item.telefone}` : "";
      const status = item.presente
        ? "✅ Presente"
        : item.confirmado
        ? "👍 Confirmado"
        : "⏳ Pendente";
      return `${idx + 1}. *${item.nome}* (${status})${tel ? `\n   ${tel}` : ""}`;
    });
    let texto = itens.join("\n\n");
    if (lista.length > maxExibir) {
      texto += `\n\n_... e mais ${lista.length - maxExibir} inscritos._`;
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
  } else if (eventoId === "the_chosen") {
    html = theChosen.renderTheChosenPdfHtml();
    filename = "Lista_Inscricoes_The_Chosen.pdf";
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
    if (typeof cultoMulheres.obterLinksPlanilhaMulheres === "function") {
      return cultoMulheres.obterLinksPlanilhaMulheres();
    }
    const ssId = process.env.MULHERES_SPREADSHEET_ID;
    const webappUrl =
      process.env.MULHERES_WEBAPP_URL ||
      "https://script.google.com/macros/s/AKfycbzGYDJzHufmbaOP39WH_ouv_EyrM9vnAkjjOC06fBJ5XJAop1ZcWo92mnJIevDPc19UcQ/exec";
    return {
      spreadsheetId: ssId || null,
      spreadsheetUrl: ssId
        ? `https://docs.google.com/spreadsheets/d/${ssId}/edit`
        : webappUrl,
      pdfUrl: ssId
        ? `https://docs.google.com/spreadsheets/d/${ssId}/export?format=pdf&portrait=true&size=a4&gridlines=true`
        : `${webappUrl}?action=pdf`,
    };
  }

  if (eventoId === "the_chosen") {
    let ssId =
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
      "1eFQTr1uMTtr1RMaU1KXtxtTpzVlUdGvQOFRtK0quHIM";
    try {
      const theChosenSheets = require("../web/the_chosen_sheets");
      if (typeof theChosenSheets.getSpreadsheetId === "function") {
        ssId = theChosenSheets.getSpreadsheetId() || ssId;
      }
    } catch {}
    return {
      spreadsheetId: ssId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${ssId}/edit`,
      pdfUrl: `https://docs.google.com/spreadsheets/d/${ssId}/export?format=pdf&portrait=true&size=a4&gridlines=true`,
    };
  }

  return { spreadsheetId: null, spreadsheetUrl: null, pdfUrl: null };
}

/**
 * Envia o resumo, lista de inscritos e links oficiais do Google Docs/Sheets
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
    eventoId === "the_chosen" &&
    typeof theChosen.sincronizarInscricoesComNuvem === "function"
  ) {
    try {
      await theChosen.sincronizarInscricoesComNuvem();
    } catch {}
  }

  let resumoTexto = "";
  if (eventoId === "culto_mulheres") {
    resumoTexto = gerarResumoCultoMulheres();
  } else if (eventoId === "the_chosen") {
    resumoTexto = gerarResumoTheChosen();
  }

  const destino = msg.from || numero;
  const isLid = String(destino).includes("@lid");

  // 1. Lista nominal de inscritos
  const listaTexto = montarListaInscritosTexto(eventoId);

  // 2. Links oficiais do Google Drive / Docs / Sheets
  const links = obterLinksDocumentos(eventoId);

  let blocoLinks = "";
  if (links.pdfUrl) {
    blocoLinks += `\n📥 *Baixar Lista Oficial em PDF (Google Drive):*\n${links.pdfUrl}\n`;
  }
  if (links.spreadsheetUrl) {
    blocoLinks += `\n📊 *Acessar Planilha Online em Tempo Real:*\n${links.spreadsheetUrl}\n`;
  }

  const corpoMensagem =
    resumoTexto +
    `📋 *Lista de Inscritos:*\n` +
    listaTexto +
    `\n\n` +
    `📑 *Documentos Oficiais (Google Docs/Drive):*` +
    blocoLinks +
    `\nDigite *menu* para voltar ao menu principal.`;

  // Envio garantido e imediato da mensagem
  await msg.reply(corpoMensagem);

  // 3. Se for usuário com @c.us e puppeteer ativo, tenta anexar o PDF como cortesia
  if (!isLid && MessageMedia && puppeteer) {
    try {
      const pdfRes = await gerarPdfEvento({ eventoId, client });
      if (pdfRes.ok && pdfRes.buffer) {
        const tempFilePath = path.join(
          os.tmpdir(),
          `inscricoes_${Date.now()}_${pdfRes.filename}`
        );
        try {
          fs.writeFileSync(tempFilePath, pdfRes.buffer);
          let media;
          if (typeof MessageMedia.fromFilePath === "function") {
            media = MessageMedia.fromFilePath(tempFilePath);
          } else {
            media = new MessageMedia(
              "application/pdf",
              pdfRes.buffer.toString("base64"),
              pdfRes.filename
            );
          }

          const sendOptions = {
            caption: `📄 *Lista Oficial de Inscrições / Folha de Portaria*`,
            sendMediaAsDocument: true,
          };

          if (typeof client?.sendMessage === "function") {
            await client.sendMessage(destino, media, sendOptions);
          } else if (typeof msg.reply === "function") {
            await msg.reply(media, undefined, sendOptions);
          }
        } finally {
          try {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          } catch {}
        }
      }
    } catch (errAnexo) {
      console.warn(
        "[Inscrições] Aviso ao enviar anexo secundário em PDF:",
        errAnexo.message
      );
    }
  }
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
          (/mulher/i.test(escolha) && e.id === "culto_mulheres") ||
          (/chosen/i.test(escolha) && e.id === "the_chosen")
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
  gerarResumoCultoMulheres,
  gerarResumoTheChosen,
  gerarPdfEvento,
  enviarInscricoesComPdf,
  iniciarFluxoConsultaInscricoes,
  processarFluxoConsultaInscricoes,
};
