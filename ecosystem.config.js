module.exports = {
  apps: [{
    name: "bot",
    script: "./chatbot.js",
    // Monitora mudanças nos arquivos de código para reiniciar automaticamente
    // Removendo 'error_file', 'out_file' e 'merge_logs' para que os logs do aplicativo
    // apareçam no stdout/stderr do Docker, que é capturado por 'docker logs'.
    // O 'chatbot.js' já gerencia a escrita para 'combined.log' diretamente.
    watch: ["chatbot.js", "web.js", ".env"],
    // IGNORAR pastas que mudam constantemente para evitar loops de restart
    ignore_watch: [
      "node_modules",
      ".wwebjs_auth",
      ".wwebjs_cache",
      ".git",
      "*.log"
    ],
    max_restarts: 10,
    restart_delay: 5000, // Aguarda 5 segundos antes de tentar reiniciar após um erro
    log_date_format: "DD-MM-YYYY HH:mm:ss",
    env: {
      NODE_ENV: "production",
      TZ: "America/Sao_Paulo",
    }
  }]
};