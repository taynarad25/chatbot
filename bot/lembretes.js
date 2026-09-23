const db = require("../db");
const { REDES } = require("./redes");
const { obterFormularioEvento } = require("./formularioEvento");
const { notificarMultimidia, notificarSecretaria } = require("./secretaria");
const { unificarEventosPreparacaoLimpeza } = require("./agenda");
const { obterUsuarioPorTelefone, obterLideresPorDepartamento } = require("../web/lideres");

function formatarDataBrasil(isoOrDateStr) {
  if (!isoOrDateStr) return "";
  const match = String(isoOrDateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return String(isoOrDateStr);
}

function formatarHoraBrasil(isoStr) {
  if (!isoStr || !isoStr.includes("T")) return "";
  try {
    const d = new Date(isoStr);
    const horas = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${horas}:${mins}`;
  } catch {
    return "";
  }
}

function formatarJidWhatsApp(telefone) {
  if (!telefone) return "";
  let limpo = String(telefone).replace(/@.*$/, "").replace(/\D/g, "");
  if (!limpo) return "";
  if ((limpo.length === 10 || limpo.length === 11) && !limpo.startsWith("55")) {
    limpo = `55${limpo}`;
  }
  return `${limpo}@c.us`;
}

const ID_AGENDA_ENSAIOS = "fc012c51d15e9b272d4f955f504df24d816277da10194302f0ac1f04ae997e81@group.calendar.google.com";
const ID_AGENDA_REUNIOES = "b8f01bfd149139d388080ec63176c2556e6e1aedce184b84d37671c3d082d238@group.calendar.google.com";
const ID_AGENDA_ATENDIMENTO = "0a55126694643f39944faf173fe3acd127b2a52074c6ecc9e9ed4dc23edf8b57@group.calendar.google.com";

function ehEnsaio(ev) {
  if (!ev) return false;
  if (ev.calendarId === ID_AGENDA_ENSAIOS) return true;
  const titulo = (ev.summary || "").toLowerCase();
  return titulo.includes("ensaio");
}

function ehReuniao(ev) {
  if (!ev) return false;
  if (ev.calendarId === ID_AGENDA_REUNIOES) return true;
  const titulo = (ev.summary || "").toLowerCase();
  return /reuni[aã]o/i.test(titulo);
}

function ehAtendimentoPastoral(ev) {
  if (!ev) return false;
  if (ev.calendarId === ID_AGENDA_ATENDIMENTO) return true;
  const titulo = (ev.summary || "").toLowerCase();
  return titulo.includes("atendimento pastoral") || titulo.includes("atendimento");
}

function montarMensagemConfirmacaoAtendimento({ nome = "", horario = "", data = "", discipulo = "" } = {}) {
  const saudacao = nome ? `Olá, *${nome}*! Tudo bem?` : "Olá, Pastor! Tudo bem?";
  const dataFormatada = formatarDataBrasil(data);
  const infoHorario = horario ? ` às *${horario}*` : "";
  const infoData = dataFormatada ? `amanhã (${dataFormatada}${infoHorario})` : "amanhã";
  const infoDiscipulo = discipulo ? ` com *${discipulo}*` : "";
  return `${saudacao}\n\nPassando para saber: o atendimento pastoral${infoDiscipulo} agendado para ${infoData} está confirmado?`;
}

function registrarAgendamentoPastoral({ eventoId = "", pastorTelefone = "", pastorNome = "", discipulo = "", dataHora = "" } = {}) {
  if (!pastorTelefone) return false;
  try {
    const agora = new Date().toISOString();
    const telLimpo = String(pastorTelefone).replace(/\D/g, "");
    db.prepare(`
      INSERT INTO agendamentos_pastorais (eventoId, pastorTelefone, pastorNome, discipulo, dataHora, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(eventoId || "", telLimpo, pastorNome || "", discipulo || "", dataHora || "", agora);
    return true;
  } catch (err) {
    console.error("[Lembretes] Erro ao registrar agendamento pastoral:", err.message);
    return false;
  }
}

function buscarPastorAgendamento(eventoId, discipulo) {
  try {
    if (eventoId) {
      const row = db.prepare("SELECT * FROM agendamentos_pastorais WHERE eventoId = ? AND eventoId != '' ORDER BY id DESC LIMIT 1").get(eventoId);
      if (row) return row;
    }
    if (discipulo) {
      const termo = String(discipulo).trim().toLowerCase();
      if (termo.length >= 3) {
        const row = db.prepare("SELECT * FROM agendamentos_pastorais WHERE LOWER(discipulo) LIKE '%' || ? || '%' ORDER BY id DESC LIMIT 1").get(termo);
        if (row) return row;
      }
    }
    return null;
  } catch (err) {
    console.error("[Lembretes] Erro ao buscar pastor do agendamento:", err.message);
    return null;
  }
}

function montarMensagemConfirmacaoReuniao({ nome = "", reuniao = "", horario = "", data = "" } = {}) {
  const saudacao = nome ? `Olá, *${nome}*! Tudo bem?` : "Olá! Tudo bem?";
  const dataFormatada = formatarDataBrasil(data);
  const infoHorario = horario ? ` às *${horario}*` : "";
  const infoData = dataFormatada ? `amanhã (${dataFormatada}${infoHorario})` : "amanhã";
  const nomeReuniao = reuniao ? ` "*${reuniao}*"` : "";
  return `${saudacao}\n\nPassando para saber: a sua reunião${nomeReuniao} agendada para ${infoData} está confirmada?`;
}

function montarMensagemLembrete({
  nomeLider = "",
  evento = "",
  data = "",
  horario = "",
  local = "",
  departamento = "",
  docUrl = "",
  diasRestantes = 5,
} = {}) {
  const saudacao = nomeLider ? `Olá, *${nomeLider}*! Tudo bem?` : "Olá! Tudo bem?";
  const dataFormatada = formatarDataBrasil(data);

  let msg =
    `🔔 *Lembrete de Evento Se Aproximando!*\n\n` +
    `${saudacao}\n\n` +
    `Faltam *${diasRestantes} dias* para a realização do seu evento:\n` +
    `📅 *Evento:* ${evento}\n`;

  if (departamento) {
    msg += `🏢 *Departamento/Ministério:* ${departamento}\n`;
  }
  if (dataFormatada) {
    msg += `📆 *Data:* ${dataFormatada}\n`;
  }
  if (horario) {
    msg += `⏰ *Horário:* ${horario}\n`;
  }
  if (local) {
    msg += `📍 *Local:* ${local}\n`;
  }

  msg +=
    `\nEstá tudo certo com os preparativos e alinhamentos?\n` +
    `Gostaria de adicionar mais alguma informação ao evento ou realizar alguma alteração? Se precisar de ajustes, basta nos responder por aqui ou falar com a secretaria.\n`;

  if (docUrl) {
    msg +=
      `\n📄 *Formulário de Agendamento Preenchido:*\n` +
      `Você pode conferir as informações enviadas acessando o link:\n${docUrl}\n`;
  }

  msg += `\n_Que Deus abençoe ricamente a realização deste evento!_ 🙏✨`;
  return msg;
}

function montarMensagemLembreteMultimidia({
  evento = "",
  departamento = "",
  dataEvento = "",
  horario = "",
  local = "",
  dataDivulgacao = "",
  diasRestantes = 5,
  nomeLider = "",
  telefoneLider = "",
  tema = "",
  versiculo = "",
  cores = "",
  midias = "",
  canais = "",
  docUrl = "",
} = {}) {
  const dataEventoBr = formatarDataBrasil(dataEvento);
  const dataDivulgacaoBr = formatarDataBrasil(dataDivulgacao);

  let msg =
    `📢 *LEMBRETE DE DIVULGAÇÃO - MULTIMÍDIAS*\n\n` +
    `Faltam *${diasRestantes} dias* para a data máxima de início da divulgação do evento!\n\n` +
    `📅 *Evento:* ${evento}\n`;

  if (departamento) {
    msg += `🏢 *Departamento:* ${departamento}\n`;
  }
  if (dataEventoBr) {
    msg += `📆 *Data do Evento:* ${dataEventoBr}\n`;
  }
  if (horario) {
    msg += `⏰ *Horário:* ${horario}\n`;
  }
  if (local) {
    msg += `📍 *Local:* ${local}\n`;
  }
  if (dataDivulgacaoBr) {
    msg += `🗓️ *Data Limite para Iniciar Divulgação:* ${dataDivulgacaoBr}\n`;
  }
  if (nomeLider) {
    msg += `👤 *Líder Responsável:* ${nomeLider}${telefoneLider ? ` (${telefoneLider})` : ""}\n`;
  }

  if (tema) msg += `✨ *Tema:* ${tema}\n`;
  if (versiculo) msg += `📖 *Versículo Base:* ${versiculo}\n`;
  if (cores) msg += `🎨 *Cores/Identidade Visual:* ${cores}\n`;
  if (midias) msg += `📱 *Mídias Solicitadas:* ${midias}\n`;
  if (canais) msg += `📢 *Canais / Prazo da Arte:* ${canais}\n`;

  if (docUrl) {
    msg += `\n📄 *Documento Oficial (Google Docs):*\n${docUrl}\n`;
  }

  msg += `\n_Equipe de Multimídia, favor verificar o alinhamento das publicações e materiais de divulgação!_ 🙏✨`;
  return msg;
}

function buscarLembreteEnviado(eventoId, tipo) {
  try {
    return db.prepare("SELECT * FROM lembretes_enviados WHERE eventoId = ? AND tipo = ?").get(eventoId, tipo);
  } catch (err) {
    console.error("[Lembretes] Erro ao consultar lembrete enviado:", err.message);
    return null;
  }
}

function registrarLembreteEnviado(eventoId, tipo, destinatario) {
  try {
    const agora = new Date().toISOString();
    db.prepare("INSERT INTO lembretes_enviados (eventoId, tipo, destinatario, enviadoEm) VALUES (?, ?, ?, ?)")
      .run(eventoId, tipo, destinatario, agora);
    return true;
  } catch (err) {
    console.error("[Lembretes] Erro ao registrar lembrete enviado:", err.message);
    return false;
  }
}

async function processarLembretesEventos({
  client,
  buscarEventos,
  agendasParaLer = [],
  diasAntecedencia = 5,
  dataBase = new Date(),
  notificarSecretariaFn = notificarSecretaria,
} = {}) {
  if (!buscarEventos || typeof buscarEventos !== "function") {
    console.log("[Lembretes] buscarEventos não fornecido.");
    return { processados: 0, enviados: 0 };
  }

  const targetDate = new Date(dataBase);
  targetDate.setDate(targetDate.getDate() + diasAntecedencia);

  const ano = targetDate.getFullYear();
  const mes = String(targetDate.getMonth() + 1).padStart(2, "0");
  const dia = String(targetDate.getDate()).padStart(2, "0");
  const dataAlvoStr = `${ano}-${mes}-${dia}`;

  // Busca janela das 00:00:00 até 23:59:59 do dia alvo
  const inicioDia = new Date(ano, targetDate.getMonth(), targetDate.getDate(), 0, 0, 0).toISOString();
  const fimDia = new Date(ano, targetDate.getMonth(), targetDate.getDate(), 23, 59, 59).toISOString();

  console.log(`[Lembretes] Verificando eventos para lembrete de ${diasAntecedencia} dias em ${dataAlvoStr}...`);

  let eventos = [];
  try {
    eventos = await buscarEventos(inicioDia, fimDia);
  } catch (err) {
    console.error("[Lembretes] Erro ao buscar eventos para lembretes:", err.message);
    return { processados: 0, enviados: 0, erro: err.message };
  }

  if (!Array.isArray(eventos) || eventos.length === 0) {
    console.log(`[Lembretes] Nenhum evento encontrado para o dia ${dataAlvoStr}.`);
    return { processados: 0, enviados: 0 };
  }

  let totalEnviados = 0;
  const tipoLembrete = `${diasAntecedencia}_dias_antes`;

  for (const ev of eventos) {
    const isEnsaio = ehEnsaio(ev);
    if (isEnsaio) {
      // Ensaios não devem receber mensagens de confirmação
      continue;
    }

    const isReuniao = ehReuniao(ev);
    const isPastoral = ehAtendimentoPastoral(ev);

    // Reunião e Atendimento Pastoral: mande 1 dia antes (diasAntecedencia === 1).
    // Eventos no geral: mande com a antecedência configurada (padrão 5 dias).
    if (diasAntecedencia !== 1 && (isReuniao || isPastoral)) {
      continue;
    }
    if (diasAntecedencia === 1 && !isReuniao && !isPastoral) {
      continue;
    }

    const eventoId = ev.id || `${ev.summary}_${dataAlvoStr}`;
    const jaEnviado = buscarLembreteEnviado(eventoId, tipoLembrete);
    if (jaEnviado) {
      continue;
    }

    const horario = formatarHoraBrasil(ev.start?.dateTime);
    const dataEv = ev.start?.dateTime ? ev.start.dateTime.split("T")[0] : (ev.start?.date || dataAlvoStr);
    const local = ev.location || "";
    const titulo = ev.summary || "Evento";

    // 1. Tenta buscar formulário no banco SQLite
    const form = obterFormularioEvento(titulo);
    const destinatarios = [];

    if (form && form.solicitanteId) {
      const user = obterUsuarioPorTelefone(form.solicitanteId);
      const nomeLider = user?.nome || form.payload?.nomeSolicitante || "";
      destinatarios.push({
        telefone: form.solicitanteId,
        nome: nomeLider,
        docUrl: form.docUrl || "",
        departamento: form.departamento || "",
      });
    }

    // Se não encontrou pelo formulário, tenta extrair solicitante da descrição do evento (ex: "Solicitante: Pr Maurício\nTelefone: 5511...")
    if (destinatarios.length === 0 && ev.description) {
      let solicitanteDesc = "";
      let telSolicitanteDesc = "";
      const matchSol = ev.description.match(/Solicitante\s*:\s*([^\n\r]+)/i);
      if (matchSol) solicitanteDesc = matchSol[1].trim();
      const matchTel = ev.description.match(/(?:Telefone\s*(?:Solicitante)?|Tel(?:efone)?)\s*:\s*([^\n\r]+)/i);
      if (matchTel) telSolicitanteDesc = matchTel[1].trim().replace(/\D/g, "");

      if (telSolicitanteDesc) {
        const user = obterUsuarioPorTelefone(telSolicitanteDesc);
        const nomeLider = user?.nome || solicitanteDesc || "";
        destinatarios.push({
          telefone: telSolicitanteDesc,
          nome: nomeLider,
          docUrl: form?.docUrl || "",
          departamento: form?.departamento || "",
        });
      }
    }

    const foiAgendadoPeloBot = Boolean(form) || /agendado via bot/i.test(ev.description || "");

    let discipulo = "";
    if (isPastoral) {
      const matchDiscDesc = (ev.description || "").match(/Disc[ií]pulo\s*:\s*([^\n\r]+)/i);
      if (matchDiscDesc) {
        discipulo = matchDiscDesc[1].trim();
      } else {
        discipulo = titulo
          .replace(/atendimento pastoral\s*[-–:]*\s*/i, "")
          .replace(/atendimento\s*[-–:]*\s*/i, "")
          .replace(/\(pr\.?[^)]*\)/i, "")
          .replace(/\(pastor[^)]*\)/i, "")
          .trim();
      }
    }

    // 2. Se for Atendimento Pastoral: a confirmação DEVE ser mandada pro pastor que o marcou e NUNCA no grupo
    if (destinatarios.length === 0 && isPastoral) {
      const desc = ev.description || "";

      // a) Busca no banco agendamentos_pastorais pelo ID do evento ou nome do discípulo
      const agendamento = buscarPastorAgendamento(ev.id, discipulo);
      if (agendamento && agendamento.pastorTelefone) {
        destinatarios.push({
          telefone: agendamento.pastorTelefone,
          nome: agendamento.pastorNome || "",
          docUrl: "",
          departamento: "Atendimento Pastoral",
        });
      }

      // b) Tenta extrair telefone do pastor na descrição do evento (ex: "Telefone Pastor: 5511...", "Pastor: Gabriel (5511...)")
      if (destinatarios.length === 0) {
        const matchTelPastor = desc.match(/(?:Telefone\s*Pastor|Pastor(?:\s*Respons[aá]vel)?)[^0-9]*((?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9\d{4}[-\s]?\d{4})/i)
          || desc.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9\d{4}[-\s]?\d{4}/);
        if (matchTelPastor) {
          destinatarios.push({
            telefone: matchTelPastor[1] || matchTelPastor[0],
            nome: "",
            docUrl: "",
            departamento: "Atendimento Pastoral",
          });
        }
      }

      // c) Tenta extrair nome do pastor na descrição ou no título e buscar em líderes/usuários
      if (destinatarios.length === 0) {
        const matchNomePastor = desc.match(/(?:Pastor|Pr\.?)\s*:\s*([^\n\r,]+)/i)
          || titulo.match(/(?:Pastor|Pr\.?)\s*([^\n\r,\)\-]+)/i);
        if (matchNomePastor) {
          const nomePastor = matchNomePastor[1].trim();
          try {
            const pastorRow = db.prepare("SELECT * FROM lideres WHERE LOWER(nome) LIKE '%' || LOWER(?) || '%'").get(nomePastor);
            if (pastorRow && pastorRow.telefone) {
              destinatarios.push({
                telefone: pastorRow.telefone,
                nome: pastorRow.nome,
                docUrl: "",
                departamento: "Atendimento Pastoral",
              });
            }
          } catch (e) {}
        }
      }

      // d) Se ainda assim não encontrou o pastor que marcou, envia para os pastores cadastrados no sistema (direto no privado, NUNCA no grupo!)
      if (destinatarios.length === 0) {
        try {
          const pastores = db.prepare("SELECT * FROM lideres WHERE LOWER(cargos) LIKE '%pastor%'").all();
          for (const p of pastores) {
            if (p.telefone) {
              destinatarios.push({
                telefone: p.telefone,
                nome: p.nome,
                docUrl: "",
                departamento: "Atendimento Pastoral",
              });
            }
          }
        } catch (e) {}
      }
    }

    // 3. Se não encontrou formulário ou solicitante, E O EVENTO NÃO FOI AGENDADO PELO BOT:
    // O bot só notifica o líder do departamento quando o evento foi agendado diretamente no Google Calendar sem passar pelo bot.
    if (destinatarios.length === 0 && !foiAgendadoPeloBot && !isPastoral) {
      let depto = "";
      if (ev.calendarId && agendasParaLer.length > 0) {
        const redeEncontrada = REDES.find((r) => agendasParaLer[r.agendaIndex] === ev.calendarId);
        if (redeEncontrada) {
          depto = redeEncontrada.nome;
        }
      }
      if (!depto) {
        const redePorNome = REDES.find((r) =>
          r.palavrasChave.some((p) => titulo.toLowerCase().includes(p)) ||
          titulo.toLowerCase().includes(r.nome.toLowerCase())
        );
        if (redePorNome) {
          depto = redePorNome.nome;
        }
      }

      if (depto) {
        const lideresDoDepto = obterLideresPorDepartamento(depto);
        for (const lid of lideresDoDepto) {
          destinatarios.push({
            telefone: lid.telefone,
            nome: lid.nome,
            docUrl: "",
            departamento: depto,
          });
        }
      }
    }

    if (destinatarios.length === 0) {
      console.log(`[Lembretes] Nenhum líder ou responsável identificado para o evento: "${titulo}".`);
      continue;
    }

    for (const dest of destinatarios) {
      // Bloqueio explícito: confirmação de atendimento pastoral NUNCA deve ser enviada para grupos
      const telDest = String(dest.telefone || "");
      if (isPastoral && telDest.includes("@g.us")) {
        console.warn(`[Lembretes] Bloqueado envio de confirmação de atendimento pastoral para grupo (${telDest}). Deve ser apenas para o pastor no privado.`);
        continue;
      }

      let msg = "";
      if (isPastoral) {
        msg = montarMensagemConfirmacaoAtendimento({
          nome: dest.nome,
          horario,
          data: dataEv,
          discipulo,
        });
      } else if (isReuniao) {
        msg = montarMensagemConfirmacaoReuniao({
          nome: dest.nome,
          reuniao: titulo,
          horario,
          data: dataEv,
        });
      } else {
        msg = montarMensagemLembrete({
          nomeLider: dest.nome,
          evento: titulo,
          data: dataEv,
          horario,
          local,
          departamento: dest.departamento,
          docUrl: diasAntecedencia === 5 ? dest.docUrl : "",
          diasRestantes: diasAntecedencia,
        });
      }

      const jid = formatarJidWhatsApp(dest.telefone);
      if (client && typeof client.sendMessage === "function") {
        try {
          await client.sendMessage(jid, msg);
          console.log(`[Lembretes] Lembrete de ${diasAntecedencia} dias enviado para ${dest.nome} (${dest.telefone}) sobre "${titulo}".`);
          totalEnviados++;
        } catch (errSend) {
          console.error(`[Lembretes] Falha ao enviar mensagem para ${dest.telefone}:`, errSend.message);
        }
      } else {
        console.log(`[Lembretes] [Simulação] Mensagem para ${dest.telefone} sobre "${titulo}":\n${msg}`);
        totalEnviados++;
      }
      registrarLembreteEnviado(eventoId, tipoLembrete, dest.telefone);

      // Notifica secretaria sobre lembretes enviados aos líderes (eventos e reuniões - pastoral NUNCA vai para grupo)
      if (!isPastoral && notificarSecretariaFn && typeof notificarSecretariaFn === "function") {
        const tipoDesc = isReuniao ? "Reunião" : "Evento";
        const formAviso = (diasAntecedencia === 5 && dest.docUrl) ? `\n📄 *Formulário Anexado:* ${dest.docUrl}` : "";
        const msgSecretaria =
          `📋 *Aviso à Secretaria - Lembrete de ${tipoDesc}*\n` +
          `Lembrete de *${diasAntecedencia} dias* enviado ao líder *${dest.nome || "Líder"}* (${dest.telefone}) sobre *${titulo}*:${formAviso}\n\n${msg}`;
        try {
          await notificarSecretariaFn(client, msgSecretaria);
        } catch (errSec) {
          console.error(`[Lembretes] Falha ao enviar cópia do lembrete para secretaria:`, errSec.message);
        }
      }
    }
  }

  return { processados: eventos.length, enviados: totalEnviados };
}

