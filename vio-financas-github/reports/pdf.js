import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import Finance from "../finance-core.js";

const PURPLE = [109, 40, 217];
const INK = [36, 19, 51];
const MUTED = [109, 90, 124];
const LINE = [226, 213, 241];

function text(value) {
  // Texto simples, nunca HTML: também evita caracteres de controle no PDF.
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[\u00a0\u202f]/g, " ");
}

function money(value = 0) {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents)) throw new Error("O relatório contém um valor monetário inválido.");
  return text((cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
}

function date(value) {
  return Finance.validDate(value) ? value.split("-").reverse().join("/") : "Sem data";
}

function month(value) {
  if (value === "sem-data") return "Sem data";
  if (!/^\d{4}-\d{2}$/u.test(value || "")) return text(value);
  return value.slice(5) + "/" + value.slice(0, 4);
}

function status(row, today) {
  // O app pode enviar o rótulo já apresentado na tabela ou o código do banco.
  if (row.status_nome || row.statusLabel) return text(row.status_nome || row.statusLabel);
  if (["Pago", "Recebido", "Pendente", "Agendado", "Atrasado"].includes(row.status)) return row.status;
  return Finance.statusLabel(row, today);
}

function checkSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.resumo) {
    throw new Error("Não há dados válidos para gerar o relatório.");
  }
  if (!Array.isArray(snapshot.meses) || !Array.isArray(snapshot.transacoes)) {
    throw new Error("O relatório financeiro está incompleto.");
  }
  const required = ["receitas", "despesas", "guardado", "saldoTotal", "saldoDisponivel", "pendentesReceitas", "pendentesDespesas"];
  for (const summary of [snapshot.resumo, ...snapshot.meses]) {
    for (const field of required) {
      if (!Number.isSafeInteger(Number(summary[field]))) {
        throw new Error("O relatório contém totais incompletos ou inválidos.");
      }
    }
  }
}

export function createReportDocument(snapshot) {
  checkSnapshot(snapshot);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const period = typeof snapshot.periodo === "string"
    ? snapshot.periodo
    : snapshot.periodo?.label || "Todo o período";
  const generated = new Date(snapshot.geradoEm || Date.now());
  const timestamp = Number.isNaN(generated.getTime())
    ? "Data de geração não informada"
    : generated.toLocaleString("pt-BR");
  const today = Finance.localDate();

  doc.setProperties({ title: text(snapshot.titulo || "Vio — Relatório financeiro"), subject: text(period), author: "Vio", creator: "Vio 2.0" });
  doc.setFont("times", "normal");
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.text("vio /", 14, 19);
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.7);
  doc.line(14, 24, width - 14, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(text(snapshot.titulo || "Relatório financeiro"), 14, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(text(period), 14, 41);
  doc.text("Gerado em " + text(timestamp), width - 14, 41, { align: "right" });

  const baseOptions = {
    margin: { left: 14, right: 14, top: 18, bottom: 17 },
    styles: { font: "helvetica", fontSize: 8.5, textColor: INK, cellPadding: 2.6, overflow: "linebreak", lineColor: LINE },
    headStyles: { fillColor: PURPLE, textColor: [255, 255, 255], fontStyle: "bold", lineWidth: 0 },
    alternateRowStyles: { fillColor: [248, 245, 253] },
    theme: "striped"
  };

  const summary = snapshot.resumo;
  autoTable(doc, {
    ...baseOptions,
    startY: 48,
    head: [["Resumo do período", "Valor"]],
    body: [
      ["Receitas confirmadas", money(summary.receitas)],
      ["Despesas confirmadas", money(summary.despesas)],
      ["Saldo total (receitas menos despesas)", money(summary.saldoTotal)],
      ["Economia efetivamente reservada", money(summary.guardado)],
      ["Saldo disponível (saldo total menos reservado)", money(summary.saldoDisponivel)],
      ["Receitas pendentes", money(summary.pendentesReceitas)],
      ["Despesas pendentes", money(summary.pendentesDespesas)]
    ],
    columnStyles: { 1: { halign: "right", cellWidth: 64 } }
  });

  function sectionTitle(label) {
    let y = (doc.lastAutoTable?.finalY || 48) + 12;
    if (y > height - 40) {
      doc.addPage();
      y = 22;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(label, 14, y);
    return y + 5;
  }

  autoTable(doc, {
    ...baseOptions,
    startY: sectionTitle("Análise mensal"),
    head: [["Mês", "Receitas", "Despesas", "Guardado", "Disponível", "A receber", "A pagar"]],
    body: snapshot.meses.length ? snapshot.meses.map(item => [
      month(item.mes), money(item.receitas), money(item.despesas), money(item.guardado),
      money(item.saldoDisponivel), money(item.pendentesReceitas), money(item.pendentesDespesas)
    ]) : [[{ content: "Nenhuma movimentação no período.", colSpan: 7 }]],
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } }
  });

  autoTable(doc, {
    ...baseOptions,
    startY: sectionTitle("Movimentações do período"),
    head: [["Prevista", "Efetiva", "Descrição", "Tipo", "Categoria", "Status", "Valor", "Guardado"]],
    body: snapshot.transacoes.length ? snapshot.transacoes.map(row => [
      date(row.data), date(row.data_efetiva), text(row.descricao),
      row.tipo === "receita" ? "Receita" : "Despesa",
      text(row.categoria_nome || row.categoria || "Outros"), status(row, today),
      money(row.valor_centavos), money(row.guardado_centavos || 0)
    ]) : [[{ content: "Nenhuma movimentação no período.", colSpan: 8 }]],
    styles: { ...baseOptions.styles, fontSize: 8 },
    columnStyles: { 0: { cellWidth: 21 }, 1: { cellWidth: 21 }, 2: { cellWidth: 66 }, 3: { cellWidth: 20 }, 4: { cellWidth: 36 }, 5: { cellWidth: 25 }, 6: { halign: "right", cellWidth: 29 }, 7: { halign: "right" } }
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(14, height - 12, width - 14, height - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Vio 2.0 | Confirmados por data efetiva; pendentes por vencimento.", 14, height - 7);
    doc.text(`${page} / ${pageCount}`, width - 14, height - 7, { align: "right" });
  }
  return doc;
}

export async function downloadReportPDF(snapshot, { canDownload = () => true } = {}) {
  // Dá oportunidade à interface de processar uma saída/troca de conta já enfileirada.
  await new Promise(resolve => setTimeout(resolve, 0));
  if (!canDownload()) throw new Error("A sessão mudou. Gere o relatório novamente.");
  const doc = createReportDocument(snapshot);
  if (!canDownload()) throw new Error("A sessão mudou. Gere o relatório novamente.");
  doc.save(`vio-relatorio-${Finance.localDate()}.pdf`);
  return { paginas: doc.getNumberOfPages(), registros: snapshot.transacoes.length };
}

if (typeof window !== "undefined") {
  window.VioExportPDF = downloadReportPDF;
}
