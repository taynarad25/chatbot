#!/usr/bin/env node
/**
 * SIMULADOR INTERATIVO DO BOT NO TERMINAL
 * 
 * Permite testar as conversas do bot em tempo real sem precisar abrir o WhatsApp,
 * simulando diferentes perfis: Pastor, Diretor, Líder (com múltiplos departamentos) e Membro,
 * além de disparar e visualizar o lembrete automático de 5 dias antes de eventos.
 * 
 * Uso: node simular.js
 */

const readline = require("readline");
const { createMessageHandler } = require("./bot/messageHandler");
const { listLideres, addLider, obterUsuarioPorTelefone } = require("./web/lideres");
const { processarLembretesEventos } = require("./bot/lembretes");
const { salvarFormularioEvento } = require("./bot/formularioEvento");

// Configuração de agendas fictícias para simulação
const AGENDAS_SIMULACAO = [
  "cal-evangelismo",
  "cal-epifania",
  "cal-intercessao",
  "cal-outros",
  "cal-seeds",
  "cal-ruach",
  "cal-casais",
  "cal-homens",
  "cal-mulheres",
  "cal-kids",
  "cal-eventos-externos",
  "cal-ceia",
  "cal-ebd",
  "cal-oracao",
  "cal-reunioes",
  "cal-uso-salao",
];

// Perfis pré-definidos para teste rápido
const PERFIS = {
  1: {
    nome: "Pr. Roberto",
    telefone: "5511977770001",
    cargos: ["pastor", "lider"],
    departamentos: ["Projeto Social Seeds"],
    descricao: "Pastor (possui cargo 'lider' no Seeds, mas deve ver apenas Área Pastoral 8️⃣)",
  },
  2: {
    nome: "Dir. Carlos",
    telefone: "5511977770002",
    cargos: ["diretor", "lider"],
    departamentos: ["Rede de Homens"],
    descricao: "Diretor (possui cargo 'lider' nos Homens, mas deve ver apenas Área da Direção 9️⃣)",
  },
  3: {
    nome: "Líder Sara",
    telefone: "5511977770003",
    cargos: ["lider"],
    departamentos: ["Epifania", "Rede Kids"],
    descricao: "Líder de Múltiplos Departamentos (Epifania e Kids - vê Área do Líder 7️⃣)",
  },
  4: {
    nome: "Membro Lucas",
    telefone: "5511977770004",
    cargos: ["membro"],
    departamentos: [],
    descricao: "Membro comum (vê apenas opções normais 1 a 6)",
  },
};

// Garante que os perfis de teste existem no banco
for (const p of Object.values(PERFIS)) {
  const usuario = obterUsuarioPorTelefone(p.telefone);
  if (!usuario.nome) {
    addLider({
      nome: p.nome,
      telefone: p.telefone,
      cargos: p.cargos,
      departamentos: p.departamentos,
    });
  }
}

// Memória do bot em tempo de execução
const etapas = {};
let eventosMemoria = [];

const fakeClient = {
  sendMessage: async (to, texto) => {
    console.log(`\n📨 [WhatsApp Enviado para ${to}]:`);
    console.log("----------------------------------------");
    console.log(texto);
    console.log("----------------------------------------\n");
  },
};

const fakeCalendar = {
  events: {
    insert: async ({ resource }) => {
      eventosMemoria.push(resource);
      return { data: { id: `ev-${Date.now()}`, ...resource } };
    },
    list: async () => ({ data: { items: eventosMemoria } }),
  },
};

