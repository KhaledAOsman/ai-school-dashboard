/**
 * Per-unit figures shown to the board. They follow the engine exactly
 * (billing basis: one subscription's revenue and the cost of its lectures fall
 * in the month it is paid), so "gross profit per subscription x subscriptions"
 * reconciles with the income statement.
 */
import type { Market, ModelResult, MonthRow, Stream } from "../api";

export const r1 = (v: number) => Math.round(v * 10) / 10;
export const r2 = (v: number) => Math.round(v * 100) / 100;

/** One subscription of a stream, before and after VAT registration. */
export function subscriptionMath(s: Stream, r: ModelResult) {
  const ra = r.resolved_assumptions!;
  const vatRate = ra.tax.vat_rate;
  const paid = s.list_price * (1 - s.avg_discount);
  const grp = Math.max(s.group_size || 1, 1);
  const teacher = (s.lessons / grp) * s.teacher_cost_per_lesson;
  const gateway = s.uses_gateway ? paid * ra.payments.gateway_fee_pct + ra.payments.gateway_fee_fixed : 0;
  const commission = s.commission_per_enrolment;
  const col = (registered: boolean) => {
    const vat = registered ? paid - paid / (1 + vatRate) : 0;
    const net = paid - vat;
    const profit = net - teacher - commission - gateway;
    return { vat, net, profit, margin: net ? profit / net : 0 };
  };
  return { list: s.list_price, discount: s.list_price - paid, paid, teacher, commission, gateway, grp, before: col(false), after: col(true) };
}

/**
 * Per 100 free (booked) trial lectures: the leads and ad spend behind them,
 * the lecture cost, and the subscriptions they turn into. Each step is
 * rounded the way it is displayed and the next one is computed from the
 * rounded value, so the table adds up exactly as printed.
 */
export function freeLectureFunnel(mk: Market, target: boolean) {
  const organic = target ? mk.organic_share_target : mk.organic_share;
  const l2t = target ? mk.lead_to_trial_target : mk.lead_to_trial;
  const show = target ? mk.show_rate_target : mk.show_rate;
  const t2p = target ? mk.trial_to_paid_target : mk.trial_to_paid;
  const cpl = r2(mk.cpl);
  const lectures = 100;
  const leads = r1(lectures / (l2t || 1));
  const paidLeads = r1(leads * (1 - organic));
  const adCost = Math.round(paidLeads * cpl);
  const lectureCost = Math.round(lectures * mk.trial_cost);
  const attended = r1(lectures * show);
  const subs = r2(attended * t2p);
  const total = adCost + lectureCost;
  return { cpl, lectures, leads, paidLeads, adCost, lectureCost, attended, subs, total, conversion: attended ? subs / attended : 0, perSub: subs ? total / subs : null };
}

/** Conversion from an attended free lecture to a paid subscription (current and target). */
export function lectureConversion(mk: Market) {
  return { now: mk.trial_to_paid, target: mk.trial_to_paid_target };
}

export interface SalesRow {
  label: string; trials: number; attended: number; fromTrials: number; otherB2c: number; renewals: number; b2b: number;
  subs: number; revenue: number; revenueB2c: number; revenueB2b: number; grossProfit: number;
}

/** Subscriptions and revenue for a set of months, split the way the board reads them. */
export function salesRow(label: string, ms: MonthRow[], r: ModelResult): SalesRow {
  const seg = new Map(r.streams.map((s) => [s.id, s.category]));
  const funnel = new Set((r.resolved_assumptions?.streams ?? []).filter((s) => s.driver === "funnel").map((s) => s.id));
  const row: SalesRow = { label, trials: 0, attended: 0, fromTrials: 0, otherB2c: 0, renewals: 0, b2b: 0, subs: 0, revenue: 0, revenueB2c: 0, revenueB2b: 0, grossProfit: 0 };
  for (const m of ms) {
    row.trials += m.trials;
    row.attended += m.attended;
    row.subs += m.subscriptions;
    row.revenue += m.revenue;
    row.grossProfit += m.gross_profit;
    for (const [id, n] of Object.entries(m.enrolments_by_stream)) {
      const isNew = m.new_by_stream[id] ?? 0;
      if (seg.get(id) === "b2b") row.b2b += n;
      else {
        if (funnel.has(id)) row.fromTrials += isNew;
        else row.otherB2c += isNew;
        row.renewals += n - isNew;
      }
    }
    for (const [id, v] of Object.entries(m.revenue_by_stream)) {
      if (seg.get(id) === "b2b") row.revenueB2b += v;
      else row.revenueB2c += v;
    }
  }
  return row;
}

/** Round values to integers that add up exactly to `target` (largest-remainder method). */
export function roundTo(values: number[], target: number): number[] {
  const floors = values.map((v) => Math.floor(v));
  let left = target - floors.reduce((a, b) => a + b, 0);
  const order = values.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f);
  const out = [...floors];
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k].i] += 1;
  for (let k = order.length - 1; left < 0 && order.length; k = (k - 1 + order.length) % order.length, left++) out[order[k].i] -= 1;
  return out;
}

const KEYS = ["trials", "attended", "fromTrials", "otherB2c", "renewals", "b2b", "subs", "revenue", "revenueB2c", "revenueB2b", "grossProfit"] as const;

/**
 * Whole-number table for one model year: every month row adds up (components = total)
 * and the months add up to the year total, which equals the rounded statement figure.
 */
export function yearTable(r: ModelResult, year: number, monthLabel: (m: string) => string, totalLabel: string) {
  const ms = r.months.filter((m) => m.year === year);
  const raw = ms.map((m) => salesRow(monthLabel(m.month), [m], r));
  const sum = (k: (typeof KEYS)[number]) => raw.reduce((a, x) => a + x[k], 0);
  const col = (k: "trials" | "attended" | "subs" | "revenue" | "grossProfit") => roundTo(raw.map((x) => x[k]), Math.round(sum(k)));
  const trials = col("trials"), attended = col("attended"), subs = col("subs"), revenue = col("revenue"), gp = col("grossProfit");
  const rows: SalesRow[] = raw.map((x, i) => {
    const [fromTrials, otherB2c, renewals, b2b] = roundTo([x.fromTrials, x.otherB2c, x.renewals, x.b2b], subs[i]);
    const [revenueB2c, revenueB2b] = roundTo([x.revenueB2c, x.revenueB2b], revenue[i]);
    return { label: x.label, trials: trials[i], attended: attended[i], fromTrials, otherB2c, renewals, b2b, subs: subs[i], revenue: revenue[i], revenueB2c, revenueB2b, grossProfit: gp[i] };
  });
  const total = { label: totalLabel } as SalesRow;
  for (const k of KEYS) (total as unknown as Record<string, number>)[k] = rows.reduce((a, x) => a + x[k], 0);
  return { rows, total };
}
