const db = require("../db");
const { REDES } = require("./redes");
const { obterFormularioEvento } = require("./formularioEvento");
const { notificarMultimidia } = require("./secretaria");
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
  const limpo = String(telefone).replace(/\D/g, "");
  if (!limpo) return "";
  return limpo.endsWith("@c.us") ? limpo : `${limpo}@c.us`;
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

    // 3. Se não encontrou formulário ou solicitante, tenta descobrir pelos departamentos cadastrados
    if (destinatarios.length === 0) {
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
          docUrl: dest.docUrl,
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
      }
      registrarLembreteEnviado(eventoId, tipoLembrete, dest.telefone);
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

function iniciarAgendadorLembretes({
  client,
  buscarEventos,
  agendasParaLer = [],
  horaExecucao = 9,
} = {}) {
  let executando = false;

  async function checarExecutar() {
    if (executando) return;
    executando = true;
    try {
      // 1. Lembretes de eventos gerais para os líderes (5 dias de antecedência)
      await processarLembretesEventos({
        client,
        buscarEventos,
        agendasParaLer,
        diasAntecedencia: 5,
      });

      // 2. Lembretes de eventos gerais para os líderes (3 dias de antecedência)
      await processarLembretesEventos({
        client,
        buscarEventos,
        agendasParaLer,
        diasAntecedencia: 3,
      });

      // 3. Lembretes de reuniões e atendimentos pastorais (1 dia antes)
      await processarLembretesEventos({
        client,
        buscarEventos,
        agendasParaLer,
        diasAntecedencia: 1,
      });

      // 4. Lembretes de divulgação no grupo MULTIMÍDIAS (5 dias antes)
      await processarLembretesDivulgacaoMultimidia({
        client,
        diasAntecedencia: 5,
      });

      // 5. Lembretes de divulgação no grupo MULTIMÍDIAS (3 dias antes)
      await processarLembretesDivulgacaoMultimidia({
        client,
        diasAntecedencia: 3,
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

  // Executa diariamente por volta das 09:00
  let ultimoDiaExecutado = null;
  const timer = setInterval(() => {
    const agora = new Date();
    const diaHoje = agora.toISOString().slice(0, 10);
    if (agora.getHours() === horaExecucao && ultimoDiaExecutado !== diaHoje) {
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
  ehEnsaio,
  ehReuniao,
  ehAtendimentoPastoral,
  buscarLembreteEnviado,
  registrarLembreteEnviado,
  registrarAgendamentoPastoral,
  buscarPastorAgendamento,
  processarLembretesEventos,
  processarLembretesDivulgacaoMultimidia,
  iniciarAgendadorLembretes,
};