/**
 * Processa formulários de eventos salvos no banco e envia lembretes para o grupo MULTIMÍDIAS
 * 5 dias e 3 dias antes da data máxima para início da divulgação.
 */
async function processarLembretesDivulgacaoMultimidia({
  client,
  diasAntecedencia = 5,
  dataBase = new Date(),
  notificarFn = notificarMultimidia,
} = {}) {
  const targetDate = new Date(dataBase);
  targetDate.setDate(targetDate.getDate() + diasAntecedencia);

  const ano = targetDate.getFullYear();
  const mes = String(targetDate.getMonth() + 1).padStart(2, "0");
  const dia = String(targetDate.getDate()).padStart(2, "0");
  const dataAlvoIso = `${ano}-${mes}-${dia}`;
  const dataAlvoBr = `${dia}/${mes}/${ano}`;

  console.log(`[Multimídia] Verificando eventos para início de divulgação (${diasAntecedencia} dias) em ${dataAlvoIso}...`);

  let rows = [];
  try {
    rows = db.prepare(`
      SELECT * FROM formularios_eventos
      WHERE dataMaximaDivulgacao IS NOT NULL
        AND (dataMaximaDivulgacao = ? OR dataMaximaDivulgacao = ?)
    `).all(dataAlvoIso, dataAlvoBr);
  } catch (err) {
    console.error("[Multimídia] Erro ao consultar formulários de eventos para divulgação:", err.message);
    return { processados: 0, enviados: 0, erro: err.message };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(`[Multimídia] Nenhum evento com divulgação agendada para o dia ${dataAlvoIso}.`);
    return { processados: 0, enviados: 0 };
  }

  let totalEnviados = 0;
  const tipoLembrete = `multimidia_divulgacao_${diasAntecedencia}_dias`;

  for (const row of rows) {
    const eventoId = `divulgacao_${row.evento}`;
    const jaEnviado = buscarLembreteEnviado(eventoId, tipoLembrete);
    if (jaEnviado) {
      continue;
    }

    let payload = {};
    try {
      payload = JSON.parse(row.payload || "{}");
    } catch {}

    const liderUser = row.solicitanteId ? obterUsuarioPorTelefone(row.solicitanteId) : null;
    const nomeLider = liderUser?.nome || payload.nome_lider || payload.nomeSolicitante || "";
    const telefoneLider = row.solicitanteId || "";

    const msg = montarMensagemLembreteMultimidia({
      evento: row.evento,
      departamento: row.departamento || payload.departamento,
      dataEvento: row.data || payload.data,
      horario: payload.horario_inicio_termino || (payload.horario_inicio && payload.horario_termino ? `${payload.horario_inicio} às ${payload.horario_termino}` : payload.horario_inicio),
      local: payload.local,
      dataDivulgacao: row.dataMaximaDivulgacao || dataAlvoBr,
      diasRestantes: diasAntecedencia,
      nomeLider,
      telefoneLider,
      tema: payload.tema,
      versiculo: payload.versiculo,
      cores: payload.cores || payload.paleta,
      midias: payload.midias || payload.estilo,
      canais: payload.divulgacao || payload.prazo_imagem,
      docUrl: row.docUrl || payload.docUrl,
    });

    try {
      if (typeof notificarFn === "function") {
        await notificarFn(client, msg);
        console.log(`[Multimídia] Lembrete de divulgação (${diasAntecedencia} dias) enviado sobre "${row.evento}".`);
        totalEnviados++;
      }
    } catch (errNotif) {
      console.error(`[Multimídia] Erro ao notificar grupo sobre divulgação do evento "${row.evento}":`, errNotif.message);
    }

    registrarLembreteEnviado(eventoId, tipoLembrete, "MULTIMÍDIAS");
  }

  return { processados: rows.length, enviados: totalEnviados };
}

