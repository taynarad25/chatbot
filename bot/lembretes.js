const db = require("../db");
const { REDES } = require("./redes");
const { obterFormularioEvento } = require("./formularioEvento");
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

    // 2. Se não encontrou formulário ou solicitante, tenta descobrir pelos departamentos cadastrados
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
      const msg = montarMensagemLembrete({
        nomeLider: dest.nome,
        evento: titulo,
        data: dataEv,
        horario,
        local,
        departamento: dest.departamento,
        docUrl: dest.docUrl,
        diasRestantes: diasAntecedencia,
      });

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
      await processarLembretesEventos({
        client,
        buscarEventos,
        agendasParaLer,
        diasAntecedencia: 5,
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
  buscarLembreteEnviado,
  registrarLembreteEnviado,
  processarLembretesEventos,
  iniciarAgendadorLembretes,
};
