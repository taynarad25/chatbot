// =====================================
// IMPORTAÇÕES
// =====================================
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
  keyFile: "credenciais-google.json",
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

const calendar = google.calendar({
  version: "v3",
  auth,
});

const calendarId = "secretariacasaforte.cf@gmail.com";

async function buscarEventos(inicio, fim) {

  const res = await calendar.events.list({
    calendarId: calendarId,
    timeMin: inicio,
    timeMax: fim,
    singleEvents: true,
    orderBy: "startTime",
  });

  return res.data.items;
}

function sabadosDoMes(ano, mes) {

  const sabados = [];
  const data = new Date(ano, mes - 1, 1);

  while (data.getMonth() === mes - 1) {

    if (data.getDay() === 6) {

      sabados.push(new Date(data));

    }

    data.setDate(data.getDate() + 1);
  }

  return sabados;
}

function formatarData(data) {

  return data.toLocaleDateString("pt-BR");

}

// =====================================
// LISTA DE LÍDERES
// =====================================
const lideres = [
    "5511995824388@c.us", // Gabi H 
    "5511970658048@c.us", // Gabi A
    "5511985526434@c.us", // Gisa
    "5511983338655@c.us", // Rosa
    "5511970498716@c.us", // Isa
    "5511946798919@c.us", // Jeferson
    "5511951617993@c.us", // Lari
    "5511997832279@c.us", // Idel
    "5511973419733@c.us", // Fernanda
    "5511944565738@c.us", // Mota
    "5511969536715@c.us", // Cíntia
    "5511957022269@c.us", // Maurício
    "5511942685501@c.us", // Gabi
    // Adicione mais números conforme necessário
];

const etapas = {};

// =====================================
// CLIENTE
// =====================================
const client = new Client({
  authStrategy: new LocalAuth(),
});

// =====================================
// QR CODE
// =====================================
client.on("qr", (qr) => {
  console.log("Escaneie o QR Code:");
  qrcode.generate(qr, { small: true });
});

// =====================================
// CONECTADO
// =====================================
client.on("ready", () => {
  console.log("✅ Bot conectado!");
});

// =====================================
// INICIAR
// =====================================
client.initialize();