/**
 * Monta o texto resumido da agenda das próximas 2 semanas para as secretárias.
 */
function montarMensagemAgendaQuinzenalSecretarias(eventos = [], dataInicio = "", dataFim = "") {
  const inicioBr = formatarDataBrasil(dataInicio);
  const fimBr = formatarDataBrasil(dataFim);

  let cabecalho =
    `🗓️ *AGENDA QUINZENAL DAS SECRETÁRIAS*\n` +
    `Período: *${inicioBr}* a *${fimBr}*\n` +
    `Acompanhamento dos eventos e programações das próximas 2 semanas.\n\n`;

  if (!Array.isArray(eventos) || eventos.length === 0) {
    return cabecalho + `_Nenhum evento agendado para as próximas duas semanas._ 🙏`;
  }

  // Unifica blocos de limpeza e preparação para não poluir a agenda com itens duplicados
  const eventosTratados = typeof unificarEventosPreparacaoLimpeza === "function"
    ? unificarEventosPreparacaoLimpeza(eventos)
    : eventos;

  // Ordena cronologicamente
  const ordenados = [...eventosTratados].sort((a, b) => {
    const timeA = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
    const timeB = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
    return timeA - timeB;
  });

  // Agrupa por data
  const porData = {};
  for (const ev of ordenados) {
    const rawData = ev.start?.dateTime ? ev.start.dateTime.split("T")[0] : (ev.start?.date || "A definir");
    if (!porData[rawData]) porData[rawData] = [];
    porData[rawData].push(ev);
  }

  const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

  let corpo = "";
  for (const [dataIso, evs] of Object.entries(porData)) {
    let tituloData = formatarDataBrasil(dataIso);
    try {
      const [ano, mes, dia] = dataIso.split("-").map(Number);
      const dt = new Date(ano, mes - 1, dia);
      const diaSemana = DIAS_SEMANA[dt.getDay()];
      tituloData = `📅 *${tituloData} (${diaSemana})*`;
    } catch {
      tituloData = `📅 *${tituloData}*`;
    }

    corpo += `${tituloData}\n`;
    for (const ev of evs) {
      const hora = formatarHoraBrasil(ev.start?.dateTime);
      const horaStr = hora ? ` às *${hora}*` : "";
      const localStr = ev.location ? ` | 📍 ${ev.location}` : "";
      corpo += `• *${ev.summary || "Evento"}*${horaStr}${localStr}\n`;
      if (ev.horarioPreparacaoLimpeza) {
        corpo += `  🧹 _${ev.horarioPreparacaoLimpeza}_\n`;
      }
    }
    corpo += `\n`;
  }

  corpo += `_Que tenham uma excelente e abençoada quinzena de trabalho ministerial!_ ✨🙏`;
  return cabecalho + corpo;
}

