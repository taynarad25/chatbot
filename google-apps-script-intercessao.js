/**
 * =========================================================================
 * GOOGLE APPS SCRIPT: INSCRIÇÕES — TREINAMENTO DE INTERCESSÃO
 * Comunidade Cristã Curados
 * "e serás chamado reparador de brechas e restaurador de veredas" (Isaías 58:12)
 * =========================================================================
 * 
 * INSTRUÇÕES DE INSTALAÇÃO NA SUA PLANILHA GOOGLE:
 * 1. Abra sua Planilha no Google Sheets (https://sheets.google.com).
 * 2. No menu superior, clique em "Extensões" > "Apps Script".
 * 3. Apague qualquer código existente no editor e cole todo este código.
 * 4. Clique no ícone de disquete (Salvar).
 * 5. Clique no botão azul "Implantar" (canto superior direito) > "Nova implantação".
 * 6. Clique na engrenagem ao lado de "Selecione o tipo" e escolha "App da Web".
 * 7. Preencha:
 *    - Descrição: Inscrições Treinamento de Intercessão
 *    - Executar como: "Eu" (seu e-mail da conta Google)
 *    - Quem pode acessar: "Qualquer pessoa" (MUITO IMPORTANTE para o site conseguir gravar os dados)
 * 8. Clique em "Implantar" e conceda as permissões solicitadas.
 * 9. O seu URL de Web App já está configurado no sistema:
 *    https://script.google.com/macros/s/AKfycbyQk1-oLONEbLfqfdDgW3xJETF7kKZTW1lP2NpaR_vFwwK2koBaudYuODD04IT0wg65Iw/exec
 */

const NOME_ABA = "Inscrições - Intercessão";

// Cabeçalhos oficiais da planilha
const CABECALHOS = [
  "Carimbo de data/hora",
  "Nome Completo",
  "Telefone (WhatsApp)",
  "E-mail",
  "Já participou do ministério ou fez curso?",
  "Detalhes da Experiência / Curso"
];

function obterOuCriarAba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(NOME_ABA);
  if (!aba) {
    aba = ss.insertSheet(NOME_ABA);
  }

  // Se a aba for recém-criada ou vazia, insere cabeçalhos e formata
  if (aba.getLastRow() === 0) {
    aba.appendRow(CABECALHOS);
    const range = aba.getRange(1, 1, 1, CABECALHOS.length);
    range.setBackground("#4f46e5"); // Roxo elegante alinhado à identidade visual
    range.setFontColor("#ffffff");
    range.setFontWeight("bold");
    range.setFontFamily("Montserrat");
    range.setHorizontalAlignment("center");
    aba.setFrozenRows(1);
    for (let c = 1; c <= CABECALHOS.length; c++) {
      aba.autoResizeColumn(c);
    }
  }

  return aba;
}

/**
 * Recebe a inscrição via POST do site oficial
 */
function doPost(e) {
  try {
    let dados = {};
    if (e && e.postData && e.postData.contents) {
      try {
        dados = JSON.parse(e.postData.contents);
      } catch (errParse) {
        dados = e.parameter || {};
      }
    } else if (e && e.parameter) {
      dados = e.parameter;
    }

    const nome = dados.nome || dados.nomeCompleto || "";
    const telefone = dados.telefone || "";
    const email = dados.email || "";
    const experiencia = dados.experienciaIntercessao || dados.experiencia || "Não";
    const detalhes = dados.experienciaDetalhes || dados.detalhes || "-";

    if (!nome) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false,
        message: "Nome é obrigatório."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const aba = obterOuCriarAba();
    const dataHoraAtual = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

    const linha = [
      dataHoraAtual,
      nome,
      telefone,
      email,
      experiencia,
      detalhes
    ];

    aba.appendRow(linha);

    // Ajusta o alinhamento da linha inserida
    const ultLinha = aba.getLastRow();
    aba.getRange(ultLinha, 1, 1, CABECALHOS.length).setFontFamily("Montserrat").setFontSize(10);
    aba.getRange(ultLinha, 1).setHorizontalAlignment("center"); // data
    aba.getRange(ultLinha, 3).setHorizontalAlignment("center"); // telefone
    aba.getRange(ultLinha, 5).setHorizontalAlignment("center"); // experiência

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      status: "success",
      message: "Inscrição de Treinamento de Intercessão registrada com sucesso na planilha!",
      nome: nome
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (erro) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      message: "Erro ao registrar na planilha: " + erro.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Permite que o site e os líderes consultem e sincronizem as inscrições
 */
function doGet(e) {
  try {
    const aba = obterOuCriarAba();
    const ultimaLinha = aba.getLastRow();

    if (ultimaLinha <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        total: 0,
        inscricoes: []
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const valores = aba.getRange(2, 1, ultimaLinha - 1, CABECALHOS.length).getValues();
    const inscricoes = valores.map(row => {
      return {
        criadoEm: row[0],
        nome: row[1],
        telefone: String(row[2]),
        email: String(row[3]),
        experienciaIntercessao: String(row[4] || "Não"),
        experienciaDetalhes: String(row[5] || "-")
      };
    });

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      total: inscricoes.length,
      inscricoes: inscricoes
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (erro) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      message: "Erro ao ler a planilha: " + erro.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
