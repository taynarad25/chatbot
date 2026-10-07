/**
 * =========================================================================
 * GOOGLE APPS SCRIPT: INSCRIÇÕES E ANAMNESE — AULA DE PILATES / SAÚDE DA MULHER
 * Comunidade Cristã Curados • Outubro Rosa
 * =========================================================================
 * 
 * INSTRUÇÕES DE INSTALAÇÃO NA SUA PLANILHA:
 * 1. Abra sua Planilha no Google Sheets (https://sheets.google.com).
 * 2. No menu superior, clique em "Extensões" > "Apps Script".
 * 3. Apague qualquer código existente no editor e cole todo este código.
 * 4. Clique no ícone de disquete (Salvar).
 * 5. Clique no botão azul "Implantar" (canto superior direito) > "Nova implantação".
 * 6. Clique na engrenagem ao lado de "Selecione o tipo" e escolha "App da Web".
 * 7. Preencha:
 *    - Descrição: Inscrições Saúde da Mulher Pilates
 *    - Executar como: "Eu" (seu e-mail)
 *    - Quem pode acessar: "Qualquer pessoa" (MUITO IMPORTANTE para o site conseguir enviar)
 * 8. Clique em "Implantar", autorize o acesso à sua conta Google.
 * 9. Copie o "URL do app da Web" gerado. Esse URL pode ser colocado no seu .env como SAUDE_MULHER_WEBAPP_URL!
 */

const NOME_ABA = "Inscrições - Pilates";

// Cabeçalhos oficiais da Anamnese
const CABECALHOS = [
  "Carimbo de data/hora",
  "Nome Completo",
  "Idade",
  "Telefone (WhatsApp)",
  "1- Condições de Saúde",
  "Tratamento / Medicamentos",
  "2- Já realizou cirurgia?",
  "Detalhes da Cirurgia (Qual e quando)",
  "3- Lesão / Dor (Coluna, Joelho, Ombro, Quadril)",
  "Detalhes da Lesão / Dor",
  "4- Limitação física ou intelectual?",
  "Detalhes da Limitação",
  "5- Gestante ou suspeita de gravidez?",
  "6- Pratica atividade física?",
  "Detalhes da Atividade Física",
  "7- Observações adicionais de saúde"
];

function obterOuCriarAba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(NOME_ABA);
  if (!aba) {
    aba = ss.insertSheet(NOME_ABA);
  }

  // Se a aba estiver vazia, cria os cabeçalhos e formata
  if (aba.getLastRow() === 0) {
    aba.appendRow(CABECALHOS);
    const range = aba.getRange(1, 1, 1, CABECALHOS.length);
    range.setBackground("#be185d"); // Rosa escuro elegante
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
 * Recebe a inscrição via POST do site
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
    const idade = dados.idade || "";

    if (!nome) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false,
        message: "Nome é obrigatório."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const aba = obterOuCriarAba();
    const dataHoraAtual = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

    // Formata condições de saúde (se vier como array ou string)
    let condicoes = dados.condicoesSaude || dados.condicoes || "";
    if (Array.isArray(condicoes)) {
      condicoes = condicoes.join(", ");
    }

    const linha = [
      dataHoraAtual,
      nome,
      idade,
      telefone,
      condicoes || "Nenhuma",
      dados.tratamentoMedicamento || "-",
      dados.cirurgia || "Não",
      dados.cirurgiaDetalhes || "-",
      dados.lesaoDor || "Não",
      dados.lesaoDorDetalhes || "-",
      dados.limitacao || "Não",
      dados.limitacaoDetalhes || "-",
      dados.gravida || "Não",
      dados.atividadeFisica || "Não",
      dados.atividadeFisicaDetalhes || "-",
      dados.outrasInformacoes || "-"
    ];

    aba.appendRow(linha);

    // Ajusta o alinhamento da linha inserida
    const ultLinha = aba.getLastRow();
    aba.getRange(ultLinha, 1, 1, CABECALHOS.length).setFontFamily("Montserrat").setFontSize(10);
    aba.getRange(ultLinha, 1).setHorizontalAlignment("center"); // data
    aba.getRange(ultLinha, 3).setHorizontalAlignment("center"); // idade
    aba.getRange(ultLinha, 4).setHorizontalAlignment("center"); // telefone

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      status: "success",
      message: "Inscrição de Pilates registrada com sucesso na planilha!",
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
 * Permite que a Secretaria do site consulte/sincronize os dados da planilha
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
        idade: String(row[2]),
        telefone: String(row[3]),
        condicoesSaude: row[4],
        tratamentoMedicamento: row[5],
        cirurgia: row[6],
        cirurgiaDetalhes: row[7],
        lesaoDor: row[8],
        lesaoDorDetalhes: row[9],
        limitacao: row[10],
        limitacaoDetalhes: row[11],
        gravida: row[12],
        atividadeFisica: row[13],
        atividadeFisicaDetalhes: row[14],
        outrasInformacoes: row[15]
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