/**
 * Toda segunda-feira de manhã envia a agenda das próximas duas semanas (14 dias)
 * para Isabelly Lacerda e Gabriela Diniz (secretárias).
 */
async function processarEnvioAgendaSecretarias({
  client,
  buscarEventos,
  agendasParaLer = [],
  dataBase = new Date(),
  destinatarios = null,
  forcar = false,
} = {}) {
  const diaSemana = dataBase.getDay(); // 0 = Domingo, 1 = Segunda
  if (!forcar && diaSemana !== 1) {
    console.log("[Lembretes:Secretaria] Hoje não é segunda-feira. Envio da agenda quinzenal ignorado.");
    return { processados: 0, enviados: 0, pulado: true, motivo: "Nao e segunda-feira" };
  }

  const ano = dataBase.getFullYear();
  const mes = String(dataBase.getMonth() + 1).padStart(2, "0");
  const dia = String(dataBase.getDate()).padStart(2, "0");
  const dataBaseStr = `${ano}-${mes}-${dia}`;
  const chaveEnvio = `agenda_quinzenal_secretarias_${dataBaseStr}`;

  if (!forcar) {
    const jaEnviado = buscarLembreteEnviado(chaveEnvio, "agenda_quinzenal_secretarias");
    if (jaEnviado) {
      console.log(`[Lembretes:Secretaria] Agenda quinzenal de ${dataBaseStr} já enviada anteriormente.`);
      return { processados: 0, enviados: 0, pulado: true, motivo: "Ja enviado hoje" };
    }
  }

  if (!buscarEventos || typeof buscarEventos !== "function") {
    console.log("[Lembretes:Secretaria] buscarEventos não fornecido.");
    return { processados: 0, enviados: 0 };
  }

  const inicioJanela = new Date(ano, dataBase.getMonth(), dataBase.getDate(), 0, 0, 0);
  const fimJanela = new Date(inicioJanela);
  fimJanela.setDate(fimJanela.getDate() + 14);
  fimJanela.setHours(23, 59, 59, 999);

  let eventos = [];
  try {
    eventos = await buscarEventos(inicioJanela.toISOString(), fimJanela.toISOString());
  } catch (err) {
    console.error("[Lembretes:Secretaria] Erro ao buscar eventos para agenda quinzenal:", err.message);
    return { processados: 0, enviados: 0, erro: err.message };
  }

  // Resolve as secretárias destinatárias (exclusivamente Isabelly Lacerda e Gabriela Diniz)
  let listaDest = destinatarios;
  if (!listaDest || listaDest.length === 0) {
    listaDest = [];
    try {
      const rows = db.prepare(`
        SELECT telefone, nome FROM lideres 
        WHERE LOWER(nome) LIKE '%isabelly%' 
           OR LOWER(nome) LIKE '%gabriela diniz%'
      `).all();
      for (const r of rows) {
        const nomeLower = (r.nome || "").toLowerCase();
        if (nomeLower.includes("henrique")) continue;
        if (r.telefone && !listaDest.some((d) => d.telefone === r.telefone)) {
          listaDest.push({ telefone: r.telefone, nome: r.nome });
        }
      }
    } catch (e) {
      console.error("[Lembretes:Secretaria] Erro ao consultar secretárias no banco:", e.message);
    }

    // Garante que Gabriela Diniz e Isabelly Lacerda estejam sempre na lista pelos números oficiais
    const telefonesPadrao = [
      { nome: "Gabriela Diniz", telefone: "5511942685501" },
      { nome: "Isabelly Lacerda", telefone: "5511970498716" },
    ];
    for (const padrao of telefonesPadrao) {
      const telDigitos = padrao.telefone.replace(/\D/g, "");
      const existe = listaDest.some((d) => {
        const dTel = String(d.telefone || "").replace(/\D/g, "");
        return dTel.endsWith(telDigitos.slice(-9)) || (d.nome && d.nome.toLowerCase().includes(padrao.nome.toLowerCase()));
      });
      if (!existe) {
        listaDest.push(padrao);
      }
    }

    if (process.env.SECRETARIA_TELEFONES) {
      const telsEnv = process.env.SECRETARIA_TELEFONES.split(",").map((t) => t.trim()).filter(Boolean);
      for (const t of telsEnv) {
        if (!listaDest.some((d) => d.telefone === t)) {
          listaDest.push({ telefone: t, nome: "Secretária" });
        }
      }
    }
  }

  // Sob nenhuma hipótese Gabriela Henrique deve receber a agenda de segunda-feira
  listaDest = listaDest.filter((d) => {
    const nomeLower = (d.nome || "").toLowerCase();
    return !nomeLower.includes("henrique");
  });

  if (listaDest.length === 0) {
    console.warn("[Lembretes:Secretaria] Nenhuma secretária (Isabelly / Gabriela) encontrada para envio.");
    return { processados: eventos.length, enviados: 0, aviso: "Nenhuma secretaria encontrada" };
  }

  const dataFimStr = `${fimJanela.getFullYear()}-${String(fimJanela.getMonth() + 1).padStart(2, "0")}-${String(fimJanela.getDate()).padStart(2, "0")}`;
  const mensagem = montarMensagemAgendaQuinzenalSecretarias(eventos, dataBaseStr, dataFimStr);

  let totalEnviados = 0;
  for (const dest of listaDest) {
    const jid = formatarJidWhatsApp(dest.telefone);
    if (client && typeof client.sendMessage === "function") {
      try {
        await client.sendMessage(jid, mensagem);
        console.log(`[Lembretes:Secretaria] Agenda quinzenal enviada com sucesso para ${dest.nome} (${dest.telefone})`);
        totalEnviados++;
      } catch (errSend) {
        console.error(`[Lembretes:Secretaria] Falha ao enviar agenda para ${dest.telefone}:`, errSend.message);
      }
    } else {
      console.log(`[Lembretes:Secretaria] [Simulação] Envio para ${dest.telefone}:\n${mensagem}`);
      totalEnviados++;
    }
    registrarLembreteEnviado(chaveEnvio, "agenda_quinzenal_secretarias", dest.telefone);
  }

  return { processados: eventos.length, enviados: totalEnviados };
}

