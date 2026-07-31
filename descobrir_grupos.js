const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");

const NOME_GRUPO_SECRETARIA = "Mensagens Secretaria";
const NOME_GRUPO_PASTORAL = "Atendimento Pastoral";
const CACHE_FILE = path.join(__dirname, "grupo_ids.json");

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

    const cache = {};
    if (fs.existsSync(CACHE_FILE)) {
      try {
        const raw = fs.readFileSync(CACHE_FILE, "utf8");
        Object.assign(cache, raw.trim() ? JSON.parse(raw) : {});
      } catch (e) {}
    }

    const secTarget = NOME_GRUPO_SECRETARIA.trim().toLowerCase();
    const pasTarget = NOME_GRUPO_PASTORAL.trim().toLowerCase();

    for (const chat of chats) {
      if (chat.isGroup && chat.name) {
        const nameLower = chat.name.trim().toLowerCase();
        if (nameLower.includes(secTarget)) {
          cache[secTarget] = chat.id._serialized;
          console.log(`📌 Encontrado grupo '${chat.name}' -> ${chat.id._serialized}`);
        } else if (nameLower.includes(pasTarget)) {
          cache[pasTarget] = chat.id._serialized;
          console.log(`📌 Encontrado grupo '${chat.name}' -> ${chat.id._serialized}`);
        }
      }
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
    console.log("✅ Arquivo grupo_ids.json atualizado com sucesso com os JIDs encontrados!");
  } catch (err) {
    console.error("Erro ao processar os chats:", err.message);
  } finally {
    await client.destroy();
    console.log("Conexão temporária encerrada.");
    process.exit(0);
  }
});

client.initialize();
