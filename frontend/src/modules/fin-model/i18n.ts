/** Arabic / English strings + number formatting for the financial-model module. */
import { useCallback, useEffect, useState } from "react";

export type Lang = "ar" | "en";

const DICT = {
  module: ["النموذج المالي", "Financial Model"],
  subtitle: ["دراسة الجدوى وخطة النمو 2026–2031 للملاك والمستثمرين", "Feasibility study & 2026–2031 growth plan for owners and investors"],
  tab_overview: ["ملخص المستثمرين", "Investor summary"],
  tab_statements: ["القوائم المالية", "Financial statements"],
  tab_units: ["اقتصاديات الوحدة", "Unit economics"],
  tab_actual: ["الفعلي مقابل الخطة", "Actual vs plan"],
  tab_scenarios: ["السيناريوهات والحساسية", "Scenarios & sensitivity"],
  tab_funding: ["التمويل والتقييم", "Funding & valuation"],
  tab_assumptions: ["الافتراضات", "Assumptions"],
  tab_versions: ["النسخ والنشر", "Versions"],
  scenario: ["السيناريو", "Scenario"],
  sc_conservative: ["متحفظ", "Conservative"],
  sc_base: ["أساسي", "Base"],
  sc_optimistic: ["متفائل", "Optimistic"],
  version: ["النسخة", "Version"],
  draft: ["مسودة", "Draft"],
  published: ["منشورة", "Published"],
  archived: ["مؤرشفة", "Archived"],
  export_excel: ["تصدير Excel", "Export Excel"],
  export_pdf: ["تقرير PDF", "PDF report"],
  loading: ["جارٍ الحساب…", "Calculating…"],
  no_version: ["لا توجد نسخة منشورة بعد", "No published version yet"],
  no_version_hint: ["سيظهر النموذج هنا بعد أن يعتمد المالك نسخة للمستثمرين.", "The model appears here once the owner publishes a version."],
  sar: ["ر.س", "SAR"],
  year: ["السنة", "Year"],
  y: ["س", "Y"],
  month: ["الشهر", "Month"],
  revenue: ["الإيرادات", "Revenue"],
  revenue_y5: ["إيراد السنة الخامسة", "Year-5 revenue"],
  cagr: ["النمو السنوي المركب", "Revenue CAGR"],
  ebitda: ["EBITDA", "EBITDA"],
  ebitda_y5: ["EBITDA السنة الخامسة", "Year-5 EBITDA"],
  margin: ["الهامش", "Margin"],
  breakeven: ["نقطة التعادل التشغيلي", "Operating break-even"],
  breakeven_hint: ["أول شهر يظل بعده مجموع EBITDA لآخر 12 شهرًا موجبًا", "First month after which trailing-12-month EBITDA stays positive"],
  funding_need: ["التمويل المطلوب", "Funding required"],
  loan: ["القرض", "Loan"],
  ev: ["قيمة المنشأة اليوم (DCF)", "Enterprise value today (DCF)"],
  exit_equity: ["قيمة حقوق الملكية في السنة الخامسة", "Equity value at year 5"],
  students: ["الطلاب النشطون", "Active students"],
  teachers: ["المعلمون المطلوبون", "Teachers needed"],
  team: ["الفريق الثابت", "Fixed team"],
  net_income: ["صافي الربح", "Net income"],
  cash: ["الرصيد النقدي", "Cash balance"],
  gross_profit: ["مجمل الربح", "Gross profit"],
  not_reached: ["لا يتحقق خلال 5 سنوات", "Not reached within 5 years"],
  checks_ok: ["كل الأرقام متطابقة: الإيراد = مجموع المصادر، والميزانية متوازنة، والنقد يطابق التدفقات", "All numbers reconcile: revenue = sum of streams, balance sheet balances, cash ties to cash flows"],
  checks_bad: ["تنبيه: توجد أرقام غير متطابقة، يُرجى مراجعة الافتراضات", "Warning: some totals do not reconcile — review assumptions"],
  rev_by_stream: ["الإيراد حسب مصدر الدخل", "Revenue by stream"],
  profit_path: ["مسار الربحية", "Path to profitability"],
  cash_path: ["الرصيد النقدي الشهري (بعد التمويل)", "Monthly cash balance (after financing)"],
  growth_ops: ["النمو التشغيلي", "Operating growth"],
  market: ["حجم السوق والفرصة", "Market opportunity"],
  use_of_funds: ["استخدام التمويل", "Use of funds"],
  key_assumptions: ["أهم الافتراضات", "Key assumptions"],
  risks: ["المخاطر وكيف نديرها", "Risks & mitigation"],
  actual_data: ["من البيانات الفعلية", "From actual data"],
  manual: ["يدوي", "Manual"],
  auto: ["تلقائي من الفعلي", "Auto from actuals"],
  save: ["حفظ", "Save"],
  saving: ["جارٍ الحفظ…", "Saving…"],
  saved: ["تم الحفظ", "Saved"],
  unsaved: ["تعديلات غير محفوظة", "Unsaved changes"],
  reset: ["تراجع", "Discard"],
  read_only: ["النسخة المعتمدة للعرض فقط، ولتعديلها تُنشأ نسخة جديدة منها.", "Published versions are read-only. Create a copy to edit."],
  live_preview: ["معاينة فورية", "Live preview"],
  add: ["إضافة", "Add"],
  remove: ["حذف", "Remove"],
  duplicate: ["تكرار", "Duplicate"],
  enabled: ["مفعّل", "Enabled"],
  suggested: ["مقترح", "Suggested"],
  annual: ["سنوي", "Annual"],
  monthly: ["شهري", "Monthly"],
  income_statement: ["قائمة الدخل", "Income statement"],
  cash_flow: ["قائمة التدفقات النقدية", "Cash flow statement"],
  balance_sheet: ["الميزانية العمومية", "Balance sheet"],
  total: ["الإجمالي", "Total"],
} as const;