/**
 * Mensagem carinhosa de aniversário assinada pela Comunidade Cristã Curados
 */
function montarMensagemAniversario({ nome = "" } = {}) {
  const saudacao = nome ? `Olá, *${nome}*! 🎉` : "Olá! 🎉";
  return (
    `${saudacao}\n\n` +
    `Hoje é um dia muito especial e toda a nossa comunidade celebra com você! 🎂✨\n\n` +
    `Desejamos que o Senhor derrame ricas bênçãos sobre a sua vida, com muita saúde, paz, alegria e realizações neste novo ciclo que se inicia. Que a graça e o favor de Deus acompanhem cada um dos seus passos!\n\n` +
    `_\"O Senhor te abençoe e te guarde; o Senhor faça resplandecer o seu rosto sobre ti e te conceda a paz.\" (Números 6:24-26)_\n\n` +
    `Com muito carinho,\n` +
    `*Comunidade Cristã Curados* ❤️🙏`
  );
}

/**
 * Rotina diária de verificação de aniversariantes do dia.
 * Compara o dia e mês atuais com a dataNascimento de todos os membros cadastrados.
 */
async function processarAniversariantesDoDia({
  client,
  dataBase = new Date(),
  listLideresFn = null,
} = {}) {
  const diaHoje = String(dataBase.getDate()).padStart(2, "0");
  const mesHoje = String(dataBase.getMonth() + 1).padStart(2, "0");
  const anoHoje = String(dataBase.getFullYear());
  const diaMesAlvo = `${diaHoje}/${mesHoje}`;

  console.log(`[Aniversários] Verificando aniversariantes do dia (${diaMesAlvo})...`);

  let membros = [];
  try {
    if (typeof listLideresFn === "function") {
      membros = listLideresFn();
    } else {
      const { listLideres } = require("../web/lideres");
      membros = listLideres();
    }
  } catch (err) {
    console.error("[Aniversários] Erro ao buscar membros/líderes:", err.message);
    return { processados: 0, enviados: 0, erro: err.message };
  }

  if (!Array.isArray(membros) || membros.length === 0) {
    return { processados: 0, enviados: 0 };
  }

  const aniversariantes = [];
  for (const m of membros) {
    if (!m.dataNascimento || !m.telefone) continue;
    const partes = String(m.dataNascimento).trim().split("/");
    if (partes.length >= 2) {
      const d = partes[0].padStart(2, "0");
      const mMes = partes[1].padStart(2, "0");
      if (d === diaHoje && mMes === mesHoje) {
        aniversariantes.push(m);
      }
    }
  }

  if (aniversariantes.length === 0) {
    console.log(`[Aniversários] Nenhum aniversariante encontrado para ${diaMesAlvo}.`);
    return { processados: membros.length, aniversariantes: 0, enviados: 0 };
  }

  let totalEnviados = 0;
  for (const pessoa of aniversariantes) {
    const telLimpo = String(pessoa.telefone).replace(/\D/g, "");
    const eventoId = `aniversario_${telLimpo}_${anoHoje}`;
    const jaEnviado = buscarLembreteEnviado(eventoId, "aniversario");
    if (jaEnviado) {
      console.log(`[Aniversários] Parabéns já enviado este ano para ${pessoa.nome} (${pessoa.telefone}).`);
      continue;
    }

    const mensagem = montarMensagemAniversario({ nome: pessoa.nome });
    const jid = formatarJidWhatsApp(pessoa.telefone);

    if (client && typeof client.sendMessage === "function") {
      try {
        await client.sendMessage(jid, mensagem);
        console.log(`[Aniversários] Mensagem de parabéns enviada para ${pessoa.nome} (${pessoa.telefone}).`);
        totalEnviados++;
      } catch (errSend) {
        console.error(`[Aniversários] Falha ao enviar parabéns para ${pessoa.telefone}:`, errSend.message);
      }
    } else {
      console.log(`[Aniversários] [Simulação] Parabéns para ${pessoa.telefone}:\n${mensagem}`);
      totalEnviados++;
    }

    registrarLembreteEnviado(eventoId, "aniversario", pessoa.telefone);
  }

  return { processados: membros.length, aniversariantes: aniversariantes.length, enviados: totalEnviados };
}

