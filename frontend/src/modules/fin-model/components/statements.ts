/** Row definitions shared by the statements page, the PDF report and the Excel export. */
import type { ModelResult, MonthRow, YearRow } from "../api";

type Row = MonthRow | YearRow;
export interface StmtLine {
  key: string;
  ar: string;
  en: string;
  value: (r: Row) => number;
  kind?: "total" | "subtotal" | "header" | "pct";
  indent?: boolean;
  /** how the "Total" column aggregates this line: sum (flows, default) or first/last (balances) */
  agg?: "sum" | "first" | "last";
}

export function incomeLines(res: ModelResult): StmtLine[] {
  const L: StmtLine[] = [];
  res.streams.forEach((s) => L.push({ key: `rev_${s.id}`, ar: s.name_ar, en: s.name_en, value: (r) => r.revenue_by_stream[s.id] ?? 0, indent: true }));
  L.push({ key: "revenue", ar: "إجمالي الإيرادات", en: "Total revenue", value: (r) => r.revenue, kind: "subtotal" });
  L.push({ key: "teacher_cost", ar: "أجور الحصص للمعلمين", en: "Teacher lesson fees", value: (r) => -r.teacher_cost, indent: true });
  L.push({ key: "trial_cost", ar: "المحاضرات التجريبية المجانية", en: "Free trial lectures", value: (r) => -r.trial_cost, indent: true });
  L.push({ key: "commissions", ar: "عمولات المبيعات", en: "Sales commissions", value: (r) => -r.commissions, indent: true });
  L.push({ key: "gateway_fees", ar: "رسوم بوابات الدفع", en: "Payment gateway fees", value: (r) => -r.gateway_fees, indent: true });
  L.push({ key: "gross_profit", ar: "مجمل الربح", en: "Gross profit", value: (r) => r.gross_profit, kind: "subtotal" });
  L.push({ key: "marketing", ar: "الإعلانات الممولة", en: "Paid advertising", value: (r) => -r.marketing, indent: true });
  L.push({ key: "payroll", ar: "رواتب الفريق (شاملة رسوم التحويل)", en: "Team payroll (incl. transfer fees)", value: (r) => -r.payroll, indent: true });
  L.push({ key: "teacher_onboarding", ar: "تعيين وتدريب معلمين جدد", en: "Teacher onboarding", value: (r) => -r.teacher_onboarding, indent: true });
  L.push({ key: "launch_costs", ar: "إطلاق منتجات جديدة", en: "New product launches", value: (r) => -r.launch_costs, indent: true });
  res.opex_lines.forEach((o) => L.push({ key: `opex_${o.id}`, ar: o.name_ar, en: o.name_en, value: (r) => -(r.opex_by_line[o.id] ?? 0), indent: true }));
  L.push({ key: "ebitda", ar: "الربح قبل الفوائد والضرائب والإهلاك (EBITDA)", en: "EBITDA", value: (r) => r.ebitda, kind: "subtotal" });
  L.push({ key: "depreciation", ar: "الإهلاك", en: "Depreciation", value: (r) => -r.depreciation, indent: true });
  L.push({ key: "ebit", ar: "الربح التشغيلي (EBIT)", en: "EBIT", value: (r) => r.ebit, kind: "subtotal" });
  L.push({ key: "interest", ar: "تكلفة التمويل (أرباح القرض)", en: "Finance cost (loan profit)", value: (r) => -r.interest, indent: true });
  L.push({ key: "loan_fees", ar: "رسوم القرض والضمان", en: "Loan & guarantee fees", value: (r) => -r.loan_fees, indent: true });
  L.push({ key: "ebt", ar: "الربح قبل الزكاة", en: "Profit before zakat", value: (r) => r.ebt, kind: "subtotal" });
  L.push({ key: "zakat", ar: "الزكاة", en: "Zakat", value: (r) => -r.zakat, indent: true });
  L.push({ key: "net_income", ar: "صافي الربح", en: "Net income", value: (r) => r.net_income, kind: "total" });
  return L;
}

