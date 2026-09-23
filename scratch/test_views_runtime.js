const { JSDOM } = require("jsdom");
const { renderIndexHtml } = require("../web/views");

const html = renderIndexHtml();

// Check if HTML has any broken tags
console.log("HTML length:", html.length);

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "http://localhost:3000/secretaria",
  beforeParse(window) {
    window.fetch = async (url) => {
      console.log("[Mock Fetch]", url);
      if (url === '/secretaria/status') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ connected: true, authenticated: true })
        };
      }
      if (url === '/secretaria/api/user-info') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, user: { username: "admin", role: "admin" } })
        };
      }
      if (url === '/the-chosen/api/inscritos') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ inscricoes: [], estatisticas: {} })
        };
      }
      if (url === '/secretaria/api/logs') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, logs: "Log test" })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
  }
});

// Wait a bit for scripts to run
setTimeout(() => {
  const statusEl = dom.window.document.getElementById("status");
  console.log("Status text in DOM:", statusEl ? statusEl.innerHTML : "NOT FOUND");
  const tabAdmin = dom.window.document.getElementById("btn-tab-admin");
  console.log("btn-tab-admin display:", tabAdmin ? tabAdmin.style.display : "NOT FOUND");
  const tabLideres = dom.window.document.getElementById("btn-tab-lideres");
  console.log("btn-tab-lideres display:", tabLideres ? tabLideres.style.display : "NOT FOUND");
  const tabLogs = dom.window.document.getElementById("btn-tab-logs");
  console.log("btn-tab-logs display:", tabLogs ? tabLogs.style.display : "NOT FOUND");
  process.exit(0);
}, 1000);