const REGEX_A_DEFINIR = /\b(a\s*definir|em\s*defini[çc][ãa]o|ser[áa]\s*definid[oa]s?|vai\s*definir|ainda\s*n[ãa]o\s*definid[oa]s?|n[ãa]o\s*definid[oa]s?|indefinid[oa]s?|a\s*confirmar|pendente|ainda\s*vamos?\s*definir)\b/i;

const LABELS_CAMPOS_FORM = {
  tema: "Tema",
  versiculo: "Versículo",
  horario_inicio: "Horário de Início",
  horario_termino: "Horário de Término",
  horario_inicio_termino: "Horário",
  local: "Local",
  preletor: "Preletor(a)",
  louvor: "Equipe de Louvor",
  intercessao: "Intercessão",
  copa: "Copa / Recepção",
  estacionamento: "Estacionamento",
  transmissao: "Transmissão",
  midias: "Mídias / Fotos",
  estilo: "Estilo da Arte",
  cores: "Paleta de Cores",
  paleta: "Paleta de Cores",
  divulgacao: "Canais de Divulgação",
  prazo_imagem: "Prazo para Imagem",
  observacoes: "Observações Gerais",
};

function montarMensagemItensADefinir({ nome = "", evento = "", data = "", itens = [] } = {}) {
  const saudacao = nome ? `Olá, *${nome}*! Tudo bem?` : "Olá! Tudo bem?";
  const dataFormatada = formatarDataBrasil(data);
  const dataStr = dataFormatada ? ` em *${dataFormatada}*` : "";

  let listaItens = "";
  for (const item of itens) {
    listaItens += `• *${item.campo}:* _${item.valor}_\n`;
  }

  return (
    `🔔 *Lembrete de Alinhamento - Faltam 7 dias!*\n\n` +
    `${saudacao}\n\n` +
    `Faltam apenas *7 dias* para a realização do evento *${evento}*${dataStr}!\n\n` +
    `No formulário de agendamento, os seguintes itens haviam ficado marcados como *a definir*:\n` +
    `${listaItens}\n` +
    `Eles já foram definidos? Se sim, você pode atualizar o formulário diretamente comigo respondendo aqui, ou nos enviar as definições para alinharmos tudo certinho!\n\n` +
    `_Seguimos à disposição e em oração pelo seu evento!_ 🙏✨`
  );
}

