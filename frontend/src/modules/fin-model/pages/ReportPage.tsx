import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Printer } from "lucide-react";
import { useFM } from "../context";
import { monthLabel } from "../i18n";
import { Panel } from "../components/ui";
import { StatementTable } from "../components/StatementTable";
import { balanceLines, cashLines, incomeLines } from "../components/statements";
import OverviewPage from "./OverviewPage";
import BusinessModelPage from "./HowItWorksPage";
import UnitEconomicsPage from "./UnitEconomicsPage";
import SalesPlanPage from "./GrowthPage";
import ExpensesPage from "./ExpensesPage";
import FundingPage from "./FundingPage";
import ScenariosPage from "./ScenariosPage";
import { ChapterHeader, ReportMode } from "../components/chapters";
import { Reconciliation } from "../components/Reconciliation";
import { ScenarioBar } from "../components/ScenarioBar";

/** Print-ready investor report: browser "Save as PDF" turns it into the PDF. */
export default function ReportPage() {
  const { result: r, version, t, lang, scenario } = useFM();
  const location = useLocation();
  const ar = lang === "ar";
  useEffect(() => {
    const prev = document.title;
    document.title = `AI School — ${t("module")} — ${version?.name ?? ""}`;
    return () => { document.title = prev; };
  }, [t, version?.name]);
  if (!r) return <p className="py-10 text-center text-ink-600">{t("loading")}</p>;
  const labels = r.years.map((y) => `${t("y")}${y.year}`);
  return (
    <div className="mx-auto max-w-[1000px] space-y-6 print:max-w-none print:space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link to={`../overview${location.search}`} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-600"><ArrowRight size={16} className={ar ? "" : "rotate-180"} /> {t("tab_overview")}</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-[14px] font-semibold text-white"><Printer size={16} /> {ar ? "طباعة / حفظ PDF" : "Print / Save as PDF"}</button>
      </div>
      <ScenarioBar />
      <header className="border-b-2 border-brand-600 pb-3">
        <img src="/logo.png" alt="AiSchool" className="h-12 w-auto" />
        <h1 className="mt-2 text-[24px] font-bold text-ink-900">{t("module")} — {version?.name}</h1>
        <p className="text-[13px] text-ink-600">
          {t("subtitle")} · {t("scenario")}: {t(`sc_${scenario}` as "sc_base")} · {ar ? "تاريخ التقرير" : "Report date"}: {new Date().toISOString().slice(0, 10)}
          {version?.status === "published" && version.published_at ? ` · ${ar ? "نسخة منشورة" : "Published"} ${version.published_at.slice(0, 10)}` : ` · ${ar ? "مسودة" : "Draft"}`}
        </p>
      </header>
      <ReportMode.Provider value>
        <OverviewPage />
        <BusinessModelPage />
        <UnitEconomicsPage />
        <SalesPlanPage />
        <ExpensesPage />
        <div className="space-y-5">
          <ChapterHeader id="statements" />
          <Panel title={`${t("income_statement")} (${monthLabel(r.years[0].from, lang)} – ${monthLabel(r.years[r.years.length - 1].to, lang)})`}>
            <StatementTable lines={incomeLines(r)} cols={r.years} labels={labels} />
          </Panel>
          <Panel title={t("cash_flow")}><StatementTable lines={cashLines} cols={r.years} labels={labels} /></Panel>
          <Panel title={t("balance_sheet")}><StatementTable lines={balanceLines} cols={r.years} labels={labels} /></Panel>
          <Reconciliation />
        </div>
        <FundingPage />
        <ScenariosPage />
      </ReportMode.Provider>
      <p className="text-[11.5px] text-ink-500">
        {ar
          ? "تقرير مُعد من النموذج المالي في داشبورد AI School. الأرقام توقعات مبنية على افتراضات موضحة في صفحة الافتراضات وبيانات التشغيل الفعلية، وليست ضمانًا للنتائج."
          : "Generated from the AI School dashboard financial model. Figures are projections based on the stated assumptions and actual operating data, not a guarantee of results."}
      </p>
    </div>
  );
}
