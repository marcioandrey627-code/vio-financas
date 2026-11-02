const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../finance-core.js");

const TODAY = "2026-11-02";
const transaction = (changes = {}) => ({
  id: "test",
  descricao: "Mercado",
  tipo: "despesa",
  categoria: "alimentacao",
  valor_centavos: 123456,
  guardado_centavos: 0,
  status: "pendente",
  data: "2026-11-01",
  data_efetiva: null,
  ...changes
});

test("BRL aceita formatos brasileiros e não usa ponto como separador decimal", () => {
  for (const input of ["1.234,56", "1234,56", "R$ 1.234,56", "r$ 1.234,56", "  R$\u00a01.234,56  "]) {
    assert.equal(F.parseMoney(input), 123456);
  }
  assert.equal(F.parseMoney("1.234"), 123400);
  assert.equal(F.parseMoney("1234"), 123400);
  assert.equal(F.parseMoney("0,01"), 1);
  assert.equal(F.parseMoney("1,2"), 120);
  assert.equal(F.parseMoney("0001,02"), 102);
  assert.equal(F.parseMoney("999.999.999,99"), F.MAX_CENTS);
  assert.equal(F.parseMoney("0", { allowZero: true }), 0);
  assert.equal(F.formatInput(123456), "1.234,56");
});

test("BRL rejeita valores ambíguos, agrupamento incorreto e estouro", () => {
  for (const value of ["", "0", "R$", "1234.56", "1.23", "1,234", "1.234,567", "12.34,56", "1,234.56", "-1,00", "+1", "NaN", "Infinity", "1e3", "1 234,56", "1.000.000.000,00"]) {
    assert.throws(() => F.parseMoney(value), Error, value);
  }
  assert.throws(() => F.parseMoney(null));
  assert.throws(() => F.formatInput(-1));
});

test("datas são validadas pelo calendário, incluindo anos bissextos", () => {
  assert.equal(F.validDate("2024-02-29"), true);
  assert.equal(F.validDate("2026-02-29"), false);
  assert.equal(F.validDate("2026-04-31"), false);
  assert.equal(F.validDate("2026-00-10"), false);
  assert.equal(F.validDate("1899-01-01"), false);
  assert.equal(F.validDate("2026-1-01"), false);
  assert.equal(F.validDate(null), false);
  assert.equal(F.localDate(new Date(2026, 10, 2, 23, 30)), TODAY);
});

test("vencimento nunca transforma automaticamente um pagamento em pago", () => {
  const row = transaction();
  assert.equal(F.paymentState(row, "2026-10-31"), "agendado");
  assert.equal(F.paymentState(row, "2026-11-01"), "pendente");
  assert.equal(F.paymentState(row, TODAY), "atrasado");
  assert.equal(F.isConfirmed(row), false);
  assert.equal(F.summarize([row], TODAY).despesas, 0);
  assert.equal(F.summarize([row], TODAY).pendentesDespesas, 123456);
  assert.equal(F.summarize([row], TODAY).atrasadas, 1);
});

test("registros legados sem status e confirmação inválida nunca viram realizados", () => {
  const legacy = transaction({ status: undefined, data: "2020-01-01" });
  const broken = transaction({ status: "confirmado", data_efetiva: null });
  assert.equal(F.isConfirmed(legacy), false);
  assert.equal(F.isConfirmed(broken), false);
  assert.equal(F.financialDate(broken), null);
  assert.equal(F.summarize([legacy, broken], TODAY).despesas, 0);
  assert.equal(F.paymentState(transaction({ data: null }), TODAY), "pendente");
});

test("edição e confirmação alteram totais apenas após status explícito", () => {
  const pending = transaction({ valor_centavos: 10000 });
  const edited = { ...pending, descricao: "Mercado corrigido", valor_centavos: 185025 };
  assert.equal(F.summarize([edited], TODAY).despesas, 0);
  const confirmed = { ...edited, status: "confirmado", data_efetiva: TODAY };
  assert.equal(F.summarize([confirmed], TODAY).despesas, 185025);
  assert.equal(F.statusLabel(confirmed, TODAY), "Pago");
  assert.equal(F.summarize([{ ...confirmed, status: "pendente", data_efetiva: null }], TODAY).despesas, 0);
});

test("economia conta só o valor reservado e disponível desconta reservas", () => {
  const income = transaction({ tipo: "receita", valor_centavos: 100000, status: "confirmado", data_efetiva: TODAY });
  const expense = transaction({ valor_centavos: 20000, status: "confirmado", data_efetiva: TODAY });
  assert.deepEqual(F.summarize([income, expense], TODAY), {
    receitas: 100000, despesas: 20000, guardado: 0,
    saldoTotal: 80000, saldoDisponivel: 80000,
    pendentesReceitas: 0, pendentesDespesas: 0, atrasadas: 0, confirmadas: 2
  });
  const reserved = F.summarize([{ ...income, guardado_centavos: 30000 }, expense], TODAY);
  assert.equal(reserved.guardado, 30000);
  assert.equal(reserved.saldoTotal, 80000);
  assert.equal(reserved.saldoDisponivel, 50000);
  assert.equal(F.summarize([{ ...income, guardado_centavos: 100000 }, expense], TODAY).saldoDisponivel, -20000);
});

test("reservas e valores inconsistentes produzem erro em vez de métricas falsas", () => {
  assert.throws(() => F.summarize([transaction({ guardado_centavos: 1 })], TODAY));
  assert.throws(() => F.summarize([transaction({ tipo: "receita", valor_centavos: 100, guardado_centavos: 101, status: "confirmado", data_efetiva: TODAY })], TODAY));
  assert.throws(() => F.summarize([transaction({ valor_centavos: 1.1 })], TODAY));
  assert.throws(() => F.summarize([transaction({ tipo: "invalido" })], TODAY));
});

