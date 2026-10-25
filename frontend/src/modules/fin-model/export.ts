/** Excel export of the financial model (statements, monthly detail, unit economics, assumptions). */
import type { ModelResult, VersionMeta } from "./api";
import { balanceLines, cashLines, incomeLines, type StmtLine } from "./components/statements";
import type { Key, Lang } from "./i18n";

interface Ctx { lang: Lang; t: (k: Key) => string; nm: (o: { name_ar?: string | null; name_en?: string | null }) => string }

const round = (v: number) => Math.round(v * 100) / 100;

function stmtSheet(lines: StmtLine[], cols: ModelResult["years"] | ModelResult["months"], heads: string[], lang: Lang) {
  const rows: (string | number)[][] = [["", ...heads]];
  for (const ln of lines) {
    if (ln.kind === "header") { rows.push([lang === "ar" ? ln.ar : ln.en]); continue; }
    rows.push([(ln.indent ? "   " : "") + (lang === "ar" ? ln.ar : ln.en), ...cols.map((c) => round(ln.value(c)))]);
  }
  return rows;
}

function flatten(obj: unknown, prefix = "", out: [string, string | number | boolean][] = []) {
  if (Array.isArray(obj)) {
    obj.forEach((x, i) => flatten(x, `${prefix}[${(x as { id?: string })?.id ?? i}]`, out));
  } else if (obj && typeof obj === "object") {
    Object.entries(obj as Record<string, unknown>).forEach(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k, out));
  } else if (obj !== null && obj !== undefined) {
    out.push([prefix, obj as string | number | boolean]);
  }
  return out;
}

export async function exportWorkbook(r: ModelResult, v: VersionMeta, c: Ctx) {
  const XLSX = await import("xlsx");
  const { lang, t } = c;
  const ar = lang === "ar";
  const wb = XLSX.utils.book_new();
  const years = r.years.map((y) => `${t("y")}${y.year} (${y.from}→${y.to})`);
  const k = r.kpis;
  const summary: (string | number | null)[][] = [
    [`AI School — ${t("module")}`],
    [v.name, v.status],
    [t("scenario"), t(`sc_${r.scenario}` as Key)],
    [],
    [t("revenue_y5"), round(k.revenue_y5)],
    [t("cagr"), k.revenue_cagr === null ? null : round(k.revenue_cagr * 100) / 100],
    [t("ebitda_y5"), round(k.ebitda_y5)],
    [t("breakeven"), k.ebitda_breakeven_month],
    [ar ? "القرض المقترح" : "Proposed loan", round(k.loan_amount)],
    [ar ? "التمويل المطلوب بدون قرض" : "Funding need without loan", round(k.funding_need_without_loan)],
    [ar ? "تمويل جسر من الملاك" : "Owner bridge", round(k.owner_bridge)],
    [t("ev"), round(k.enterprise_value)],
    [t("exit_equity"), round(k.exit_equity_value)],
    [ar ? "العائد الداخلي للملاك" : "Owner IRR", k.owner_irr === null ? null : round(k.owner_irr)],
    [t("students"), Math.round(k.students_active_end)],
    [t("teachers"), k.teachers_end],
    [ar ? "التسجيل الضريبي" : "VAT registration", k.vat_registration_month],
    [ar ? "تطابق كل الأرقام" : "All totals reconcile", r.checks.all_ok ? "✓" : "✗"],
  ];
  const add = (name: string, rows: unknown[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 44 }, ...Array.from({ length: 70 }, () => ({ wch: 14 }))];
    if (ar) (ws as { "!views"?: unknown })["!views"] = [{ RTL: true }];
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };
  add(ar ? "الملخص" : "Summary", summary);
  add(ar ? "قائمة الدخل" : "Income statement", stmtSheet(incomeLines(r), r.years, years, lang));
  add(ar ? "التدفقات النقدية" : "Cash flow", stmtSheet(cashLines, r.years, years, lang));
  add(ar ? "الميزانية" : "Balance sheet", stmtSheet(balanceLines, r.years, years, lang));
  add(ar ? "قائمة الدخل شهري" : "Income monthly", stmtSheet(incomeLines(r), r.months, r.months.map((m) => m.month), lang));
  add(ar ? "التدفقات شهري" : "Cash flow monthly", stmtSheet(cashLines, r.months, r.months.map((m) => m.month), lang));
  const ops: (string | number)[][] = [[ar ? "الشهر" : "Month", ar ? "ليدز" : "Leads", ar ? "تجارب" : "Trials", ar ? "حضور" : "Attended", ar ? "مشتركون جدد" : "New customers", ar ? "تجديدات" : "Renewals", ar ? "طلاب نشطون" : "Active students", ar ? "معلمون" : "Teachers", ar ? "الفريق الثابت" : "Fixed team"]];
  r.months.forEach((m) => ops.push([m.month, round(m.leads), round(m.trials), round(m.attended), round(m.new_customers), round(m.renewals), round(m.active_students), m.headcount.teachers, m.headcount.fixed]));
  add(ar ? "التشغيل" : "Operations", ops);
  const ue: (string | number | null)[][] = [[ar ? "المصدر" : "Stream", ar ? "سعر القائمة" : "List price", ar ? "الخصم" : "Discount", ar ? "الصافي" : "Net price", ar ? "أجر المعلم" : "Teacher", ar ? "العمولة" : "Commission", ar ? "بوابة الدفع" : "Gateway", ar ? "المساهمة" : "Contribution", "LTV", "CAC", "LTV/CAC", ar ? "الاسترداد (شهور)" : "Payback (months)"]];
  r.unit_economics.forEach((u) => ue.push([c.nm(u), u.price_list, u.discount, round(u.price_net), round(u.teacher_cost), u.commission, round(u.gateway_fee), round(u.contribution), u.ltv === null ? null : round(u.ltv), u.cac === null ? null : round(u.cac), u.ltv_cac === null ? null : round(u.ltv_cac), u.payback_months === null ? null : round(u.payback_months)]));
  add(ar ? "اقتصاديات الوحدة" : "Unit economics", ue);
  if (r.resolved_assumptions) add(ar ? "الافتراضات" : "Assumptions", [[ar ? "المسار" : "Path", ar ? "القيمة" : "Value"], ...flatten(r.resolved_assumptions)]);
  XLSX.writeFile(wb, `AI-School-financial-model-${v.name.replace(/[^\w؀-ۿ-]+/g, "-")}-${r.scenario}.xlsx`);
}
