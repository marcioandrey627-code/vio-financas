/* Relatórios do Vio: apresentação dos dados já recortados pelo período. */
(function (root) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const amountFields = ["receitas", "despesas", "guardado", "saldoDisponivel", "pendentesReceitas", "pendentesDespesas"];
  const series = [
    { key: "receitas", label: "Recebido", color: "var(--accent)" },
    { key: "despesas", label: "Pago", color: "var(--danger)" },
    { key: "guardado", label: "Guardado", color: "var(--primary)" }
  ];

  function money(cents) {
    if (!Number.isSafeInteger(cents)) throw new Error("Valor inválido no relatório.");
    const absolute = Math.abs(cents);
    const integer = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (cents < 0 ? "−" : "") + "R$ " + integer + "," + String(absolute % 100).padStart(2, "0");
  }

  function monthLabel(month) {
    if (month === "sem-data") return "Sem data";
    return months[Number(month.slice(5)) - 1] + "/" + month.slice(0, 4);
  }

  function monthSerial(month) {
    return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
  }

  function serialMonth(serial) {
    return String(Math.floor(serial / 12)).padStart(4, "0") + "-" + String(serial % 12 + 1).padStart(2, "0");
  }

  function svgNode(name, attrs = {}, content) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (content !== undefined) node.textContent = String(content);
    return node;
  }

  function setupChart(id, width, height, title, description) {
    const svg = document.getElementById(id);
    if (!svg) return null;
    svg.replaceChildren();
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-labelledby", id + "-title " + id + "-description");
    svg.removeAttribute("aria-label");
    svg.append(
      svgNode("title", { id: id + "-title" }, title),
      svgNode("desc", { id: id + "-description" }, description)
    );
    return svg;
  }

  function emptyChart(svg, width, message) {
    if (!svg) return;
    svg.append(svgNode("text", {
      x: width / 2, y: 125, "text-anchor": "middle", fill: "var(--muted)", "font-size": 12
    }, message));
  }

  function renderTable(monthly) {
    const body = document.getElementById("relatorio-meses");
    if (!body) return;
    const fragment = document.createDocumentFragment();
    if (!monthly.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.className = "vazio";
      cell.textContent = "Nenhuma movimentação no período selecionado.";
      row.append(cell);
      fragment.append(row);
    }
    for (const month of monthly) {
      const row = document.createElement("tr");
      const label = document.createElement("th");
      label.scope = "row";
      label.textContent = monthLabel(month.mes);
      row.append(label);
      for (const field of amountFields) {
        const cell = document.createElement("td");
        cell.textContent = money(month[field]);
        cell.style.whiteSpace = "nowrap";
        cell.style.fontVariantNumeric = "tabular-nums";
        row.append(cell);
      }
      fragment.append(row);
    }
    body.replaceChildren(fragment);
  }

  function chartMonths(monthly, period) {
    const dated = monthly.filter(month => month.mes !== "sem-data");
    if (!dated.length) return [];
    const end = period?.end ? monthSerial(period.end.slice(0, 7)) : monthSerial(dated[dated.length - 1].mes);
    const beginning = period?.start ? monthSerial(period.start.slice(0, 7)) : monthSerial(dated[0].mes);
    const start = Math.max(end - 11, beginning);
    const byMonth = new Map(dated.map(month => [month.mes, month]));
    const visible = [];
    for (let serial = start; serial <= end; serial++) {
      const mes = serialMonth(serial);
      visible.push(byMonth.get(mes) || { mes, receitas: 0, despesas: 0, guardado: 0 });
    }
    return visible;
  }

  function renderComparison(monthly, period) {
    const visible = chartMonths(monthly, period);
    const description = visible.map(month => monthLabel(month.mes) + ": " + series.map(item => item.label + " " + money(month[item.key])).join(", ")).join(". ");
    const svg = setupChart("grafico-comparativo", 600, 250, "Recebimentos, pagamentos e reservas por mês", description || "Sem valores realizados com data no período.");
    if (!svg) return;
    const max = Math.max(0, ...visible.flatMap(month => series.map(item => month[item.key])));
    if (!max) {
      emptyChart(svg, 600, "Sem valores confirmados com data neste recorte.");
      return;
    }
    const plot = { left: 72, top: 20, width: 512, height: 176 };
    const maximum = max * 1.1;
    const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
    for (let tick = 0; tick <= 4; tick++) {
      const y = plot.top + plot.height * (1 - tick / 4);
      svg.append(svgNode("line", {
        x1: plot.left, y1: y, x2: plot.left + plot.width, y2: y, stroke: "var(--border)", "stroke-width": 1
      }));
      svg.append(svgNode("text", {
        x: plot.left - 9, y: y + 3, fill: "var(--muted)", "font-size": 9, "text-anchor": "end"
      }, "R$ " + compact.format(maximum * tick / 400)));
    }
    const slot = plot.width / visible.length;
    const bar = Math.min(26, slot * 0.21);
    const gap = Math.min(4, slot * 0.04);
    visible.forEach((month, index) => {
      const center = plot.left + (index + 0.5) * slot;
      series.forEach((item, seriesIndex) => {
        const value = month[item.key];
        if (!value) return;
        const height = value / maximum * plot.height;
        const rect = svgNode("rect", {
          x: center - (bar * 3 + gap * 2) / 2 + seriesIndex * (bar + gap),
          y: plot.top + plot.height - height, width: bar, height, rx: 2, fill: item.color
        });
        rect.append(svgNode("title", {}, monthLabel(month.mes) + " · " + item.label + ": " + money(value)));
        svg.append(rect);
      });
      svg.append(svgNode("text", {
        x: center, y: 216, fill: "var(--muted)", "font-size": 10, "text-anchor": "middle"
      }, monthLabel(month.mes)));
    });
    svg.append(svgNode("text", {
      x: plot.left, y: 242, fill: "var(--muted)", "font-size": 10
    }, "Até 12 meses do recorte · somente valores confirmados"));
  }

  function groupedCategories(rows, finance, categoryName, categoryColor) {
    const groups = new Map();
    for (const row of rows) {
      if (row.tipo !== "despesa" || !finance.isConfirmed(row)) continue;
      const name = String(categoryName(row) || "Outros");
      const key = row.categoria_id ? "custom:" + row.categoria_id : "builtin:" + (row.categoria || name);
      if (!groups.has(key)) {
        const color = String(categoryColor(row) || "");
        groups.set(key, { name, total: 0, color: /^#[\da-f]{6}$/iu.test(color) ? color : "var(--accent)" });
      }
      const group = groups.get(key);
      group.total += row.valor_centavos;
      if (!Number.isSafeInteger(group.total)) throw new Error("Total de categoria fora do limite seguro.");
    }
    return [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
  }

  function renderCategories(categories) {
    const svg = setupChart("grafico-categorias", 500, 250, "Despesas confirmadas por categoria", categories.map(item => item.name + ": " + money(item.total)).join(". ") || "Nenhuma despesa confirmada no período.");
    if (!svg) return;
    if (!categories.length) {
      emptyChart(svg, 500, "Nenhuma despesa confirmada no período.");
      return;
    }
    const visible = categories.length > 8
      ? [...categories.slice(0, 7), { name: "Demais categorias (" + (categories.length - 7) + ")", total: categories.slice(7).reduce((sum, category) => sum + category.total, 0), color: "var(--muted)" }]
      : categories;
    const maximum = Math.max(...visible.map(item => item.total));
    visible.forEach((item, index) => {
      const y = 24 + index * 27;
      const characters = Array.from(item.name);
      const label = characters.length > 22 ? characters.slice(0, 21).join("") + "…" : item.name;
      const name = svgNode("text", { x: 0, y: y + 10, fill: "var(--muted)", "font-size": 10 }, label);
      name.append(svgNode("title", {}, item.name));
      svg.append(name);
      const bar = svgNode("rect", { x: 151, y, width: item.total / maximum * 220, height: 15, rx: 3, fill: item.color });
      bar.append(svgNode("title", {}, item.name + ": " + money(item.total)));
      svg.append(bar);
      svg.append(svgNode("text", {
        x: 497, y: y + 11, fill: "var(--text)", "font-size": 10, "text-anchor": "end"
      }, money(item.total)));
    });
  }

  function renderAnalysis(rows, summary, monthly, categories) {
    const element = document.getElementById("analise-mensal");
    if (!element) return;
    if (!rows.length) {
      element.textContent = "Adicione movimentações ou escolha outro período para ver a análise financeira.";
      return;
    }
    const sentences = [
      "Neste recorte, você recebeu " + money(summary.receitas) + " e pagou " + money(summary.despesas) + ".",
      "A reserva efetiva é de " + money(summary.guardado) + "; o saldo disponível após a reserva é " + money(summary.saldoDisponivel) + "."
    ];
    if (summary.receitas > 0) {
      sentences.push("Os pagamentos representam " + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(summary.despesas / summary.receitas * 100) + "% dos recebimentos confirmados.");
    }
    if (categories.length) sentences.push("Maior despesa por categoria: " + categories[0].name + " (" + money(categories[0].total) + ").");
    const dated = monthly.filter(month => month.mes !== "sem-data");
    if (dated.length > 1) {
      const best = dated.reduce((previous, current) => current.saldoDisponivel > previous.saldoDisponivel ? current : previous);
      sentences.push("Maior saldo disponível mensal no recorte: " + monthLabel(best.mes) + ", " + money(best.saldoDisponivel) + ".");
    }
    const pending = rows.length - summary.confirmadas;
    if (pending) sentences.push(pending + (pending === 1 ? " movimentação aguarda" : " movimentações aguardam") + " confirmação" + (summary.atrasadas ? "; " + summary.atrasadas + " em atraso" : "") + ". Esses valores não entram nos realizados.");
    element.textContent = sentences.join(" ");
  }

  function render({ rows = [], periodo, categoryName = row => row.categoria || "Outros", categoryColor = () => "" } = {}) {
    const finance = root.VioFinance;
    if (!finance) throw new Error("Carregue finance-core.js antes dos relatórios.");
    const summary = finance.summarize(rows);
    const monthly = finance.monthlyReport(rows);
    const categories = groupedCategories(rows, finance, categoryName, categoryColor);
    const periodLabel = document.getElementById("relatorio-periodo");
    if (periodLabel) periodLabel.textContent = typeof periodo === "string" ? periodo : periodo?.label || "Todo o período";
    renderTable(monthly);
    renderAnalysis(rows, summary, monthly, categories);
    renderComparison(monthly, periodo);
    renderCategories(categories);
    return { resumo: summary, meses: monthly, categorias: categories };
  }

  root.VioReportsUI = Object.freeze({ render });
})(typeof window !== "undefined" ? window : globalThis);