// =====================================
// RECEBER MENSAGEM
// =====================================
client.on("message", async (msg) => {
  // Ignora mensagens de grupo
  if (msg.from.endsWith("@g.us")) return;

  // Pega contato e número
  const contato = await msg.getContact();
  const numero = contato.id._serialized;

  console.log("Número real:", numero);

  // Texto da mensagem e verificação de líder
  const texto = msg.body.toLowerCase().trim();
  const isLider = lideres.includes(numero);

  // Busca a etapa do contato
  const etapa = etapas[numero];

  // Se existir etapa, processa as ações relacionadas
  if (etapa) {
    console.log("Etapa atual do usuário:", etapa.etapa);

    if (etapa.etapa === "evento_horario") {
      // Aqui vai o código específico da etapa "evento_horario"
      console.log("Processando evento_horario...");
      // Exemplo: msg.reply("Escolha o horário desejado.");
    }

    // Outras etapas podem ser verificadas da mesma forma
    // else if (etapa.etapa === "outra_etapa") { ... }
  } else {
    // Usuário sem etapa definida: fluxo normal ou mensagem padrão
    console.log("Usuário sem etapa definida. Continuando fluxo normal...");
    // Exemplo: msg.reply("Olá! Como posso te ajudar?");
  }

  // =====================================
  // MENU PRINCIPAL
  // =====================================
  if (/^(menu|oi|olá|ola|bom dia|boa tarde|boa noite|paz)$/i.test(texto)) {
    if (isLider) {
      await client.sendMessage(
        msg.from,
        `Olá! 👋
Secretaria da Comunidade Cristã Casa Forte.

Escolha uma opção:

1️⃣ Horário dos cultos
2️⃣ Ver agenda da igreja
3️⃣ Agendar evento (líderes)
4️⃣ Atendimento pastoral
5️⃣ Aulas de música
6️⃣ Falar com a secretaria

Digite *menu* a qualquer momento para voltar ao menu principal.`
      );
    } else {
      await client.sendMessage(
        msg.from,
        `Olá! 👋
Secretaria da Comunidade Cristã Casa Forte.

Escolha uma opção:

1️⃣ Horário dos cultos
2️⃣ Ver agenda da igreja
4️⃣ Atendimento pastoral
5️⃣ Aulas de música
6️⃣ Falar com a secretaria

Digite *menu* a qualquer momento para voltar ao menu principal.`
      );
    }
    return;
  }

  // =====================================
  // HORÁRIO DOS CULTOS
  // =====================================
if (texto === "1") {

  await client.sendMessage(
    msg.from,
`📅 Horário dos Cultos

Domingo
18h — Culto de Celebração

Primeiro domingo do mês
08h30 — Santa Ceia + Sala de Oração

⚠️ No primeiro domingo não há culto à noite.

Esperamos você!

Digite *menu* para voltar ao menu principal.`

  );

  return;
}

  // =====================================
  // AGENDA DA IGREJA
  // =====================================
  if (texto === "2") {

    const { google } = require("googleapis");
    const calendar = google.calendar("v3");

    const auth = new google.auth.GoogleAuth({
        keyFile: "credenciais-google.json",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    const authClient = await auth.getClient();

    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    const response = await calendar.events.list({
        auth: authClient,
        calendarId: "primary", // ou ID da agenda da igreja
        timeMin: primeiroDia.toISOString(),
        timeMax: ultimoDia.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
    });

    const eventos = response.data.items;

    let mensagem = "📅 *Agenda de Sábados da Igreja*\n\n";

    eventos.forEach(evento => {

        const dataEvento = new Date(evento.start.dateTime || evento.start.date);
        const diaSemana = dataEvento.getDay();

        if (diaSemana === 6) { // 6 = sábado

            const data = dataEvento.toLocaleDateString("pt-BR");

            const hora = evento.start.dateTime
                ? dataEvento.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                : "Horário não definido";

            mensagem += `📌 ${evento.summary}\n📅 ${data}\n⏰ ${hora}\n\n`;
        }

    });

    if (mensagem === "📅 *Agenda de Sábados da Igreja*\n\n") {
        mensagem += "Não há eventos cadastrados para sábado neste mês.";
    }

    msg.reply(mensagem);
}

  // =====================================
// FLUXO DE AGENDAMENTO DE EVENTO
// =====================================

// OPÇÃO 3 - INICIAR
if (msg.body === "3" && lideres.includes(numero)) {

  etapas[numero] = { passo: "evento_nome" };

  await client.sendMessage(
    msg.from,
`📅 *Agendamento de Evento*

Qual o *nome do evento*?`
  );

  return;
}


// RECEBER NOME DO EVENTO
if (etapas[numero]?.passo === "evento_nome") {

  etapas[numero].nome = msg.body;
  etapas[numero].passo = "evento_rede";

  await client.sendMessage(
    msg.from,
`Qual rede está organizando?

Exemplo:
• Jovens
• Mulheres
• Homens`
  );

  return;
}

// RECEBER REDE
if (etapas[numero]?.passo === "evento_rede") {

  etapas[numero].rede = msg.body;
  etapas[numero].passo = "evento_mes";

  await client.sendMessage(
    msg.from,
`📅 Digite o *número do mês* do evento.

Exemplo:
3 para Março
4 para Abril
5 para Maio`
  );

  return;
}

// RECEBER MÊS
if (etapas[numero]?.passo === "evento_mes") {

  const mes = parseInt(msg.body);
  const ano = new Date().getFullYear();

  etapas[numero].mes = mes;
  etapas[numero].ano = ano;
  etapas[numero].passo = "evento_horario";

  await client.sendMessage(
    msg.from,
`⏰ Qual o horário do evento?

Digite por exemplo:
18:00
19:30

O bot verificará quais sábados estão livres nesse horário.`
  );

  return;
}

// RECEBER HORÁRIO

if (etapa?.etapa === "evento_horario") {
    // Validar horário digitado pelo usuário
    const [hora, minuto] = msg.body.split(":").map(Number);
    if (isNaN(hora) || isNaN(minuto)) {
        await msg.reply("O horário digitado é inválido. Digite no formato HH:MM, por exemplo 18:00");
        return;
    }

    etapa.horario = msg.body;

    const ano = new Date().getFullYear();

    // Buscar todos os sábados do mês
    const sabados = sabadosDoMes(ano, etapa.mes);

    // Buscar eventos já existentes
    const inicioMes = new Date(ano, etapa.mes - 1, 1);
    const fimMes = new Date(ano, etapa.mes, 0);
    const eventos = await buscarEventos(inicioMes.toISOString(), fimMes.toISOString());

    const sabadosDisponiveis = [];

    for (let sabado of sabados) {
        const inicioEvento = new Date(sabado);
        inicioEvento.setHours(hora);
        inicioEvento.setMinutes(minuto);

        const fimEvento = new Date(inicioEvento);
        fimEvento.setHours(fimEvento.getHours() + 3); // duração padrão

        let ocupado = eventos.some(evento => {
            const inicioGoogle = new Date(evento.start.dateTime || evento.start.date);
            const fimGoogle = new Date(evento.end.dateTime || evento.end.date);
            return inicioEvento < fimGoogle && fimEvento > inicioGoogle;
        });

        if (!ocupado) {
            sabadosDisponiveis.push(sabado);
        }
    }

    if (sabadosDisponiveis.length === 0) {
        await msg.reply("Não encontramos sábados disponíveis nesse horário neste mês.");
        delete etapas[numero];
        return;
    }

    etapa.datas = sabadosDisponiveis;
    etapa.etapa = "evento_data";

    // Montar resposta para o usuário
    let resposta = "Sábados disponíveis:\n\n";
    sabadosDisponiveis.forEach((d, i) => {
        resposta += `${i + 1} - ${d.getDate()}/${d.getMonth() + 1}\n`;
    });

    await msg.reply(resposta);
}

// =====================================
// ESCOLHA DA DATA
// =====================================

if (etapa?.etapa === "evento_data") {
    const escolha = parseInt(msg.body) - 1;

    if (isNaN(escolha) || !etapa.datas[escolha]) {
        await msg.reply("Escolha uma das opções enviadas.");
        return;
    }

    const dataEscolhida = etapa.datas[escolha];

    const resumo = `📅 Solicitação de Evento

Evento: ${etapa.nome}
Rede: ${etapa.rede}
Data solicitada: ${dataEscolhida.getDate()}/${dataEscolhida.getMonth() + 1}
Horário: ${etapa.horario}

✅ Solicitação registrada!

A secretaria da igreja irá verificar a agenda e confirmar a data o mais breve possível.`;

    await msg.reply(resumo);

    // Finaliza o fluxo e limpa etapa
    delete etapas[numero];
}

// =====================================
// ATENDIMENTO PASTORAL
// =====================================

// INICIAR ATENDIMENTO
if (texto === "4") {

  etapas[msg.from] = { passo: "nome" };

  await client.sendMessage(
    msg.from,
`🙏 *Atendimento Pastoral*

Se você deseja conversar ou receber oração, teremos alegria em ajudar.

Para começarmos:

📝 Qual é o seu *nome*?

Digite *menu* para voltar ao menu principal.`
  );

  return;
}

// RECEBER NOME
if (etapas[msg.from]?.passo === "nome") {

  etapas[msg.from].nome = msg.body;
  etapas[msg.from].passo = "horario";

  await client.sendMessage(
    msg.from,
`Obrigado, *${msg.body}*! 🙏

Agora nos diga:

⏰ *Quais horários você tem disponibilidade para que um dos pastores entre em contato com você?*

Exemplo:
• Manhã
• Tarde
• Noite

Digite *menu* para voltar ao menu principal.`
  );

  return;
}

// RECEBER HORÁRIO
if (etapas[msg.from]?.passo === "horario") {

  const nome = etapas[msg.from].nome;
  const horario = msg.body;

  await client.sendMessage(
    msg.from,
`🙏 *Pedido de atendimento recebido!*

📌 Nome: ${nome}
⏰ Disponibilidade: ${horario}

Nossa equipe pastoral entrará em contato com você em breve.

Deus abençoe!`
  );

  delete etapas[msg.from];

  return;
}

  // =====================================
  // AULAS DE MÚSICA
  // =====================================
  if (texto === "5") {

    await client.sendMessage(
      msg.from,
`🎵 Aulas de Música

Oferecemos aulas de:

🎤 Canto
🎹 Teclado
🎸 Violão
🎸 Guitarra

Para mais informações sobre horários e inscrição, digite "MÚSICA".`
    );

    return;
  }

  // =====================================
  // SECRETARIA
  // =====================================
  if (texto === "6") {

    await client.sendMessage(
      msg.from,
`📞 Secretaria

Um atendente responderá sua mensagem em breve.

Horário de atendimento:
Terça a Sábado
🕗 08h às 18h`
    );

    return;
  }

});