export const cashLines: StmtLine[] = [
  { key: "collections", ar: "المتحصلات من العملاء", en: "Cash from customers", value: (r) => r.collections, indent: true },
  { key: "gw", ar: "رسوم بوابات الدفع", en: "Gateway fees", value: (r) => -r.gateway_fees, indent: true },
  { key: "direct", ar: "أجور المعلمين والتجارب والعمولات", en: "Teachers, trials & commissions", value: (r) => -(r.teacher_cost + r.trial_cost + r.commissions), indent: true },
  { key: "opex", ar: "المصروفات التشغيلية", en: "Operating expenses", value: (r) => -r.opex, indent: true },
  { key: "vat", ar: "ضريبة القيمة المضافة المسددة", en: "VAT paid", value: (r) => -r.vat_paid, indent: true },
  { key: "zakat", ar: "الزكاة المسددة", en: "Zakat paid", value: (r) => -r.zakat_paid, indent: true },
  { key: "cfo", ar: "صافي التدفق من التشغيل", en: "Net cash from operations", value: (r) => r.cfo, kind: "subtotal" },
  { key: "capex", ar: "الاستثمار في المنصة والأصول", en: "Platform & asset investment", value: (r) => -r.capex, indent: true },
  { key: "cfi", ar: "صافي التدفق من الاستثمار", en: "Net cash from investing", value: (r) => -r.capex, kind: "subtotal" },
  { key: "loan_draw", ar: "صرف القرض", en: "Loan drawdown", value: (r) => r.loan_draw, indent: true },
  { key: "loan_fees", ar: "رسوم القرض", en: "Loan fees", value: (r) => -r.loan_fees, indent: true },
  { key: "interest", ar: "أرباح القرض المدفوعة", en: "Loan profit paid", value: (r) => -r.interest, indent: true },
  { key: "principal", ar: "سداد أصل القرض", en: "Loan principal repaid", value: (r) => -r.loan_principal, indent: true },
  { key: "equity", ar: "تمويل من الملاك", en: "Owner funding", value: (r) => r.equity_injection, indent: true },
  { key: "cff", ar: "صافي التدفق من التمويل", en: "Net cash from financing", value: (r) => r.loan_draw - r.loan_fees - r.interest - r.loan_principal + r.equity_injection, kind: "subtotal" },
  { key: "net", ar: "صافي التغير في النقد", en: "Net change in cash", value: (r) => r.net_cash_flow, kind: "subtotal" },
  { key: "opening", ar: "النقد أول الفترة", en: "Opening cash", value: (r) => r.cash - r.net_cash_flow, indent: true, agg: "first" },
  { key: "closing", ar: "النقد آخر الفترة", en: "Closing cash", value: (r) => r.cash, kind: "total", agg: "last" },
];

export const balanceLines: StmtLine[] = [
  { key: "h_assets", ar: "الأصول", en: "Assets", value: () => 0, kind: "header" },
  { key: "cash", ar: "النقد", en: "Cash", value: (r) => r.cash, indent: true },
  { key: "ar", ar: "مستحقات على المدارس والعملاء", en: "Receivables", value: (r) => r.receivables, indent: true },
  { key: "fa", ar: "صافي الأصول الثابتة (المنصة)", en: "Net fixed assets (platform)", value: (r) => r.fixed_assets, indent: true },
  { key: "assets", ar: "إجمالي الأصول", en: "Total assets", value: (r) => r.cash + r.receivables + r.fixed_assets, kind: "subtotal" },
  { key: "h_liab", ar: "الالتزامات وحقوق الملكية", en: "Liabilities & equity", value: () => 0, kind: "header" },
  { key: "def", ar: "إيرادات مقدمة (حصص لم تُقدّم بعد)", en: "Deferred revenue (lessons not yet taught)", value: (r) => r.deferred_revenue, indent: true },
  { key: "vat", ar: "ضريبة قيمة مضافة مستحقة", en: "VAT payable", value: (r) => r.vat_payable, indent: true },
  { key: "zakat", ar: "زكاة مستحقة", en: "Zakat payable", value: (r) => r.zakat_payable, indent: true },
  { key: "loan", ar: "رصيد القرض", en: "Loan balance", value: (r) => r.loan_balance, indent: true },
  { key: "liab", ar: "إجمالي الالتزامات", en: "Total liabilities", value: (r) => r.deferred_revenue + r.vat_payable + r.zakat_payable + r.loan_balance, kind: "subtotal" },
  { key: "equity", ar: "حقوق الملكية", en: "Equity", value: (r) => r.equity, indent: true },
  { key: "le", ar: "إجمالي الالتزامات وحقوق الملكية", en: "Total liabilities & equity", value: (r) => r.deferred_revenue + r.vat_payable + r.zakat_payable + r.loan_balance + r.equity, kind: "total" },
];