/**
 * Faltando 7 dias para o evento, verifica se há respostas "a definir" no formulário
 * e envia uma mensagem ao líder perguntando se já foram definidas.
 */
async function processarLembretesItensADefinir({
  client,
  buscarEventos,
  agendasParaLer = [],
  diasAntecedencia = 7,
  dataBase = new Date(),
} = {}) {
  if (!buscarEventos || typeof buscarEventos !== "function") {
    return { processados: 0, enviados: 0 };
  }

  const targetDate = new Date(dataBase);
  targetDate.setDate(targetDate.getDate() + diasAntecedencia);

  const ano = targetDate.getFullYear();
  const mes = String(targetDate.getMonth() + 1).padStart(2, "0");
  const dia = String(targetDate.getDate()).padStart(2, "0");
  const dataAlvoStr = `${ano}-${mes}-${dia}`;

  const inicioDia = new Date(ano, targetDate.getMonth(), targetDate.getDate(), 0, 0, 0).toISOString();
  const fimDia = new Date(ano, targetDate.getMonth(), targetDate.getDate(), 23, 59, 59).toISOString();

  console.log(`[Itens a Definir] Verificando eventos de ${dataAlvoStr} (7 dias)...`);

  let eventos = [];
  try {
    eventos = await buscarEventos(inicioDia, fimDia);
  } catch (err) {
    console.error("[Itens a Definir] Erro ao buscar eventos:", err.message);
    return { processados: 0, enviados: 0, erro: err.message };
  }

  if (!Array.isArray(eventos) || eventos.length === 0) {
    return { processados: 0, enviados: 0 };
  }

  let totalEnviados = 0;
  const tipoLembrete = `7_dias_itens_a_definir`;

  for (const ev of eventos) {
    if (ehEnsaio(ev) || ehReuniao(ev) || ehAtendimentoPastoral(ev)) {
      continue;
    }

    const eventoId = ev.id || `${ev.summary}_${dataAlvoStr}`;
    const jaEnviado = buscarLembreteEnviado(eventoId, tipoLembrete);
    if (jaEnviado) {
      continue;
    }

    const titulo = ev.summary || "Evento";
    const form = obterFormularioEvento(titulo);
    if (!form || !form.payload) {
      continue;
    }

    let payload = {};
    if (typeof form.payload === "string") {
      try {
        payload = JSON.parse(form.payload);
      } catch {}
    } else if (typeof form.payload === "object" && form.payload !== null) {
      payload = form.payload;
    }

    const itensADefinir = [];
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === "string" && REGEX_A_DEFINIR.test(v.trim())) {
        itensADefinir.push({
          campo: LABELS_CAMPOS_FORM[k] || k,
          valor: v.trim(),
        });
      }
    }

    if (itensADefinir.length === 0) {
      continue;
    }

    let telDest = form.solicitanteId;
    let nomeDest = payload.nomeSolicitante || payload.nome_lider || "";

    if (!telDest && ev.description) {
      const matchTel = ev.description.match(/(?:Telefone\s*(?:Solicitante)?|Tel(?:efone)?)\s*:\s*([^\n\r]+)/i);
      if (matchTel) telDest = matchTel[1].trim().replace(/\D/g, "");
      const matchSol = ev.description.match(/Solicitante\s*:\s*([^\n\r]+)/i);
      if (matchSol) nomeDest = matchSol[1].trim();
    }

    if (!telDest) {
      continue;
    }

    const user = obterUsuarioPorTelefone(telDest);
    if (user && user.nome) nomeDest = user.nome;

    const dataEv = ev.start?.dateTime ? ev.start.dateTime.split("T")[0] : (ev.start?.date || dataAlvoStr);
    const mensagem = montarMensagemItensADefinir({
      nome: nomeDest,
      evento: titulo,
      data: dataEv,
      itens: itensADefinir,
    });

    const jid = formatarJidWhatsApp(telDest);
    if (client && typeof client.sendMessage === "function") {
      try {
        await client.sendMessage(jid, mensagem);
        console.log(`[Itens a Definir] Lembrete de 7 dias enviado para ${nomeDest} (${telDest}) sobre "${titulo}".`);
        totalEnviados++;
      } catch (errSend) {
        console.error(`[Itens a Definir] Falha ao enviar lembrete para ${telDest}:`, errSend.message);
      }
    } else {
      console.log(`[Itens a Definir] [Simulação] Envio para ${telDest} sobre "${titulo}":\n${mensagem}`);
      totalEnviados++;
    }

    registrarLembreteEnviado(eventoId, tipoLembrete, telDest);
  }

  return { processados: eventos.length, enviados: totalEnviados };
}

