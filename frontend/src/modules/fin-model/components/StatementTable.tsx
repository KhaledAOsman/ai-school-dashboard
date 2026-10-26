import clsx from "clsx";
import { useFM } from "../context";
import { money } from "../i18n";
import type { StmtLine } from "./statements";
import type { MonthRow, YearRow } from "../api";

export function StatementTable({ lines, cols, labels, totalCol }: {
  lines: StmtLine[]; cols: (MonthRow | YearRow)[]; labels: string[]; totalCol?: boolean;
}) {
  const { lang } = useFM();
  return (
    <div className="thin-scrollbar overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[720px] border-separate print:!min-w-0 print:text-[10.5px] border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th className="sticky start-0 z-10 bg-white py-2 pe-3 text-start font-semibold text-ink-600" />
            {labels.map((l) => <th key={l} className="whitespace-nowrap px-2 py-2 text-end font-semibold text-ink-600">{l}</th>)}
            {totalCol && <th className="whitespace-nowrap px-2 py-2 text-end font-bold text-ink-900">{lang === "ar" ? "الإجمالي" : "Total"}</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => {
            if (ln.kind === "header") {
              return (
                <tr key={ln.key}><td colSpan={labels.length + 2} className="pt-3 pb-1 text-[12.5px] font-bold uppercase tracking-wide text-brand-600">{lang === "ar" ? ln.ar : ln.en}</td></tr>
              );
            }
            const vals = cols.map((c) => ln.value(c));
            // detail lines that are zero in every column (e.g. no finance cost on an interest-free loan) are left out
            if (ln.indent && !ln.kind && vals.every((v) => Math.abs(v) < 0.5)) return null;
            const strong = ln.kind === "subtotal" || ln.kind === "total";
            return (
              <tr key={ln.key} className={clsx(strong && "font-semibold", ln.kind === "total" && "text-[13.5px]")}>
                <td className={clsx("sticky start-0 z-10 min-w-[170px] bg-white print:static print:!min-w-0 py-1.5 pe-3 text-start sm:min-w-[240px]", ln.indent ? "ps-3 text-ink-700" : "text-ink-900",
                  strong && "border-t border-[#e1e7ef]", ln.kind === "total" && "border-b-2 border-ink-300")}>{lang === "ar" ? ln.ar : ln.en}</td>
                {vals.map((v, i) => (
                  <td key={i} className={clsx("ltr-content whitespace-nowrap px-2 py-1.5 text-end tabular-nums", v < 0 ? "text-[#a02a24]" : "text-ink-900",
                    strong && "border-t border-[#e1e7ef]", ln.kind === "total" && "border-b-2 border-ink-300")}>{money(v)}</td>
                ))}
                {totalCol && (
                  <td className={clsx("ltr-content whitespace-nowrap px-2 py-1.5 text-end font-semibold tabular-nums", strong && "border-t border-[#e1e7ef]", ln.kind === "total" && "border-b-2 border-ink-300")}>
                    {money(ln.agg === "first" ? vals[0] : ln.agg === "last" ? vals[vals.length - 1] : vals.reduce((a, b) => a + b, 0))}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