const handleMessage = createMessageHandler({
  client: fakeClient,
  calendar: fakeCalendar,
  agendasParaLer: AGENDAS_SIMULACAO,
  lideres: [],
  etapas,
  buscarEventos: async () => eventosMemoria,
  listLideres: () => listLideres(),
  enviarWebhookExterno: async () => ({
    ok: true,
    url: "https://docs.google.com/document/d/exemplo-simulado/edit",
  }),
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function printHeader() {
  console.clear();
  console.log("===============================================================");
  console.log("   🤖 SIMULADOR INTERATIVO DO BOT DE WHATSAPP DA IGREJA   ");
  console.log("===============================================================");
  console.log("Escolha um perfil para testar as mensagens:");
  console.log("1. ⛪ Pastor (Pr. Roberto) -> Testa Área Pastoral [8]");
  console.log("2. 🏛️ Diretor (Dir. Carlos) -> Testa Área da Direção [9]");
  console.log("3. 👥 Líder Multi-Depto (Sara: Epifania + Kids) -> Testa [7]");
  console.log("4. 👤 Membro Comum (Lucas) -> Menus 1 a 6");
  console.log("5. 🔔 Testar Disparo de Lembrete de 5 dias (com link Google Docs)");
  console.log("0. ❌ Sair");
  console.log("===============================================================");
}

function iniciarChat(perfil) {
  console.clear();
  console.log("===============================================================");
  console.log(`👤 Você está conversando como: ${perfil.nome}`);
  console.log(`📱 Telefone: ${perfil.telefone}`);
  console.log(`🎖️ Cargos: [${perfil.cargos.join(", ")}]`);
  console.log(`🏢 Departamentos: [${perfil.departamentos.join(", ") || "Nenhum"}]`);
  console.log(`💡 ${perfil.descricao}`);
  console.log("---------------------------------------------------------------");
  console.log("Comandos úteis: digite 'oi' ou 'menu' para iniciar.");
  console.log("Digite 'trocar' para mudar de perfil ou 'sair' para encerrar.");
  console.log("===============================================================\n");

  const numeroJid = `${perfil.telefone}@c.us`;

  function perguntar() {
    rl.question(`💬 Você (${perfil.nome}) > `, async (texto) => {
      const comando = texto.trim().toLowerCase();
      if (comando === "sair") {
        rl.close();
        return;
      }
      if (comando === "trocar") {
        menuPrincipal();
        return;
      }
      if (!texto.trim()) {
        perguntar();
        return;
      }

      const msg = {
        from: numeroJid,
        fromMe: false,
        body: texto,
        id: { _serialized: `msg-${Date.now()}` },
        getContact: async () => ({
          id: { _serialized: numeroJid },
          pushname: perfil.nome,
          name: perfil.nome,
        }),
        reply: async (resposta) => {
          console.log(`\n🤖 Bot:\n${resposta}\n`);
          return resposta;
        },
      };

      try {
        await handleMessage(msg);
      } catch (err) {
        console.error("Erro ao processar mensagem:", err);
      }

      perguntar();
    });
  }

  perguntar();
}

async function simularLembrete5Dias() {
  console.clear();
  console.log("===============================================================");
  console.log("   🔔 SIMULAÇÃO DO LEMBRETE AUTOMÁTICO DE EVENTOS (5 DIAS)     ");
  console.log("===============================================================");

  // Data base de simulação: hoje
  const dataHoje = new Date();
  const dataEvento = new Date(dataHoje);
  dataEvento.setDate(dataEvento.getDate() + 5);

  const ano = dataEvento.getFullYear();
  const mes = String(dataEvento.getMonth() + 1).padStart(2, "0");
  const dia = String(dataEvento.getDate()).padStart(2, "0");
  const dataEventoStr = `${ano}-${mes}-${dia}`;
  const dataEventoBR = `${dia}/${mes}/${ano}`;

  console.log(`Simulando um evento agendado para: ${dataEventoBR} (daqui a 5 dias)`);
  console.log("Nome do Evento: 'Acampamento Jovem Epifania'");
  console.log("Departamento: 'Epifania'");
  console.log("Responsável cadastrado: Líder Sara (+55 11 97777-0003)");
  console.log("---------------------------------------------------------------");

  // Salva formulário com docUrl no banco SQLite
  salvarFormularioEvento({
    evento: "Acampamento Jovem Epifania",
    departamento: "Epifania",
    data: dataEventoBR,
    solicitanteId: "5511977770003",
    payload: { nomeSolicitante: "Líder Sara" },
    docUrl: "https://docs.google.com/document/d/exemplo-acampamento-epifania/edit",
  });

  const eventosFalsos = [
    {
      id: `ev-epifania-${Date.now()}`,
      summary: "Acampamento Jovem Epifania",
      start: { dateTime: `${dataEventoStr}T19:00:00-03:00` },
      location: "Sítio Vale da Bênção",
      calendarId: "cal-epifania",
    },
  ];

  console.log("Executando rotina diária de verificação de lembretes...\n");
  const resultado = await processarLembretesEventos({
    client: fakeClient,
    buscarEventos: async () => eventosFalsos,
    agendasParaLer: AGENDAS_SIMULACAO,
    diasAntecedencia: 5,
    dataBase: dataHoje,
  });

  console.log(`✅ Concluído! Total de eventos processados: ${resultado.processados}, lembretes enviados: ${resultado.enviados}`);
  console.log("\nPressione ENTER para voltar ao menu principal...");
  rl.question("", () => {
    menuPrincipal();
  });
}

function menuPrincipal() {
  printHeader();
  rl.question("Opção: ", (opt) => {
    const opcao = opt.trim();
    if (opcao === "0") {
      console.log("Até mais!");
      rl.close();
      return;
    }
    if (PERFIS[opcao]) {
      iniciarChat(PERFIS[opcao]);
      return;
    }
    if (opcao === "5") {
      simularLembrete5Dias();
      return;
    }
    console.log("Opção inválida.");
    setTimeout(menuPrincipal, 1000);
  });
}

menuPrincipal();
