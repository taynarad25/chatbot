const { Client, LocalAuth } = require("whatsapp-web.js");
const { NOME_GRUPO_SECRETARIA, NOME_GRUPO_PASTORAL, encontrarGrupoSecretaria, encontrarGrupoPastoral } = require("./bot/secretaria");

console.log("Iniciando cliente temporário para descobrir os JIDs dos grupos...");
console.log("⚠️  Aviso: Certifique-se de que o bot principal esteja parado antes de rodar este script para evitar conflitos de sessão!");

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: __dirname
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],
    executablePath: process.env.CHROME_BIN || null
  }
});

client.on("qr", () => {
  console.log("❌ Erro: Sessão não autenticada no local. É necessário que o bot já esteja logado anteriormente.");
  process.exit(1);
});

client.on("ready", async () => {
  console.log("✅ Conectado ao WhatsApp! Buscando chats...");
  try {
    const chats = await client.getChats();
    console.log(`Total de chats carregados: ${chats.length}`);

    // encontrarGrupoSecretaria/encontrarGrupoPastoral já salvam o JID encontrado
    // no banco (mesma lógica usada pelo bot em produção) — só chamar já basta.
    const secretaria = encontrarGrupoSecretaria(chats);
    const pastoral = encontrarGrupoPastoral(chats);

    if (secretaria) console.log(`📌 Encontrado grupo '${secretaria.name}' -> ${secretaria.id._serialized}`);
    else console.log(`⚠️  Grupo '${NOME_GRUPO_SECRETARIA}' não encontrado.`);

    if (pastoral) console.log(`📌 Encontrado grupo '${pastoral.name}' -> ${pastoral.id._serialized}`);
    else console.log(`⚠️  Grupo '${NOME_GRUPO_PASTORAL}' não encontrado.`);

    console.log("✅ Banco (dados.db) atualizado com os JIDs encontrados!");
  } catch (err) {
    console.error("Erro ao processar os chats:", err.message);
  } finally {
    await client.destroy();
    console.log("Conexão temporária encerrada.");
    process.exit(0);
  }
});

client.initialize();