export type Key = keyof typeof DICT;

const STORE = "fm.lang";

export function useLang() {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem(STORE) as Lang) === "en" ? "en" : "ar";
    } catch {
      return "ar";
    }
  });
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORE, l); } catch { /* private mode */ }
  }, []);
  useEffect(() => undefined, [lang]);
  const t = useCallback((k: Key) => DICT[k][lang === "ar" ? 0 : 1], [lang]);
  const nm = useCallback((o: { name_ar?: string | null; name_en?: string | null } | undefined | null) =>
    (o ? (lang === "ar" ? o.name_ar || o.name_en : o.name_en || o.name_ar) : "") || "", [lang]);
  return { lang, setLang, t, nm, dir: (lang === "ar" ? "rtl" : "ltr") as "rtl" | "ltr" };
}

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(ym: string | null | undefined, lang: Lang, short = false): string {
  if (!ym) return "—";
  const [y, m] = ym.split("-").map(Number);
  const name = (lang === "ar" ? AR_MONTHS : EN_MONTHS)[m - 1];
  return short ? `${lang === "ar" ? name.slice(0, 3) : name} ${String(y).slice(2)}` : `${name} ${y}`;
}

/** 1,234,567 (negatives in parentheses, accounting style) */
/** Left-to-right isolate: keeps "1,250", "(300)" and "30%" intact inside Arabic text. */
export const iso = (t: string) => `\u2066${t}\u2069`;

export function money(v: number | null | undefined, opts: { parens?: boolean; decimals?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const d = opts.decimals ?? 0;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (v < 0 && Math.abs(v) >= 0.5 * 10 ** -d) return iso(opts.parens === false ? `-${abs}` : `(${abs})`);
  return iso(abs);
}

/** 1.2M / 350K */
export function compact(v: number | null | undefined, lang: Lang): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e6) return lang === "ar" ? `${iso(sign + (a / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 }))} مليون` : `${sign}${(a / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (a >= 1e3) return lang === "ar" ? `${iso(sign + (a / 1e3).toLocaleString("en-US", { maximumFractionDigits: 0 }))} ألف` : `${sign}${(a / 1e3).toLocaleString("en-US", { maximumFractionDigits: 0 })}K`;
  return iso(`${sign}${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
}

export function pct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return iso(`${(v * 100).toLocaleString("en-US", { maximumFractionDigits: decimals })}%`);
}

export const COLORS = {
  purple: "#6d3af2",
  purpleSoft: "#bea3ff",
  orange: "#ff8a3d",
  orangeSoft: "#ffc49b",
  deep: "#3d1fa3",
  slate: "#8f97b3",
  amber: "#f5b83d",
  green: "#1f8a52",
  red: "#d9453d",
  grid: "#eef1f6",
};
export const STREAM_COLORS = ["#6d3af2", "#ff8a3d", "#bea3ff", "#3d1fa3", "#f5b83d", "#ffc49b", "#8f97b3", "#9b7bff"];
