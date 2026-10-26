import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fmApi, type ModelResult, type Scenario, type VersionMeta } from "./api";
import { useLang, type Lang, type Key } from "./i18n";

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key) => string;
  nm: (o: { name_ar?: string | null; name_en?: string | null } | undefined | null) => string;
  dir: "rtl" | "ltr";
  versions: VersionMeta[];
  version: VersionMeta | null;
  versionId: string | null;
  setVersionId: (id: string) => void;
  scenario: Scenario;
  /** scenarios this viewer can switch between (all for the analyst; the owner's choice for a published version) */
  scenarios: Scenario[];
  setScenario: (s: Scenario) => void;
  canEdit: boolean;
  canPublish: boolean;
  result: ModelResult | undefined;
  resultLoading: boolean;
  resultError: boolean;
  versionsLoading: boolean;
}

const C = createContext<Ctx | null>(null);

export function FinModelProvider({ children }: { children: ReactNode }) {
  const { lang, setLang, t, nm, dir } = useLang();
  const [params, setParams] = useSearchParams();
  const vq = useQuery({ queryKey: ["fm", "versions"], queryFn: fmApi.versions, staleTime: 30_000 });
  const versions = vq.data?.versions ?? [];
  const wanted = params.get("v");
  const version =
    versions.find((v) => v.id === wanted) ??
    versions.find((v) => v.status === "published") ??
    versions[0] ??
    null;
  const ALL: Scenario[] = ["conservative", "base", "optimistic"];
  const pres = version?.status === "published" ? version.presentation : undefined;
  const scenarios: Scenario[] = vq.data?.can_edit || !pres ? ALL : pres.scenarios;
  const defScenario: Scenario = pres && scenarios.includes(pres.default_scenario) ? pres.default_scenario : scenarios.includes("base") ? "base" : scenarios[0];
  const scenarioParam = params.get("s") as Scenario | null;
  const scenario: Scenario = scenarioParam && scenarios.includes(scenarioParam) ? scenarioParam : defScenario;
  const rq = useQuery({
    queryKey: ["fm", "result", version?.id, scenario, version?.updated_at],
    queryFn: () => fmApi.result(version!.id, scenario),
    enabled: !!version,
    staleTime: 60_000,
    placeholderData: (p) => p,
  });

  const value = useMemo<Ctx>(() => ({
    lang, setLang, t, nm, dir, versions, version, versionId: version?.id ?? null,
    setVersionId: (id: string) => { const p = new URLSearchParams(params); p.set("v", id); setParams(p, { replace: true }); },
    scenario, scenarios,
    setScenario: (s: Scenario) => { const p = new URLSearchParams(params); if (s === defScenario) p.delete("s"); else p.set("s", s); setParams(p, { replace: true }); },
    canEdit: !!vq.data?.can_edit, canPublish: !!vq.data?.can_publish,
    result: rq.data, resultLoading: rq.isLoading, resultError: rq.isError, versionsLoading: vq.isLoading,
  }), [lang, setLang, t, nm, dir, versions, version, scenario, scenarios, defScenario, params, setParams, vq.data, rq.data, rq.isLoading, rq.isError, vq.isLoading]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useFM(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error("useFM outside FinModelProvider");
  return c;
}