test("filtros de mês, ano e intervalo têm limites inclusivos e datas reais", () => {
  assert.deepEqual(F.resolvePeriod({ mode: "mes" }, TODAY), {
    mode: "mes", start: "2026-11-01", end: "2026-11-30", label: "novembro de 2026"
  });
  const leap = F.resolvePeriod({ mode: "mes-especifico", month: "2024-02" }, TODAY);
  assert.equal(leap.end, "2024-02-29");
  const year = F.resolvePeriod({ mode: "ano", year: "2026" }, TODAY);
  assert.equal(year.start, "2026-01-01");
  assert.equal(year.end, "2026-12-31");
  const range = F.resolvePeriod({ mode: "personalizado", start: "2026-10-31", end: TODAY }, TODAY);
  assert.equal(F.matchesPeriod(transaction({ data: "2026-10-31" }), range), true);
  assert.equal(F.matchesPeriod(transaction({ data: TODAY }), range), true);
  assert.equal(F.matchesPeriod(transaction({ data: "2026-11-03" }), range), false);
  assert.throws(() => F.resolvePeriod({ mode: "personalizado", start: TODAY, end: "2026-10-31" }, TODAY));
  assert.throws(() => F.resolvePeriod({ mode: "mes-especifico", month: "2026-13" }, TODAY));
  assert.throws(() => F.resolvePeriod({ mode: "ano", year: "26" }, TODAY));
  assert.throws(() => F.resolvePeriod({ mode: "desconhecido" }, TODAY));
});

test("realizados usam a data efetiva; pendentes usam vencimento; sem data só no total", () => {
  const november = F.resolvePeriod({ mode: "mes" }, TODAY);
  const paidLate = transaction({ status: "confirmado", data: "2026-10-20", data_efetiva: TODAY });
  assert.equal(F.matchesPeriod(paidLate, november), true);
  assert.equal(F.matchesPeriod({ ...paidLate, data_efetiva: "2026-10-31" }, november), false);
  assert.equal(F.matchesPeriod(transaction({ data: null }), november), false);
  assert.equal(F.matchesPeriod(transaction({ data: null }), F.resolvePeriod({}, TODAY)), true);
});

test("pagamento antecipado confirmado conta na data real, mesmo com vencimento futuro", () => {
  const early = transaction({ status: "confirmado", data: "2026-12-15", data_efetiva: TODAY, valor_centavos: 9900 });
  assert.equal(F.paymentState(early, TODAY), "confirmado");
  assert.equal(F.summarize([early], TODAY).despesas, 9900);
  assert.equal(F.matchesPeriod(early, F.resolvePeriod({ mode: "mes" }, TODAY)), true);
  assert.equal(F.matchesPeriod(early, F.resolvePeriod({ mode: "mes-especifico", month: "2026-12" }, TODAY)), false);
});

test("relatório mensal reconcilia recebidos, pagos, reservados e pendentes", () => {
  const rows = [
    transaction({ tipo: "receita", valor_centavos: 100000, guardado_centavos: 20000, status: "confirmado", data: "2026-10-31", data_efetiva: TODAY }),
    transaction({ valor_centavos: 20000, status: "confirmado", data_efetiva: "2026-10-31" }),
    transaction({ valor_centavos: 30000, data: "2026-11-15" }),
    transaction({ valor_centavos: 40000, data: null })
  ];
  const months = F.monthlyReport(rows, TODAY);
  assert.deepEqual(months.map(month => month.mes), ["2026-10", "2026-11", "sem-data"]);
  assert.equal(months[0].despesas, 20000);
  assert.equal(months[1].receitas, 100000);
  assert.equal(months[1].guardado, 20000);
  assert.equal(months[1].saldoDisponivel, 80000);
  assert.equal(months[1].pendentesDespesas, 30000);
  assert.equal(months[2].pendentesDespesas, 40000);
  assert.equal(months.reduce((sum, row) => sum + row.receitas, 0), F.summarize(rows, TODAY).receitas);
});

test("CSV mantém acentos, separadores brasileiros e neutraliza fórmulas de usuário", () => {
  const rows = [
    transaction({ descricao: '=HYPERLINK("https://example.invalid")', data: TODAY }),
    transaction({ descricao: "  +SOMA(1;2)", status: "confirmado", data_efetiva: TODAY }),
    transaction({ descricao: "Ônibus; café\nmercado", tipo: "receita", status: "confirmado", data_efetiva: TODAY, guardado_centavos: 3456 })
  ];
  const result = F.csv(rows, { today: TODAY, categoryName: () => "@Categoria" });
  assert.equal(result.charCodeAt(0), 0xfeff);
  assert(result.includes('"\'=HYPERLINK(""https://example.invalid"")"'));
  assert(result.includes('"\'  +SOMA(1;2)"'));
  assert(result.includes('"\'@Categoria"'));
  assert(result.includes('"Ônibus; café\nmercado"'));
  assert(result.includes('"1.234,56"'));
  assert(result.includes('"34,56"'));
  assert(result.includes('"02/11/2026"'));
  assert(result.includes('"Pago"'));
  assert(result.includes('"Recebido"'));
});

test("módulo não modifica os registros recebidos", () => {
  const row = Object.freeze(transaction());
  const rows = Object.freeze([row]);
  F.summarize(rows, TODAY);
  F.monthlyReport(rows, TODAY);
  F.csv(rows, { today: TODAY });
  assert.equal(row.status, "pendente");
});
