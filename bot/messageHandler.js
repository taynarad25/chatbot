const moment = require("moment-timezone");
const { agruparEventosAgenda, montarMensagemAgenda, montarDetalheEvento, interpretarPeriodoPersonalizado } = require("./agenda");
const { calcularDisponibilidade, montarMensagemConflito, montarMensagemDatasDisponiveis, verificarDataEspecifica, calcularJanelasLivres, montarMensagemDataEspecificaBloqueada } = require("./disponibilidade");
const { montarListaRedes, obterRedePorNumero, mapearRedeParaAgendaIndex } = require("./redes");
const { notificarSecretaria } = require("./secretaria");
const { montarResourceEvento, montarResourcePatchAlteracao } = require("./agendamentoAutomatico");
const { salvarPendente, buscarPendente, removerPendente, extrairCodigo } = require("./pendentesAprovacao");

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

// Monta a identificação padrão usada nos logs: nome do contato + telefone
// mascarado + papel do usuário (ex: "Taynara Diniz | +55 (11) *****-6727 (Usuário)").
function identificarUsuario(contato, numero, isLider) {
  return `${nomeContato(contato, numero)} | ${mascararTelefone(numero)} (${isLider ? "Líder" : "Usuário"})`;
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
 * @param {() => object[]} [deps.listLideres] - retorna os líderes cadastrados no painel ({ nome, telefone }),
 *   usado para identificar o solicitante nos resumos de evento pelo nome cadastrado (não o nome do contato salvo no celular)
 */
function createMessageHandler({ client, calendar, agendasParaLer, lideres, etapas, buscarEventos, listLideres = () => [] }) {
  // Identifica o solicitante de um evento (criar/alterar/cancelar) pelo nome
  // cadastrado no painel de líderes, já que o nome salvo no celular do líder
  // (nomeContato) pode divergir do nome oficial usado pela secretaria. Sem
  // correspondência (ou nome cadastrado vazio), cai de volta no nome do contato.
  function nomeSolicitante(contato, numero) {
    const numeroDigitos = String(numero).replace(/\D/g, "");
    const lider = listLideres().find((l) => numeroDigitos.includes(l.telefone));
    if (lider && lider.nome && lider.nome.trim()) return lider.nome.trim();
    return nomeContato(contato, numero);
  }

  // Busca, filtra e entrega a listagem de agenda para um período, deixando o
  // fluxo pronto para receber o número de um item na próxima mensagem.
  async function entregarAgenda(numero, info, inicioBusca, fimBusca, tituloPeriodo, msg) {
    try {
      const todosEventosRaw = await buscarEventos(inicioBusca, fimBusca);
      const todosEventos = todosEventosRaw.filter(ev =>
        !(ev.calendarId === agendasParaLer[0] && ev.summary && ev.summary.toLowerCase().includes("sábado livre"))
      );

      if (todosEventos.length === 0) {
        delete etapas[numero];
        return msg.reply(`📅 Não há eventos programados para ${tituloPeriodo}.\n\nDigite *menu* para voltar ao menu principal.`);
      }

      const itens = agruparEventosAgenda(todosEventos);
      info.itensAgenda = itens;
      info.etapa = "detalhe_evento";

      return msg.reply(montarMensagemAgenda(itens, tituloPeriodo));
    } catch (e) {
      console.error(`[ALERTA:google-calendar] Erro ao buscar agenda para ${mascararTelefone(numero)}:`, e);
      delete etapas[numero];
      return msg.reply("⚠️ Erro ao carregar agenda.");
    }
  }

  // Monta e envia o resumo de "novo evento" pro solicitante e o pedido de
  // aprovação pro grupo da secretaria. Compartilhado pelos dois caminhos de
  // busca de data (por dia da semana + horário, ou por data específica).
  async function finalizarNovoAgendamento({ msg, numero, contato, info, dataFinal, isLider }) {
    try {
      const dataFormatada = moment(dataFinal).format("DD/MM");
      const resumo = `✅ *Solicitação de Agendamento*\n\n*Evento:* ${info.nome}\n*Local:* ${info.local}\n*Departamento:* ${info.rede}\n*Data:* ${dataFormatada}\n*Horário:* ${info.horarioInicio} - ${info.horarioFim}\n\nAguarde a confirmação da secretaria!\n\nDigite *menu* para voltar ao menu principal.`;

      const dadosAgendamento = {
        solicitanteId: numero,
        evento: info.nome,
        local: info.local,
        rede: info.rede,
        dia: dataFinal.getDate(),
        mes: dataFinal.getMonth() + 1,
        horarioInicio: info.horarioInicio,
        horarioFim: info.horarioFim,
        isDiaInteiro: info.isDiaInteiro,
      };
      const codigo = salvarPendente(dadosAgendamento);
      const resumoGrupo = `🔔 *NOVO AGENDAMENTO SOLICITADO*\n\n👤 *Solicitante:* ${nomeSolicitante(contato, numero)}\n📅 *Evento:* ${info.nome}\n📍 *Local:* ${info.local}\n🏢 *Depto:* ${info.rede}\n📆 *Data:* ${dataFormatada}\n⏰ *Horário:* ${info.horarioInicio} - ${info.horarioFim}\n\n_Responda a este resumo com "marcar evento" ou "não marcar" para realizar o agendamento automático._\n\n_Código: ${codigo}_`;
      await notificarSecretaria(client, resumoGrupo);

      console.log(`Agendamento solicitado por ${identificarUsuario(contato, numero, isLider)}: ${resumo.replace(/\n/g, ' | ')}`);
      await msg.reply(resumo);
    } catch (e) {
      console.error(`[ALERTA:persistencia] Erro ao registrar solicitação de agendamento para ${identificarUsuario(contato, numero, isLider)}:`, e);
      await msg.reply("⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes.");
    }
  }

  return async function handleMessage(msg) {
    try {
      // Ignora mensagens de status e mensagens enviadas pelo próprio bot
      if (msg.from === 'status@broadcast' || msg.fromMe) {
        return;
      }

      // Lógica para mensagens em grupo (Confirmação da Secretaria)
      if (msg.from.endsWith("@g.us")) {
        const chat = await msg.getChat();
        // Loga toda mensagem de grupo processada aqui, incluindo se é uma resposta
        // (hasQuotedMsg) — sem isso, uma mensagem solta "marcar evento" (sem usar o
        // "Responder" do WhatsApp) ou um grupo com nome diferente do esperado eram
        // ignorados em silêncio, sem deixar rastro nenhum no log pra diagnosticar.
        console.log(`[Grupo] "${chat.name}" | Resposta a outra mensagem: ${msg.hasQuotedMsg} | Texto: "${msg.body}"`);
        if (chat.name === "Mensagens Secretaria" && msg.hasQuotedMsg) {
          const textoMsg = msg.body.toLowerCase().trim();
          if (textoMsg === "marcar evento" || textoMsg === "não marcar") {
            const quotedMsg = await msg.getQuotedMessage();
            // Verifica se a mensagem respondida é o resumo enviado pelo bot
            if (quotedMsg.fromMe) {
              const codigo = extrairCodigo(quotedMsg.body);
              const dados = codigo ? buscarPendente(codigo) : null;
              if (!dados) {
                return msg.reply("❌ Não encontrei essa solicitação (código inválido ou já respondido antes).");
              }

              const { solicitanteId, rede } = dados;

              if (textoMsg === "marcar evento") {
                try {
                  const ano = moment().tz("America/Sao_Paulo").year();
                  const agendaId = agendasParaLer[mapearRedeParaAgendaIndex(rede)];
                  const resource = montarResourceEvento(dados, ano);

                  await calendar.events.insert({ calendarId: agendaId, resource });
                  removerPendente(codigo);

                  const feedback = "✅ *Agendamento Confirmado e Gravado!*\n\nSua solicitação foi aprovada e já consta na agenda oficial. 🙏\n\n📝 *Para mais detalhes do evento, preencha o formulário:* \nhttps://forms.gle/paug7A1kx5eyA2zr6\n\nDigite *menu* para voltar ao menu principal.";
                  await client.sendMessage(solicitanteId, feedback);
                  console.log(`[Secretaria] Agendamento automático realizado para ${mascararTelefone(solicitanteId)}`);
                  return msg.reply(`✅ Evento gravado na agenda de *${rede}* e líder notificado.`);
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
          } else if (textoMsg === "alterar evento" || textoMsg === "não alterar") {
            const quotedMsg = await msg.getQuotedMessage();
            // Verifica se a mensagem respondida é o pedido de alteração enviado pelo bot
            if (quotedMsg.fromMe) {
              const codigo = extrairCodigo(quotedMsg.body);
              const dados = codigo ? buscarPendente(codigo) : null;
              if (!dados) {
                return msg.reply("❌ Não encontrei essa solicitação (código inválido ou já respondido antes).");
              }

              const { solicitanteId, evento } = dados;

              if (textoMsg === "alterar evento") {
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
          } else if (textoMsg === "cancelar evento" || textoMsg === "manter evento") {
            const quotedMsg = await msg.getQuotedMessage();
            // Verifica se a mensagem respondida é o pedido de cancelamento enviado pelo bot
            if (quotedMsg.fromMe) {
              const codigo = extrairCodigo(quotedMsg.body);
              const dados = codigo ? buscarPendente(codigo) : null;
              if (!dados) {
                return msg.reply("❌ Não encontrei essa solicitação (código inválido ou já respondido antes).");
              }

              const { solicitanteId, evento, calendarId, eventId } = dados;

              if (textoMsg === "cancelar evento") {
                try {
                  await calendar.events.delete({ calendarId, eventId });
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
        }
        return; // Ignora outras mensagens em grupos
      }

      const contato = await msg.getContact();
      const numero = contato.id._serialized;
      const texto = msg.body.toLowerCase().trim();
      // Verificação mais flexível para o número de líder
      const isLider = lideres.some(l => numero.includes(l));

      console.log(`[Mensagem Recebida] De: ${identificarUsuario(contato, numero, isLider)} | Texto: "${msg.body}"`);

      const ehSaudacao = SAUDACOES_REGEX.test(texto);

      if (ehSaudacao) {
        delete etapas[numero];
        const menu = isLider
          ? `Olá! 👋
Secretaria da Comunidade Cristã Curados.

Escolha uma opção:

1️⃣ Horário dos cultos
2️⃣ Ver agenda da igreja
3️⃣ Atendimento pastoral
4️⃣ Aulas de música
5️⃣ Falar com a secretaria
6️⃣ Agendar, alterar ou cancelar evento (líderes)
7️⃣ Comunicados e Avisos nos Cultos

Digite *menu* a qualquer momento para voltar ao menu principal.`
          : `Olá! 👋
Secretaria da Comunidade Cristã Curados.

Escolha uma opção:

1️⃣ Horário dos cultos
2️⃣ Ver agenda da igreja
3️⃣ Atendimento pastoral
4️⃣ Aulas de música
5️⃣ Falar com a secretaria

Digite *menu* a qualquer momento para voltar ao menu principal.`;

        return msg.reply(menu);
      }

      if (etapas[numero]) {
        const info = etapas[numero];
        console.log(`[Fluxo Ativo] ${identificarUsuario(contato, numero, isLider)} | Fluxo: ${info.fluxo} | Etapa: ${info.etapa}`);

        if (info.fluxo === "agendamento") {
          // Lógica de agendamento (Opção 6)
          if (info.etapa === "evento_acao") {
            if (msg.body === "1") {
              info.etapa = "evento_nome";
              console.log(`[Fluxo] ${identificarUsuario(contato, numero, isLider)} iniciou novo agendamento.`);
              return msg.reply("📅 *Novo Agendamento*\nQual o nome do evento?");
            } else if (msg.body === "2") {
              info.acaoEvento = "alterar";
              info.etapa = "alterar_departamento";
              console.log(`[Fluxo] ${identificarUsuario(contato, numero, isLider)} iniciou alteração de evento.`);
              return msg.reply(`🏢 De qual departamento é o evento que deseja alterar?\n\n${montarListaRedes()}`);
            } else if (msg.body === "3") {
              info.acaoEvento = "cancelar";
              info.etapa = "alterar_departamento";
              console.log(`[Fluxo] ${identificarUsuario(contato, numero, isLider)} iniciou cancelamento de evento.`);
              return msg.reply(`🏢 De qual departamento é o evento que deseja cancelar?\n\n${montarListaRedes()}`);
            } else {
              return msg.reply("❌ Opção inválida. Digite 1 para Agendar, 2 para Alterar ou 3 para Cancelar.");
            }
          }

          if (info.etapa === "alterar_departamento") {
            const rede = obterRedePorNumero(msg.body);
            if (!rede) return msg.reply("❌ Escolha um departamento da lista (1 a 10).");

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
              const filtrados = await buscarEventos(inicioBusca, fimAno, info.calendarIdBusca);

              if (filtrados.length === 0) {
                delete etapas[numero];
                return msg.reply(`📅 Não encontrei eventos futuros para o departamento ${info.departamento}.`);
              }

              info.eventosEncontrados = filtrados.slice(0, 15); // Limita a 15 para não travar o zap
              info.etapa = "alterar_selecionar_evento";

              const acaoLabel = info.acaoEvento === "cancelar" ? "cancelar" : "alterar";
              let lista = `📋 *Eventos de ${info.departamento}*\nQual você deseja ${acaoLabel}?\n\n`;
              info.eventosEncontrados.forEach((ev, i) => {
                const d = moment.tz(ev.start.dateTime || ev.start.date, "America/Sao_Paulo");
                lista += `${i + 1} - ${d.format("DD/MM")}: ${ev.summary}\n`;
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
              info.etapa = "cancelar_confirmar";
              const d = moment.tz(info.eventoParaAlterar.start.dateTime || info.eventoParaAlterar.start.date, "America/Sao_Paulo");
              return msg.reply(`⚠️ Tem certeza que deseja *cancelar* o evento *${info.eventoParaAlterar.summary}* do dia ${d.format("DD/MM")}?\n\nDigite *SIM* para confirmar, ou *menu* para desistir.`);
            }

            info.etapa = "alterar_o_que";
            return msg.reply(`📝 Você selecionou: *${info.eventoParaAlterar.summary}*\n\nO que você deseja alterar?\n\n1 - Horário\n2 - Data\n3 - Nome do evento\n4 - Local\n5 - Outra alteração (descreva em texto livre)`);
          }

          if (info.etapa === "cancelar_confirmar") {
            if (msg.body.trim().toLowerCase() !== "sim") {
              return msg.reply("❌ Cancelamento não confirmado. Digite *SIM* para confirmar, ou *menu* para desistir.");
            }

            try {
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
              if (eventoEhDiaInteiro) return msg.reply("❌ Esse evento é de dia inteiro (sem horário definido). Escolha *2* para mudar a data, ou *5* para descrever outra alteração.");
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
              info.campoAlterado = "nome";
              info.etapa = "alterar_novo_nome";
              return msg.reply("📝 Qual o novo *nome* do evento?");
            }
            if (opcao === "4") {
              info.campoAlterado = "local";
              info.etapa = "alterar_novo_local";
              return msg.reply("📍 Qual o novo *local*? Digite o endereço, ou apenas *igreja* se for no templo.");
            }
            if (opcao === "5") {
              info.etapa = "alterar_detalhes";
              return msg.reply(`📝 Descreva a alteração que você precisa (Ex: Mudar horário para 20h, alterar data para o dia seguinte, etc):`);
            }
            return msg.reply("❌ Opção inválida. Escolha um número de 1 a 5.");
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
            return msg.reply(`🏢 Qual departamento está organizando?\n\n${montarListaRedes()}`);
          }

          if (info.etapa === "evento_rede") {
            const rede = obterRedePorNumero(msg.body.trim());
            if (!rede) return msg.reply("❌ Escolha um departamento da lista (1 a 10).");

            info.rede = rede.nome;
            console.log(`[Agendamento] Rede selecionada: ${info.rede}`);
            info.etapa = "evento_mes";
            return msg.reply("📅 Para qual *mês* você quer agendar?\nDigite o número (ex: 5 para Maio)");
          }

          if (info.etapa === "evento_mes") {
            const mes = parseInt(msg.body);
            if (isNaN(mes) || mes < 1 || mes > 12) return msg.reply("❌ Mês inválido. Digite um número de 1 a 12.");
            console.log(`[Agendamento] Mês: ${mes}`);
            info.mes = mes;
            info.etapa = "evento_modo_busca";
            return msg.reply("📅 Como você quer escolher a data?\n\n1 - Já tenho uma data específica em mente\n2 - Quero ver as datas disponíveis baseado no dia da semana e horário");
          }

          if (info.etapa === "evento_modo_busca") {
            const opcao = msg.body.trim();
            if (opcao === "1") {
              info.etapa = "evento_dia_especifico";
              return msg.reply(`📅 Qual o dia do mês? (Ex: 25, para o dia 25/${String(info.mes).padStart(2, "0")})`);
            }
            if (opcao === "2") {
              info.etapa = "evento_tipo_dia";
              return msg.reply("📅 Qual o dia da semana desejado?\n\n1 - Segunda-feira\n2 - Terça-feira\n3 - Quarta-feira\n4 - Quinta-feira\n5 - Sexta-feira\n6 - Sábado\n7 - Domingo\n8 - Vários dias / Evento longo");
            }
            return msg.reply("❌ Opção inválida. Digite 1 para escolher uma data específica, ou 2 para ver as datas disponíveis.");
          }

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
              const todosEventos = await buscarEventos(inicioBusca, fimBusca);

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

              return msg.reply(`✅ O dia ${resultado.dataFormatada} está livre!\n\n⏰ *Horários livres nesse dia* (considerando 1h de intervalo antes/depois de outros eventos):\n${listaJanelas}\n\nQual o *horário de início* do seu evento? (Ex: 19:30)\nOu digite *DIA TODO* para eventos de longa duração.`);
            } catch (e) {
              console.error(`[ALERTA:google-calendar] Erro ao verificar data específica para ${identificarUsuario(contato, numero, isLider)}:`, e);
              delete etapas[numero];
              return msg.reply("⚠️ Erro ao acessar a agenda.");
            }
          }

          if (info.etapa === "evento_horario_especifico") {
            const entrada = msg.body.toUpperCase().trim();
            info.horarioInicio = entrada;
            info.isDiaInteiro = entrada.includes("DIA");
            console.log(`[Agendamento] Horário de início (data específica): ${entrada}`);

            if (info.isDiaInteiro) {
              info.horarioFim = "DIA TODO";
              info.etapa = "confirmar_data_especifica";
              // Não retorna aqui, deixa o fluxo cair para a próxima etapa
            } else {
              if (!HORARIO_REGEX.test(info.horarioInicio)) {
                return msg.reply("❌ Formato de horário de início inválido. Use HH:MM (ex: 19:30) ou *DIA TODO*.");
              }
              info.etapa = "evento_horario_fim_especifico";
              return msg.reply("⏰ Qual o *horário de término* do evento? (Ex: 21:00)");
            }
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
              const todosEventos = await buscarEventos(inicioBusca, fimBusca);

              const resultado = verificarDataEspecifica({
                eventos: todosEventos,
                evangelismoCalendarId: agendasParaLer[0],
                ano: info.anoEspecifico, mes: info.mes, dia: info.diaEspecifico,
                rede: info.rede,
                isDiaInteiro: info.isDiaInteiro,
                horarioInicio: info.isDiaInteiro ? undefined : info.horarioInicio,
                horarioFim: info.isDiaInteiro ? undefined : info.horarioFim,
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
            return msg.reply("⏰ Qual o *horário de início* do evento? (Ex: 19:30)\nOu digite *DIA TODO* para eventos de longa duração ou vários dias.");
          }

          if (info.etapa === "evento_horario") {
            const entrada = msg.body.toUpperCase();
            info.horarioInicio = entrada; // Armazena o horário de início
            info.isDiaInteiro = entrada.includes("DIA");
            console.log(`[Agendamento] Horário de início: ${entrada}`);

            if (info.isDiaInteiro) {
              info.horarioFim = "DIA TODO"; // Se for dia inteiro, o fim também é dia todo
              info.etapa = "consultar_disponibilidade"; // Pula para a consulta
              // Não retorna aqui, deixa o fluxo cair para a próxima etapa
            } else {
              // Valida o formato do horário de início
              if (!HORARIO_REGEX.test(info.horarioInicio)) {
                return msg.reply("❌ Formato de horário de início inválido. Por favor, use HH:MM (ex: 19:30) ou *DIA TODO*.");
              }
              info.etapa = "evento_horario_fim";
              return msg.reply("⏰ Qual o *horário de término* do evento? (Ex: 21:00)");
            }
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
            const tempStart = moment.tz("America/Sao_Paulo").set({hour: hInicio, minute: mInicio, second: 0, millisecond: 0});
            const tempEnd = moment.tz("America/Sao_Paulo").set({hour: hFim, minute: mFim, second: 0, millisecond: 0});
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

              const todosEventos = await buscarEventos(inicioBusca, fimBusca);

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
            console.log(`[Pastoral] Nome recebido: ${info.nome} (${mascararTelefone(numero)}). Solicitando disponibilidade.`);
            return msg.reply(`Obrigado, ${info.nome}. 🙏\nAgora, por favor, informe quais os *dias e horários* você tem disponível para o atendimento.`);
          }

          if (info.etapa === "disponibilidade") {
            info.disponibilidade = msg.body;
            console.log(`[Pastoral] Pedido finalizado para ${info.nome} (${mascararTelefone(numero)}). Disponibilidade: ${info.disponibilidade}`);
            await msg.reply(`Perfeito! Sua solicitação de atendimento pastoral foi registrada.\n\n👤 *Nome:* ${info.nome}\n🗓️ *Disponibilidade:* ${info.disponibilidade}\n\nA secretaria entrará em contato em breve para confirmar o agendamento. 🙏\n\nDigite *menu* para voltar ao menu principal.`);
            delete etapas[numero];
            return;
          }
        } else if (info.fluxo === "ver_agenda") {
          // Lógica de consulta de agenda (Opção 2)
          if (info.etapa === "escolha_mes") {
            const escolhaRaw = msg.body.trim();

            if (escolhaRaw === "0") {
              info.etapa = "periodo_personalizado";
              return msg.reply("🗓️ Digite as datas de início e fim que deseja consultar.\n\nExemplo: *10/07 a 20/07*");
            }

            const agora = moment.tz("America/Sao_Paulo");
            const mesAtual = agora.month() + 1;
            const escolha = parseInt(escolhaRaw);

            if (isNaN(escolha) || escolha < mesAtual || escolha > 12) {
              return msg.reply(`❌ Opção inválida. Escolha um mês de ${mesAtual} a 12, ou 0 para um período específico.`);
            }

            const mesNome = MESES[escolha - 1];
            const ano = agora.year();

            // Define o início e fim do mês usando format() para manter o offset -03:00, garantindo que o Google entenda o horário local
            const inicioBusca = moment.tz([ano, escolha - 1], "America/Sao_Paulo").startOf('month').subtract(1, 'minute').format();
            const fimBusca = moment.tz([ano, escolha - 1], "America/Sao_Paulo").endOf('month').format();

            console.log(`[Agenda] Buscando eventos para ${identificarUsuario(contato, numero, isLider)} em ${mesNome}`);
            await msg.reply(`🔍 Consultando eventos de ${mesNome}...`);

            return await entregarAgenda(numero, info, inicioBusca, fimBusca, mesNome, msg);
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
            await msg.reply(`🔍 Consultando eventos de ${tituloPeriodo}...`);

            return await entregarAgenda(numero, info, inicioBusca, fimBusca, tituloPeriodo, msg);
          }

          if (info.etapa === "detalhe_evento") {
            const index = parseInt(msg.body.trim()) - 1;
            const itens = info.itensAgenda || [];

            if (isNaN(index) || !itens[index]) {
              return msg.reply("❌ Número inválido. Digite o número de um dos eventos da lista, ou *menu* para voltar.");
            }

            return msg.reply(montarDetalheEvento(itens[index]));
          }
        }
        return;
      }

      if (texto === "1") {
        console.log(`Opção 1 selecionada por ${identificarUsuario(contato, numero, isLider)}`);
        const mensagemCultos = `✨ *Celebre Conosco!* ✨

Estamos esperando por você e sua família em nossos encontros:

⛪ *Culto de Celebração*
🗓️ Todos os Domingos
⏰ Às *18h*
📍 *Endereço temporário:* Rua Orlando Telles, 225, Cidade Saúde - Itapevi
⚠️ _Nota: Devido à transição para o nosso novo salão, os cultos de domingo à noite temporariamente continuam sendo realizados neste endereço._

🍞 *Santa Ceia*
🗓️ Todo 1º Domingo do Mês
⏰ Às *08h30*
📍 *Local:* Salão Novo (Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi)
⚠️ _Nota: Nossas Santa Ceias já estão sendo realizadas diretamente no salão novo. Lembrando que, neste domingo de Santa Ceia, não temos culto à noite._

📢 *Aviso Importante (Mudança de Salão):*
*A partir de Agosto*, TODOS os nossos cultos (incluindo os cultos de domingo à noite) serão realizados definitivamente em nosso novo endereço:
📍 *Endereço:* Rua Benedicto de Abreu Júnior, 40, Cidade Saúde - Itapevi

Venha viver um tempo precioso na presença de Deus! 🙏🙌

Digite *menu* para voltar ao menu principal.`;
        return msg.reply(mensagemCultos);
      }

      if (texto === "2") {
        console.log(`Opção 2 selecionada por ${identificarUsuario(contato, numero, isLider)}`);
        const hoje = new Date();
        const mesAtual = hoje.getMonth();

        let listaMeses = "📅 *Ver Agenda*\n\nPara qual mês você deseja consultar?\n\n";
        for (let i = mesAtual; i < 12; i++) {
          listaMeses += `${i + 1} - ${MESES[i]}\n`;
        }
        listaMeses += "\n0 - Escolher um período específico";

        etapas[numero] = { fluxo: "ver_agenda", etapa: "escolha_mes" };
        return msg.reply(listaMeses + "\n\nDigite o número do mês desejado, ou 0 para outro período:");
      }

      if (texto === "3") {
        console.log(`Opção 3 selecionada por ${identificarUsuario(contato, numero, isLider)}, iniciando atendimento pastoral`);
        etapas[numero] = { fluxo: "pastoral", etapa: "nome" };
        return msg.reply("🙏 *Atendimento Pastoral*\n\n📝 Qual é o seu *nome*?");
      }

      if (texto === "4") {
        console.log(`Opção 4 selecionada por ${identificarUsuario(contato, numero, isLider)}`);
        return msg.reply(`🎵 *Aulas de Música*\n\nOferecemos: Canto, Teclado, Violão e Guitarra.\n\n*Em breve abriremos novas inscrições!* Fique atento aos avisos.\n\nDigite *menu* para voltar ao menu principal.`);
      }

      if (texto === "5") {
        console.log(`Opção 5 selecionada por ${identificarUsuario(contato, numero, isLider)}`);
        const avisoSecretaria = `📞 *PEDIDO DE ATENDIMENTO*\n\n👤 *Solicitante:* ${nomeContato(contato, numero)}\n\nO usuário solicitou falar com a secretaria.`;
        await notificarSecretaria(client, avisoSecretaria);
        return msg.reply(`📞 *Secretaria*\n\nUm atendente responderá em breve.\nAtendimento: Terça a Sábado, 08h às 18h.\n\nDigite *menu* para voltar ao menu principal.`);
      }

      if (texto === "6" && isLider) {
        console.log(`Opção 6 selecionada por ${identificarUsuario(contato, numero, isLider)}, iniciando agendamento`);
        etapas[numero] = { fluxo: "agendamento", etapa: "evento_acao" };
        return msg.reply("📅 O que você deseja fazer?\n\n1 - Agendar novo evento\n2 - Alterar evento existente\n3 - Cancelar evento existente");
      }

      if (texto === "7" && isLider) {
        console.log(`Opção 7 selecionada por ${identificarUsuario(contato, numero, isLider)}`);
        etapas[numero] = { fluxo: "comunicados", etapa: "texto_comunicado" };
        return msg.reply("📢 *Comunicados e Avisos*\n\nPor favor, digite abaixo o texto do comunicado que você deseja que seja lido ou exibido nos cultos:");
      }

      // Nenhuma opção reconhecida e nenhum fluxo ativo. Se a mensagem for só
      // números, é provavelmente uma tentativa de usar o menu (ex: "9"), então
      // orientamos a digitar *menu*. Já texto livre (ex: "hoje não vou
      // conseguir ir") pode ser parte de uma conversa com a secretaria fora do
      // fluxo do bot, então é melhor não interromper com uma mensagem de erro.
      if (!/^\d+$/.test(texto)) {
        console.log(`[Mensagem ignorada] De: ${identificarUsuario(contato, numero, isLider)} | Texto: "${msg.body}"`);
        return;
      }

      console.log(`[Mensagem não reconhecida] De: ${identificarUsuario(contato, numero, isLider)} | Texto: "${msg.body}"`);
      return msg.reply("❓ Não entendi sua mensagem. Digite *menu* para ver as opções disponíveis.");
    } catch (err) {
      console.error("[ALERTA:fatal] Erro Fatal no Listener de Mensagens:", err);
    }
  };
}

module.exports = { createMessageHandler, nomeContato };
