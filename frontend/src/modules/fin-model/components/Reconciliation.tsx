/**
 * Ties the income statement to the cash-flow statement, year by year:
 *   revenue + VAT billed + change in deferred revenue - change in receivables = cash collected
 *   EBITDA - change in receivables + change in deferred revenue + change in VAT payable - zakat paid = operating cash flow
 * The engine checks both identities every month (checks.revenue_to_collections /
 * ebitda_to_operating_cash); here each column is rounded so it adds up as printed.
 */
import clsx from "clsx";
import { useFM } from "../context";
import { money } from "../i18n";
import { CARD } from "./ui";
import { roundTo } from "./unitmath";
import type { ModelResult } from "../api";

interface Line { label: string; vals: number[]; kind?: "total" }

function build(r: ModelResult) {
  let prev = { ar: 0, def: 0, vat: 0 };
  return r.years.map((y) => {
    const end = r.months.find((m) => m.month === y.to)!;
    const dAr = end.receivables - prev.ar;
    const dDef = end.deferred_revenue - prev.def;
    const dVat = end.vat_payable - prev.vat;
    prev = { ar: end.receivables, def: end.deferred_revenue, vat: end.vat_payable };
    // whole riyals: statement figures and shared lines are rounded once, so both tables show the
    // same values and each column adds up to the rounded cash-flow figure
    const rev = Math.round(y.revenue), eb = Math.round(y.ebitda), coll = Math.round(y.collections), cfo = Math.round(y.cfo);
    const ar = Math.round(-dAr), df = Math.round(dDef);
    const vb = coll - rev - df - ar;
    const [dv, zk] = roundTo([dVat, -y.zakat_paid], cfo - eb - df - ar);
    return { rev, vb, df, ar, coll, eb, ar2: ar, df2: df, dv, zk, cfo };
  });
}

export function Reconciliation() {
  const { result: r, t, lang } = useFM();
  if (!r) return null;
  const ar = lang === "ar";
  const y = build(r);
  const anyDef = y.some((x) => x.df !== 0 || x.df2 !== 0);
  const A: Line[] = [
    { label: ar ? "إجمالي الإيرادات (قائمة الدخل)" : "Total revenue (income statement)", vals: y.map((x) => x.rev) },
    { label: ar ? "+ ضريبة القيمة المضافة المحصلة من العملاء" : "+ VAT collected from customers", vals: y.map((x) => x.vb) },
    ...(anyDef ? [{ label: ar ? "+ الزيادة في الإيرادات المقدمة" : "+ Increase in deferred revenue", vals: y.map((x) => x.df) }] : []),
    { label: ar ? "− الزيادة في الذمم المدينة (مبالغ مؤسسية لم تُحصَّل بعد)" : "− Increase in receivables (institutional amounts not yet collected)", vals: y.map((x) => x.ar) },
    { label: ar ? "= المتحصلات من العملاء (قائمة التدفقات النقدية)" : "= Cash from customers (cash-flow statement)", vals: y.map((x) => x.coll), kind: "total" },
  ];
  const B: Line[] = [
    { label: "EBITDA", vals: y.map((x) => x.eb) },
    { label: ar ? "− الزيادة في الذمم المدينة" : "− Increase in receivables", vals: y.map((x) => x.ar2) },
    ...(anyDef ? [{ label: ar ? "+ الزيادة في الإيرادات المقدمة" : "+ Increase in deferred revenue", vals: y.map((x) => x.df2) }] : []),
    { label: ar ? "+ الزيادة في ضريبة القيمة المضافة المستحقة (محصلة ولم تُورَّد بعد)" : "+ Increase in VAT payable (collected, not yet remitted)", vals: y.map((x) => x.dv) },
    { label: ar ? "− الزكاة المسددة" : "− Zakat paid", vals: y.map((x) => x.zk) },
    { label: ar ? "= صافي التدفق من التشغيل (قائمة التدفقات النقدية)" : "= Net cash from operations (cash-flow statement)", vals: y.map((x) => x.cfo), kind: "total" },
  ];
  const Table = ({ title, lines }: { title: string; lines: Line[] }) => (
    <div className={clsx(CARD, "overflow-hidden print:shadow-none")}>
      <p className="border-b border-[#e1e7ef] px-4 py-3 text-[14.5px] font-bold text-ink-900">{title}</p>
      <div className="thin-scrollbar overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead>
            <tr className="border-b border-[#e1e7ef] bg-[#f8f9fc] text-[12.5px] text-ink-600">
              <th className="px-4 py-2.5 text-start font-semibold">{ar ? "بالريال" : "SAR"}</th>
              {r.years.map((yy) => <th key={yy.year} className="px-3 py-2.5 text-end font-semibold">{t("y")}{yy.year}</th>)}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label} className={clsx("border-b border-[#f0f2f7] last:border-0", l.kind === "total" && "bg-brand-50/50 font-bold")}>
                <td className={clsx("px-4 py-2.5", l.kind === "total" ? "text-ink-900" : "text-ink-700")}>{l.label}</td>
                {l.vals.map((v, i) => <td key={i} className={clsx("ltr-content px-3 py-2.5 text-end tabular-nums", v < 0 ? "text-[#a02a24]" : "text-ink-900")}>{money(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <Table title={ar ? "من الإيرادات إلى المتحصلات النقدية" : "From revenue to cash collected"} lines={A} />
      <Table title={ar ? "من الربح التشغيلي (EBITDA) إلى صافي التدفق من التشغيل" : "From EBITDA to net cash from operations"} lines={B} />
    </div>
  );
}