function iniciarAgendadorLembretes({
  client,
  buscarEventos,
  agendasParaLer = [],
  horaExecucao = 8,
} = {}) {
  let executando = false;

  async function checarExecutar() {
    if (executando) return;
    executando = true;
    try {
      // 0. Parabéns aos aniversariantes do dia (diariamente às 08:00)
      await processarAniversariantesDoDia({
        client,
      });

      // 1. Lembretes de itens a definir no formulário (7 dias antes)
      await processarLembretesItensADefinir({
        client,
        buscarEventos,
        agendasParaLer,
        diasAntecedencia: 7,
      });

      // 2. Lembretes de eventos gerais para os líderes (5 dias de antecedência)
      await processarLembretesEventos({
        client,
        buscarEventos,
        agendasParaLer,
        diasAntecedencia: 5,
      });

      // 3. Lembretes de eventos gerais para os líderes (3 dias de antecedência)
      await processarLembretesEventos({
        client,
        buscarEventos,
        agendasParaLer,
        diasAntecedencia: 3,
      });

      // 4. Lembretes de reuniões e atendimentos pastorais (1 dia antes)
      await processarLembretesEventos({
        client,
        buscarEventos,
        agendasParaLer,
        diasAntecedencia: 1,
      });

      // 5. Lembretes de divulgação no grupo MULTIMÍDIAS (5 dias antes)
      await processarLembretesDivulgacaoMultimidia({
        client,
        diasAntecedencia: 5,
      });

      // 6. Lembretes de divulgação no grupo MULTIMÍDIAS (3 dias antes)
      await processarLembretesDivulgacaoMultimidia({
        client,
        diasAntecedencia: 3,
      });

      // 7. Agenda quinzenal para secretárias (toda segunda-feira)
      await processarEnvioAgendaSecretarias({
        client,
        buscarEventos,
        agendasParaLer,
      });
    } catch (err) {
      console.error("[Agendador Lembretes] Erro no processamento:", err);
    } finally {
      executando = false;
    }
  }

  // Executa uma vez após 1 minuto da inicialização
  const timeoutInicial = setTimeout(() => {
    checarExecutar();
  }, 60 * 1000);

  // Executa diariamente no horário configurado (padrão 08:00)
  let ultimoDiaExecutado = null;
  const timer = setInterval(() => {
    const agora = new Date();
    const diaHoje = agora.toISOString().slice(0, 10);
    if (agora.getHours() >= horaExecucao && ultimoDiaExecutado !== diaHoje) {
      ultimoDiaExecutado = diaHoje;
      checarExecutar();
    }
  }, 30 * 60 * 1000);

  return { timer, timeoutInicial, checarExecutar };
}

module.exports = {
  formatarDataBrasil,
  formatarHoraBrasil,
  formatarJidWhatsApp,
  montarMensagemLembrete,
  montarMensagemLembreteMultimidia,
  montarMensagemConfirmacaoAtendimento,
  montarMensagemConfirmacaoReuniao,
  montarMensagemAgendaQuinzenalSecretarias,
  montarMensagemAniversario,
  montarMensagemItensADefinir,
  ehEnsaio,
  ehReuniao,
  ehAtendimentoPastoral,
  buscarLembreteEnviado,
  registrarLembreteEnviado,
  registrarAgendamentoPastoral,
  buscarPastorAgendamento,
  processarLembretesEventos,
  processarLembretesDivulgacaoMultimidia,
  processarEnvioAgendaSecretarias,
  processarAniversariantesDoDia,
  processarLembretesItensADefinir,
  iniciarAgendadorLembretes,
  REGEX_A_DEFINIR,
  LABELS_CAMPOS_FORM,
};
