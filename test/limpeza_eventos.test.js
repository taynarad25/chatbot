const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const moment = require("moment-timezone");

const {
  extrairDataTerminoEvento,
  isEventoExpiradoData,
  limparTodosEventosExpirados,
  filtrarHtmlEventosExpirados,
} = require("../web/limpeza_eventos");

const {
  DATA_LIMITE_INSCRICAO,
  estaoInscricoesAbertas,
  isEventoExpirado: isSaudeMulherExpirado,
} = require("../web/saude_mulher");

test("extrairDataTerminoEvento: extrai corretamente datas únicas e intervalos", () => {
  assert.equal(extrairDataTerminoEvento("24/10/2026").format("YYYY-MM-DD"), "2026-10-24");
  assert.equal(extrairDataTerminoEvento("31/10/2026 às 15h").format("YYYY-MM-DD"), "2026-10-31");
  assert.equal(extrairDataTerminoEvento("2026-10-24").format("YYYY-MM-DD"), "2026-10-24");
  assert.equal(extrairDataTerminoEvento("24 a 26 de Outubro de 2026").format("YYYY-MM-DD"), "2026-10-26");
  assert.equal(extrairDataTerminoEvento("10/10/2026 até 12/10/2026").format("YYYY-MM-DD"), "2026-10-12");
  assert.equal(extrairDataTerminoEvento("Evento sem data"), null);
});

test("isEventoExpiradoData: expira obrigatoriamente no primeiro segundo do dia seguinte à execução", () => {
  const dataHoje = "2026-10-28";

  // Evento que ocorreu em 24/10/2026 -> expirado
  assert.equal(isEventoExpiradoData("24/10/2026", dataHoje), true);
  // Evento que ocorreu ontem (27/10/2026) -> expirado
  assert.equal(isEventoExpiradoData("27/10/2026", dataHoje), true);
  // Evento que ocorre hoje (28/10/2026) -> NÃO expirado (dia de execução)
  assert.equal(isEventoExpiradoData("28/10/2026", dataHoje), false);
  // Evento amanhã (29/10/2026) -> NÃO expirado
  assert.equal(isEventoExpiradoData("29/10/2026", dataHoje), false);
  // Evento Saúde da Mulher (31/10/2026) -> NÃO expirado em 28/10
  assert.equal(isEventoExpiradoData("31/10/2026", dataHoje), false);
  // Evento Saúde da Mulher avaliado no dia seguinte (01/11/2026) -> DEVE estar expirado
  assert.equal(isEventoExpiradoData("31/10/2026", "2026-11-01"), true);
});

