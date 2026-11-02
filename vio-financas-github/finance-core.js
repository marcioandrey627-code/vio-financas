/* Núcleo financeiro do Vio. Sem DOM, rede, React ou dependência de autenticação. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VioFinance = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_CENTS = 99999999999;
  const monthNames = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];

  function parseMoney(text, options = {}) {
    const allowZero = options.allowZero === true;
    if (typeof text !== "string") {
      throw new Error("Informe o valor em reais, usando vírgula para os centavos.");
    }

    const value = text.trim().replace(/^R\$\s*/iu, "");
    const pattern = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/u;

    if (!pattern.test(value)) {
      throw new Error("Use um valor como 1.234,56 ou 1234,56, com vírgula para os centavos.");
    }

    const [integerPart, fractionalPart = ""] = value.split(",");
    const whole = integerPart.replace(/\./g, "");
    // Limita antes da conversão, evitando arredondamentos de números enormes.
    const significantWhole = whole.replace(/^0+(?=\d)/u, "");
    if (significantWhole.length > 9) {
      throw new Error("O valor máximo permitido é R$ 999.999.999,99.");
    }

    const cents = Number(significantWhole) * 100 +
      Number(fractionalPart.padEnd(2, "0"));

    if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) {
      throw new Error("O valor máximo permitido é R$ 999.999.999,99.");
    }
    if (cents < 0 || (!allowZero && cents === 0)) {
      throw new Error(allowZero ? "Informe um valor igual ou maior que zero." : "Informe um valor maior que zero.");
    }
    return cents;
  }

  function centsValue(value, minimum = 0) {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < minimum || amount > MAX_CENTS) {
      throw new Error("Há um registro com valor monetário inválido.");
    }
    return amount;
  }

  function formatInput(cents) {
    const amount = centsValue(cents);
    return (amount / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function localDate(date = new Date()) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new Error("Data inválida.");
    }
    return [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const test = new Date(0);
    test.setUTCHours(0, 0, 0, 0);
    test.setUTCFullYear(year, month - 1, day);
    return test.getUTCFullYear() === year && test.getUTCMonth() === month - 1 && test.getUTCDate() === day;
  }

  function isConfirmed(row) {
    return Boolean(row && row.status === "confirmado" && validDate(row.data_efetiva));
  }

  function paymentState(row, today = localDate()) {
    if (isConfirmed(row)) return "confirmado";
    if (!row || !validDate(row.data)) return "pendente";
    if (row.data < today) return "atrasado";
    if (row.data > today) return "agendado";
    return "pendente";
  }

  function financialDate(row) {
    if (!row) return null;
    if (row.status === "confirmado") {
      return validDate(row.data_efetiva) ? row.data_efetiva : null;
    }
    return validDate(row.data) ? row.data : null;
  }

  function monthRange(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}$/u.test(value)) {
      throw new Error("Escolha um mês válido.");
    }
    const [year, month] = value.split("-").map(Number);
    if (year < 1900 || year > 9999 || month < 1 || month > 12) {
      throw new Error("Escolha um mês válido.");
    }
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      start: `${value}-01`,
      end: `${value}-${String(lastDay).padStart(2, "0")}`,
      label: `${monthNames[month - 1]} de ${year}`
    };
  }

  function resolvePeriod(input = {}, today = localDate()) {
    if (!validDate(today)) throw new Error("Data de referência inválida.");
    const mode = input.mode || "todos";
    if (mode === "todos") return { mode, start: null, end: null, label: "Todo o período" };
    if (mode === "mes") return { mode, ...monthRange(today.slice(0, 7)) };
    if (mode === "mes-especifico") return { mode, ...monthRange(input.month) };
    if (mode === "ano") {
      const year = String(input.year || "");
      if (!/^\d{4}$/u.test(year) || Number(year) < 1900 || Number(year) > 9999) {
        throw new Error("Escolha um ano entre 1900 e 9999.");
      }
      return { mode, start: `${year}-01-01`, end: `${year}-12-31`, label: `Ano de ${year}` };
    }
    if (mode === "personalizado") {
      if (!validDate(input.start) || !validDate(input.end)) {
        throw new Error("Informe as duas datas do intervalo.");
      }
      if (input.start > input.end) {
        throw new Error("A data inicial deve ser anterior ou igual à data final.");
      }
      const display = value => value.split("-").reverse().join("/");
      return { mode, start: input.start, end: input.end, label: `${display(input.start)} a ${display(input.end)}` };
    }
    throw new Error("Período inválido.");
  }

  function matchesPeriod(row, period) {
    if (!period || period.mode === "todos") return true;
    const date = financialDate(row);
    return Boolean(date && date >= period.start && date <= period.end);
  }

  function checkedAdd(left, right) {
    const result = left + right;
    if (!Number.isSafeInteger(result)) {
      throw new Error("O total ultrapassou o limite de cálculo seguro do painel.");
    }
    return result;
  }

  function summarize(rows, today = localDate()) {
    const result = {
      receitas: 0,
      despesas: 0,
      guardado: 0,
      saldoTotal: 0,
      saldoDisponivel: 0,
      pendentesReceitas: 0,
      pendentesDespesas: 0,
      atrasadas: 0,
      confirmadas: 0
    };

    for (const row of rows) {
      if (!row || !["receita", "despesa"].includes(row.tipo)) {
        throw new Error("Há um registro com tipo de movimentação inválido.");
      }
      const amount = centsValue(row.valor_centavos, 1);
      const saved = centsValue(row.guardado_centavos ?? 0);
      if (saved > amount || (saved > 0 && (row.tipo !== "receita" || !isConfirmed(row)))) {
        throw new Error("Há uma reserva inválida: só é possível guardar parte de um recebimento confirmado.");
      }

      if (isConfirmed(row)) {
        const field = row.tipo === "receita" ? "receitas" : "despesas";
        result[field] = checkedAdd(result[field], amount);
        result.guardado = checkedAdd(result.guardado, saved);
        result.confirmadas++;
      } else {
        const field = row.tipo === "receita" ? "pendentesReceitas" : "pendentesDespesas";
        result[field] = checkedAdd(result[field], amount);
        if (paymentState(row, today) === "atrasado") result.atrasadas++;
      }
    }

    result.saldoTotal = checkedAdd(result.receitas, -result.despesas);
    result.saldoDisponivel = checkedAdd(result.saldoTotal, -result.guardado);
    return result;
  }

  function monthlyReport(rows, today = localDate()) {
    const groups = new Map();
    for (const row of rows) {
      const date = financialDate(row);
      const month = date ? date.slice(0, 7) : "sem-data";
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(row);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a === b ? 0 : a === "sem-data" ? 1 : b === "sem-data" ? -1 : a.localeCompare(b))
      .map(([mes, items]) => ({ mes, ...summarize(items, today) }));
  }

  function statusLabel(row, today = localDate()) {
    const state = paymentState(row, today);
    if (state === "confirmado") return row.tipo === "receita" ? "Recebido" : "Pago";
    return { pendente: "Pendente", atrasado: "Atrasado", agendado: "Agendado" }[state];
  }

  function csvText(value) {
    let text = String(value ?? "");
    if (/^\s*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function csv(rows, options = {}) {
    const today = options.today || localDate();
    const categoryName = options.categoryName || (row => row.categoria_nome || row.categoria || "Outros");
    const header = ["Descrição", "Tipo", "Categoria", "Status", "Data prevista", "Data efetiva", "Valor (R$)", "Guardado (R$)"];
    const lines = [header];
    const displayDate = value => validDate(value) ? value.split("-").reverse().join("/") : "";

    for (const row of rows) {
      const amount = centsValue(row.valor_centavos, 1);
      const saved = centsValue(row.guardado_centavos ?? 0);
      lines.push([
        row.descricao,
        row.tipo === "receita" ? "Receita" : "Despesa",
        categoryName(row),
        statusLabel(row, today),
        displayDate(row.data),
        isConfirmed(row) ? displayDate(row.data_efetiva) : "",
        formatInput(amount),
        formatInput(saved)
      ]);
    }

    // Valores positivos; a coluna Tipo preserva a direção da movimentação.
    return "\uFEFF" + lines.map(line => line.map(csvText).join(";")).join("\r\n");
  }

  return Object.freeze({
    MAX_CENTS,
    parseMoney,
    formatInput,
    localDate,
    validDate,
    isConfirmed,
    paymentState,
    financialDate,
    resolvePeriod,
    matchesPeriod,
    summarize,
    monthlyReport,
    statusLabel,
    csv
  });
});
