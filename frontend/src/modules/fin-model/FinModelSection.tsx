/**
 * Investor financial model (feasibility study & growth plan).
 * One shared header (version, scenario, language, export) above tabbed pages.
 * Investors (financial_model.view) only ever see published versions; the
 * financial analyst (financial_model.edit) also works on drafts.
 */
import { Suspense, lazy, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import clsx from "clsx";
import { Download, FileText, Languages } from "lucide-react";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { FinModelProvider, useFM } from "./context";
import { ScenarioBar } from "./components/ScenarioBar";
import { CHAPTERS, TOOLS, ToolHeader } from "./components/chapters";

const Overview = lazy(() => import("./pages/OverviewPage"));
const Statements = lazy(() => import("./pages/StatementsPage"));
const Units = lazy(() => import("./pages/UnitEconomicsPage"));
const ActualVsPlan = lazy(() => import("./pages/ActualVsPlanPage"));
const Scenarios = lazy(() => import("./pages/ScenariosPage"));
const Funding = lazy(() => import("./pages/FundingPage"));
const AssumptionsPage = lazy(() => import("./pages/AssumptionsPage"));
const Versions = lazy(() => import("./pages/VersionsPage"));
const Report = lazy(() => import("./pages/ReportPage"));
const BusinessModel = lazy(() => import("./pages/HowItWorksPage"));
const SalesPlan = lazy(() => import("./pages/GrowthPage"));
const Expenses = lazy(() => import("./pages/ExpensesPage"));

export function FinModelSection() {
  return (
    <FinModelProvider>
      <Shell />
    </FinModelProvider>
  );
}

function Shell() {
  const fm = useFM();
  const { t, lang, setLang, dir, versions, version, setVersionId, canEdit, result } = fm;
  const canExport = usePermission(PERMISSIONS.FIN_MODEL_EXPORT);
  const location = useLocation();
  const isReport = location.pathname.endsWith("/report");
  const [exporting, setExporting] = useState(false);
  const qs = location.search;
  // the full report (every chapter one after another): analysts with export rights, and viewers of a
  // published version when the owner allowed it
  const canReport = canExport || canEdit || (version?.status === "published" && version.presentation?.allow_report !== false);

  // moving to another chapter/tool starts at the top of the page, not where the previous one was scrolled
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }, [location.pathname]);

  async function exportExcel() {
    if (!result || !version) return;
    setExporting(true);
    try {
      const { exportWorkbook } = await import("./export");
      await exportWorkbook(result, version, fm);
    } finally {
      setExporting(false);
    }
  }

  if (!fm.versionsLoading && !version) {
    return (
      <div dir={dir} className="py-20 text-center">
        <h1 className="text-[22px] font-bold text-ink-900">{t("no_version")}</h1>
        <p className="mt-2 text-[14px] text-ink-600">{t("no_version_hint")}</p>
      </div>
    );
  }

  return (
    <div dir={dir} lang={lang} className={clsx("fm-root", lang === "en" && "text-left")}>
      {!isReport && (
        <div className="print:hidden">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[24px] font-bold tracking-tight text-ink-900 sm:text-[26px]">{t("module")}</h1>
              <p className="mt-0.5 text-[13.5px] text-ink-600">{t("subtitle")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setLang(lang === "ar" ? "en" : "ar")}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e1e7ef] bg-white px-3 text-[13px] font-semibold text-ink-700 hover:bg-brand-50">
                <Languages size={15} /> {lang === "ar" ? "English" : "العربية"}
              </button>
              {canExport && (
                <button type="button" onClick={exportExcel} disabled={!result || exporting}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e1e7ef] bg-white px-3 text-[13px] font-semibold text-ink-700 hover:bg-brand-50 disabled:opacity-50">
                  <Download size={15} /> {t("export_excel")}
                </button>
              )}
              {canReport && (
                <NavLink to={`report${qs}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 text-[13px] font-semibold text-white hover:bg-brand-700">
                  <FileText size={15} /> {lang === "ar" ? "العرض الكامل / طباعة" : "Full report / print"}
                </NavLink>
              )}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-ink-600">
              <span>{t("version")}</span>
              <select value={version?.id ?? ""} onChange={(e) => setVersionId(e.target.value)}
                className="h-9 max-w-[280px] rounded-full border border-[#e1e7ef] bg-white px-3 text-[13px] font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-600">
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} — {t(v.status)}</option>
                ))}
              </select>
            </label>
            {version && (
              <span className={clsx("text-[12.5px] font-semibold", version.status === "published" ? "text-[#136c3a]" : "text-accent-700")}>
                ● {t(version.status)}
              </span>
            )}
            <div className="flex flex-wrap items-center gap-1 lg:ms-auto">
              <span className="me-1 text-[12.5px] font-medium text-ink-500">{lang === "ar" ? "أدوات المحلل:" : "Analyst tools:"}</span>
              {TOOLS.filter((x) => !x.editorsOnly || canEdit).map((x) => (
                <NavLink key={x.to} to={`${x.to}${qs}`}
                  className={({ isActive }) => clsx("whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors",
                    isActive ? "border-accent-500 text-accent-700" : "border-[#e1e7ef] bg-white text-ink-600 hover:text-ink-900")}>
                  {lang === "ar" ? x.ar : x.en}
                </NavLink>
              ))}
            </div>
          </div>

          <ScenarioBar className="mb-5" />

          <nav className="mb-7 border-b border-ink-200" aria-label={lang === "ar" ? "فصول العرض" : "Chapters"}>
            <div className="thin-scrollbar -mx-1 flex items-end gap-0.5 overflow-x-auto px-1">
              {CHAPTERS.map((c, i) => (
                <NavLink key={c.to} to={`${c.to}${qs}`}
                  className={({ isActive }) => clsx("group -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2.5 py-3 text-[14px] font-semibold transition-colors",
                    isActive ? "border-brand-600 text-brand-700" : "border-transparent text-ink-600 hover:text-ink-900")}>
                  {({ isActive }) => (
                    <>
                      <span className={clsx("ltr-content grid h-6 w-6 place-items-center rounded-full border text-[11.5px] font-bold transition-colors",
                        isActive ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 text-ink-500 group-hover:border-ink-500")}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span title={lang === "ar" ? c.ar : c.en}>{c.short ? c.short[lang === "ar" ? 0 : 1] : lang === "ar" ? c.ar : c.en}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      )}

      {!isReport && (() => {
        const tool = TOOLS.find((x) => location.pathname.endsWith(`/${x.to}`));
        return tool ? <ToolHeader to={tool.to} /> : null;
      })()}
      <Suspense fallback={<p className="py-10 text-center text-[14px] text-ink-600">{t("loading")}</p>}>
        <Routes>
          <Route index element={<Navigate to={`overview${qs}`} replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="business-model" element={<BusinessModel />} />
          <Route path="sales-plan" element={<SalesPlan />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="how-it-works" element={<Navigate to={`../business-model${qs}`} replace />} />
          <Route path="growth" element={<Navigate to={`../sales-plan${qs}`} replace />} />
          <Route path="statements" element={<Statements />} />
          <Route path="unit-economics" element={<Units />} />
          <Route path="actual-vs-plan" element={<ActualVsPlan />} />
          <Route path="scenarios" element={<Scenarios />} />
          <Route path="funding" element={<Funding />} />
          <Route path="assumptions" element={<AssumptionsPage />} />
          <Route path="versions" element={canEdit || fm.versionsLoading ? <Versions /> : <Navigate to={`../overview${qs}`} replace />} />
          <Route path="report" element={canReport || fm.versionsLoading ? <Report /> : <Navigate to={`../overview${qs}`} replace />} />
          <Route path="*" element={<Navigate to={`overview${qs}`} replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
