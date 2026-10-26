/**
 * Scenario switcher shown at the top of every page (and the report): one card per scenario the
 * viewer may see, each with its headline numbers, so an investor opening a shared link can compare
 * and switch cases in one click. Results are the same queries the pages use (shared cache).
 */
import { useQueries } from "@tanstack/react-query";
import clsx from "clsx";
import { useFM } from "../context";
import { fmApi, type Scenario } from "../api";
import { COLORS, compact, monthLabel } from "../i18n";

const STRIP: Record<Scenario, string> = { conservative: COLORS.slate, base: COLORS.purple, optimistic: COLORS.orange };
const NOTE: Record<Scenario, [string, string]> = {
  conservative: ["نمو أبطأ وتكلفة أعلى", "Slower growth, higher costs"],
  base: ["الخطة المعتمدة", "The plan as approved"],
  optimistic: ["نمو أسرع من المتوقع", "Faster than expected"],
};

export function ScenarioBar({ className }: { className?: string }) {
  const { version, scenario, scenarios, setScenario, t, lang } = useFM();
  const ar = lang === "ar";
  const qs = useQueries({
    queries: scenarios.map((sc) => ({
      queryKey: ["fm", "result", version?.id, sc, version?.updated_at],
      queryFn: () => fmApi.result(version!.id, sc),
      enabled: !!version,
      staleTime: 60_000,
    })),
  });
  if (!version || scenarios.length < 2) return null;
  return (
    <div className={clsx("print:hidden", className)}>
      <p className="mb-2 text-[13px] font-semibold text-ink-600">{ar ? "اختر السيناريو لعرض أرقامه في كل الصفحات" : "Choose a scenario — every page follows it"}</p>
      <div role="tablist" className={clsx("grid gap-2 sm:gap-3", scenarios.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {scenarios.map((sc, i) => {
          const k = qs[i]?.data?.kpis;
          const active = sc === scenario;
          return (
            <button key={sc} type="button" role="tab" aria-selected={active} onClick={() => setScenario(sc)}
              className={clsx("group relative overflow-hidden rounded-xl border bg-white p-2.5 text-start transition-all duration-200 sm:p-3.5",
                active ? "border-brand-600 shadow-[0_6px_18px_-8px_rgba(109,58,242,0.45)]" : "border-[#e1e7ef] hover:-translate-y-0.5 hover:border-ink-300")}>
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: STRIP[sc], opacity: active ? 1 : 0.45 }} />
              <span className="flex items-center justify-between gap-2">
                <span className={clsx("text-[14px] font-bold sm:text-[15.5px]", active ? "text-brand-700" : "text-ink-900")}>{t(`sc_${sc}` as "sc_base")}</span>
                <span className={clsx("grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition-colors", active ? "border-brand-600" : "border-ink-300")}>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
                </span>
              </span>
              <span className="mt-0.5 hidden text-[12px] text-ink-500 sm:block">{NOTE[sc][ar ? 0 : 1]}</span>
              <span className="mt-2 grid gap-x-3 gap-y-1 text-[11.5px] text-ink-600 sm:grid-cols-3 sm:text-[12px]">
                <span><span className="block text-ink-500">{ar ? "التعادل" : "Break-even"}</span>
                  <b className="text-ink-900">{k ? (k.ebitda_breakeven_month ? monthLabel(k.ebitda_breakeven_month, lang) : t("not_reached")) : "…"}</b></span>
                <span className="hidden sm:block"><span className="block text-ink-500">{ar ? "إيراد س5" : "Y5 revenue"}</span>
                  <b className="ltr-content text-ink-900">{k ? compact(k.revenue_y5, "en") : "…"}</b></span>
                <span className="hidden sm:block"><span className="block text-ink-500">{ar ? "القرض" : "Loan"}</span>
                  <b className="ltr-content text-ink-900">{k ? compact(k.loan_amount, "en") : "…"}</b></span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
