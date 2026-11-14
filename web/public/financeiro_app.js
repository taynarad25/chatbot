(function () {
  "use strict";

  const state = {
    user: null,
    tab: "dashboard",
    filters: {
      periodo: "mes",
      inicio: "",
      fim: "",
      conta_id: "",
      categoria_id: "",
      ministerio: "",
    },
    dashboard: null,
    contas: [],
    cartoes: [],
    viewMode: "table",
    categorias: [],
    ministerios: [],
    lancamentos: [],
    conferencias: [],
    fechamentos: [],
    usuarios: [],
    auditoria: [],
    prestacaoHistorico: [],
    prestacaoMesFiltro: "",
    prestacaoResumo: null,
    loginStep: "login", // login | primeiro_acesso | 2fa | recuperar
    loginPhone: "",
    loginPass: "",
    cedulas: {
      "200": 0, "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "2": 0,
      "1": 0, "0.50": 0, "0.25": 0, "0.10": 0, "0.05": 0,
    },
  };

  const ROLE_LABELS = {
    admin_financeiro: "Administrador Financeiro",
    tesouraria: "Tesouraria",
    lideranca: "Pastor / Liderança",
    lider_ministerio: "Líder de Ministério",
    auditoria: "Auditoria / Consulta",
  };

  const FORMAS_PAGAMENTO = [
    "Dinheiro",
    "PIX",
    "Transferência bancária",
    "Cartão de débito",
    "Cartão de crédito",
    "Boleto",
    "Depósito",
    "Outros",
  ];

  function fmtMoney(v) {
    const n = Number(v || 0) / 100;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function fmtDate(iso) {
    if (!iso) return "-";
    const s = String(iso).slice(0, 10);
    const p = s.split("-");
    if (p.length !== 3) return iso;
    return `${p[2]}/${p[1]}/${p[0]}`;
  }

  function fmtDateTime(iso) {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    } catch (_) {
      return iso;
    }
  }

  const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  function getPeriodoMesAtual() {
    if (state.filters.periodo && /^\d{4}-\d{2}$/.test(state.filters.periodo)) {
      return state.filters.periodo;
    }
    if (state.filters.periodo === "mes_anterior") {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 7);
    }
    return todayISO().slice(0, 7);
  }

  function formatarMesNome(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || "Mês Atual";
    const [y, m] = ym.split("-").map(Number);
    return `${NOMES_MESES[m - 1]} de ${y}`;
  }

  function alterarMesFiltro(delta) {
    const ym = getPeriodoMesAtual();
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const nextYm = d.toISOString().slice(0, 7);
    state.filters.periodo = nextYm;
    state.filters.inicio = "";
    state.filters.fim = "";
  }

  function renderMonthNavigator() {
    const ym = getPeriodoMesAtual();
    const ind = state.dashboard ? state.dashboard.indicadores : null;
    const saldo = ind ? ind.saldo_total : 0;
    const resultado = ind ? ind.resultado_mes : 0;
    const inicial = ind ? (saldo - resultado) : 0;
    const previsto = ind ? ind.previsao_saldo_futuro : 0;

    return `
      <div class="fin-month-nav-container no-print">
        <div class="fin-month-nav-bar">
          <button type="button" class="fin-month-nav-arrow" data-action="prev-month" title="Mês anterior">‹</button>
          <div class="fin-month-nav-label">
            <span class="fin-month-nav-title">${formatarMesNome(ym)}</span>
          </div>
          <button type="button" class="fin-month-nav-arrow" data-action="next-month" title="Próximo mês">›</button>
        </div>
        <div class="fin-month-nav-badges">
          <div class="fin-month-badge">
            <span class="fin-mb-label">🔘 Inicial</span>
            <span class="fin-mb-val">${fmtMoney(inicial)}</span>
          </div>
          <div class="fin-month-badge fin-mb-active">
            <span class="fin-mb-label">🔘 Saldo Atual</span>
            <span class="fin-mb-val">${fmtMoney(saldo)}</span>
          </div>
          <div class="fin-month-badge fin-mb-previsto">
            <span class="fin-mb-label">🔘 Previsto no Mês</span>
            <span class="fin-mb-val">${fmtMoney(previsto)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function fmtDetalhesAuditoria(acao, rawJson) {
    if (!rawJson) return "-";
    let d = null;
    try {
      d = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
    } catch (_) {
      return esc(String(rawJson));
    }
    if (!d || typeof d !== "object") return esc(String(rawJson));

    if (acao === "solicitacao_prestacao_contas") {
      const canalStr = d.canal === "whatsapp" ? "💬 WhatsApp Bot" : "💻 Sistema Web";
      const tel = d.telefone ? ` (${d.telefone})` : "";
      return `Solicitado via ${canalStr} por <strong>${esc(d.solicitante || "Liderança")}</strong>${esc(tel)}`;
    }
    if (acao === "cancelar_lancamento") {
      const mot = d.motivo ? ` Motivo: "${esc(d.motivo)}"` : "";
      const desc = d.antes && d.antes.descricao ? ` • Lançamento: ${esc(d.antes.descricao)}` : "";
      return `Cancelamento registrado.${desc}${mot}`;
    }
    if (acao === "login") {
      return d["2fa"] ? "Login com 2FA verificado" : "Login autenticado com sucesso";
    }
    if (acao === "quitar_lancamento") {
      return "Conta quitada com comprovante/baixa";
    }
    const parts = [];
    for (const [k, v] of Object.entries(d)) {
      if (v == null || v === "") continue;
      if (typeof v === "object") continue;
      parts.push(`${k}: ${v}`);
    }
    return parts.length ? esc(parts.join(" • ")) : esc(JSON.stringify(d));
  }

  function todayISO() {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    const res = await fetch("/controlefinanceiro/api" + path, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !opts.allowError) {
      const err = new Error(data.erro || "Erro na requisição");
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function canEdit() {
    return state.user && ["admin_financeiro", "tesouraria"].includes(state.user.papel);
  }

  function isAdmin() {
    return state.user && state.user.papel === "admin_financeiro";
  }

  // ==================== LOGIN SCREEN ====================
  function renderLogin() {
    const root = document.getElementById("app");
    if (!root) return;

    let formHtml = "";
    if (state.loginStep === "login") {
      formHtml = `
        <form id="fin-login-form">
          <div class="fin-field" style="margin-bottom:0.9rem">
            <label>Seu WhatsApp (com DDD)</label>
            <input type="text" class="fin-input" id="login-usuario" placeholder="Ex: 11 95161-7993" value="${esc(state.loginPhone)}" required />
          </div>
          <div class="fin-field" style="margin-bottom:1rem">
            <label>Senha Individual</label>
            <input type="password" class="fin-input" id="login-senha" placeholder="Digite sua senha (ou deixe em branco no 1º acesso)" />
          </div>
          <button type="submit" class="fin-btn fin-btn-primary" style="width:100%;padding:0.75rem">Entrar no Controle Financeiro</button>
          <div style="display:flex;justify-content:space-between;margin-top:0.9rem;font-size:0.8rem">
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="go-primeiro-acesso">🔑 Primeiro Acesso / Criar Senha</button>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="go-recuperar">Esqueci a senha</button>
          </div>
        </form>
      `;
    } else if (state.loginStep === "primeiro_acesso") {
      formHtml = `
        <div class="fin-alert fin-alert-info">
          <strong>Primeiro Acesso / Nova Senha:</strong> Crie sua senha individual pessoal (mínimo de 6 caracteres).
        </div>
        <form id="fin-first-form">
          <div class="fin-field" style="margin-bottom:0.85rem">
            <label>Seu WhatsApp Autorizado</label>
            <input type="text" class="fin-input" id="first-usuario" value="${esc(state.loginPhone)}" placeholder="Ex: 11 95161-7993" required />
          </div>
          <div class="fin-field" style="margin-bottom:0.85rem">
            <label>Criar Senha Pessoal (mín. 6 caracteres)</label>
            <input type="password" class="fin-input" id="first-senha" required minlength="6" />
          </div>
          <div class="fin-field" style="margin-bottom:1rem">
            <label>Confirmar Senha</label>
            <input type="password" class="fin-input" id="first-confirma" required minlength="6" />
          </div>
          <button type="submit" class="fin-btn fin-btn-success" style="width:100%;padding:0.75rem">Salvar Senha e Acessar</button>
          <button type="button" class="fin-btn fin-btn-outline" style="width:100%;margin-top:0.5rem" data-action="go-login">Voltar ao Login</button>
        </form>
      `;
    } else if (state.loginStep === "2fa") {
      formHtml = `
        <div class="fin-alert fin-alert-warning">
          <strong>Verificação em 2 Etapas (2FA):</strong> Digite o código de 6 dígitos do seu aplicativo autenticador.
        </div>
        <form id="fin-2fa-form">
          <div class="fin-field" style="margin-bottom:1rem">
            <label>Código 2FA (6 dígitos)</label>
            <input type="text" class="fin-input" id="login-2fa-code" placeholder="000000" maxlength="6" required />
          </div>
          <button type="submit" class="fin-btn fin-btn-primary" style="width:100%;padding:0.75rem">Confirmar Código</button>
          <button type="button" class="fin-btn fin-btn-outline" style="width:100%;margin-top:0.5rem" data-action="go-login">Voltar</button>
        </form>
      `;
    } else if (state.loginStep === "recuperar") {
      formHtml = `
        <div class="fin-alert fin-alert-warning">
          <strong>Recuperação Segura de Senha:</strong><br/>
          Por segurança, a redefinição de senha exige liberação de um Administrador Financeiro (Tesouraria Principal). Solicite a liberação de redefinição e depois clique em <em>Primeiro Acesso / Criar Senha</em>.
        </div>
        <button type="button" class="fin-btn fin-btn-primary" style="width:100%" data-action="go-login">Voltar ao Login</button>
      `;
    }

    root.innerHTML = `
      <div class="fin-auth-wrapper">
        <div class="fin-auth-card">
          <div class="fin-auth-header">
            <div style="width:56px;height:56px;border-radius:14px;background:#f3e8ff;color:#6d28d9;display:inline-flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:800">💎</div>
            <h1>Controle Financeiro</h1>
            <p>Comunidade Cristã Curados • Acesso Restrito e Auditado</p>
          </div>
          <div id="login-msg"></div>
          ${formHtml}
        </div>
      </div>
    `;
  }

  function showLoginAlert(msg, type = "danger") {
    const el = document.getElementById("login-msg");
    if (el) el.innerHTML = `<div class="fin-alert fin-alert-${type}">${esc(msg)}</div>`;
  }

  // ==================== MAIN APP SHELL ====================
  async function loadAllData() {
    const q = new URLSearchParams(state.filters).toString();
    const [dash, contasRes, lancRes, confRes, fechRes, cartoesRes] = await Promise.all([
      api("/dashboard?" + q),
      api("/contas"),
      api("/lancamentos?" + q),
      api("/conferencias"),
      api("/fechamentos"),
      api("/cartoes").catch(() => ({ cartoes: [] })),
    ]);
    state.dashboard = dash;
    state.contas = dash.contas || contasRes.contas || [];
    state.cartoes = dash.cartoes || cartoesRes.cartoes || cartoesRes.itens || [];
    state.categorias = dash.categorias || [];
    state.ministerios = dash.ministerios || [];
    state.lancamentos = lancRes.lancamentos || [];
    state.conferencias = confRes.conferencias || [];
    state.fechamentos = fechRes.fechamentos || [];

    if (isAdmin()) {
      const [uRes, aRes] = await Promise.all([api("/usuarios"), api("/auditoria")]);
      state.usuarios = uRes.usuarios || [];
      state.auditoria = aRes.auditoria || [];
    } else if (["tesouraria", "lideranca", "auditoria"].includes(state.user.papel)) {
      const aRes = await api("/auditoria").catch(() => ({ auditoria: [] }));
      state.auditoria = aRes.auditoria || [];
    }

    const [histRes, prestRes] = await Promise.all([
      api("/prestacao-contas/historico" + (state.prestacaoMesFiltro ? `?mes=${state.prestacaoMesFiltro}` : "")).catch(() => ({ logs: [] })),
      api("/prestacao-contas?registrar_auditoria=0").catch(() => null),
    ]);
    state.prestacaoHistorico = histRes.logs || [];
    if (prestRes) state.prestacaoResumo = prestRes;
  }

  function renderApp() {
    const root = document.getElementById("app");
    if (!root || !state.user) return;

    const tabs = [
      { id: "dashboard", label: "📊 Painel Principal" },
      { id: "contas", label: "🏦 Contas e Saldos" },
      { id: "caixa", label: "💵 Caixa Físico" },
      { id: "entradas", label: "📥 Entradas" },
      { id: "dizimos", label: "🙌 Dízimos, Ofertas & Culto" },
      { id: "saidas", label: "📤 Saídas & Contas a Pagar" },
      { id: "relatorios", label: "📊 Relatórios Financeiros" },
      { id: "prestacao", label: "📋 Prestação de Contas" },
      { id: "config", label: "⚙️ Categorias, Segurança & Auditoria" },
    ];

    const activeTabObj = tabs.find((t) => t.id === state.tab) || tabs[0];
    const [activeIcon, ...activeNameParts] = activeTabObj.label.split(" ");
    const activeName = activeNameParts.join(" ");

    root.innerHTML = `
      <header class="fin-topbar">
        <div class="fin-brand">
          <div class="fin-brand-logo"><img src="/logo.png" alt="Logo" /></div>
          <div>
            <div class="fin-brand-title">Comunidade Cristã Curados</div>
            <div class="fin-brand-subtitle">Sistema de Controle Financeiro</div>
          </div>
        </div>

        <!-- Seletor Suspenso do Menu Mobile no Topo (Cara de App) -->
        <div class="fin-mobile-menu-box mobile-only">
          <button type="button" class="fin-mobile-menu-btn" data-action="toggle-mobile-dropdown">
            <span class="fin-mobile-menu-icon">${activeIcon}</span>
            <span class="fin-mobile-menu-text">${activeName}</span>
            <span class="fin-mobile-menu-caret">▾</span>
          </button>
        </div>

        <div class="fin-user-bar desktop-only">
          <div class="fin-user-info">
            <div class="fin-user-name">${esc(state.user.nome)}</div>
            <span class="fin-user-role">${esc(ROLE_LABELS[state.user.papel] || state.user.papel)}</span>
          </div>
          <a href="/gestao" class="fin-btn fin-btn-outline fin-btn-sm" style="background:rgba(255,255,255,0.1);color:#fff;border-color:rgba(255,255,255,0.2)">📅 Portal de Gestão</a>
          <button type="button" class="fin-btn fin-btn-danger fin-btn-sm" data-action="logout">Sair</button>
        </div>
      </header>

      <!-- Backdrop e Menu Suspenso Mobile Flutuante -->
      <div id="fin-mobile-backdrop" class="fin-mobile-backdrop" style="display:none" data-action="close-mobile-dropdown"></div>
      <div id="fin-mobile-dropdown" class="fin-mobile-dropdown" style="display:none">
        <div class="fin-mobile-dropdown-header">
          <div class="fin-mobile-dropdown-user">👤 <b>${esc(state.user.nome)}</b> · <span class="fin-user-role" style="font-size:0.65rem">${esc(ROLE_LABELS[state.user.papel] || state.user.papel)}</span></div>
          <button type="button" class="fin-mobile-dropdown-close" data-action="close-mobile-dropdown" aria-label="Fechar menu">✕</button>
        </div>
        <div class="fin-mobile-dropdown-items">
          ${tabs
            .map(
              (t) => `
            <button type="button" class="fin-mobile-dropdown-item ${state.tab === t.id ? "active" : ""}" data-action="switch-tab" data-tab="${t.id}">
              <span class="fin-mobile-dropdown-label">${t.label}</span>
              ${state.tab === t.id ? '<span class="fin-mobile-dropdown-check">✓</span>' : ""}
            </button>`
            )
            .join("")}
        </div>
        <div class="fin-mobile-dropdown-actions">
          <a href="/gestao" class="fin-btn fin-btn-outline fin-btn-sm" style="flex:1;text-align:center" data-action="close-mobile-dropdown">📅 Gestão</a>
          <button type="button" class="fin-btn fin-btn-danger fin-btn-sm" data-action="logout" style="flex:1">Sair</button>
        </div>
      </div>

      <nav class="fin-nav desktop-only">
        ${tabs
          .map(
            (t) => `
          <button type="button" class="fin-nav-btn ${state.tab === t.id ? "active" : ""}" data-action="switch-tab" data-tab="${t.id}">
            ${t.label}
          </button>`
          )
          .join("")}
      </nav>

      <main class="fin-container">
        ${renderShortcutsBar()}
        ${renderMonthNavigator()}
        ${renderFiltersBar()}
        <div id="fin-tab-content">${renderActiveTab()}</div>
      </main>
      <div id="fin-modal-root"></div>
    `;
  }

  function renderShortcutsBar() {
    if (!canEdit()) return "";
    return `
      <div class="fin-shortcuts no-print">
        <button type="button" class="fin-btn fin-btn-success fin-btn-sm" data-action="open-lancamento" data-tipo="entrada">➕ Nova Entrada</button>
        <button type="button" class="fin-btn fin-btn-danger fin-btn-sm" data-action="open-lancamento" data-tipo="saida">➖ Nova Despesa</button>
        <button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="open-lancamento" data-tipo="saida" data-status="efetivado">💳 Registrar Pagamento</button>
        <button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="open-lancamento" data-tipo="entrada" data-status="efetivado">💰 Registrar Recebimento</button>
        <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="open-lancamento" data-tipo="transferencia">🔄 Transferir entre Contas</button>
        <button type="button" class="fin-btn fin-btn-warning fin-btn-sm" data-action="open-lancamento" data-tipo="saida" data-status="pendente">📅 Nova Conta a Pagar</button>
        <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="open-fechamento-culto">⛪ Fechar Arrecadação do Culto</button>
        <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="switch-tab" data-tab="caixa">💵 Consultar Caixa</button>
        <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="switch-tab" data-tab="relatorios">📊 Gerar Relatório</button>
      </div>
    `;
  }

  function renderFiltersBar() {
    const f = state.filters;
    return `
      <div class="fin-filters no-print">
        <div class="fin-filter-group">
          <label>Período</label>
          <select class="fin-select" id="flt-periodo">
            ${/^\d{4}-\d{2}$/.test(f.periodo) ? `<option value="${f.periodo}" selected>📅 ${formatarMesNome(f.periodo)}</option>` : ""}
            <option value="hoje" ${f.periodo === "hoje" ? "selected" : ""}>Hoje</option>
            <option value="semana" ${f.periodo === "semana" ? "selected" : ""}>Esta Semana</option>
            <option value="mes" ${f.periodo === "mes" ? "selected" : ""}>Este Mês</option>
            <option value="mes_anterior" ${f.periodo === "mes_anterior" ? "selected" : ""}>Mês Anterior</option>
            <option value="proximo_mes" ${f.periodo === "proximo_mes" ? "selected" : ""}>Próximo Mês</option>
            <option value="ano" ${f.periodo === "ano" ? "selected" : ""}>Este Ano</option>
            <option value="personalizado" ${f.periodo === "personalizado" ? "selected" : ""}>Período Personalizado</option>
          </select>
        </div>
        ${
          f.periodo === "personalizado"
            ? `
          <div class="fin-filter-group">
            <label>Data Inicial</label>
            <input type="date" class="fin-input" id="flt-inicio" value="${esc(f.inicio)}" />
          </div>
          <div class="fin-filter-group">
            <label>Data Final</label>
            <input type="date" class="fin-input" id="flt-fim" value="${esc(f.fim)}" />
          </div>`
            : ""
        }
        <div class="fin-filter-group">
          <label>Conta Financeira</label>
          <select class="fin-select" id="flt-conta">
            <option value="">Todas as contas</option>
            ${state.contas
              .map(
                (c) =>
                  `<option value="${c.id}" ${String(f.conta_id) === String(c.id) ? "selected" : ""}>${esc(c.nome)}</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="fin-filter-group">
          <label>Categoria</label>
          <select class="fin-select" id="flt-categoria">
            <option value="">Todas as categorias</option>
            ${state.categorias
              .map(
                (c) =>
                  `<option value="${c.id}" ${String(f.categoria_id) === String(c.id) ? "selected" : ""}>${esc(c.nome)} (${c.tipo})</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="fin-filter-group">
          <label>Ministério / Projeto</label>
          <select class="fin-select" id="flt-ministerio">
            <option value="">Todos os ministérios</option>
            ${state.ministerios
              .map(
                (m) =>
                  `<option value="${esc(m)}" ${f.ministerio === m ? "selected" : ""}>${esc(m)}</option>`
              )
              .join("")}
          </select>
        </div>
        <button type="button" class="fin-btn fin-btn-primary" data-action="apply-filters">Filtrar</button>
      </div>
    `;
  }

  function renderActiveTab() {
    switch (state.tab) {
      case "dashboard":
        return renderDashboardTab();
      case "contas":
        return renderContasTab();
      case "caixa":
        return renderCaixaTab();
      case "entradas":
        return renderLancamentosTab("entrada");
      case "dizimos":
        return renderDizimosTab();
      case "saidas":
        return renderLancamentosTab("saida");
      case "relatorios":
        return renderRelatoriosTab();
      case "prestacao":
        return renderPrestacaoTab();
      case "config":
        return renderConfigTab();
      default:
        return renderDashboardTab();
    }
  }

  // ==================== 1. DASHBOARD ====================
  function renderDashboardTab() {
    if (!state.dashboard) return `<div class="fin-card">Carregando indicadores...</div>`;
    const ind = state.dashboard.indicadores;
    const graf = state.dashboard.graficos;
    const totalBancos = (ind.saldo_contas_bancarias || []).reduce((s, c) => s + c.saldo_atual, 0);
    const qtdBancos = (ind.saldo_contas_bancarias || []).length;
    const isSuperavit = ind.resultado_mes >= 0;
    const temVencidas = ind.contas_vencidas > 0;

    const renderBarGroup = (obj, color) => {
      const entries = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
      if (!entries.length) return `<div style="color:var(--fin-muted);font-size:0.84rem">Sem dados no período selecionado.</div>`;
      const max = Math.max(...entries.map((e) => e[1]), 1);
      return `<div class="fin-bar-list">
        ${entries
          .slice(0, 7)
          .map(
            ([k, v]) => `
          <div class="fin-bar-row">
            <div class="fin-bar-meta"><span>${esc(k)}</span><span>${fmtMoney(v)}</span></div>
            <div class="fin-bar-track"><div class="fin-bar-fill" style="width:${Math.round((v / max) * 100)}%;background:${color}"></div></div>
          </div>`
          )
          .join("")}
      </div>`;
    };

    const maxEv = Math.max(
      ...graf.evolucao_mensal.map((m) => Math.max(m.entradas, m.saidas, Math.abs(m.saldo))),
      1
    );

    return `
      <!-- CARD EXECUTIVO MOBILE 3-EM-1 (EXCLUSIVO CELULAR) -->
      <div class="fin-mobile-hero mobile-only">
        <div class="fin-mhero-top">
          <div class="fin-mhero-label">
            <span>🏦 Saldo Geral da Igreja</span>
            <span style="font-size:0.68rem;background:#f3e8ff;color:#6d28d9;padding:1px 6px;border-radius:999px;font-weight:700">Consolidado</span>
          </div>
          <div class="fin-mhero-main-val">${fmtMoney(ind.saldo_total)}</div>
        </div>
        <div class="fin-mhero-bottom">
          <div class="fin-mhero-col">
            <span class="fin-mhero-sublabel">💎 Disponível Livre</span>
            <span class="fin-mhero-subval" style="color:#059669">${fmtMoney(ind.total_disponivel)}</span>
          </div>
          <div class="fin-mhero-divider"></div>
          <div class="fin-mhero-col">
            <span class="fin-mhero-sublabel">📈 Resultado do Mês</span>
            <span class="fin-mhero-subval" style="color:${isSuperavit ? "#16a34a" : "#dc2626"}">
              ${fmtMoney(ind.resultado_mes)} <small style="font-size:0.75rem">${isSuperavit ? "✅" : "⚠️"}</small>
            </span>
          </div>
        </div>
      </div>

      <!-- DESTAQUES PRINCIPAIS (HERO KPIS - DESKTOP / NOTEBOOK) -->
      <div class="fin-hero-grid desktop-only">
        <div class="fin-hero-card hero-saldo">
          <div class="fin-hero-header">
            <span class="fin-hero-title">Saldo Financeiro Total</span>
            <span class="fin-hero-icon">🏦</span>
          </div>
          <div class="fin-hero-value">${fmtMoney(ind.saldo_total)}</div>
          <div class="fin-hero-sub">Soma real de todas as contas ativas da igreja</div>
        </div>

        <div class="fin-hero-card hero-disponivel">
          <div class="fin-hero-header">
            <span class="fin-hero-title">Total Disponível Livre</span>
            <span class="fin-hero-icon">💎</span>
          </div>
          <div class="fin-hero-value" style="color:#059669">${fmtMoney(ind.total_disponivel)}</div>
          <div class="fin-hero-sub">Valor livre para utilização (descontando reservas)</div>
        </div>

        <div class="fin-hero-card ${isSuperavit ? "hero-resultado-pos" : "hero-resultado-neg"}">
          <div class="fin-hero-header">
            <span class="fin-hero-title">Resultado do Período</span>
            <span class="fin-hero-icon">${isSuperavit ? "📈" : "📉"}</span>
          </div>
          <div class="fin-hero-value" style="color:${isSuperavit ? "#16a34a" : "#dc2626"}">${fmtMoney(ind.resultado_mes)}</div>
          <div class="fin-hero-sub">
            <strong style="color:${isSuperavit ? "#16a34a" : "#dc2626"}">${isSuperavit ? "Superávit ✅" : "Déficit ⚠️"}</strong>
            <span>• Entradas menos Saídas do período</span>
          </div>
        </div>
      </div>

      <!-- SELETOR RÁPIDO DE BLOCOS (EXCLUSIVO CELULAR) -->
      <div class="fin-dash-pills mobile-only no-print">
        <button type="button" class="fin-pill-btn active" data-action="filter-dash-block" data-target="all">Todos</button>
        <button type="button" class="fin-pill-btn" data-action="filter-dash-block" data-target="cartoes">💳 Cartões</button>
        <button type="button" class="fin-pill-btn" data-action="filter-dash-block" data-target="saldos">🏦 Saldos</button>
        <button type="button" class="fin-pill-btn" data-action="filter-dash-block" data-target="movimento">⚖️ Movimentação</button>
        <button type="button" class="fin-pill-btn" data-action="filter-dash-block" data-target="dizimos">🙌 Dízimos/Ofertas</button>
        <button type="button" class="fin-pill-btn" data-action="filter-dash-block" data-target="contas">⚠️ Contas a Pagar</button>
      </div>

      <!-- BLOCO: CARTÕES DE CRÉDITO -->
      <section class="fin-dash-section fin-sec-cartoes">
        <div class="fin-dash-section-header">
          <div class="fin-dash-section-title">
            <span class="badge-icon">💳</span>
            <span>Cartões de Crédito</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem">
            <span class="fin-dash-section-sub">Limite total, utilizado e disponível para compras</span>
            ${canEdit() ? `<button type="button" class="fin-btn fin-btn-primary fin-btn-xs" data-action="open-novo-cartao">➕ Novo Cartão</button>` : ""}
          </div>
        </div>

        ${!state.cartoes.length ? `
          <div class="fin-card" style="padding:1.25rem;text-align:center;color:var(--fin-muted)">
            <p style="margin-bottom:0.6rem">Nenhum cartão de crédito cadastrado ainda.</p>
            ${canEdit() ? `<button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="open-novo-cartao">💳 Cadastrar Cartão de Crédito</button>` : ""}
          </div>
        ` : `
          <div class="fin-cartoes-grid">
            ${state.cartoes.map(card => {
              const percUsado = card.limite_total > 0 ? Math.min(100, Math.round((card.limite_usado / card.limite_total) * 100)) : 0;
              return `
                <div class="fin-credit-card-item" style="border-top: 4px solid ${esc(card.cor || "#6366f1")}">
                  <div class="fin-cc-top">
                    <div>
                      <div class="fin-cc-name">${esc(card.nome)}</div>
                      <div class="fin-cc-inst">${esc(card.instituicao || "Banco")} • ${esc(card.bandeira || "Cartão")}</div>
                    </div>
                    ${canEdit() ? `<button type="button" class="fin-btn fin-btn-outline fin-btn-xs" data-action="open-edit-cartao" data-id="${card.id}">Editar</button>` : ""}
                  </div>
                  <div class="fin-cc-limit-row">
                    <div>
                      <span class="fin-cc-lbl">Limite Disponível</span>
                      <div class="fin-cc-val-disp" style="color:#059669">${fmtMoney(card.limite_disponivel)}</div>
                    </div>
                    <div style="text-align:right">
                      <span class="fin-cc-lbl">Limite Total</span>
                      <div class="fin-cc-val-total">${fmtMoney(card.limite_total)}</div>
                    </div>
                  </div>
                  <div class="fin-cc-bar-track">
                    <div class="fin-cc-bar-fill" style="width:${percUsado}%;background:${percUsado > 80 ? "#dc2626" : (card.cor || "#6366f1")}"></div>
                  </div>
                  <div class="fin-cc-meta">
                    <span>Limite Usado: <strong>${fmtMoney(card.limite_usado)}</strong></span>
                    <span>Fecha dia <strong>${card.dia_fechamento}</strong> • Vence dia <strong>${card.dia_vencimento}</strong></span>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </section>

      <!-- BLOCO 1: LOCALIZAÇÃO DOS SALDOS & LIQUIDEZ -->
      <section class="fin-dash-section fin-sec-saldos">
        <div class="fin-dash-section-header">
          <div class="fin-dash-section-title">
            <span class="badge-icon">🏦</span>
            <span>Contas & Saldos por Local</span>
          </div>
          <span class="fin-dash-section-sub">Onde o recurso da igreja está armazenado no momento e projeção</span>
        </div>
        <div class="fin-dash-grid">
          <div class="fin-stat-card stat-success">
            <div class="fin-stat-label">💵 Caixa Físico (Espécie)</div>
            <div class="fin-stat-value">${fmtMoney(ind.dinheiro_caixa_fisico)}</div>
            <div class="fin-stat-sub">Dinheiro em mãos na igreja</div>
          </div>
          <div class="fin-stat-card stat-primary">
            <div class="fin-stat-label">🏦 Saldos Bancários</div>
            <div class="fin-stat-value">${fmtMoney(totalBancos)}</div>
            <div class="fin-stat-sub">${qtdBancos} conta(s) bancária(s) ativa(s)</div>
          </div>
          <div class="fin-stat-card stat-warning">
            <div class="fin-stat-label">🛡️ Valores Reservados</div>
            <div class="fin-stat-value">${fmtMoney(ind.total_reservado)}</div>
            <div class="fin-stat-sub">Fundos e projetos com carimbo</div>
          </div>
          <div class="fin-stat-card" style="border: 2px solid #8b5cf6">
            <div class="fin-stat-label">🔮 Esperado Próximo Mês</div>
            <div class="fin-stat-value" style="color:#6d28d9">${fmtMoney(ind.saldo_previsto_proximo_mes || ind.previsao_saldo_futuro)}</div>
            <div class="fin-stat-sub">${state.dashboard.proximo_mes ? state.dashboard.proximo_mes.nome : "Próximo Mês"} (Projeção)</div>
          </div>
        </div>

        <!-- CARDS INDIVIDUAIS DE CADA CONTA COM VALOR ESPERADO -->
        <div class="fin-contas-cards-grid">
          ${state.contas.map(c => `
            <div class="fin-conta-summary-card">
              <div class="fin-cs-header">
                <div>
                  <div class="fin-cs-name">${esc(c.nome)}</div>
                  <div class="fin-cs-sub">${esc(c.tipo)} ${c.instituicao ? `• ${esc(c.instituicao)}` : ""}</div>
                </div>
                <span class="fin-cs-badge" style="background:${c.saldo_atual >= 0 ? "#dcfce7" : "#fee2e2"};color:${c.saldo_atual >= 0 ? "#15803d" : "#b91c1c"}">
                  ${fmtMoney(c.saldo_atual)}
                </span>
              </div>
              <div class="fin-cs-body">
                <div class="fin-cs-row">
                  <span>Saldo Previsto no Mês:</span>
                  <strong>${fmtMoney(c.saldo_projetado)}</strong>
                </div>
                <div class="fin-cs-row" style="background:#f8fafc;padding:0.4rem;border-radius:6px;border:1px dashed #cbd5e1">
                  <span style="color:#4c1d95;font-weight:600">🔮 Esperado Próximo Mês:</span>
                  <strong style="color:#4c1d95">${fmtMoney(c.saldo_previsto_proximo_mes)}</strong>
                </div>
                <div class="fin-cs-micro-details">
                  <span style="color:var(--fin-success)">+ Previsto: ${fmtMoney(c.entradas_esperadas_proximo_mes || 0)}</span>
                  <span style="color:var(--fin-danger)">- Previsto: ${fmtMoney(c.saidas_esperadas_proximo_mes || 0)}</span>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      </section>

      <!-- BLOCO 2: ENTRADAS VS SAÍDAS DO PERÍODO -->
      <section class="fin-dash-section fin-sec-movimento">
        <div class="fin-dash-section-header">
          <div class="fin-dash-section-title">
            <span class="badge-icon">⚖️</span>
            <span>Movimentação do Período (${fmtDate(state.dashboard.periodo.inicio)} a ${fmtDate(state.dashboard.periodo.fim)})</span>
          </div>
          <span class="fin-dash-section-sub">Entradas arrecadadas vs despesas efetivadas</span>
        </div>
        <div class="fin-dash-grid">
          <div class="fin-stat-card stat-success">
            <div class="fin-stat-label">📥 Entradas Efetivadas</div>
            <div class="fin-stat-value">${fmtMoney(ind.entradas_mes)}</div>
            <div class="fin-stat-sub">Receitas confirmadas no período</div>
          </div>
          <div class="fin-stat-card stat-danger">
            <div class="fin-stat-label">📤 Saídas Efetivadas</div>
            <div class="fin-stat-value">${fmtMoney(ind.saidas_mes)}</div>
            <div class="fin-stat-sub">Despesas pagas no período</div>
          </div>
          <div class="fin-stat-card stat-warning">
            <div class="fin-stat-label">🏢 Despesas Fixas / Estruturais</div>
            <div class="fin-stat-value">${fmtMoney(ind.despesas_fixas_mensais)}</div>
            <div class="fin-stat-sub">Aluguel, água, energia, internet e sustento</div>
          </div>
          <div class="fin-stat-card">
            <div class="fin-stat-label">🎪 Despesas Variáveis</div>
            <div class="fin-stat-value">${fmtMoney(ind.despesas_variaveis)}</div>
            <div class="fin-stat-sub">Ministérios, eventos e pontuais</div>
          </div>
        </div>
      </section>

      <!-- BLOCO 3: ARRECADAÇÃO (DÍZIMOS & OFERTAS) -->
      <section class="fin-dash-section fin-sec-dizimos">
        <div class="fin-dash-section-header">
          <div class="fin-dash-section-title">
            <span class="badge-icon">🙌</span>
            <span>Arrecadação & Contribuições</span>
          </div>
          <span class="fin-dash-section-sub">Dízimos, ofertas dos cultos e outras receitas</span>
        </div>
        <div class="fin-dash-grid">
          <div class="fin-stat-card stat-success">
            <div class="fin-stat-label">🙏 Dízimos Recebidos</div>
            <div class="fin-stat-value">${fmtMoney(ind.dizimos_mes)}</div>
            <div class="fin-stat-sub">No período selecionado</div>
          </div>
          <div class="fin-stat-card stat-success">
            <div class="fin-stat-label">🎁 Ofertas Recebidas</div>
            <div class="fin-stat-value">${fmtMoney(ind.ofertas_mes)}</div>
            <div class="fin-stat-sub">Gerais, missões e Santa Ceia</div>
          </div>
          <div class="fin-stat-card">
            <div class="fin-stat-label">📦 Outras Contribuições</div>
            <div class="fin-stat-value">${fmtMoney(ind.outras_contribuicoes)}</div>
            <div class="fin-stat-sub">Cantina, eventos, doações e inscrições</div>
          </div>
          <div class="fin-stat-card stat-primary">
            <div class="fin-stat-label">🧾 Lançamentos Recentes</div>
            <div class="fin-stat-value">${state.dashboard.movimentacoes_recentes.length}</div>
            <div class="fin-stat-sub">Últimos registros computados</div>
          </div>
        </div>
      </section>

      <!-- BLOCO 4: CONTAS A PAGAR & COMPROMISSOS FUTUROS -->
      <section class="fin-dash-section fin-sec-contas">
        <div class="fin-dash-section-header">
          <div class="fin-dash-section-title">
            <span class="badge-icon">⚠️</span>
            <span>Compromissos Financeiros & Contas a Pagar</span>
          </div>
          <span class="fin-dash-section-sub">Controle de vencimentos e obrigações da igreja</span>
        </div>
        <div class="fin-dash-grid">
          <div class="fin-stat-card stat-warning">
            <div class="fin-stat-label">📋 Contas a Pagar (Abertas)</div>
            <div class="fin-stat-value">${fmtMoney(ind.contas_a_pagar)}</div>
            <div class="fin-stat-sub">Total pendente de quitação</div>
          </div>
          <div class="fin-stat-card ${temVencidas ? "stat-alert-urgent" : "stat-success"}">
            <div class="fin-stat-label">${temVencidas ? "🚨 Contas Vencidas" : "✅ Contas Vencidas"}</div>
            <div class="fin-stat-value">${fmtMoney(ind.contas_vencidas)}</div>
            <div class="fin-stat-sub">${temVencidas ? ind.qtd_vencidas + " conta(s) - Atenção urgente!" : "Nenhuma conta vencida!"}</div>
          </div>
          <div class="fin-stat-card stat-warning">
            <div class="fin-stat-label">⏳ Vencendo em até 7 dias</div>
            <div class="fin-stat-value">${fmtMoney(ind.contas_vencer_7d)}</div>
            <div class="fin-stat-sub">Atenção no curto prazo</div>
          </div>
          <div class="fin-stat-card">
            <div class="fin-stat-label">📅 Vencendo em até 30 dias</div>
            <div class="fin-stat-value">${fmtMoney(ind.contas_vencer_30d)}</div>
            <div class="fin-stat-sub">Planejamento do mês</div>
          </div>
          <div class="fin-stat-card stat-primary">
            <div class="fin-stat-label">💰 Valores a Receber</div>
            <div class="fin-stat-value">${fmtMoney(ind.valores_a_receber)}</div>
            <div class="fin-stat-sub">Entradas pendentes cadastradas</div>
          </div>
        </div>
      </section>

      <div class="fin-charts-grid">
        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title">📈 Entradas vs Saídas (Período)</span></div>
          ${renderBarGroup({ Entradas: graf.entradas_vs_saidas.entradas, Saídas: graf.entradas_vs_saidas.saidas }, "#6d28d9")}
        </div>

        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title">🛡️ Comprometido vs Disponível</span></div>
          ${renderBarGroup(
            {
              "Disponível Livre": graf.comprometido_vs_disponivel.disponivel,
              "Reservado (Fundos/Projetos)": graf.comprometido_vs_disponivel.reservado,
              "Comprometido (Contas a Pagar)": graf.comprometido_vs_disponivel.comprometido,
            },
            "#2563eb"
          )}
        </div>

        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title">📥 Entradas por Categoria</span></div>
          ${renderBarGroup(graf.entradas_por_categoria, "#16a34a")}
        </div>

        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title">📤 Despesas por Categoria</span></div>
          ${renderBarGroup(graf.despesas_por_categoria, "#dc2626")}
        </div>

        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title">🏦 Distribuição de Recursos por Conta</span></div>
          ${renderBarGroup(
            Object.fromEntries(graf.distribuicao_por_conta.map((c) => [c.nome, Math.max(0, c.valor)])),
            "#4f46e5"
          )}
        </div>

        <div class="fin-card">
          <div class="fin-card-header"><span class="fin-card-title">📅 Evolução Mensal & Comparação entre Meses</span></div>
          <div class="fin-table-wrap">
            <table class="fin-table">
              <thead>
                <tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Resultado</th><th>Saldo Acum.</th></tr>
              </thead>
              <tbody>
                ${graf.evolucao_mensal
                  .map(
                    (m) => `
                  <tr>
                    <td><strong>${esc(m.mes)}</strong></td>
                    <td style="color:var(--fin-success)">${fmtMoney(m.entradas)}</td>
                    <td style="color:var(--fin-danger)">${fmtMoney(m.saidas)}</td>
                    <td><strong>${fmtMoney(m.resultado)}</strong></td>
                    <td>${fmtMoney(m.saldo)}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="fin-card">
        <div class="fin-card-header">
          <span class="fin-card-title">🕒 20. Movimentações Recentes</span>
        </div>
        ${renderLancamentosTable(state.dashboard.movimentacoes_recentes)}
      </div>
    `;
  }

  // ==================== 2. CONTAS E SALDOS ====================
  function renderContasTab() {
    return `
      <div class="fin-card">
        <div class="fin-card-header">
          <div>
            <span class="fin-card-title">🏦 Contas Financeiras e Saldos</span>
            <p style="font-size:0.8rem;color:var(--fin-muted)">O saldo atual é calculado automaticamente (Saldo Inicial + Entradas Efetivadas - Saídas Efetivadas). Ajustes só ocorrem por lançamento auditável.</p>
          </div>
          <div style="display:flex;gap:0.5rem">
            ${canEdit() ? `<button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="open-nova-conta">➕ Nova Conta</button>` : ""}
            ${isAdmin() ? `<button type="button" class="fin-btn fin-btn-warning fin-btn-sm" data-action="open-lancamento" data-tipo="ajuste">⚖️ Lançar Ajuste de Saldo</button>` : ""}
          </div>
        </div>
        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Conta</th>
                <th>Tipo / Instituição</th>
                <th>Saldo Inicial</th>
                <th>Total Entradas</th>
                <th>Total Saídas</th>
                <th>Saldo Real Atual</th>
                <th>Reservado</th>
                <th>Disponível Livre</th>
                <th>Saldo Projetado</th>
                <th>Esperado Próx. Mês</th>
                <th>Status</th>
                ${canEdit() ? `<th>Ações</th>` : ""}
              </tr>
            </thead>
            <tbody>
              ${state.contas
                .map(
                  (c) => `
                <tr>
                  <td>#${c.id}</td>
                  <td><strong>${esc(c.nome)}</strong><br/><small style="color:var(--fin-muted)">${esc(c.descricao || "")}</small></td>
                  <td>${esc(c.tipo)} ${c.instituicao ? `• ${esc(c.instituicao)}` : ""}</td>
                  <td>${fmtMoney(c.saldo_inicial)}<br/><small style="color:var(--fin-muted)">${fmtDate(c.data_saldo_inicial)}</small></td>
                  <td style="color:var(--fin-success)">+${fmtMoney(c.total_entradas)}</td>
                  <td style="color:var(--fin-danger)">-${fmtMoney(c.total_saidas)}</td>
                  <td><strong style="font-size:0.95rem">${fmtMoney(c.saldo_atual)}</strong></td>
                  <td><span class="fin-badge badge-warning">${fmtMoney(c.valor_reservado)}</span></td>
                  <td><strong style="color:var(--fin-success)">${fmtMoney(c.saldo_disponivel)}</strong></td>
                  <td>${fmtMoney(c.saldo_projetado)}</td>
                  <td><strong style="color:#6d28d9">${fmtMoney(c.saldo_previsto_proximo_mes)}</strong></td>
                  <td>${c.ativa ? `<span class="fin-badge badge-success">Ativa</span>` : `<span class="fin-badge badge-muted">Inativa</span>`}</td>
                  ${
                    canEdit()
                      ? `<td><button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="open-edit-conta" data-id="${c.id}">Editar</button></td>`
                      : ""
                  }
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="fin-card" style="margin-top:1.5rem">
        <div class="fin-card-header">
          <div>
            <span class="fin-card-title">💳 Cartões de Crédito</span>
            <p style="font-size:0.8rem;color:var(--fin-muted)">Gerenciamento de cartões, limites disponíveis, faturas e controle de datas de fechamento e vencimento.</p>
          </div>
          ${canEdit() ? `<button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="open-novo-cartao">➕ Novo Cartão</button>` : ""}
        </div>
        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead>
              <tr>
                <th>Cartão</th>
                <th>Instituição / Bandeira</th>
                <th>Limite Total</th>
                <th>Limite Usado</th>
                <th>Limite Disponível</th>
                <th>Fechamento</th>
                <th>Vencimento</th>
                <th>Conta de Pagamento</th>
                ${canEdit() ? `<th>Ações</th>` : ""}
              </tr>
            </thead>
            <tbody>
              ${!state.cartoes.length ? `<tr><td colspan="9" style="text-align:center;color:var(--fin-muted);padding:1.5rem">Nenhum cartão cadastrado.</td></tr>` :
                state.cartoes.map(card => `
                  <tr>
                    <td>
                      <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${esc(card.cor || "#6366f1")};margin-right:6px"></span>
                      <strong>${esc(card.nome)}</strong>
                    </td>
                    <td>${esc(card.instituicao || "Banco")} • ${esc(card.bandeira || "Cartão")}</td>
                    <td>${fmtMoney(card.limite_total)}</td>
                    <td style="color:var(--fin-danger)">${fmtMoney(card.limite_usado)}</td>
                    <td><strong style="color:var(--fin-success)">${fmtMoney(card.limite_disponivel)}</strong></td>
                    <td>Dia ${card.dia_fechamento}</td>
                    <td>Dia ${card.dia_vencimento}</td>
                    <td>${esc(card.conta_nome || "Não vinculada")}</td>
                    ${canEdit() ? `<td><button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="open-edit-cartao" data-id="${card.id}">Editar</button></td>` : ""}
                  </tr>
                `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==================== 3. CAIXA FÍSICO ====================
  function renderCaixaTab() {
    const caixa = state.contas.find((c) => c.tipo === "caixa" || c.tipo === "caixa_fisico") || state.contas[0] || { id: 1, nome: "Caixa físico da igreja", saldo_atual: 0 };
    const totalContado = Object.entries(state.cedulas).reduce(
      (sum, [denom, qtd]) => sum + Math.round(Number(denom) * 100) * Number(qtd || 0),
      0
    );
    const diff = totalContado - Number(caixa.saldo_atual || 0);
    const movsCaixa = state.lancamentos.filter(
      (l) => String(l.conta_id) === String(caixa.id) || String(l.conta_destino_id) === String(caixa.id)
    );

    const denoms = ["200", "100", "50", "20", "10", "5", "2", "1", "0.50", "0.25", "0.10", "0.05"];

    return `
      <div class="fin-kpi-grid">
        <div class="fin-kpi-card kpi-success">
          <div class="fin-kpi-label">Saldo Contábil no Caixa Físico</div>
          <div class="fin-kpi-value">${fmtMoney(caixa.saldo_atual)}</div>
          <div class="fin-kpi-sub">${esc(caixa.nome)}</div>
        </div>
        <div class="fin-kpi-card kpi-info">
          <div class="fin-kpi-label">Total Contado (Cédulas e Moedas)</div>
          <div class="fin-kpi-value" id="caixa-total-contado">${fmtMoney(totalContado)}</div>
          <div class="fin-kpi-sub">Conferência física em tempo real</div>
        </div>
        <div class="fin-kpi-card ${Math.abs(diff) < 0.01 ? "kpi-success" : "kpi-danger"}">
          <div class="fin-kpi-label">Diferença de Conferência</div>
          <div class="fin-kpi-value" id="caixa-diff-val">${fmtMoney(diff)}</div>
          <div class="fin-kpi-sub" id="caixa-diff-msg">${Math.abs(diff) < 0.01 ? "✅ Caixa batendo perfeitamente!" : "⚠️ Diferença detectada! Não altera saldo sozinho."}</div>
        </div>
      </div>

      ${
        canEdit()
          ? `
      <div class="fin-shortcuts">
        <button type="button" class="fin-btn fin-btn-success fin-btn-sm" data-action="open-lancamento" data-tipo="entrada" data-conta="${caixa.id}" data-forma="Dinheiro">➕ Entrada em Espécie</button>
        <button type="button" class="fin-btn fin-btn-danger fin-btn-sm" data-action="open-lancamento" data-tipo="saida" data-conta="${caixa.id}" data-forma="Dinheiro">➖ Saída em Espécie</button>
        <button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="open-lancamento" data-tipo="transferencia" data-conta="${caixa.id}">🏦 Retirada p/ Depósito Bancário</button>
        <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="open-lancamento" data-tipo="transferencia" data-destino="${caixa.id}">🏧 Registrar Saque p/ Caixa</button>
      </div>

      <div class="fin-card">
        <div class="fin-card-header">
          <div>
            <span class="fin-card-title">🧮 Conferência de Caixa (Contagem de Cédulas e Moedas)</span>
            <p style="font-size:0.8rem;color:var(--fin-muted)">Informe a quantidade física de notas e moedas. Diferenças geram alerta para investigação e não alteram o saldo contábil automaticamente.</p>
          </div>
        </div>
        <form id="form-conferencia-caixa" data-conta-id="${caixa.id}">
          <div class="fin-cedulas-grid">
            ${denoms
              .map(
                (d) => `
              <div class="fin-cedula-box">
                <label>${Number(d) >= 2 ? `Nota R$ ${d}` : `Moeda R$ ${d.replace(".", ",")}`}</label>
                <input type="number" min="0" step="1" class="fin-input input-cedula" data-denom="${d}" value="${state.cedulas[d] || 0}" />
              </div>`
              )
              .join("")}
          </div>
          <div class="fin-form-grid">
            <div class="fin-field">
              <label>Observações da Conferência</label>
              <input type="text" class="fin-input" id="conf-obs" placeholder="Ex: Conferência após culto de domingo" />
            </div>
          </div>
          <button type="submit" class="fin-btn fin-btn-primary">💾 Salvar Conferência de Caixa</button>
        </form>
      </div>`
          : ""
      }

      <div class="fin-card">
        <div class="fin-card-header"><span class="fin-card-title">📋 Histórico de Conferências de Caixa</span></div>
        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead>
              <tr><th>Data</th><th>Responsável</th><th>Saldo Sistema</th><th>Valor Contado</th><th>Diferença</th><th>Observações</th></tr>
            </thead>
            <tbody>
              ${
                state.conferencias.length
                  ? state.conferencias
                      .map(
                        (c) => `
                <tr>
                  <td>${fmtDate(c.data)}</td>
                  <td>${esc(c.responsavel_nome)}</td>
                  <td>${fmtMoney(c.saldo_sistema)}</td>
                  <td><strong>${fmtMoney(c.valor_contado)}</strong></td>
                  <td>
                    <span class="fin-badge ${Math.abs(c.diferenca) < 0.01 ? "badge-success" : "badge-danger"}">
                      ${fmtMoney(c.diferenca)}
                    </span>
                  </td>
                  <td>${esc(c.observacoes || "-")}</td>
                </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="6" style="text-align:center;color:var(--fin-muted)">Nenhuma conferência registrada ainda.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="fin-card">
        <div class="fin-card-header"><span class="fin-card-title">💵 Movimentações do Caixa Físico</span></div>
        ${renderLancamentosTable(movsCaixa)}
      </div>
    `;
  }

  // ==================== 4 & 6. ENTRADAS / SAÍDAS ====================
  function renderLancamentosTab(tipoFiltro) {
    const isEntrada = tipoFiltro === "entrada";
    const list = state.lancamentos.filter((l) =>
      isEntrada ? l.tipo === "entrada" : l.tipo === "saida" || l.tipo === "transferencia" || l.tipo === "ajuste"
    );

    return `
      <div class="fin-card">
        <div class="fin-card-header">
          <div>
            <span class="fin-card-title">${isEntrada ? "📥 Controle de Entradas e Receitas" : "📤 Controle de Saídas, Despesas e Contas a Pagar"}</span>
            <p style="font-size:0.8rem;color:var(--fin-muted)">Todos os registros possuem rastreabilidade completa, anexos e proteção contra duplicidade.</p>
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center">
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="toggle-view-mode" title="Alternar entre modo tabela e linha do tempo diária">
              ${state.viewMode === "timeline" ? "📋 Ver Tabela" : "📱 Ver por Dia (Timeline)"}
            </button>
            ${
              canEdit()
                ? `<button type="button" class="fin-btn ${isEntrada ? "fin-btn-success" : "fin-btn-danger"} fin-btn-sm" data-action="open-lancamento" data-tipo="${isEntrada ? "entrada" : "saida"}">
                    ➕ ${isEntrada ? "Nova Entrada" : "Nova Despesa / Conta a Pagar"}
                  </button>`
                : ""
            }
          </div>
        </div>
        ${renderLancamentosTable(list)}
      </div>
    `;
  }

  function renderLancamentosTimeline(list) {
    if (!list || !list.length) {
      return `<div style="padding:1.5rem;text-align:center;color:var(--fin-muted)">Nenhuma movimentação encontrada para o período selecionado.</div>`;
    }
    const grupos = {};
    for (const l of list) {
      const dt = l.data_movimento || l.data_vencimento || l.data || l.vencimento || "Sem data";
      if (!grupos[dt]) grupos[dt] = [];
      grupos[dt].push(l);
    }
    const dias = Object.keys(grupos).sort((a, b) => b.localeCompare(a));
    const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

    return `
      <div class="fin-timeline-container">
        ${dias
          .map((dt) => {
            let label = dt;
            if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
              const [yy, mm, dd] = dt.split("-").map(Number);
              const d = new Date(Date.UTC(yy, mm - 1, dd, 12));
              label = `${dd} • ${DIAS_SEMANA[d.getUTCDay()]}`;
            }
            const itens = grupos[dt];
            const tot = itens.reduce((s, x) => s + (x.tipo === "saida" ? -x.valor : x.valor), 0);
            return `
              <div class="fin-timeline-day-group">
                <div class="fin-timeline-day-header">
                  <span class="fin-timeline-day-title">${esc(label)}</span>
                  <span class="fin-timeline-day-total" style="color:${tot >= 0 ? "var(--fin-success)" : "var(--fin-danger)"}">
                    ${tot >= 0 ? "+" : ""}${fmtMoney(tot)}
                  </span>
                </div>
                <div class="fin-timeline-items">
                  ${itens
                    .map((l) => {
                      const isSaida = l.tipo === "saida";
                      const isPendente = l.status === "pendente";
                      return `
                        <div class="fin-timeline-item ${isPendente ? "is-pending" : ""}">
                          <div class="fin-timeline-icon" style="background:${isSaida ? "#fee2e2" : "#dcfce7"};color:${isSaida ? "#b91c1c" : "#15803d"}">
                            ${isSaida ? (l.cartao_nome ? "💳" : "📤") : "📥"}
                          </div>
                          <div class="fin-timeline-info">
                            <div class="fin-timeline-desc">
                              <strong>${esc(l.descricao)}</strong>
                              ${l.parcela_total > 1 ? `<span class="fin-badge badge-purple" style="font-size:0.68rem">${l.parcela_num}/${l.parcela_total}</span>` : ""}
                            </div>
                            <div class="fin-timeline-meta">
                              <span>📁 ${esc(l.categoria_nome || "Geral")}</span>
                              <span>•</span>
                              <span>🏦 ${esc(l.conta_nome || "-")}</span>
                              ${l.cartao_nome ? `<span class="fin-badge" style="background:#e0e7ff;color:#3730a3;font-size:0.68rem">💳 ${esc(l.cartao_nome)}</span>` : ""}
                              ${l.forma_pagamento ? `<small style="color:var(--fin-muted)">(${esc(l.forma_pagamento)})</small>` : ""}
                            </div>
                          </div>
                          <div class="fin-timeline-val-col">
                            <div class="fin-timeline-val" style="color:${isSaida ? "var(--fin-danger)" : "var(--fin-success)"};font-weight:700">
                              ${isSaida ? "-" : "+"}${fmtMoney(l.valor)}
                            </div>
                            <div class="fin-timeline-actions">
                              ${isPendente && canEdit() ? `<button type="button" class="fin-btn fin-btn-success fin-btn-xs" data-action="open-quitar" data-id="${l.id}">Efetivar</button>` : ""}
                              ${canEdit() ? `<button type="button" class="fin-btn fin-btn-outline fin-btn-xs" data-action="open-editar-lanc" data-id="${l.id}">Editar</button>` : ""}
                            </div>
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderLancamentosTable(list) {
    if (state.viewMode === "timeline") {
      return renderLancamentosTimeline(list);
    }
    if (!list || !list.length) {
      return `<div style="padding:1.25rem;text-align:center;color:var(--fin-muted)">Nenhuma movimentação encontrada para os filtros selecionados.</div>`;
    }
    return `
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Data / Venc.</th>
              <th>Tipo</th>
              <th>Categoria / Ministério</th>
              <th>Descrição / Pessoa</th>
              <th>Conta / Forma</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Anexos</th>
              ${canEdit() ? `<th>Ações</th>` : ""}
            </tr>
          </thead>
          <tbody>
            ${list
              .map((l) => {
                const statusBadge =
                  l.status === "efetivado"
                    ? `<span class="fin-badge badge-success">Efetivado</span>`
                    : l.status === "pendente"
                    ? `<span class="fin-badge badge-warning">Pendente</span>`
                    : `<span class="fin-badge badge-muted">Cancelado</span>`;
                const tipoBadge =
                  l.tipo === "entrada"
                    ? `<span class="fin-badge badge-success">Entrada</span>`
                    : l.tipo === "saida"
                    ? `<span class="fin-badge badge-danger">Saída</span>`
                    : l.tipo === "transferencia"
                    ? `<span class="fin-badge badge-info">Transferência</span>`
                    : `<span class="fin-badge badge-purple">Ajuste</span>`;

                return `
                  <tr>
                    <td>#${l.id}</td>
                    <td>
                      <strong>${fmtDate(l.data_movimento || l.data_vencimento)}</strong>
                      ${l.data_vencimento && l.status === "pendente" ? `<br/><small style="color:var(--fin-warning)">Venc: ${fmtDate(l.data_vencimento)}</small>` : ""}
                    </td>
                    <td>${tipoBadge}</td>
                    <td>
                      <strong>${esc(l.categoria_nome || "-")}</strong>
                      ${l.ministerio ? `<br/><small style="color:var(--fin-primary)">${esc(l.ministerio)}</small>` : ""}
                    </td>
                    <td>
                      <strong>${esc(l.descricao)}</strong>
                      ${l.contribuinte_nome ? `<br/><small style="color:var(--fin-muted)">👤 ${esc(l.contribuinte_nome)}</small>` : ""}
                      ${l.fornecedor ? `<br/><small style="color:var(--fin-muted)">🏢 ${esc(l.fornecedor)}</small>` : ""}
                      ${l.parcela_total > 1 ? `<span class="fin-badge badge-info">Parcela ${l.parcela_num}/${l.parcela_total}</span>` : ""}
                    </td>
                    <td>
                      ${esc(l.conta_nome || "-")}
                      ${l.conta_destino_nome ? ` ➔ ${esc(l.conta_destino_nome)}` : ""}
                      <br/><small style="color:var(--fin-muted)">${esc(l.forma_pagamento || "")}</small>
                    </td>
                    <td>
                      <strong style="color:${l.tipo === "entrada" ? "var(--fin-success)" : l.tipo === "saida" ? "var(--fin-danger)" : "var(--fin-text)"}">
                        ${fmtMoney(l.valor)}
                      </strong>
                    </td>
                    <td>${statusBadge}</td>
                    <td>
                      <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="open-anexos" data-id="${l.id}">
                        📎 ${l.qtd_anexos || 0}
                      </button>
                    </td>
                    ${
                      canEdit()
                        ? `<td>
                            <div style="display:flex;gap:0.3rem;flex-wrap:wrap">
                              ${
                                l.status === "pendente"
                                  ? `<button type="button" class="fin-btn fin-btn-success fin-btn-sm" data-action="open-quitar" data-id="${l.id}" title="Quitar total ou pagar/receber parte da conta mantendo o saldo restante">${l.tipo === "saida" ? "💳 Pagar / Parcial" : "💰 Receber / Parcial"}</button>`
                                  : ""
                              }
                              ${
                                l.status !== "cancelado"
                                  ? `<button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="open-editar-lanc" data-id="${l.id}">Editar</button>
                                     <button type="button" class="fin-btn fin-btn-danger fin-btn-sm" data-action="open-cancelar-lanc" data-id="${l.id}">Estornar</button>`
                                  : ""
                              }
                            </div>
                          </td>`
                        : ""
                    }
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==================== 5. DÍZIMOS, OFERTAS & FECHAMENTO DE CULTO ====================
  function renderDizimosTab() {
    const ind = state.dashboard ? state.dashboard.indicadores : { dizimos_mes: 0, ofertas_mes: 0 };
    const listaDizimos = state.lancamentos.filter(
      (l) => l.tipo === "entrada" && /d[ií]zimo|oferta|ceia|miss/i.test(l.categoria_nome || "")
    );

    return `
      <div class="fin-kpi-grid">
        <div class="fin-kpi-card kpi-success">
          <div class="fin-kpi-label">Dízimos no Período</div>
          <div class="fin-kpi-value">${fmtMoney(ind.dizimos_mes)}</div>
          <div class="fin-kpi-sub">Consagrado no período</div>
        </div>
        <div class="fin-kpi-card kpi-info">
          <div class="fin-kpi-label">Ofertas no Período</div>
          <div class="fin-kpi-value">${fmtMoney(ind.ofertas_mes)}</div>
          <div class="fin-kpi-sub">Ofertas gerais, especiais, Santa Ceia e missões</div>
        </div>
        <div class="fin-kpi-card kpi-warning">
          <div class="fin-kpi-label">Fechamentos de Culto Realizados</div>
          <div class="fin-kpi-value">${state.fechamentos.length}</div>
          <div class="fin-kpi-sub">Com dupla conferência registrada</div>
        </div>
      </div>

      <div class="fin-card">
        <div class="fin-card-header">
          <div>
            <span class="fin-card-title">⛪ Fechamento de Arrecadação de Cultos</span>
            <p style="font-size:0.8rem;color:var(--fin-muted)">Consolida dízimos e ofertas por forma de pagamento, gera os lançamentos nas contas correspondentes sem duplicar e exige dupla conferência.</p>
          </div>
          ${
            canEdit()
              ? `<button type="button" class="fin-btn fin-btn-primary" data-action="open-fechamento-culto">⛪ Fechar Arrecadação do Culto</button>`
              : ""
          }
        </div>
        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Data</th>
                <th>Culto / Reunião</th>
                <th>Dinheiro</th>
                <th>PIX</th>
                <th>Cartão</th>
                <th>Outros</th>
                <th>Total Arrecadado</th>
                <th>Dupla Conferência</th>
              </tr>
            </thead>
            <tbody>
              ${
                state.fechamentos.length
                  ? state.fechamentos
                      .map(
                        (f) => `
                <tr>
                  <td>#${f.id}</td>
                  <td>${fmtDate(f.data_culto)}</td>
                  <td><strong>${esc(f.culto_nome)}</strong></td>
                  <td>${fmtMoney(f.total_dinheiro)}</td>
                  <td>${fmtMoney(f.total_pix)}</td>
                  <td>${fmtMoney(f.total_cartao)}</td>
                  <td>${fmtMoney(f.total_outros)}</td>
                  <td><strong style="color:var(--fin-success)">${fmtMoney(f.total_geral)}</strong></td>
                  <td>👤 ${esc(f.conferente1)}<br/>👤 ${esc(f.conferente2)}</td>
                </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="9" style="text-align:center;color:var(--fin-muted)">Nenhum fechamento de culto registrado ainda.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="fin-card">
        <div class="fin-card-header">
          <span class="fin-card-title">🙌 Lançamentos de Dízimos e Ofertas</span>
        </div>
        ${renderLancamentosTable(listaDizimos)}
      </div>
    `;
  }

  // ==================== 7. RELATÓRIOS & PRESTAÇÃO DE CONTAS ====================
  function renderRelatoriosTab() {
    if (!state.dashboard) return "";
    const ind = state.dashboard.indicadores;
    const graf = state.dashboard.graficos;
    const q = new URLSearchParams(state.filters).toString();

    return `
      <div class="fin-card">
        <div class="fin-card-header">
          <div>
            <span class="fin-card-title">📑 Prestação de Contas Oficial — Comunidade Cristã Curados</span>
            <p style="font-size:0.8rem;color:var(--fin-muted)">Período de referência: ${fmtDate(state.dashboard.periodo.inicio)} a ${fmtDate(state.dashboard.periodo.fim)}</p>
          </div>
          <div class="no-print" style="display:flex;gap:0.5rem;flex-wrap:wrap">
            <button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="open-prestacao">📑 Resumo Executivo Oficial</button>
            <a href="/controlefinanceiro/api/relatorio.csv?${q}" class="fin-btn fin-btn-success fin-btn-sm">📥 Exportar Planilha (CSV)</a>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="print-report">🖨️ Imprimir / Salvar PDF</button>
          </div>
        </div>

        <div class="fin-kpi-grid">
          <div class="fin-kpi-card kpi-success">
            <div class="fin-kpi-label">Total de Entradas no Período</div>
            <div class="fin-kpi-value">${fmtMoney(ind.entradas_mes)}</div>
          </div>
          <div class="fin-kpi-card kpi-danger">
            <div class="fin-kpi-label">Total de Saídas no Período</div>
            <div class="fin-kpi-value">${fmtMoney(ind.saidas_mes)}</div>
          </div>
          <div class="fin-kpi-card kpi-info">
            <div class="fin-kpi-label">Resultado Líquido do Período</div>
            <div class="fin-kpi-value">${fmtMoney(ind.resultado_mes)}</div>
          </div>
          <div class="fin-kpi-card kpi-success">
            <div class="fin-kpi-label">Saldo Final Consolidado</div>
            <div class="fin-kpi-value">${fmtMoney(ind.saldo_total)}</div>
          </div>
        </div>

        <div class="fin-charts-grid">
          <div>
            <h4 style="margin-bottom:0.5rem">Entradas por Categoria</h4>
            <table class="fin-table">
              <thead><tr><th>Categoria</th><th>Total</th></tr></thead>
              <tbody>
                ${Object.entries(graf.entradas_por_categoria)
                  .map(([k, v]) => `<tr><td>${esc(k)}</td><td><strong>${fmtMoney(v)}</strong></td></tr>`)
                  .join("") || `<tr><td colspan="2">Sem entradas no período</td></tr>`}
              </tbody>
            </table>
          </div>
          <div>
            <h4 style="margin-bottom:0.5rem">Saídas por Categoria</h4>
            <table class="fin-table">
              <thead><tr><th>Categoria</th><th>Total</th></tr></thead>
              <tbody>
                ${Object.entries(graf.despesas_por_categoria)
                  .map(([k, v]) => `<tr><td>${esc(k)}</td><td><strong>${fmtMoney(v)}</strong></td></tr>`)
                  .join("") || `<tr><td colspan="2">Sem despesas no período</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-top:2.5rem;display:grid;grid-template-columns:1fr 1fr;gap:2rem;text-align:center;padding-top:1.5rem;border-top:1px dashed var(--fin-border)">
          <div>
            <div style="border-bottom:1px solid #334155;height:2.2rem;margin-bottom:0.4rem"></div>
            <strong>Tesouraria / Administração Financeira</strong>
            <div style="font-size:0.78rem;color:var(--fin-muted)">Larissa Luana dos Santos / Rafael Oliveira</div>
          </div>
          <div>
            <div style="border-bottom:1px solid #334155;height:2.2rem;margin-bottom:0.4rem"></div>
            <strong>Pastor Presidente / Conselho Fiscal</strong>
            <div style="font-size:0.78rem;color:var(--fin-muted)">Comunidade Cristã Curados</div>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== 7.5. ABA DEDICADA: PRESTAÇÃO DE CONTAS & RASTREABILIDADE ====================
  function renderPrestacaoTab() {
    if (!state.dashboard) return `<div class="fin-card">Carregando dados da prestação de contas...</div>`;
    const ind = state.dashboard.indicadores;
    const resumo = state.prestacaoResumo;
    const q = new URLSearchParams(state.filters).toString();

    // Gerar últimos 6 meses para filtro
    const hoje = todayISO();
    const [anoAtual, mesAtual] = hoje.split("-").map(Number);
    const mesesNomes = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    const opcoesMeses = [];
    for (let i = 0; i < 6; i++) {
      let m = mesAtual - i;
      let y = anoAtual;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      const val = `${y}-${String(m).padStart(2, "0")}`;
      const label = `${mesesNomes[m - 1]} / ${y}`;
      opcoesMeses.push({ val, label });
    }

    const logsFiltrados = (state.prestacaoHistorico || []).filter((l) => {
      if (!state.prestacaoMesFiltro) return true;
      if (l.criado_em && l.criado_em.startsWith(state.prestacaoMesFiltro)) return true;
      try {
        const d = JSON.parse(l.detalhes || "{}");
        if (d.data_solicitacao && d.data_solicitacao.startsWith(state.prestacaoMesFiltro)) return true;
      } catch (_) {}
      return false;
    });

    return `
      <div class="fin-card">
        <div class="fin-card-header" style="flex-wrap:wrap;gap:1rem">
          <div>
            <span class="fin-card-title">📋 Prestação de Contas Consolidada</span>
            <p style="font-size:0.82rem;color:var(--fin-muted)">Comunidade Cristã Curados • Relatório executivo oficial para pastores, conselho e diretoria.</p>
          </div>
          <div class="no-print" style="display:flex;gap:0.5rem;flex-wrap:wrap">
            <button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="gerar-prestacao-oficial">
              🔄 Atualizar / Gerar Prestação
            </button>
            <a href="/controlefinanceiro/api/relatorio.csv?${q}" class="fin-btn fin-btn-success fin-btn-sm">
              📥 Exportar Planilha (CSV)
            </a>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="print-report">
              🖨️ Imprimir / Salvar PDF
            </button>
          </div>
        </div>

        <div class="fin-kpi-grid">
          <div class="fin-kpi-card kpi-success">
            <div class="fin-kpi-label">Entradas no Mês</div>
            <div class="fin-kpi-value">${fmtMoney(ind.entradas_mes)}</div>
            <div class="fin-kpi-sub">Dízimos e Ofertas recebidos</div>
          </div>
          <div class="fin-kpi-card kpi-danger">
            <div class="fin-kpi-label">Saídas no Mês</div>
            <div class="fin-kpi-value">${fmtMoney(ind.saidas_mes)}</div>
            <div class="fin-kpi-sub">Despesas fixas e ministeriais</div>
          </div>
          <div class="fin-kpi-card ${ind.resultado_mes >= 0 ? "kpi-success" : "kpi-danger"}">
            <div class="fin-kpi-label">Resultado Líquido</div>
            <div class="fin-kpi-value">${fmtMoney(ind.resultado_mes)}</div>
            <div class="fin-kpi-sub">${ind.resultado_mes >= 0 ? "Superávit no período ✅" : "Déficit no período ⚠️"}</div>
          </div>
          <div class="fin-kpi-card kpi-info">
            <div class="fin-kpi-label">Saldo Consolidado Geral</div>
            <div class="fin-kpi-value">${fmtMoney(ind.saldo_total)}</div>
            <div class="fin-kpi-sub">Disponível livre: ${fmtMoney(ind.total_disponivel)}</div>
          </div>
        </div>

        <div style="margin-top:1.25rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;flex-wrap:wrap;gap:8px">
            <span style="font-weight:700;font-size:0.9rem;color:var(--fin-text)">
              💬 Resumo Estruturado Oficial (WhatsApp & Reuniões de Liderança):
            </span>
            <div style="display:flex;gap:6px">
              <button type="button" class="fin-btn fin-btn-sm fin-btn-outline" data-action="copy-prestacao-text">
                📋 Copiar Texto Completo
              </button>
              <button type="button" class="fin-btn fin-btn-sm fin-btn-outline" data-action="open-prestacao">
                🔍 Ver em Janela Cheia
              </button>
            </div>
          </div>
          <div class="fin-prestacao-box" id="prestacao-texto-box">${esc(resumo ? resumo.textoWhatsApp : "Carregando resumo executivo oficial...")}</div>
        </div>
      </div>

      <!-- SEÇÃO EXCLUSIVA: QUEM PEDIU PRESTAÇÃO DE CONTAS NO MÊS -->
      <div class="fin-card">
        <div class="fin-card-header" style="flex-wrap:wrap;gap:1rem">
          <div>
            <span class="fin-card-title">🛡️ Rastreabilidade: Histórico de Solicitações de Prestação de Contas</span>
            <p style="font-size:0.82rem;color:var(--fin-muted)">
              Lista de todos os pastores e diretores que solicitaram a prestação de contas neste mês ou período, com canal de origem (WhatsApp Bot ou Sistema Web), data/hora e auditoria.
            </p>
          </div>
          <div class="no-print" style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap">
            <label style="font-size:0.82rem;font-weight:700;color:var(--fin-text)">Mês de Consulta:</label>
            <select class="fin-select" id="flt-prestacao-mes" style="width:auto;min-width:180px">
              <option value="">Todos os Meses</option>
              ${opcoesMeses.map((o) => `<option value="${o.val}" ${state.prestacaoMesFiltro === o.val ? "selected" : ""}>${o.label}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead>
              <tr>
                <th>Data e Horário</th>
                <th>Solicitante</th>
                <th>WhatsApp / Contato</th>
                <th>Canal de Solicitação</th>
                <th>Origem / IP</th>
                <th>Auditoria</th>
              </tr>
            </thead>
            <tbody>
              ${
                logsFiltrados.length
                  ? logsFiltrados
                      .map((l) => {
                        let det = {};
                        try { det = JSON.parse(l.detalhes || "{}"); } catch (_) {}
                        const canalIsWhats = det.canal === "whatsapp";
                        const canalBadge = canalIsWhats
                          ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#166534;padding:3px 10px;border-radius:999px;font-size:0.75rem;font-weight:800">💬 WhatsApp Bot</span>`
                          : `<span style="display:inline-flex;align-items:center;gap:4px;background:#e0e7ff;color:#3730a3;padding:3px 10px;border-radius:999px;font-size:0.75rem;font-weight:800">💻 Sistema Web</span>`;
                        const telDisplay = det.telefone || (l.usuario && l.usuario.match(/\d{10,13}/) ? l.usuario.match(/\d{10,13}/)[0] : "-");
                        const nomeDisplay = det.solicitante || (l.usuario ? l.usuario.split("(")[0].trim() : "Liderança");
                        return `
                        <tr>
                          <td style="white-space:nowrap;font-weight:600">${fmtDateTime(l.criado_em)}</td>
                          <td><strong>${esc(nomeDisplay)}</strong></td>
                          <td>
                            ${telDisplay !== "-" ? `<a href="https://wa.me/${telDisplay.replace(/\D/g, "")}" target="_blank" rel="noopener" style="color:var(--fin-primary);text-decoration:none;font-weight:600">📱 ${esc(telDisplay)}</a>` : "-"}
                          </td>
                          <td>${canalBadge}</td>
                          <td><small style="color:var(--fin-muted)">${esc(l.ip || "-")}</small></td>
                          <td><span class="fin-badge badge-success">🔒 Auditado</span></td>
                        </tr>`;
                      })
                      .join("")
                  : `<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--fin-muted)">Nenhuma solicitação de prestação de contas encontrada para o mês selecionado.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==================== 8. CONFIGURAÇÕES, USUÁRIOS & AUDITORIA ====================
  function renderConfigTab() {
    return `
      <div class="fin-charts-grid">
        <div class="fin-card">
          <div class="fin-card-header">
            <span class="fin-card-title">🔐 Minha Segurança (Senha & 2FA)</span>
          </div>
          <div style="display:flex;gap:0.65rem;flex-wrap:wrap">
            <button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="open-alterar-senha">🔑 Alterar Minha Senha</button>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="open-2fa-setup">
              🛡️ ${state.user.totp_ativo ? "Gerenciar / Desativar 2FA" : "Ativar Autenticação em 2 Etapas (2FA)"}
            </button>
          </div>
        </div>

        <div class="fin-card">
          <div class="fin-card-header">
            <span class="fin-card-title">🏷️ Categorias Financeiras</span>
            ${canEdit() ? `<button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="open-nova-categoria">➕ Nova Categoria</button>` : ""}
          </div>
          <div style="max-height:240px;overflow-y:auto">
            <table class="fin-table">
              <thead><tr><th>Nome</th><th>Tipo</th><th>Grupo</th><th>Fixa</th></tr></thead>
              <tbody>
                ${state.categorias
                  .map(
                    (c) => `
                  <tr>
                    <td><strong>${esc(c.nome)}</strong></td>
                    <td><span class="fin-badge ${c.tipo === "entrada" ? "badge-success" : "badge-danger"}">${esc(c.tipo)}</span></td>
                    <td>${esc(c.grupo || "-")}</td>
                    <td>${c.fixa ? "Sim" : "Não"}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      ${
        isAdmin()
          ? `
      <div class="fin-card">
        <div class="fin-card-header">
          <div>
            <span class="fin-card-title">👥 Usuários e Permissões de Acesso</span>
            <p style="font-size:0.8rem;color:var(--fin-muted)">Gerencie quem tem acesso ao sistema financeiro e seus níveis de permissão.</p>
          </div>
          <button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="open-novo-usuario">➕ Autorizar Usuário</button>
        </div>
        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead>
              <tr><th>Nome</th><th>WhatsApp</th><th>Nível de Acesso</th><th>Ministério</th><th>2FA</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody>
              ${state.usuarios
                .map(
                  (u) => `
                <tr>
                  <td><strong>${esc(u.nome)}</strong></td>
                  <td>${esc(u.telefone)}</td>
                  <td><span class="fin-badge badge-purple">${esc(ROLE_LABELS[u.papel] || u.papel)}</span></td>
                  <td>${esc(u.ministerio || "Todos")}</td>
                  <td>${u.totp_ativo ? "✅ Ativo" : "Opcional"}</td>
                  <td>${u.ativo ? `<span class="fin-badge badge-success">Ativo</span>` : `<span class="fin-badge badge-danger">Bloqueado</span>`}</td>
                  <td>
                    <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="reset-senha-user" data-id="${u.id}"> Liberar Nova Senha</button>
                  </td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`
          : ""
      }

      <div class="fin-card">
        <div class="fin-card-header">
          <span class="fin-card-title">🕵️ Trilha de Auditoria e Rastreabilidade</span>
        </div>
        <div class="fin-table-wrap" style="max-height:360px;overflow-y:auto">
          <table class="fin-table">
            <thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr></thead>
            <tbody>
              ${
                state.auditoria.length
                  ? state.auditoria
                      .map(
                        (a) => `
                <tr>
                  <td style="white-space:nowrap">${fmtDateTime(a.criado_em)}</td>
                  <td><strong>${esc(a.usuario_nome || "-")}</strong></td>
                  <td><span class="fin-badge badge-info">${esc(a.acao)}</span></td>
                  <td>${esc(a.entidade || "-")} ${a.entidade_id ? `#${a.entidade_id}` : ""}</td>
                  <td><small style="color:var(--fin-text)">${fmtDetalhesAuditoria(a.acao, a.depois_json)}</small></td>
                </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="5" style="text-align:center;color:var(--fin-muted)">Sem registros de auditoria visíveis.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==================== MODALS ====================
  function closeModal() {
    const m = document.getElementById("fin-modal-root");
    if (m) m.innerHTML = "";
  }

  function openLancamentoModal(opts = {}) {
    const tipo = opts.tipo || "entrada";
    const statusPadrao = opts.status || "efetivado";
    const contaPadrao = opts.conta || (state.contas[0] ? state.contas[0].id : "");
    const destinoPadrao = opts.destino || (state.contas[1] ? state.contas[1].id : "");
    const formaPadrao = opts.forma || "PIX";
    const cats = state.categorias.filter((c) => (tipo === "entrada" ? c.tipo === "entrada" : c.tipo === "saida"));

    const m = document.getElementById("fin-modal-root");
    if (!m) return;

    const titleMap = {
      entrada: "📥 Registrar Entrada Financeira",
      saida: "📤 Registrar Despesa / Conta a Pagar",
      transferencia: "🔄 Transferência entre Contas",
      ajuste: "⚖️ Ajuste Auditado de Saldo",
    };

    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal">
          <div class="fin-modal-header">
            <span class="fin-modal-title">${titleMap[tipo] || "Novo Lançamento"}</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <div id="modal-alert"></div>
          <form id="form-novo-lancamento" data-tipo="${tipo}">
            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Descrição *</label>
                <input type="text" class="fin-input" name="descricao" required placeholder="Ex: Oferta Culto de Domingo / Conta de Luz" />
              </div>
              <div class="fin-field">
                <label>Valor (R$) *</label>
                <input type="number" step="0.01" class="fin-input" name="valor" required placeholder="0,00" />
              </div>
            </div>

            <div class="fin-form-grid">
              <div class="fin-field">
                <label>${tipo === "transferencia" ? "Conta de Origem *" : "Conta Financeira *"}</label>
                <select class="fin-select" name="conta_id" required>
                  ${state.contas
                    .map((c) => `<option value="${c.id}" ${String(c.id) === String(contaPadrao) ? "selected" : ""}>${esc(c.nome)} (${fmtMoney(c.saldo_atual)})</option>`)
                    .join("")}
                </select>
              </div>
              ${
                tipo === "transferencia"
                  ? `
                <div class="fin-field">
                  <label>Conta de Destino *</label>
                  <select class="fin-select" name="conta_destino_id" required>
                    ${state.contas
                      .map((c) => `<option value="${c.id}" ${String(c.id) === String(destinoPadrao) ? "selected" : ""}>${esc(c.nome)}</option>`)
                      .join("")}
                  </select>
                </div>`
                  : `
                <div class="fin-field">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">
                    <label style="margin:0">Categoria *</label>
                    <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="quick-add-category" data-tipo="${tipo}" style="padding:0.15rem 0.45rem;font-size:0.75rem;line-height:1;border-radius:4px" title="Adicionar nova categoria">+ Nova</button>
                  </div>
                  <select class="fin-select" name="categoria_id" id="novo-cat-select">
                    ${cats.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}
                  </select>
                </div>`
              }
            </div>

            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Status *</label>
                <select class="fin-select" name="status">
                  <option value="efetivado" ${statusPadrao === "efetivado" ? "selected" : ""}>Efetivado (Pago / Recebido)</option>
                  <option value="pendente" ${statusPadrao === "pendente" ? "selected" : ""}>Pendente (Conta a Pagar / Receber)</option>
                </select>
              </div>
              <div class="fin-field">
                <label>Data do Movimento</label>
                <input type="date" class="fin-input" name="data_movimento" value="${todayISO()}" />
              </div>
              <div class="fin-field">
                <label>Data de Vencimento / Competência</label>
                <input type="date" class="fin-input" name="data_vencimento" value="${todayISO()}" />
              </div>
            </div>

            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Forma de Pagamento</label>
                <select class="fin-select" name="forma_pagamento" id="lanc-forma-select">
                  ${FORMAS_PAGAMENTO.map((fp) => `<option value="${esc(fp)}" ${fp === formaPadrao ? "selected" : ""}>${esc(fp)}</option>`).join("")}
                </select>
              </div>
              <div class="fin-field" id="box-cartao-credito" style="${formaPadrao === "Cartão de crédito" ? "" : "display:none"}">
                <label>Cartão de Crédito Utilizado</label>
                <select class="fin-select" name="cartao_id">
                  <option value="">Selecione o Cartão...</option>
                  ${state.cartoes.map((c) => `<option value="${c.id}">${esc(c.nome)} (Disp: ${fmtMoney(c.limite_disponivel)})</option>`).join("")}
                </select>
              </div>
              <div class="fin-field">
                <label>Ministério / Departamento</label>
                <select class="fin-select" name="ministerio">
                  <option value="">Geral / Sem vínculo</option>
                  ${state.ministerios.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}
                </select>
              </div>
              <div class="fin-field">
                <label>${tipo === "entrada" ? "Contribuinte (Opcional/Sigiloso)" : "Fornecedor / Beneficiário"}</label>
                <input type="text" class="fin-input" name="${tipo === "entrada" ? "contribuinte_nome" : "fornecedor"}" placeholder="Opcional" />
              </div>
            </div>

            ${
              (tipo === "saida" || tipo === "entrada")
                ? `
              <div class="fin-field" style="grid-column:1 / -1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:0.85rem">
                <div style="font-weight:600;margin-bottom:0.6rem;font-size:0.88rem;display:flex;align-items:center;gap:0.4rem;color:#334155">
                  <span>🔁</span> ${tipo === "entrada" ? "Repetição / Parcelamento de Receita" : "Repetição / Parcelamento de Despesa"}
                </div>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem">
                  <label class="fin-radio-pill">
                    <input type="radio" name="tipo_repeticao" value="unica" checked />
                    <span>Não recorrente (1x)</span>
                  </label>
                  <label class="fin-radio-pill">
                    <input type="radio" name="tipo_repeticao" value="parcelada" />
                    <span>Parcelar ou repetir</span>
                  </label>
                  <label class="fin-radio-pill">
                    <input type="radio" name="tipo_repeticao" value="fixa" />
                    <span>Fixa mensal (${tipo === "entrada" ? "Receita Recorrente" : "Despesa Recorrente"})</span>
                  </label>
                </div>

                <div id="box-repeticao-parcelada" style="display:none;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:0.75rem;margin-bottom:0.5rem">
                  <div class="fin-form-grid" style="margin-bottom:0.5rem">
                    <div class="fin-field">
                      <label>Começar na parcela</label>
                      <input type="number" min="1" max="120" class="fin-input" name="parcela_inicial" id="rep-parcela-inicial" value="1" />
                      <small style="color:#64748b;font-size:0.72rem">Ex: se ${tipo === "entrada" ? "o recebimento/contribuição" : "a compra/despesa"} foi em 11x mas você já está no 7º mês, coloque 7</small>
                    </div>
                    <div class="fin-field">
                      <label>Total de parcelas</label>
                      <input type="number" min="2" max="120" class="fin-input" name="total_parcelas" id="rep-total-parcelas" value="2" />
                      <small style="color:#64748b;font-size:0.72rem">Quantidade total ${tipo === "entrada" ? "do recebimento" : "da compra"} (ex: 11 vezes)</small>
                    </div>
                  </div>

                  <div class="fin-field" style="margin-bottom:0.5rem">
                    <label style="margin-bottom:0.25rem">O valor digitado acima (R$) refere-se a:</label>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
                      <label class="fin-radio-pill">
                        <input type="radio" name="modo_valor" value="total" checked />
                        <span>Valor Total (dividido entre as parcelas)</span>
                      </label>
                      <label class="fin-radio-pill">
                        <input type="radio" name="modo_valor" value="parcela" />
                        <span>Valor de CADA Parcela</span>
                      </label>
                    </div>
                  </div>

                  <div id="rep-preview-text" style="font-size:0.82rem;font-weight:600;color:#6b21a8;padding:0.45rem 0.65rem;background:#f5f3ff;border-radius:6px;border:1px solid #ddd6fe">
                  </div>
                </div>

                <div id="box-repeticao-fixa" style="display:none;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:0.75rem">
                  <div class="fin-field">
                    <label>Repetir mensalmente por quantos meses? (${tipo === "entrada" ? "Receita Fixa Mensal" : "Despesa Fixa"})</label>
                    <input type="number" min="2" max="60" class="fin-input" name="repetir_meses" value="12" />
                    <small style="color:#64748b;font-size:0.72rem">Gera ${tipo === "entrada" ? "receitas" : "despesas"} mensais automáticas para os meses seguintes</small>
                  </div>
                </div>
              </div>`
                : ""
            }

            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Anexar Comprovante / Nota Fiscal (Imagem ou PDF)</label>
                <input type="file" class="fin-input" id="lanc-arquivo" accept="image/*,application/pdf" />
              </div>
              <div class="fin-field">
                <label>Observações</label>
                <input type="text" class="fin-input" name="observacoes" placeholder="Detalhes adicionais..." />
              </div>
            </div>

            <div class="fin-modal-footer">
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-primary">Salvar Lançamento</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Configuração dinâmica dos cálculos de repetição e parcelamento
    const radioRep = m.querySelectorAll("input[name='tipo_repeticao']");
    const boxParcelada = m.querySelector("#box-repeticao-parcelada");
    const boxFixa = m.querySelector("#box-repeticao-fixa");
    const inpVal = m.querySelector("input[name='valor']");
    const inpParcIni = m.querySelector("#rep-parcela-inicial");
    const inpTotParc = m.querySelector("#rep-total-parcelas");
    const radiosModo = m.querySelectorAll("input[name='modo_valor']");
    const txtPreview = m.querySelector("#rep-preview-text");

    function atualizarPreviewRepeticao() {
      if (!txtPreview) return;
      const val = parseFloat(inpVal?.value || 0) || 0;
      const tot = Math.max(parseInt(inpTotParc?.value || 2, 10), 2);
      const ini = Math.max(Math.min(parseInt(inpParcIni?.value || 1, 10), tot), 1);
      const qtd = tot - ini + 1;
      let modo = "total";
      radiosModo.forEach((r) => { if (r.checked) modo = r.value; });
      let valParc = modo === "parcela" ? val : (tot > 0 ? val / tot : 0);
      txtPreview.innerHTML = `💡 Serão geradas <b>${qtd} parcelas</b> (da <b>${ini}ª</b> até a <b>${tot}ª</b>) no valor de <b>R$ ${valParc.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> por mês.`;
    }

    radioRep.forEach((r) => {
      r.addEventListener("change", () => {
        if (boxParcelada) boxParcelada.style.display = r.value === "parcelada" && r.checked ? "block" : "none";
        if (boxFixa) boxFixa.style.display = r.value === "fixa" && r.checked ? "block" : "none";
        atualizarPreviewRepeticao();
      });
    });

    [inpVal, inpParcIni, inpTotParc].forEach((el) => {
      if (el) el.addEventListener("input", atualizarPreviewRepeticao);
    });
    radiosModo.forEach((r) => {
      r.addEventListener("change", atualizarPreviewRepeticao);
    });
    const selForma = m.querySelector("#lanc-forma-select");
    const boxCartao = m.querySelector("#box-cartao-credito");
    if (selForma && boxCartao) {
      selForma.addEventListener("change", () => {
        boxCartao.style.display = selForma.value === "Cartão de crédito" ? "block" : "none";
      });
    }
    atualizarPreviewRepeticao();
  }

  function openFechamentoCultoModal() {
    const m = document.getElementById("fin-modal-root");
    if (!m) return;
    const caixa = state.contas.find((c) => c.tipo === "caixa_fisico") || state.contas[0] || { id: 1 };
    const banco = state.contas.find((c) => c.tipo !== "caixa_fisico") || caixa;
    const catDizimo = state.categorias.find((c) => /d[ií]zimo/i.test(c.nome)) || state.categorias[0] || { id: 1 };
    const catOferta = state.categorias.find((c) => /ofertas gerais/i.test(c.nome)) || catDizimo;

    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:780px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">⛪ Fechar Arrecadação do Culto</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <div id="modal-alert"></div>
          <form id="form-fechamento-culto">
            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Data do Culto *</label>
                <input type="date" class="fin-input" name="data_culto" value="${todayISO()}" required />
              </div>
              <div class="fin-field">
                <label>Identificação do Culto *</label>
                <input type="text" class="fin-input" name="culto_nome" placeholder="Ex: Culto de Celebração Domingo Noite" required />
              </div>
            </div>

            <p style="font-size:0.8rem;color:var(--fin-muted);margin-bottom:0.65rem">
              Informe os valores apurados por categoria e forma de pagamento. Entradas já lançadas na mesma data serão vinculadas sem duplicar.
            </p>

            <div class="fin-table-wrap" style="margin-bottom:0.85rem">
              <table class="fin-table">
                <thead><tr><th>Tipo</th><th>Forma de Pagamento</th><th>Conta Destino</th><th>Valor (R$)</th></tr></thead>
                <tbody>
                  <tr>
                    <td>Dízimos em Espécie<input type="hidden" class="fc-cat" value="${catDizimo.id}" /><input type="hidden" class="fc-desc" value="Dízimos em Espécie" /></td>
                    <td><input type="hidden" class="fc-forma" value="Dinheiro" />Dinheiro</td>
                    <td><select class="fin-select fc-conta">${state.contas.map((c) => `<option value="${c.id}" ${c.id === caixa.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></td>
                    <td><input type="number" step="0.01" min="0" class="fin-input fc-valor" value="0" /></td>
                  </tr>
                  <tr>
                    <td>Ofertas em Espécie<input type="hidden" class="fc-cat" value="${catOferta.id}" /><input type="hidden" class="fc-desc" value="Ofertas em Espécie" /></td>
                    <td><input type="hidden" class="fc-forma" value="Dinheiro" />Dinheiro</td>
                    <td><select class="fin-select fc-conta">${state.contas.map((c) => `<option value="${c.id}" ${c.id === caixa.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></td>
                    <td><input type="number" step="0.01" min="0" class="fin-input fc-valor" value="0" /></td>
                  </tr>
                  <tr>
                    <td>Dízimos via PIX<input type="hidden" class="fc-cat" value="${catDizimo.id}" /><input type="hidden" class="fc-desc" value="Dízimos via PIX" /></td>
                    <td><input type="hidden" class="fc-forma" value="PIX" />PIX</td>
                    <td><select class="fin-select fc-conta">${state.contas.map((c) => `<option value="${c.id}" ${c.id === banco.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></td>
                    <td><input type="number" step="0.01" min="0" class="fin-input fc-valor" value="0" /></td>
                  </tr>
                  <tr>
                    <td>Ofertas via PIX<input type="hidden" class="fc-cat" value="${catOferta.id}" /><input type="hidden" class="fc-desc" value="Ofertas via PIX" /></td>
                    <td><input type="hidden" class="fc-forma" value="PIX" />PIX</td>
                    <td><select class="fin-select fc-conta">${state.contas.map((c) => `<option value="${c.id}" ${c.id === banco.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></td>
                    <td><input type="number" step="0.01" min="0" class="fin-input fc-valor" value="0" /></td>
                  </tr>
                  <tr>
                    <td>Ofertas / Dízimos Cartão<input type="hidden" class="fc-cat" value="${catOferta.id}" /><input type="hidden" class="fc-desc" value="Arrecadação Maquininha Cartão" /></td>
                    <td><input type="hidden" class="fc-forma" value="Cartão de débito" />Cartão</td>
                    <td><select class="fin-select fc-conta">${state.contas.map((c) => `<option value="${c.id}" ${c.id === banco.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></td>
                    <td><input type="number" step="0.01" min="0" class="fin-input fc-valor" value="0" /></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="fin-form-grid">
              <div class="fin-field">
                <label>1º Responsável pela Conferência *</label>
                <input type="text" class="fin-input" name="conferente1" value="${esc(state.user.nome)}" required />
              </div>
              <div class="fin-field">
                <label>2º Responsável pela Conferência (Testemunha) *</label>
                <input type="text" class="fin-input" name="conferente2" placeholder="Nome do 2º conferente" required />
              </div>
            </div>
            <div class="fin-field">
              <label>Observações da Contagem</label>
              <input type="text" class="fin-input" name="observacoes" placeholder="Opcional" />
            </div>

            <div class="fin-modal-footer">
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-success">Confirmar e Fechar Arrecadação</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function openQuitarModal(id) {
    const l = state.lancamentos.find((x) => String(x.id) === String(id));
    if (!l) return;
    const isSaida = l.tipo === "saida";
    const acaoVerbo = isSaida ? "Pagar" : "Receber";
    const acaoSubst = isSaida ? "Pagamento" : "Recebimento";
    const totalFloat = (l.valor / 100);
    const m = document.getElementById("fin-modal-root");
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:540px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">${isSaida ? "💳 Registrar Pagamento" : "💰 Registrar Recebimento"} #${l.id}</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          
          <div style="background:#f8fafc;border:1px solid var(--fin-border);border-radius:12px;padding:0.9rem;margin-bottom:1rem">
            <div style="font-size:0.95rem;font-weight:800;color:var(--fin-text);margin-bottom:0.25rem">${esc(l.descricao)}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.4rem;font-size:0.82rem;color:var(--fin-muted)">
              <span>${l.categoria_nome ? `📁 ${esc(l.categoria_nome)}` : ""} ${l.fornecedor ? `• 🏢 ${esc(l.fornecedor)}` : ""}</span>
              <span style="font-size:1.05rem;font-weight:900;color:${isSaida ? 'var(--fin-danger)' : 'var(--fin-success)'}">
                Total pendente: ${fmtMoney(l.valor)}
              </span>
            </div>
          </div>

          <form id="form-quitar-lanc" data-id="${l.id}">
            <!-- Seletor de Modo: Quitar Total vs Quitar Parcial -->
            <div class="fin-field" style="margin-bottom:0.85rem">
              <label style="font-weight:700">Tipo de ${acaoSubst} *</label>
              <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
                <label class="fin-radio-pill" style="flex:1;justify-content:center">
                  <input type="radio" name="modo_quitacao" value="total" checked />
                  <span>Quitar Total (${fmtMoney(l.valor)})</span>
                </label>
                <label class="fin-radio-pill" style="flex:1;justify-content:center">
                  <input type="radio" name="modo_quitacao" value="parcial" />
                  <span>${acaoVerbo} Parcial (deixar restante)</span>
                </label>
              </div>
            </div>

            <!-- Campo Valor Pago/Recebido -->
            <div class="fin-field" style="margin-bottom:0.85rem">
              <label id="label-valor-pago">Valor ${isSaida ? "Pago" : "Recebido"} Agora (R$) *</label>
              <input type="number" step="0.01" min="0.01" max="${totalFloat.toFixed(2)}" class="fin-input" id="input-valor-pago" name="valor_pago" value="${totalFloat.toFixed(2)}" required style="font-size:1.1rem;font-weight:800" />
            </div>

            <!-- Resumo Parcial Dinâmico -->
            <div id="quitar-parcial-preview" style="display:none;background:rgba(109,40,217,0.06);border:1px dashed var(--fin-primary);border-radius:10px;padding:0.75rem 0.9rem;margin-bottom:0.85rem;font-size:0.84rem">
              <div style="display:flex;justify-content:space-between;margin-bottom:0.3rem">
                <span>Valor que será abatido agora:</span>
                <strong id="preview-abatido" style="color:var(--fin-success)">${fmtMoney(l.valor)}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem">
                <span>Saldo restante que ficará em aberto:</span>
                <strong id="preview-restante" style="color:var(--fin-danger)">R$ 0,00</strong>
              </div>
              <div style="font-size:0.75rem;color:var(--fin-muted)">
                ℹ️ O valor restante continuará pendente no sistema com o mesmo vínculo e histórico para ser quitado depois.
              </div>
            </div>

            <!-- Data do Movimento e Novo Vencimento do Saldo -->
            <div class="fin-form-grid" style="margin-bottom:0.75rem">
              <div class="fin-field">
                <label>Data do ${acaoSubst} *</label>
                <input type="date" class="fin-input" name="data_movimento" value="${todayISO()}" required />
              </div>
              <div class="fin-field" id="campo-novo-vencimento" style="display:none">
                <label>Vencimento do Saldo Restante</label>
                <input type="date" class="fin-input" name="vencimento_restante" value="${l.vencimento || todayISO()}" />
              </div>
            </div>

            <!-- Conta e Forma de Pagamento -->
            <div class="fin-form-grid" style="margin-bottom:0.75rem">
              <div class="fin-field">
                <label>Conta Utilizada *</label>
                <select class="fin-select" name="conta_id">
                  ${state.contas.map((c) => `<option value="${c.id}" ${c.id === l.conta_id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
                </select>
              </div>
              <div class="fin-field">
                <label>Forma de ${acaoSubst}</label>
                <select class="fin-select" name="forma">
                  <option value="PIX" ${l.forma === "PIX" ? "selected" : ""}>PIX</option>
                  <option value="Dinheiro" ${l.forma === "Dinheiro" ? "selected" : ""}>Dinheiro (Espécie)</option>
                  <option value="Cartão de Débito" ${l.forma === "Cartão de Débito" ? "selected" : ""}>Cartão de Débito</option>
                  <option value="Cartão de Crédito" ${l.forma === "Cartão de Crédito" ? "selected" : ""}>Cartão de Crédito</option>
                  <option value="Transferência Bancária" ${l.forma === "Transferência Bancária" ? "selected" : ""}>Transferência Bancária (TED/DOC)</option>
                  <option value="Boleto" ${l.forma === "Boleto" ? "selected" : ""}>Boleto Bancário</option>
                  <option value="Outro" ${l.forma === "Outro" ? "selected" : ""}>Outro</option>
                </select>
              </div>
            </div>

            <div class="fin-modal-footer">
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-success" id="btn-submit-quitar">
                Confirmar ${acaoSubst} Total
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const form = document.getElementById("form-quitar-lanc");
    const valInput = document.getElementById("input-valor-pago");
    const previewBox = document.getElementById("quitar-parcial-preview");
    const vencBox = document.getElementById("campo-novo-vencimento");
    const prevAbatido = document.getElementById("preview-abatido");
    const prevRestante = document.getElementById("preview-restante");
    const submitBtn = document.getElementById("btn-submit-quitar");

    function atualizarCalculo() {
      const modo = form.querySelector("input[name='modo_quitacao']:checked")?.value || "total";
      const totalCentavos = l.valor;
      if (modo === "total") {
        valInput.value = (totalCentavos / 100).toFixed(2);
        valInput.readOnly = true;
        previewBox.style.display = "none";
        vencBox.style.display = "none";
        submitBtn.innerHTML = `Confirmar ${acaoSubst} Total`;
      } else {
        valInput.readOnly = false;
        previewBox.style.display = "block";
        vencBox.style.display = "block";
        const valAtual = Number(valInput.value || 0);
        const centAtual = Math.round(valAtual * 100);
        const centRestante = Math.max(0, totalCentavos - centAtual);
        prevAbatido.innerText = fmtMoney(centAtual);
        prevRestante.innerText = fmtMoney(centRestante);
        submitBtn.innerHTML = `Confirmar ${acaoSubst} Parcial`;
      }
    }

    form.querySelectorAll("input[name='modo_quitacao']").forEach((r) => {
      r.addEventListener("change", () => {
        if (r.value === "parcial" && Number(valInput.value) >= totalFloat) {
          valInput.value = (totalFloat / 2).toFixed(2);
        }
        atualizarCalculo();
      });
    });

    valInput.addEventListener("input", () => {
      const valAtual = Number(valInput.value || 0);
      if (valAtual < totalFloat) {
        const radParcial = form.querySelector("input[name='modo_quitacao'][value='parcial']");
        if (radParcial && !radParcial.checked) {
          radParcial.checked = true;
        }
      }
      atualizarCalculo();
    });
  }

  function openEditarLancModal(id) {
    const l = state.lancamentos.find((x) => String(x.id) === String(id));
    if (!l) return;
    const tipo = l.tipo || "saida";
    const cats = state.categorias.filter((c) => (tipo === "entrada" ? c.tipo === "entrada" : c.tipo === "saida"));
    const m = document.getElementById("fin-modal-root");
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:760px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">✏️ Editar Lançamento #${l.id}</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <form id="form-editar-lanc" data-id="${l.id}">
            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Descrição *</label>
                <input type="text" class="fin-input" name="descricao" value="${esc(l.descricao)}" required placeholder="Ex: Oferta Culto de Domingo / Conta de Luz" />
              </div>
              <div class="fin-field">
                <label>Valor (R$) *</label>
                <input type="number" step="0.01" class="fin-input" name="valor" value="${(l.valor / 100).toFixed(2)}" required placeholder="0,00" />
              </div>
            </div>

            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Conta Financeira *</label>
                <select class="fin-select" name="conta_id" required>
                  ${state.contas
                    .map((c) => `<option value="${c.id}" ${String(c.id) === String(l.conta_id) ? "selected" : ""}>${esc(c.nome)} (${fmtMoney(c.saldo_atual)})</option>`)
                    .join("")}
                </select>
              </div>
              <div class="fin-field">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">
                  <label style="margin:0">Categoria *</label>
                  <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="quick-add-category" data-tipo="${tipo}" style="padding:0.15rem 0.45rem;font-size:0.75rem;line-height:1;border-radius:4px" title="Adicionar nova categoria">+ Nova</button>
                </div>
                <select class="fin-select" name="categoria_id" id="edit-cat-select">
                  ${cats.map((c) => `<option value="${c.id}" ${String(c.id) === String(l.categoria_id) ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
                </select>
              </div>
            </div>

            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Status *</label>
                <select class="fin-select" name="status">
                  <option value="efetivado" ${l.status === "efetivado" ? "selected" : ""}>Efetivado (Pago / Recebido)</option>
                  <option value="pendente" ${l.status === "pendente" ? "selected" : ""}>Pendente (Conta a Pagar / Receber)</option>
                </select>
              </div>
              <div class="fin-field">
                <label>Data do Movimento</label>
                <input type="date" class="fin-input" name="data" value="${l.data || todayISO()}" />
              </div>
              <div class="fin-field">
                <label>Data de Vencimento / Competência</label>
                <input type="date" class="fin-input" name="vencimento" value="${l.vencimento || l.data || todayISO()}" />
              </div>
            </div>

            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Forma de Pagamento</label>
                <select class="fin-select" name="forma" id="edit-forma-select">
                  ${FORMAS_PAGAMENTO.map((fp) => `<option value="${esc(fp)}" ${fp === (l.forma || "PIX") ? "selected" : ""}>${esc(fp)}</option>`).join("")}
                </select>
              </div>
              <div class="fin-field" id="edit-box-cartao-credito" style="${l.forma === "Cartão de crédito" || l.cartao_id ? "" : "display:none"}">
                <label>Cartão de Crédito</label>
                <select class="fin-select" name="cartao_id">
                  <option value="">Nenhum / Não vinculado</option>
                  ${state.cartoes.map((c) => `<option value="${c.id}" ${String(c.id) === String(l.cartao_id) ? "selected" : ""}>${esc(c.nome)} (Disp: ${fmtMoney(c.limite_disponivel)})</option>`).join("")}
                </select>
              </div>
              <div class="fin-field">
                <label>Ministério / Departamento</label>
                <select class="fin-select" name="ministerio">
                  <option value="">Geral / Sem vínculo</option>
                  ${state.ministerios.map((m) => `<option value="${esc(m)}" ${m === l.ministerio ? "selected" : ""}>${esc(m)}</option>`).join("")}
                </select>
              </div>
              <div class="fin-field">
                <label>${tipo === "entrada" ? "Contribuinte (Opcional/Sigiloso)" : "Fornecedor / Beneficiário"}</label>
                <input type="text" class="fin-input" name="fornecedor" value="${esc(l.fornecedor || l.contribuinte || "")}" placeholder="Opcional" />
              </div>
            </div>

            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Anexar Comprovante / Nota Fiscal (Imagem ou PDF)</label>
                <input type="file" class="fin-input" id="lanc-edit-arquivo" accept="image/*,application/pdf" />
              </div>
              <div class="fin-field">
                <label>Observações</label>
                <input type="text" class="fin-input" name="observacoes" value="${esc(l.observacoes || "")}" placeholder="Detalhes adicionais..." />
              </div>
            </div>

            <div class="fin-modal-footer">
              ${
                l.status === "pendente"
                  ? `<button type="button" class="fin-btn fin-btn-success fin-btn-sm" data-action="open-quitar" data-id="${l.id}" style="margin-right:auto">
                      ${tipo === "saida" ? "💳 Pagar Agora (Total ou Parcial)" : "💰 Receber Agora (Total ou Parcial)"}
                    </button>`
                  : ""
              }
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-primary">Salvar Alterações</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const editSelForma = m.querySelector("#edit-forma-select");
    const editBoxCartao = m.querySelector("#edit-box-cartao-credito");
    if (editSelForma && editBoxCartao) {
      editSelForma.addEventListener("change", () => {
        editBoxCartao.style.display = editSelForma.value === "Cartão de crédito" ? "block" : "none";
      });
    }
  }

  function openCancelarLancModal(id) {
    const l = state.lancamentos.find((x) => String(x.id) === String(id));
    if (!l) return;
    const m = document.getElementById("fin-modal-root");
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:460px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">🚫 Estornar / Cancelar Lançamento #${l.id}</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <form id="form-cancelar-lanc" data-id="${l.id}">
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Motivo do Estorno / Cancelamento *</label>
              <input type="text" class="fin-input" name="motivo" placeholder="Informe o motivo para a auditoria..." required />
            </div>
            <div class="fin-modal-footer">
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Voltar</button>
              <button type="submit" class="fin-btn fin-btn-danger">Confirmar Estorno</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function openAnexosModal(lancId) {
    const m = document.getElementById("fin-modal-root");
    const res = await api(`/lancamentos/${lancId}/anexos`);
    const anexos = res.anexos || [];
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:520px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">📎 Comprovantes do Lançamento #${lancId}</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <div style="margin-bottom:1rem">
            ${
              anexos.length
                ? anexos
                    .map(
                      (a) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem;border-bottom:1px solid var(--fin-border)">
                    <span>📄 ${esc(a.nome_arquivo)}</span>
                    <a href="/controlefinanceiro/api/anexos/${a.id}" target="_blank" class="fin-btn fin-btn-outline fin-btn-sm">Abrir / Baixar</a>
                  </div>`
                    )
                    .join("")
                : `<p style="color:var(--fin-muted);font-size:0.85rem">Nenhum comprovante anexado ainda.</p>`
            }
          </div>
          ${
            canEdit()
              ? `
            <form id="form-upload-anexo" data-id="${lancId}">
              <div class="fin-field" style="margin-bottom:0.75rem">
                <label>Adicionar Comprovante (Imagem ou PDF)</label>
                <input type="file" class="fin-input" id="anexo-file-input" accept="image/*,application/pdf" required />
              </div>
              <button type="submit" class="fin-btn fin-btn-primary fin-btn-sm">Enviar Comprovante</button>
            </form>`
              : ""
          }
        </div>
      </div>
    `;
  }

  async function openPrestacaoModal() {
    const m = document.getElementById("fin-modal-root");
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:840px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">📑 Prestação de Contas (Pastoral & Diretoria)</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <div style="padding:2.5rem 1rem;text-align:center;font-size:1.05rem;color:var(--fin-muted)">
            Consultando informações consolidadas e registrando auditoria... ⏳
          </div>
        </div>
      </div>
    `;

    try {
      const [resumo, hist] = await Promise.all([
        api("/prestacao-contas"),
        api("/prestacao-contas/historico").catch(() => ({ logs: [] })),
      ]);

      const logsHtml = (hist.logs || []).slice(0, 10).map((l) => {
        let det = {};
        try { det = JSON.parse(l.detalhes || "{}"); } catch (_) {}
        const dataFmt = new Date(l.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const canalBadge = det.canal === "whatsapp"
          ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:700">📱 WhatsApp</span>`
          : `<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:700">💻 Web / Site</span>`;
        return `
          <tr>
            <td style="white-space:nowrap;font-size:0.8rem">${dataFmt}</td>
            <td style="font-weight:600;font-size:0.84rem">${esc(l.usuario || "Desconhecido")}</td>
            <td>${canalBadge}</td>
            <td style="font-size:0.78rem;color:var(--fin-muted)">${esc(l.ip || "-")}</td>
          </tr>
        `;
      }).join("");

      m.innerHTML = `
        <div class="fin-modal-backdrop">
          <div class="fin-modal" style="max-width:860px">
            <div class="fin-modal-header">
              <div>
                <span class="fin-modal-title">📑 Prestação de Contas Consolidada</span>
                <div style="font-size:0.78rem;color:var(--fin-muted);margin-top:2px">
                  Comunidade Cristã Curados • Acesso Exclusivo para Pastores e Diretoria
                </div>
              </div>
              <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
            </div>

            <div class="fin-alert fin-alert-info" style="margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <div>
                <strong>Auditoria Ativa:</strong> Esta consulta foi registrada com sucesso nos logs com seu usuário, data/hora e canal.
              </div>
              <span style="font-weight:700;font-size:0.82rem">📞 Tesouraria: +55 11 99111-7612</span>
            </div>

            <div style="margin-bottom:0.6rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-weight:700;font-size:0.88rem;color:var(--fin-text)">Resumo Estruturado Oficial:</span>
              <div style="display:flex;gap:6px">
                <button type="button" class="fin-btn fin-btn-sm fin-btn-outline" data-action="copy-prestacao-text" id="btn-copy-prestacao">
                  📋 Copiar Texto Completo
                </button>
                <button type="button" class="fin-btn fin-btn-sm fin-btn-outline" data-action="print-report">
                  🖨️ Imprimir
                </button>
              </div>
            </div>

            <div class="fin-prestacao-box" id="prestacao-texto-box">${esc(resumo.textoWhatsApp)}</div>

            <div style="margin-top:1.25rem">
              <span style="font-weight:800;font-size:0.88rem;color:var(--fin-text);display:block;margin-bottom:0.5rem">
                🛡️ Histórico de Quem Solicitou Prestação de Contas (Últimos acessos)
              </span>
              <div class="fin-table-wrapper" style="max-height:180px;overflow-y:auto">
                <table class="fin-table" style="font-size:0.82rem">
                  <thead>
                    <tr>
                      <th>Data / Horário</th>
                      <th>Quem Solicitou</th>
                      <th>Canal</th>
                      <th>IP / Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${logsHtml || `<tr><td colspan="4" style="text-align:center;color:var(--fin-muted)">Nenhum registro anterior localizado.</td></tr>`}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="fin-modal-footer" style="margin-top:1rem">
              <button type="button" class="fin-btn fin-btn-primary" data-action="close-modal">Concluído</button>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      alert("Erro ao carregar prestação de contas: " + err.message);
      closeModal();
    }
  }

  function openContaModal(contaId) {
    const c = contaId ? state.contas.find((x) => String(x.id) === String(contaId)) : null;
    const m = document.getElementById("fin-modal-root");
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:520px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">${c ? `Editar Conta #${c.id}` : "🏦 Cadastrar Nova Conta Financeira"}</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <form id="form-conta" data-id="${c ? c.id : ""}">
            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Nome da Conta *</label>
                <input type="text" class="fin-input" name="nome" value="${esc(c ? c.nome : "")}" required />
              </div>
              <div class="fin-field">
                <label>Tipo *</label>
                <select class="fin-select" name="tipo">
                  <option value="conta_corrente" ${c && c.tipo === "conta_corrente" ? "selected" : ""}>Conta Corrente</option>
                  <option value="conta_poupanca" ${c && c.tipo === "conta_poupanca" ? "selected" : ""}>Conta Poupança</option>
                  <option value="conta_digital" ${c && c.tipo === "conta_digital" ? "selected" : ""}>Conta Digital / PIX</option>
                  <option value="caixa_fisico" ${c && c.tipo === "caixa_fisico" ? "selected" : ""}>Caixa Físico</option>
                </select>
              </div>
            </div>
            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Instituição Financeira</label>
                <input type="text" class="fin-input" name="instituicao" value="${esc(c ? c.instituicao : "")}" />
              </div>
              <div class="fin-field">
                <label>Valor Reservado nesta Conta (R$)</label>
                <input type="number" step="0.01" class="fin-input" name="valor_reservado" value="${c ? c.valor_reservado : 0}" />
              </div>
            </div>
            ${
              !c
                ? `
              <div class="fin-form-grid">
                <div class="fin-field">
                  <label>Saldo Inicial Implantação (R$)</label>
                  <input type="number" step="0.01" class="fin-input" name="saldo_inicial" value="0" />
                </div>
                <div class="fin-field">
                  <label>Data do Saldo Inicial</label>
                  <input type="date" class="fin-input" name="data_saldo_inicial" value="${todayISO()}" />
                </div>
              </div>`
                : ""
            }
            <div class="fin-field">
              <label>Descrição / Responsável</label>
              <input type="text" class="fin-input" name="descricao" value="${esc(c ? c.descricao : "")}" />
            </div>
            <div class="fin-modal-footer">
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-primary">Salvar Conta</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function openCartaoModal(cardId) {
    const card = cardId ? state.cartoes.find((x) => String(x.id) === String(cardId)) : null;
    const m = document.getElementById("fin-modal-root");
    if (!m) return;
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:540px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">${card ? `💳 Editar Cartão #${card.id}` : "💳 Cadastrar Cartão de Crédito"}</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <form id="form-cartao" data-id="${card ? card.id : ""}">
            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Nome / Identificação do Cartão *</label>
                <input type="text" class="fin-input" name="nome" value="${esc(card ? card.nome : "")}" required placeholder="Ex: Nubank Corporativo" />
              </div>
              <div class="fin-field">
                <label>Instituição / Banco</label>
                <input type="text" class="fin-input" name="instituicao" value="${esc(card ? card.instituicao || "" : "")}" placeholder="Ex: Nubank, Bradesco, Itaú..." />
              </div>
            </div>
            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Bandeira</label>
                <select class="fin-select" name="bandeira">
                  <option value="Mastercard" ${card && card.bandeira === "Mastercard" ? "selected" : ""}>Mastercard</option>
                  <option value="Visa" ${card && card.bandeira === "Visa" ? "selected" : ""}>Visa</option>
                  <option value="Elo" ${card && card.bandeira === "Elo" ? "selected" : ""}>Elo</option>
                  <option value="American Express" ${card && card.bandeira === "American Express" ? "selected" : ""}>American Express</option>
                  <option value="Hipercard" ${card && card.bandeira === "Hipercard" ? "selected" : ""}>Hipercard</option>
                  <option value="Outra" ${card && card.bandeira === "Outra" ? "selected" : ""}>Outra</option>
                </select>
              </div>
              <div class="fin-field">
                <label>Limite Total (R$) *</label>
                <input type="number" step="0.01" min="0" class="fin-input" name="limite" value="${card ? (card.limite / 100).toFixed(2) : "0.00"}" required />
              </div>
            </div>
            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Dia de Fechamento da Fatura (1 a 31) *</label>
                <input type="number" min="1" max="31" class="fin-input" name="dia_fechamento" value="${card ? card.dia_fechamento : "1"}" required />
              </div>
              <div class="fin-field">
                <label>Dia de Vencimento da Fatura (1 a 31) *</label>
                <input type="number" min="1" max="31" class="fin-input" name="dia_vencimento" value="${card ? card.dia_vencimento : "10"}" required />
              </div>
            </div>
            <div class="fin-form-grid">
              <div class="fin-field">
                <label>Conta Bancária para Pagamento da Fatura</label>
                <select class="fin-select" name="conta_id">
                  <option value="">Não vinculada / Definir ao pagar</option>
                  ${state.contas.map((c) => `<option value="${c.id}" ${card && String(c.id) === String(card.conta_id) ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
                </select>
              </div>
              <div class="fin-field">
                <label>Cor do Cartão</label>
                <input type="color" class="fin-input" name="cor" value="${card ? esc(card.cor || "#6366f1") : "#6366f1"}" style="height:38px;padding:2px" />
              </div>
            </div>
            <div class="fin-modal-footer">
              ${card ? `<button type="button" class="fin-btn fin-btn-danger fin-btn-sm" data-action="delete-cartao" data-id="${card.id}" style="margin-right:auto">Excluir Cartão</button>` : ""}
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-primary">Salvar Cartão</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function openNovaCategoriaModal() {
    const m = document.getElementById("fin-modal-root");
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:460px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">🏷️ Nova Categoria Financeira</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <form id="form-nova-categoria">
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Nome da Categoria *</label>
              <input type="text" class="fin-input" name="nome" required />
            </div>
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Tipo *</label>
              <select class="fin-select" name="tipo">
                <option value="entrada">Entrada / Receita</option>
                <option value="saida">Saída / Despesa</option>
              </select>
            </div>
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Grupo</label>
              <input type="text" class="fin-input" name="grupo" placeholder="Ex: Ministérios, Estrutura, Receitas" />
            </div>
            <div class="fin-modal-footer">
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function openNovoUsuarioModal() {
    const m = document.getElementById("fin-modal-root");
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:480px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">👤 Autorizar Usuário no Financeiro</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <form id="form-novo-usuario">
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Nome Completo *</label>
              <input type="text" class="fin-input" name="nome" required />
            </div>
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>WhatsApp (com DDD) *</label>
              <input type="text" class="fin-input" name="telefone" placeholder="Ex: 11 99999-9999" required />
            </div>
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Nível de Acesso *</label>
              <select class="fin-select" name="papel">
                <option value="tesouraria">Tesouraria</option>
                <option value="lideranca">Pastor / Liderança</option>
                <option value="lider_ministerio">Líder de Ministério</option>
                <option value="auditoria">Auditoria / Consulta</option>
                <option value="admin_financeiro">Administrador Financeiro</option>
              </select>
            </div>
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Ministério (Obrigatório se Líder de Ministério)</label>
              <select class="fin-select" name="ministerio">
                <option value="">Todos os ministérios</option>
                ${state.ministerios.map((min) => `<option value="${esc(min)}">${esc(min)}</option>`).join("")}
              </select>
            </div>
            <div class="fin-modal-footer">
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-primary">Autorizar Acesso</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function openAlterarSenhaModal() {
    const m = document.getElementById("fin-modal-root");
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:440px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">🔑 Alterar Minha Senha</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <form id="form-alterar-senha">
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Senha Atual *</label>
              <input type="password" class="fin-input" name="senha_atual" required />
            </div>
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Nova Senha (mín. 6 caracteres) *</label>
              <input type="password" class="fin-input" name="nova_senha" minlength="6" required />
            </div>
            <div class="fin-modal-footer">
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-primary">Salvar Nova Senha</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function open2FASetupModal() {
    const m = document.getElementById("fin-modal-root");
    const res = await api("/2fa/gerar", { method: "POST" });
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:480px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">🛡️ Autenticação em 2 Etapas (2FA)</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <p style="font-size:0.84rem;margin-bottom:0.75rem">
            Adicione a chave secreta abaixo no seu aplicativo autenticador (Google Authenticator / Authy) e digite o código de 6 dígitos gerado:
          </p>
          <div class="fin-alert fin-alert-info" style="font-family:monospace;word-break:break-all;text-align:center">
            ${esc(res.secret)}
          </div>
          <form id="form-ativar-2fa">
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Código de 6 dígitos do App *</label>
              <input type="text" class="fin-input" name="codigo" maxlength="6" required />
            </div>
            <div class="fin-modal-footer">
              ${
                state.user.totp_ativo
                  ? `<button type="button" class="fin-btn fin-btn-danger" data-action="desativar-2fa">Desativar 2FA</button>`
                  : ""
              }
              <button type="submit" class="fin-btn fin-btn-success">Ativar 2FA</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ==================== EVENT DELEGATION ====================
  function bindEvents() {
    function closeMobileNav() {
      const dd = document.getElementById("fin-mobile-dropdown");
      const bd = document.getElementById("fin-mobile-backdrop");
      const caret = document.querySelector(".fin-mobile-menu-caret");
      if (dd) {
        dd.style.display = "none";
        dd.classList.remove("open");
      }
      if (bd) bd.style.display = "none";
      if (caret) caret.style.transform = "rotate(0deg)";
    }

    function openMobileNav() {
      const dd = document.getElementById("fin-mobile-dropdown");
      const bd = document.getElementById("fin-mobile-backdrop");
      const caret = document.querySelector(".fin-mobile-menu-caret");
      if (dd) {
        dd.style.display = "block";
        dd.classList.add("open");
      }
      if (bd) bd.style.display = "block";
      if (caret) caret.style.transform = "rotate(180deg)";
    }

    document.addEventListener("click", async (e) => {
      // Fechar menu mobile ao clicar fora
      const dd = document.getElementById("fin-mobile-dropdown");
      if (dd && (dd.style.display !== "none" || dd.classList.contains("open"))) {
        if (!e.target.closest("#fin-mobile-dropdown") && !e.target.closest("[data-action='toggle-mobile-dropdown']")) {
          closeMobileNav();
        }
      }

      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");

      if (action === "close-mobile-dropdown") {
        closeMobileNav();
      } else if (action === "go-primeiro-acesso") {
        const u = document.getElementById("login-usuario");
        if (u) state.loginPhone = u.value;
        state.loginStep = "primeiro_acesso";
        renderLogin();
      } else if (action === "go-recuperar") {
        state.loginStep = "recuperar";
        renderLogin();
      } else if (action === "go-login") {
        state.loginStep = "login";
        renderLogin();
      } else if (action === "logout") {
        closeMobileNav();
        await api("/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/controlefinanceiro/login";
      } else if (action === "switch-tab") {
        closeMobileNav();
        state.tab = btn.getAttribute("data-tab") || "dashboard";
        if (state.tab === "prestacao") {
          const [rRes, hRes] = await Promise.all([
            api("/prestacao-contas?registrar_auditoria=0").catch(() => null),
            api("/prestacao-contas/historico" + (state.prestacaoMesFiltro ? `?mes=${state.prestacaoMesFiltro}` : "")).catch(() => ({ logs: [] })),
          ]);
          if (rRes) state.prestacaoResumo = rRes;
          state.prestacaoHistorico = hRes.logs || [];
        }
        renderApp();
      } else if (action === "toggle-mobile-dropdown") {
        const dd = document.getElementById("fin-mobile-dropdown");
        const visivel = dd && (dd.style.display === "block" || dd.classList.contains("open"));
        if (visivel) {
          closeMobileNav();
        } else {
          openMobileNav();
        }
      } else if (action === "quick-add-category") {
        const tipo = btn.getAttribute("data-tipo") || "saida";
        const nome = prompt(`Nova Categoria de ${tipo === "entrada" ? "Receita / Entrada" : "Despesa / Saída"}:`);
        if (nome && nome.trim()) {
          try {
            const res = await api("/categorias", {
              method: "POST",
              body: { nome: nome.trim(), tipo, grupo: tipo === "entrada" ? "Receitas" : "Despesas Gerais" }
            });
            await loadAllData();
            const catSelects = document.querySelectorAll("select[name='categoria_id']");
            catSelects.forEach((sel) => {
              const cats = state.categorias.filter((c) => (tipo === "entrada" ? c.tipo === "entrada" : c.tipo === "saida"));
              sel.innerHTML = cats.map((c) => `<option value="${c.id}" ${res.id && c.id === res.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("");
            });
          } catch (err) {
            alert("❌ " + (err.message || "Erro ao cadastrar categoria."));
          }
        }
      } else if (action === "apply-filters") {
        const p = document.getElementById("flt-periodo");
        const ini = document.getElementById("flt-inicio");
        const fim = document.getElementById("flt-fim");
        const cta = document.getElementById("flt-conta");
        const cat = document.getElementById("flt-categoria");
        const min = document.getElementById("flt-ministerio");
        if (p) state.filters.periodo = p.value;
        if (ini) state.filters.inicio = ini.value;
        if (fim) state.filters.fim = fim.value;
        if (cta) state.filters.conta_id = cta.value;
        if (cat) state.filters.categoria_id = cat.value;
        if (min) state.filters.ministerio = min.value;
        await loadAllData();
        renderApp();
      } else if (action === "close-modal") {
        closeModal();
      } else if (action === "filter-dash-block") {
        const target = btn.getAttribute("data-target");
        document.querySelectorAll(".fin-pill-btn").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const secs = document.querySelectorAll(".fin-dash-section");
        if (target === "all") {
          secs.forEach((s) => (s.style.display = ""));
        } else {
          secs.forEach((s) => {
            if (s.classList.contains(`fin-sec-${target}`)) {
              s.style.display = "";
            } else {
              s.style.display = "none";
            }
          });
        }
      } else if (action === "open-prestacao") {
        openPrestacaoModal();
      } else if (action === "copy-prestacao-text") {
        const box = document.getElementById("prestacao-texto-box");
        if (box) {
          const txt = box.textContent || box.innerText;
          navigator.clipboard.writeText(txt).then(() => {
            const old = btn.innerHTML;
            btn.innerHTML = "✅ Copiado!";
            setTimeout(() => { btn.innerHTML = old; }, 2500);
          }).catch(() => {
            alert("Texto selecionado: use Ctrl+C para copiar.");
          });
        }
      } else if (action === "gerar-prestacao-oficial") {
        btn.disabled = true;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = "⏳ Atualizando...";
        try {
          const [resumo, hist] = await Promise.all([
            api("/prestacao-contas?registrar_auditoria=1"),
            api("/prestacao-contas/historico" + (state.prestacaoMesFiltro ? `?mes=${state.prestacaoMesFiltro}` : "")),
          ]);
          state.prestacaoResumo = resumo;
          state.prestacaoHistorico = hist.logs || [];
          renderApp();
        } catch (e) {
          alert("Erro ao atualizar prestação: " + e.message);
          btn.disabled = false;
          btn.innerHTML = oldHtml;
        }
      } else if (action === "open-lancamento") {
        openLancamentoModal({
          tipo: btn.getAttribute("data-tipo"),
          status: btn.getAttribute("data-status"),
          conta: btn.getAttribute("data-conta"),
          destino: btn.getAttribute("data-destino"),
          forma: btn.getAttribute("data-forma"),
        });
      } else if (action === "open-fechamento-culto") {
        openFechamentoCultoModal();
      } else if (action === "open-quitar") {
        openQuitarModal(btn.getAttribute("data-id"));
      } else if (action === "open-editar-lanc") {
        openEditarLancModal(btn.getAttribute("data-id"));
      } else if (action === "open-cancelar-lanc") {
        openCancelarLancModal(btn.getAttribute("data-id"));
      } else if (action === "open-anexos") {
        openAnexosModal(btn.getAttribute("data-id"));
      } else if (action === "open-nova-conta") {
        openContaModal(null);
      } else if (action === "open-edit-conta") {
        openContaModal(btn.getAttribute("data-id"));
      } else if (action === "open-nova-categoria") {
        openNovaCategoriaModal();
      } else if (action === "open-novo-usuario") {
        openNovoUsuarioModal();
      } else if (action === "open-alterar-senha") {
        openAlterarSenhaModal();
      } else if (action === "open-2fa-setup") {
        open2FASetupModal();
      } else if (action === "desativar-2fa") {
        await api("/2fa/desativar", { method: "POST" });
        state.user.totp_ativo = 0;
        closeModal();
        renderApp();
      } else if (action === "reset-senha-user") {
        const uid = btn.getAttribute("data-id");
        await api(`/usuarios/${uid}`, { method: "PUT", body: { redefinir_senha: true } });
        alert("Redefinição liberada! O usuário já pode clicar em 'Primeiro Acesso / Criar Senha'.");
      } else if (action === "prev-month") {
        alterarMesFiltro(-1);
        await loadAllData();
        renderApp();
      } else if (action === "next-month") {
        alterarMesFiltro(1);
        await loadAllData();
        renderApp();
      } else if (action === "toggle-view-mode") {
        state.viewMode = state.viewMode === "timeline" ? "table" : "timeline";
        renderApp();
      } else if (action === "open-novo-cartao") {
        openCartaoModal(null);
      } else if (action === "open-edit-cartao") {
        openCartaoModal(btn.getAttribute("data-id"));
      } else if (action === "delete-cartao") {
        const cid = btn.getAttribute("data-id");
        if (confirm("Deseja realmente desativar ou excluir este cartão?")) {
          await api(`/cartoes/${cid}`, { method: "DELETE" });
          closeModal();
          await loadAllData();
          renderApp();
        }
      } else if (action === "print-report") {
        window.print();
      }
    });

    document.addEventListener("change", async (e) => {
      if (e.target && e.target.id === "flt-periodo") {
        state.filters.periodo = e.target.value;
        renderApp();
      }
      if (e.target && e.target.id === "flt-prestacao-mes") {
        state.prestacaoMesFiltro = e.target.value;
        const hRes = await api("/prestacao-contas/historico" + (state.prestacaoMesFiltro ? `?mes=${state.prestacaoMesFiltro}` : "")).catch(() => ({ logs: [] }));
        state.prestacaoHistorico = hRes.logs || [];
        renderApp();
      }
    });

    document.addEventListener("input", (e) => {
      if (e.target && e.target.classList.contains("input-cedula")) {
        const denom = e.target.getAttribute("data-denom");
        state.cedulas[denom] = Number(e.target.value || 0);
        const caixa = state.contas.find((c) => c.tipo === "caixa" || c.tipo === "caixa_fisico") || state.contas[0] || { saldo_atual: 0 };
        const total = Object.entries(state.cedulas).reduce((s, [d, q]) => s + Math.round(Number(d) * 100) * Number(q || 0), 0);
        const diff = total - Number(caixa.saldo_atual || 0);
        const elTot = document.getElementById("caixa-total-contado");
        const elDiff = document.getElementById("caixa-diff-val");
        const elMsg = document.getElementById("caixa-diff-msg");
        if (elTot) elTot.textContent = fmtMoney(total);
        if (elDiff) elDiff.textContent = fmtMoney(diff);
        if (elMsg) elMsg.textContent = Math.abs(diff) < 1 ? "✅ Caixa batendo perfeitamente!" : "⚠️ Diferença detectada! Não altera saldo sozinho.";
      }
    });

    document.addEventListener("submit", async (e) => {
      const form = e.target;
      if (!form || !form.id) return;
      e.preventDefault();

      try {
        if (form.id === "fin-login-form") {
          state.loginPhone = document.getElementById("login-usuario").value;
          state.loginPass = document.getElementById("login-senha").value;
          const res = await api("/login", {
            method: "POST",
            body: { usuario: state.loginPhone, senha: state.loginPass },
            allowError: true,
          });
          if (res.primeiro_acesso) {
            state.loginStep = "primeiro_acesso";
            renderLogin();
            return;
          }
          if (res.requer_2fa) {
            state.loginStep = "2fa";
            renderLogin();
            return;
          }
          if (!res.ok) {
            showLoginAlert(res.erro || "Falha na autenticação");
            return;
          }
          window.location.href = "/controlefinanceiro";
        } else if (form.id === "fin-first-form") {
          const u = document.getElementById("first-usuario").value;
          const s = document.getElementById("first-senha").value;
          const c = document.getElementById("first-confirma").value;
          await api("/primeiro-acesso", {
            method: "POST",
            body: { usuario: u, nova_senha: s, confirmar_senha: c },
          });
          window.location.href = "/controlefinanceiro";
        } else if (form.id === "fin-2fa-form") {
          const code = document.getElementById("login-2fa-code").value;
          const res = await api("/login", {
            method: "POST",
            body: { usuario: state.loginPhone, senha: state.loginPass, codigo_2fa: code },
          });
          if (res.ok) window.location.href = "/controlefinanceiro";
        } else if (form.id === "form-novo-lancamento") {
          const fd = new FormData(form);
          const payload = Object.fromEntries(fd.entries());
          payload.tipo = form.getAttribute("data-tipo");
          if (payload.tipo_repeticao === "parcelada") {
            payload.total_parcelas = payload.total_parcelas || 2;
            payload.parcela_inicial = payload.parcela_inicial || 1;
            payload.modo_valor = payload.modo_valor || "total";
            payload.parcelas = payload.total_parcelas;
          } else if (payload.tipo_repeticao === "fixa") {
            payload.parcelas = 1;
            payload.repetir_meses = payload.repetir_meses || 12;
          } else {
            payload.parcelas = 1;
            payload.repetir_meses = 0;
          }
          const fileInput = document.getElementById("lanc-arquivo");
          if (fileInput && fileInput.files && fileInput.files[0]) {
            const f = fileInput.files[0];
            payload.anexo = {
              nome_arquivo: f.name,
              mime_type: f.type,
              dados_base64: await fileToBase64(f),
            };
          }
          let res = await api("/lancamentos", { method: "POST", body: payload, allowError: true });
          if (res.duplicado || res.saldo_negativo) {
            if (confirm((res.erro || "Confirmar operação?") + "\n\nDeseja confirmar mesmo assim?")) {
              payload.confirmar_duplicidade = true;
              payload.confirmar_saldo_negativo = true;
              res = await api("/lancamentos", { method: "POST", body: payload });
            } else {
              return;
            }
          } else if (!res.ok) {
            throw new Error(res.erro || "Erro ao salvar lançamento");
          }
          closeModal();
          await loadAllData();
          renderApp();
        } else if (form.id === "form-conferencia-caixa") {
          const conta_id = Number(form.getAttribute("data-conta-id"));
          const obs = document.getElementById("conf-obs").value;
          await api("/conferencias", {
            method: "POST",
            body: { conta_id, detalhes_cedulas: state.cedulas, observacoes: obs },
          });
          await loadAllData();
          renderApp();
        } else if (form.id === "form-fechamento-culto") {
          const fd = new FormData(form);
          const payload = Object.fromEntries(fd.entries());
          const rows = form.querySelectorAll("tbody tr");
          payload.itens = [];
          rows.forEach((tr) => {
            const valor = Number(tr.querySelector(".fc-valor").value || 0);
            if (valor > 0) {
              payload.itens.push({
                categoria_id: Number(tr.querySelector(".fc-cat").value),
                descricao: tr.querySelector(".fc-desc").value,
                forma_pagamento: tr.querySelector(".fc-forma").value,
                conta_id: Number(tr.querySelector(".fc-conta").value),
                valor,
              });
            }
          });
          await api("/fechamentos", { method: "POST", body: payload });
          closeModal();
          await loadAllData();
          renderApp();
        } else if (form.id === "form-quitar-lanc") {
          const id = form.getAttribute("data-id");
          const fd = new FormData(form);
          const res = await api(`/lancamentos/${id}/quitar`, { method: "POST", body: Object.fromEntries(fd.entries()) });
          closeModal();
          await loadAllData();
          renderApp();
          if (res && res.message) {
            alert("✅ " + res.message);
          }
        } else if (form.id === "form-editar-lanc") {
          const id = form.getAttribute("data-id");
          const fd = new FormData(form);
          const payload = Object.fromEntries(fd.entries());
          const fileInput = document.getElementById("lanc-edit-arquivo");
          if (fileInput && fileInput.files && fileInput.files[0]) {
            const f = fileInput.files[0];
            const anexoPayload = {
              nome_arquivo: f.name,
              mime_type: f.type,
              dados_base64: await fileToBase64(f),
            };
            await api(`/lancamentos/${id}/anexos`, { method: "POST", body: anexoPayload }).catch(() => {});
          }
          await api(`/lancamentos/${id}`, { method: "PUT", body: payload });
          closeModal();
          await loadAllData();
          renderApp();
        } else if (form.id === "form-cancelar-lanc") {
          const id = form.getAttribute("data-id");
          const fd = new FormData(form);
          await api(`/lancamentos/${id}/cancelar`, { method: "POST", body: Object.fromEntries(fd.entries()) });
          closeModal();
          await loadAllData();
          renderApp();
        } else if (form.id === "form-upload-anexo") {
          const id = form.getAttribute("data-id");
          const f = document.getElementById("anexo-file-input").files[0];
          if (f) {
            await api(`/lancamentos/${id}/anexos`, {
              method: "POST",
              body: {
                nome_arquivo: f.name,
                mime_type: f.type,
                dados_base64: await fileToBase64(f),
              },
            });
            openAnexosModal(id);
            await loadAllData();
          }
        } else if (form.id === "form-conta") {
          const id = form.getAttribute("data-id");
          const fd = new FormData(form);
          const body = Object.fromEntries(fd.entries());
          if (id) {
            await api(`/contas/${id}`, { method: "PUT", body });
          } else {
            await api("/contas", { method: "POST", body });
          }
          closeModal();
          await loadAllData();
          renderApp();
        } else if (form.id === "form-cartao") {
          const id = form.getAttribute("data-id");
          const fd = new FormData(form);
          const body = Object.fromEntries(fd.entries());
          if (id) {
            await api(`/cartoes/${id}`, { method: "PUT", body });
          } else {
            await api("/cartoes", { method: "POST", body });
          }
          closeModal();
          await loadAllData();
          renderApp();
        } else if (form.id === "form-nova-categoria") {
          const fd = new FormData(form);
          await api("/categorias", { method: "POST", body: Object.fromEntries(fd.entries()) });
          closeModal();
          await loadAllData();
          renderApp();
        } else if (form.id === "form-novo-usuario") {
          const fd = new FormData(form);
          await api("/usuarios", { method: "POST", body: Object.fromEntries(fd.entries()) });
          closeModal();
          await loadAllData();
          renderApp();
        } else if (form.id === "form-alterar-senha") {
          const fd = new FormData(form);
          await api("/alterar-senha", { method: "POST", body: Object.fromEntries(fd.entries()) });
          closeModal();
          alert("Senha alterada com sucesso!");
        } else if (form.id === "form-ativar-2fa") {
          const fd = new FormData(form);
          await api("/2fa/ativar", { method: "POST", body: Object.fromEntries(fd.entries()) });
          state.user.totp_ativo = 1;
          closeModal();
          renderApp();
        }
      } catch (err) {
        const alertEl = document.getElementById("modal-alert");
        if (alertEl) {
          alertEl.innerHTML = `<div class="fin-alert fin-alert-danger">${esc(err.message)}</div>`;
        } else if (state.user) {
          alert(err.message);
        } else {
          showLoginAlert(err.message);
        }
      }
    });
  }

  async function init() {
    bindEvents();
    const root = document.getElementById("app");
    if (!root) return;
    const pagina = root.getAttribute("data-pagina");
    if (pagina === "login") {
      renderLogin();
      return;
    }
    try {
      const me = await api("/me");
      state.user = me.usuario;
      await loadAllData();
      renderApp();
    } catch (_) {
      window.location.href = "/controlefinanceiro/login";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