test("limparTodosEventosExpirados: exclui totalmente eventos do banco no próximo dia", () => {
  const tempDbPath = path.join(__dirname, `test_limpeza_${Date.now()}.db`);
  const db = new DatabaseSync(tempDbPath);

  try {
    // Cria tabelas conforme schema do sistema
    db.exec(`
      CREATE TABLE painel_eventos (
        id TEXT PRIMARY KEY,
        slug TEXT,
        titulo TEXT,
        dataEvento TEXT,
        tipoInscricao TEXT,
        ativo INTEGER DEFAULT 1,
        criadoEm TEXT,
        atualizadoEm TEXT
      );
      CREATE TABLE painel_eventos_inscricoes (
        id TEXT PRIMARY KEY,
        eventoId TEXT,
        nome TEXT,
        telefone TEXT,
        respostas TEXT,
        criadoEm TEXT
      );
      CREATE TABLE formularios_eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT,
        evento TEXT,
        campos TEXT
      );
      CREATE TABLE descricoes_eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evento TEXT,
        descricao TEXT,
        horariosJson TEXT
      );
    `);

    // Insere eventos passados (executados em 24/10) e futuros (31/10)
    db.prepare(`
      INSERT INTO painel_eventos (id, slug, titulo, dataEvento, tipoInscricao, criadoEm, atualizadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("ev-passado", "culto-mulheres", "Culto de Mulheres", "2026-10-24", "interno", "2026-10-20", "2026-10-20");

    db.prepare(`
      INSERT INTO painel_eventos_inscricoes (id, eventoId, nome, telefone, respostas, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("insc-1", "ev-passado", "Maria", "11999998888", "{}", "2026-10-21");

    db.prepare(`
      INSERT INTO painel_eventos (id, slug, titulo, dataEvento, tipoInscricao, criadoEm, atualizadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("ev-futuro", "saude-mulher", "Saúde da Mulher", "2026-10-31", "interno", "2026-10-20", "2026-10-20");

    db.prepare(`
      INSERT INTO painel_eventos_inscricoes (id, eventoId, nome, telefone, respostas, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("insc-2", "ev-futuro", "Ana", "11977776666", "{}", "2026-10-21");

    // Formulários
    db.prepare("INSERT INTO formularios_eventos (data, evento, campos) VALUES (?, ?, ?)").run(
      "24/10/2026",
      "Culto Passado",
      "[]"
    );
    db.prepare("INSERT INTO formularios_eventos (data, evento, campos) VALUES (?, ?, ?)").run(
      "31/10/2026",
      "Encontro Futuro",
      "[]"
    );

    // Descrições
    db.prepare("INSERT INTO descricoes_eventos (evento, descricao, horariosJson) VALUES (?, ?, ?)").run(
      "Culto Passado",
      "Descrição do culto 24/10/2026",
      JSON.stringify([{ data: "2026-10-24" }])
    );
    db.prepare("INSERT INTO descricoes_eventos (evento, descricao, horariosJson) VALUES (?, ?, ?)").run(
      "Encontro Futuro",
      "Descrição do encontro 31/10/2026",
      JSON.stringify([{ data: "2026-10-31" }])
    );

    // Executa limpeza considerando a data de referência 28/10/2026
    const res = limparTodosEventosExpirados({ db, dataReferencia: "2026-10-28" });
    assert.equal(res.removidosPainel, 1);
    assert.equal(res.removidosFormularios, 1);
    assert.equal(res.removidosDescricoes, 1);

    // Verifica que o passado foi totalmente excluído
    const painelRestantes = db.prepare("SELECT * FROM painel_eventos").all();
    assert.equal(painelRestantes.length, 1);
    assert.equal(painelRestantes[0].titulo, "Saúde da Mulher");

    // Inscrições do passado também foram deletadas em cascata
    const inscricoesRestantes = db.prepare("SELECT * FROM painel_eventos_inscricoes").all();
    assert.equal(inscricoesRestantes.length, 1);
    assert.equal(inscricoesRestantes[0].nome, "Ana");

    // Formulários
    const formsRestantes = db.prepare("SELECT * FROM formularios_eventos").all();
    assert.equal(formsRestantes.length, 1);
    assert.equal(formsRestantes[0].evento, "Encontro Futuro");

    // Descrições
    const descRestantes = db.prepare("SELECT * FROM descricoes_eventos").all();
    assert.equal(descRestantes.length, 1);
    assert.equal(descRestantes[0].evento, "Encontro Futuro");
  } finally {
    db.close();
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch {}
  }
});

test("filtrarHtmlEventosExpirados: remove do HTML elementos com data de execução expirada", () => {
  const htmlEntrada = `
    <div class="card" data-event-date="2026-10-24">Culto de Mulheres (Passado)</div>
    <div class="card" data-event-date="2026-10-31">Saúde da Mulher (Futuro)</div>
  `;
  const htmlFiltrado = filtrarHtmlEventosExpirados(htmlEntrada, "2026-10-28");
  assert.ok(!htmlFiltrado.includes("Culto de Mulheres (Passado)"));
  assert.ok(htmlFiltrado.includes("Saúde da Mulher (Futuro)"));
});

test("Saúde da Mulher: prazo de inscrição encerra amanhã (29/10/2026 23:59:59)", () => {
  // Data limite configurada para horário de Brasília
  const limiteFmt = moment(DATA_LIMITE_INSCRICAO).tz("America/Sao_Paulo").format("YYYY-MM-DD HH:mm:ss");
  assert.equal(limiteFmt, "2026-10-29 23:59:59");

  // Em 28/10 está aberto
  const momentoHoje = moment.tz("2026-10-28 14:00:00", "America/Sao_Paulo");
  assert.equal(estaoInscricoesAbertas(momentoHoje), true);

  // Em 29/10 às 23h59m50s ainda está aberto
  const momentoAmanhaLimite = moment.tz("2026-10-29 23:59:50", "America/Sao_Paulo");
  assert.equal(estaoInscricoesAbertas(momentoAmanhaLimite), true);

  // Em 30/10 às 00h00m01s inscrições estão ENCERRADAS
  const momentoDepoisPrazo = moment.tz("2026-10-30 00:00:01", "America/Sao_Paulo");
  assert.equal(estaoInscricoesAbertas(momentoDepoisPrazo), false);

  // Evento em si só expira em 01/11/2026 (dia seguinte à execução em 31/10)
  assert.equal(isSaudeMulherExpirado(moment.tz("2026-10-31 20:00:00", "America/Sao_Paulo")), false);
  assert.equal(isSaudeMulherExpirado(moment.tz("2026-11-01 00:00:01", "America/Sao_Paulo")), true);
});
