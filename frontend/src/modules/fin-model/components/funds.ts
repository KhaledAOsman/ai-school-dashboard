/**
 * Use of funds: what the financing pays for between the loan draw and the
 * month operating cash flow turns positive. The operating gross profit of that
 * period covers part of the spending; the financing covers the rest plus the
 * cash reserve, so the rows always add up to the amount raised.
 */
import type { ModelResult } from "../api";

export type FundKey = "marketing" | "team" | "product" | "reserve";

export const FUND_LABELS: Record<FundKey, [string, string]> = {
  marketing: ["التسويق واكتساب العملاء (إعلانات، مؤثرون، فريق التسويق)", "Marketing & acquisition (ads, influencers, marketing team)"],
  team: ["الفريق التشغيلي (المحتوى، خدمة العملاء، الجودة، الإدارة)", "Operating team (content, customer service, quality, management)"],
  product: ["المنصة والمنتجات الجديدة والاشتراكات التقنية", "Platform, new products & technology subscriptions"],
  reserve: ["احتياطي نقدي", "Cash reserve"],
};

export function computeUseOfFunds(r: ModelResult) {
  const k = r.kpis;
  const end = k.cash_flow_breakeven_month ?? r.months[r.months.length - 1].month;
  const ms = r.months.filter((m) => m.month <= end);
  const sum = (f: (m: ModelResult["months"][number]) => number) => ms.reduce((s, m) => s + f(m), 0);
  const parts: Record<Exclude<FundKey, "reserve">, number> = {
    marketing: sum((m) => m.expense_by_category.ads + m.expense_by_category.marketing_extra + m.expense_by_category.marketing_team),
    team: sum((m) => m.expense_by_category.content + m.expense_by_category.cs + m.expense_by_category.quality + m.expense_by_category.admin),
    product: sum((m) => m.expense_by_category.launch + m.expense_by_category.tools + m.capex),
  };
  const funded = k.loan_amount;
  const used = Object.values(parts).reduce((a, b) => a + b, 0);
  const scale = used > 0 ? Math.min(1, Math.max(0, funded - k.cash_buffer) / used) : 0;
  // whole riyals that add up exactly to the amount raised
  const rows = (Object.keys(parts) as (keyof typeof parts)[]).map((key) => ({ key: key as FundKey, value: Math.round(parts[key] * scale) }));
  const allocated = rows.reduce((s, x) => s + x.value, 0);
  rows.push({ key: "reserve", value: Math.max(0, Math.round(funded) - allocated) });
  return { rows, funded: rows.reduce((s, x) => s + x.value, 0), until: end };
}
