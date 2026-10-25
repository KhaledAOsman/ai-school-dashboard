/**
 * Investor financial model (feasibility study & growth plan).
 * One shared header (version, scenario, language, export) above tabbed pages.
 * Investors (financial_model.view) only ever see published versions; the
 * financial analyst (financial_model.edit) also works on drafts.
 */
import { Suspense, lazy, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import clsx from "clsx";
import { Download, FileText, Languages } from "lucide-react";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { FinModelProvider, useFM } from "./context";
import { Segmented } from "./components/ui";
import type { Scenario } from "./api";

const Overview = lazy(() => import("./pages/OverviewPage"));
const Statements = lazy(() => import("./pages/StatementsPage"));
const Units = lazy(() => import("./pages/UnitEconomicsPage"));
const ActualVsPlan = lazy(() => import("./pages/ActualVsPlanPage"));
const Scenarios = lazy(() => import("./pages/ScenariosPage"));
const Funding = lazy(() => import("./pages/FundingPage"));
const AssumptionsPage = lazy(() => import("./pages/AssumptionsPage"));
const Versions = lazy(() => import("./pages/VersionsPage"));
const Report = lazy(() => import("./pages/ReportPage"));

export function FinModelSection() {
  return (
    <FinModelProvider>
      <Shell />
    </FinModelProvider>
  );
}

function Shell() {
  const fm = useFM();
  const { t, lang, setLang, dir, versions, version, setVersionId, scenario, setScenario, canEdit, result } = fm;
  const canExport = usePermission(PERMISSIONS.FIN_MODEL_EXPORT);
  const location = useLocation();
  const isReport = location.pathname.endsWith("/report");
  const [exporting, setExporting] = useState(false);
  const qs = location.search;

  const tabs: { to: string; label: string; show: boolean }[] = [
    { to: "overview", label: t("tab_overview"), show: true },
    { to: "statements", label: t("tab_statements"), show: true },
    { to: "unit-economics", label: t("tab_units"), show: true },
    { to: "actual-vs-plan", label: t("tab_actual"), show: true },
    { to: "scenarios", label: t("tab_scenarios"), show: true },
    { to: "funding", label: t("tab_funding"), show: true },
    { to: "assumptions", label: t("tab_assumptions"), show: true },
    { to: "versions", label: t("tab_versions"), show: canEdit },
  ];

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
    <div dir={dir} lang={lang} className={clsx(lang === "en" && "text-left")}>
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
                <>
                  <button type="button" onClick={exportExcel} disabled={!result || exporting}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e1e7ef] bg-white px-3 text-[13px] font-semibold text-ink-700 hover:bg-brand-50 disabled:opacity-50">
                    <Download size={15} /> {t("export_excel")}
                  </button>
                  <NavLink to={`report${qs}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 text-[13px] font-semibold text-white hover:bg-brand-700">
                    <FileText size={15} /> {t("export_pdf")}
                  </NavLink>
                </>
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
            <div className="flex items-center gap-2 text-[13px] text-ink-600">
              <span>{t("scenario")}</span>
              <Segmented<Scenario> size="sm" value={scenario} onChange={setScenario}
                options={[{ value: "conservative", label: t("sc_conservative") }, { value: "base", label: t("sc_base") }, { value: "optimistic", label: t("sc_optimistic") }]} />
            </div>
            {version && (
              <span className={clsx("text-[12.5px] font-semibold", version.status === "published" ? "text-[#136c3a]" : "text-accent-700")}>
                ● {t(version.status)}
              </span>
            )}
          </div>

          <nav className="thin-scrollbar -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-ink-200 px-1">
            {tabs.filter((x) => x.show).map((x) => (
              <NavLink key={x.to} to={`${x.to}${qs}`}
                className={({ isActive }) => clsx("-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[14px] font-semibold transition-colors",
                  isActive ? "border-brand-600 text-brand-700" : "border-transparent text-ink-600 hover:text-ink-900")}>
                {x.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      <Suspense fallback={<p className="py-10 text-center text-[14px] text-ink-600">{t("loading")}</p>}>
        <Routes>
          <Route index element={<Navigate to={`overview${qs}`} replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="statements" element={<Statements />} />
          <Route path="unit-economics" element={<Units />} />
          <Route path="actual-vs-plan" element={<ActualVsPlan />} />
          <Route path="scenarios" element={<Scenarios />} />
          <Route path="funding" element={<Funding />} />
          <Route path="assumptions" element={<AssumptionsPage />} />
          <Route path="versions" element={canEdit || fm.versionsLoading ? <Versions /> : <Navigate to={`../overview${qs}`} replace />} />
          <Route path="report" element={<Report />} />
          <Route path="*" element={<Navigate to={`overview${qs}`} replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
