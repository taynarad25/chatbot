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
    categorias: [],
    ministerios: [],
    lancamentos: [],
    conferencias: [],
    fechamentos: [],
    usuarios: [],
    auditoria: [],
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
    const [dash, contasRes, lancRes, confRes, fechRes] = await Promise.all([
      api("/dashboard?" + q),
      api("/contas"),
      api("/lancamentos?" + q),
      api("/conferencias"),
      api("/fechamentos"),
    ]);
    state.dashboard = dash;
    state.contas = dash.contas || contasRes.contas || [];
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
      { id: "relatorios", label: "📑 Relatórios & Prestação" },
      { id: "config", label: "⚙️ Categorias, Segurança & Auditoria" },
    ];

    root.innerHTML = `
      <header class="fin-topbar">
        <div class="fin-brand">
          <div class="fin-brand-logo"><img src="/logo.png" alt="Logo" /></div>
          <div>
            <div class="fin-brand-title">Comunidade Cristã Curados</div>
            <div class="fin-brand-subtitle">Sistema de Controle Financeiro</div>
          </div>
        </div>
        <div class="fin-user-bar">
          <div class="fin-user-info">
            <div class="fin-user-name">${esc(state.user.nome)}</div>
            <span class="fin-user-role">${esc(ROLE_LABELS[state.user.papel] || state.user.papel)}</span>
          </div>
          <a href="/gestao" class="fin-btn fin-btn-outline fin-btn-sm" style="background:rgba(255,255,255,0.1);color:#fff;border-color:rgba(255,255,255,0.2)">📅 Portal de Gestão</a>
          <button type="button" class="fin-btn fin-btn-danger fin-btn-sm" data-action="logout">Sair</button>
        </div>
      </header>

      <nav class="fin-nav">
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
            <option value="hoje" ${f.periodo === "hoje" ? "selected" : ""}>Hoje</option>
            <option value="semana" ${f.periodo === "semana" ? "selected" : ""}>Esta Semana</option>
            <option value="mes" ${f.periodo === "mes" ? "selected" : ""}>Este Mês</option>
            <option value="mes_anterior" ${f.periodo === "mes_anterior" ? "selected" : ""}>Mês Anterior</option>
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

    const kpis = [
      { label: "1. Saldo Financeiro Total", val: fmtMoney(ind.saldo_total), sub: "Soma real de todas as contas", cls: "kpi-info" },
      { label: "2. Caixa Físico (Espécie)", val: fmtMoney(ind.dinheiro_caixa_fisico), sub: "Dinheiro em mãos na igreja", cls: "kpi-success" },
      { label: "3. Saldos Bancários", val: fmtMoney(ind.saldo_contas_bancarias.reduce((s, c) => s + c.saldo_atual, 0)), sub: `${ind.saldo_contas_bancarias.length} conta(s) bancária(s)`, cls: "kpi-info" },
      { label: "4. Total Disponível Livre", val: fmtMoney(ind.total_disponivel), sub: "Descontando reservas", cls: "kpi-success" },
      { label: "5. Valores Reservados", val: fmtMoney(ind.total_reservado), sub: "Fundos e projetos carimbados", cls: "kpi-warning" },
      { label: "6. Entradas do Período", val: fmtMoney(ind.entradas_mes), sub: `${fmtDate(state.dashboard.periodo.inicio)} a ${fmtDate(state.dashboard.periodo.fim)}`, cls: "kpi-success" },
      { label: "7. Saídas do Período", val: fmtMoney(ind.saidas_mes), sub: "Despesas efetivadas", cls: "kpi-danger" },
      { label: "8. Resultado do Período", val: fmtMoney(ind.resultado_mes), sub: ind.resultado_mes >= 0 ? "Superávit no período" : "Déficit no período", cls: ind.resultado_mes >= 0 ? "kpi-success" : "kpi-danger" },
      { label: "9. Contas a Pagar (Abertas)", val: fmtMoney(ind.contas_a_pagar), sub: "Total pendente de quitação", cls: "kpi-warning" },
      { label: "10. Contas Vencidas", val: fmtMoney(ind.contas_vencidas), sub: "Atenção imediata", cls: "kpi-danger" },
      { label: "11. Vencendo em 7 dias", val: fmtMoney(ind.contas_vencer_7d), sub: "Próximos 7 dias", cls: "kpi-warning" },
      { label: "12. Vencendo em 30 dias", val: fmtMoney(ind.contas_vencer_30d), sub: "Próximos 30 dias", cls: "kpi-info" },
      { label: "13. Valores a Receber", val: fmtMoney(ind.valores_a_receber), sub: "Entradas pendentes", cls: "kpi-info" },
      { label: "14. Dízimos Recebidos", val: fmtMoney(ind.dizimos_mes), sub: "No período filtrado", cls: "kpi-success" },
      { label: "15. Ofertas Recebidas", val: fmtMoney(ind.ofertas_mes), sub: "Gerais, especiais e missões", cls: "kpi-success" },
      { label: "16. Outras Contribuições", val: fmtMoney(ind.outras_contribuicoes), sub: "Eventos, cantina, doações", cls: "kpi-info" },
      { label: "17. Despesas Fixas", val: fmtMoney(ind.despesas_fixas_mensais), sub: "Estrutura e recorrentes", cls: "kpi-warning" },
      { label: "18. Despesas Variáveis", val: fmtMoney(ind.despesas_variaveis), sub: "Ministérios e ações", cls: "kpi-info" },
      { label: "19. Previsão de Saldo Futuro", val: fmtMoney(ind.previsao_saldo_futuro), sub: "Saldo atual + a receber - a pagar", cls: ind.previsao_saldo_futuro >= 0 ? "kpi-success" : "kpi-danger" },
      { label: "20. Movimentações Recentes", val: String(state.dashboard.movimentacoes_recentes.length), sub: "Últimos lançamentos registrados", cls: "kpi-info" },
    ];

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
      <div class="fin-kpi-grid">
        ${kpis
          .map(
            (k) => `
          <div class="fin-kpi-card ${k.cls}">
            <div class="fin-kpi-label">${esc(k.label)}</div>
            <div class="fin-kpi-value">${esc(k.val)}</div>
            <div class="fin-kpi-sub">${esc(k.sub)}</div>
          </div>`
          )
          .join("")}
      </div>

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
          ${
            canEdit()
              ? `<div style="display:flex;gap:0.5rem">
                  <button type="button" class="fin-btn ${isEntrada ? "fin-btn-success" : "fin-btn-danger"} fin-btn-sm" data-action="open-lancamento" data-tipo="${isEntrada ? "entrada" : "saida"}">
                    ➕ ${isEntrada ? "Nova Entrada" : "Nova Despesa / Conta a Pagar"}
                  </button>
                </div>`
              : ""
          }
        </div>
        ${renderLancamentosTable(list)}
      </div>
    `;
  }

  function renderLancamentosTable(list) {
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
                                  ? `<button type="button" class="fin-btn fin-btn-success fin-btn-sm" data-action="open-quitar" data-id="${l.id}">Quitar</button>`
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
          <div class="no-print" style="display:flex;gap:0.5rem">
            <a href="/controlefinanceiro/api/relatorio.csv?${q}" class="fin-btn fin-btn-success fin-btn-sm">📥 Exportar Planilha (CSV)</a>
            <button type="button" class="fin-btn fin-btn-primary fin-btn-sm" data-action="print-report">🖨️ Imprimir / Salvar PDF</button>
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
                  <td>${esc(a.criado_em)}</td>
                  <td><strong>${esc(a.usuario_nome || "-")}</strong></td>
                  <td><span class="fin-badge badge-info">${esc(a.acao)}</span></td>
                  <td>${esc(a.entidade || "-")} ${a.entidade_id ? `#${a.entidade_id}` : ""}</td>
                  <td><small style="color:var(--fin-muted)">${esc(a.depois_json || "")}</small></td>
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
                  <label>Categoria *</label>
                  <select class="fin-select" name="categoria_id">
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
                <select class="fin-select" name="forma_pagamento">
                  ${FORMAS_PAGAMENTO.map((fp) => `<option value="${esc(fp)}" ${fp === formaPadrao ? "selected" : ""}>${esc(fp)}</option>`).join("")}
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
              tipo === "saida"
                ? `
              <div class="fin-form-grid">
                <div class="fin-field">
                  <label>Parcelar em (vezes)</label>
                  <input type="number" min="1" max="60" class="fin-input" name="parcelas" value="1" />
                </div>
                <div class="fin-field">
                  <label>Repetir Mensalmente (Despesa Recorrente)</label>
                  <input type="number" min="1" max="24" class="fin-input" name="repetir_meses" value="1" />
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
    const m = document.getElementById("fin-modal-root");
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:480px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">✅ Quitar Lançamento #${l.id}</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <p style="font-size:0.86rem;margin-bottom:0.85rem">
            <strong>${esc(l.descricao)}</strong> — Valor total: <strong>${fmtMoney(l.valor)}</strong>.<br/>
            Se informar um valor menor, o sistema registrará pagamento parcial e manterá o restante pendente automaticamente.
          </p>
          <form id="form-quitar-lanc" data-id="${l.id}">
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Valor Pago Agora (R$) *</label>
              <input type="number" step="0.01" min="0.01" max="${(l.valor / 100).toFixed(2)}" class="fin-input" name="valor_pago" value="${(l.valor / 100).toFixed(2)}" required />
            </div>
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Data do Pagamento *</label>
              <input type="date" class="fin-input" name="data_movimento" value="${todayISO()}" required />
            </div>
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Conta Utilizada *</label>
              <select class="fin-select" name="conta_id">
                ${state.contas.map((c) => `<option value="${c.id}" ${c.id === l.conta_id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
              </select>
            </div>
            <div class="fin-modal-footer">
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-success">Confirmar Quitação</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function openEditarLancModal(id) {
    const l = state.lancamentos.find((x) => String(x.id) === String(id));
    if (!l) return;
    const m = document.getElementById("fin-modal-root");
    m.innerHTML = `
      <div class="fin-modal-backdrop">
        <div class="fin-modal" style="max-width:520px">
          <div class="fin-modal-header">
            <span class="fin-modal-title">✏️ Editar Lançamento #${l.id}</span>
            <button type="button" class="fin-btn fin-btn-outline fin-btn-sm" data-action="close-modal">✕</button>
          </div>
          <form id="form-editar-lanc" data-id="${l.id}">
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Descrição *</label>
              <input type="text" class="fin-input" name="descricao" value="${esc(l.descricao)}" required />
            </div>
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Valor (R$) *</label>
              <input type="number" step="0.01" class="fin-input" name="valor" value="${(l.valor / 100).toFixed(2)}" required />
            </div>
            <div class="fin-field" style="margin-bottom:0.75rem">
              <label>Motivo da Alteração (Obrigatório p/ Auditoria) *</label>
              <input type="text" class="fin-input" name="motivo" placeholder="Justifique a correção..." required />
            </div>
            <div class="fin-modal-footer">
              <button type="button" class="fin-btn fin-btn-outline" data-action="close-modal">Cancelar</button>
              <button type="submit" class="fin-btn fin-btn-primary">Salvar Correção</button>
            </div>
          </form>
        </div>
      </div>
    `;
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
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");

      if (action === "go-primeiro-acesso") {
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
        await api("/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/controlefinanceiro/login";
      } else if (action === "switch-tab") {
        state.tab = btn.getAttribute("data-tab") || "dashboard";
        renderApp();
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
      } else if (action === "print-report") {
        window.print();
      }
    });

    document.addEventListener("change", (e) => {
      if (e.target && e.target.id === "flt-periodo") {
        state.filters.periodo = e.target.value;
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
          await api(`/lancamentos/${id}/quitar`, { method: "POST", body: Object.fromEntries(fd.entries()) });
          closeModal();
          await loadAllData();
          renderApp();
        } else if (form.id === "form-editar-lanc") {
          const id = form.getAttribute("data-id");
          const fd = new FormData(form);
          await api(`/lancamentos/${id}`, { method: "PUT", body: Object.fromEntries(fd.entries()) });
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
