import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useFM } from "../context";
import { fmApi, type Presentation, type Scenario, type VersionMeta } from "../api";
import { CARD, Note, Panel } from "../components/ui";
import { apiErrorMessage } from "@/modules/marketing/lib";

const fmtDT = (iso: string | null, lang: "ar" | "en") => (iso ? new Date(iso).toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function VersionsPage() {
  const { versions, version, setVersionId, canPublish, lang, t } = useFM();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>(version?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const hq = useQuery({ queryKey: ["fm", "history", version?.id, version?.updated_at], queryFn: () => fmApi.history(version!.id), enabled: !!version });
  const done = () => qc.invalidateQueries({ queryKey: ["fm"] });
  const create = useMutation({ mutationFn: () => fmApi.create(name.trim(), copyFrom || null), onSuccess: (v) => { setName(""); done().then(() => setVersionId(v.id)); }, onError: (e) => setErr(apiErrorMessage(e)) });
  const [picking, setPicking] = useState<string | null>(null);
  const publish = useMutation({ mutationFn: ({ id, p }: { id: string; p: Presentation }) => fmApi.publish(id, p), onSuccess: () => { setPicking(null); done(); }, onError: (e) => setErr(apiErrorMessage(e)) });
  const present = useMutation({ mutationFn: ({ id, p }: { id: string; p: Presentation }) => fmApi.setPresentation(id, p), onSuccess: () => { setPicking(null); done(); }, onError: (e) => setErr(apiErrorMessage(e)) });
  const archive = useMutation({ mutationFn: (id: string) => fmApi.archive(id), onSuccess: done, onError: (e) => setErr(apiErrorMessage(e)) });
  const actionLabel: Record<string, [string, string]> = {
    "fin_model.create": ["إنشاء النسخة", "Created"], "fin_model.update": ["تعديل الافتراضات", "Assumptions edited"],
    "fin_model.publish": ["نشر للمستثمرين", "Published to investors"], "fin_model.archive": ["أرشفة", "Archived"], "fin_model.presentation": ["تحديد السيناريوهات المعروضة", "Shown scenarios changed"],
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Note>{ar ? "يعدّل المحلل المالي المسودات بحرية. عند اعتماد المالك نسخة بالضغط على «نشر» تُقفل النسخة بأرقامها وبيانات التشغيل الفعلية في تاريخ النشر، وهي النسخة التي يطّلع عليها المستثمرون. لأي تعديل لاحق تُنشأ نسخة جديدة منها." : "The analyst edits drafts freely. When the owner publishes, the version is locked together with the actual data at that moment — that is what investors see. To change a published version, create a copy."}</Note>
        {versions.map((v) => (
          <div key={v.id} className={clsx(CARD, "p-4", v.id === version?.id && "ring-2 ring-brand-600")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-ink-900">{v.name}</p>
                {v.description && <p className="mt-0.5 text-[12.5px] text-ink-600">{v.description}</p>}
                <p className="mt-1 text-[12px] text-ink-500">
                  <span className={clsx("font-semibold", v.status === "published" ? "text-[#136c3a]" : "text-accent-700")}>{t(v.status)}</span>
                  {" · "}{ar ? "آخر تعديل" : "Updated"} {fmtDT(v.updated_at, lang)}
                  {v.published_at && <> · {ar ? "نُشرت" : "Published"} {fmtDT(v.published_at, lang)}{v.calibration_as_of && ` (${ar ? "بيانات حتى" : "data as of"} ${v.calibration_as_of})`}</>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {v.id !== version?.id && <button type="button" onClick={() => setVersionId(v.id)} className="rounded-full border border-[#e1e7ef] px-3 py-1.5 text-[13px] font-semibold text-ink-700 hover:bg-brand-50">{ar ? "عرض" : "Open"}</button>}
                {canPublish && v.status === "draft" && (
                  <button type="button" disabled={publish.isPending} onClick={() => setPicking(picking === v.id ? null : v.id)}
                    className="rounded-full bg-brand-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700">{ar ? "نشر للمستثمرين" : "Publish"}</button>
                )}
                {canPublish && v.status === "published" && (
                  <button type="button" onClick={() => setPicking(picking === v.id ? null : v.id)}
                    className="rounded-full border border-[#e1e7ef] px-3 py-1.5 text-[13px] font-semibold text-ink-700 hover:bg-brand-50">{ar ? "السيناريوهات المعروضة" : "Shown scenarios"}</button>
                )}
                {canPublish && (
                  <button type="button" onClick={() => { if (window.confirm(ar ? `أرشفة «${v.name}»؟` : `Archive “${v.name}”?`)) archive.mutate(v.id); }}
                    className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#a02a24] hover:bg-ink-100">{ar ? "أرشفة" : "Archive"}</button>
                )}
              </div>
            </div>
            {v.status === "published" && v.presentation && picking !== v.id && (
              <p className="mt-2 text-[12.5px] text-ink-600">{ar ? "يرى المشاهدون: " : "Viewers see: "}
                {v.presentation.scenarios.map((sc) => t(`sc_${sc}` as "sc_base")).join(ar ? "، " : ", ")}
                {" · "}{ar ? "يفتح على: " : "Opens on: "}<b className="text-ink-900">{t(`sc_${v.presentation.default_scenario}` as "sc_base")}</b>
                {" · "}{v.presentation.allow_report !== false ? (ar ? "العرض الكامل والطباعة مسموح" : "Full report allowed") : (ar ? "العرض الكامل غير مسموح" : "Full report not allowed")}</p>
            )}
            {picking === v.id && (
              <PresentationPicker v={v} busy={publish.isPending || present.isPending}
                cta={v.status === "draft" ? (ar ? "تأكيد النشر وقفل النسخة" : "Publish and lock") : (ar ? "حفظ" : "Save")}
                onCancel={() => setPicking(null)}
                onSave={(p) => (v.status === "draft" ? publish.mutate({ id: v.id, p }) : present.mutate({ id: v.id, p }))} />
            )}
          </div>
        ))}
        {err && <p className="text-[13px] text-[#a02a24]">{err}</p>}
      </div>
      <div className="space-y-4">
        <Panel title={ar ? "نسخة جديدة" : "New version"}>
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }} className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder={ar ? "مثال: خطة جولة التمويل — نوفمبر 2026" : "e.g. Funding round plan — Nov 2026"}
              className="w-full rounded-lg px-3 py-2 text-[14px] ring-1 ring-inset ring-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-600" />
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="w-full rounded-lg px-3 py-2 text-[14px] ring-1 ring-inset ring-ink-300">
              <option value="">{ar ? "من الافتراضات المبدئية" : "From the default assumptions"}</option>
              {versions.map((v) => <option key={v.id} value={v.id}>{ar ? "نسخة من: " : "Copy of: "}{v.name}</option>)}
            </select>
            <button type="submit" disabled={!name.trim() || create.isPending} className="w-full rounded-full bg-brand-600 py-2 text-[14px] font-semibold text-white disabled:bg-ink-200">{ar ? "إنشاء" : "Create"}</button>
          </form>
        </Panel>
        <Panel title={ar ? `سجل التعديلات — ${version?.name ?? ""}` : `Change log — ${version?.name ?? ""}`}>
          <ul className="space-y-2.5 text-[12.5px]">
            {(hq.data ?? []).map((h, i) => {
              const changed = (h.details?.changed as string[] | undefined) ?? [];
              return (
                <li key={i} className="border-b border-[#f0f2f7] pb-2">
                  <p className="font-semibold text-ink-900">{(actionLabel[h.action] ?? [h.action, h.action])[ar ? 0 : 1]} <span className="font-normal text-ink-500">— {h.by ?? "—"}</span></p>
                  <p className="text-ink-500">{fmtDT(h.at, lang)}</p>
                  {changed.length > 0 && <p className="ltr-content mt-0.5 break-words text-[11.5px] text-ink-600" title={changed.join("\n")}>{changed.slice(0, 6).join(", ")}{changed.length > 6 ? ` +${changed.length - 6}` : ""}</p>}
                </li>
              );
            })}
            {hq.data?.length === 0 && <li className="text-ink-500">{ar ? "لا توجد تعديلات بعد" : "No changes yet"}</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}


const ALL_SC: Scenario[] = ["conservative", "base", "optimistic"];

/** Owner picks which scenarios viewers of the shared dashboard can switch between, and the one it opens on. */
function PresentationPicker({ v, cta, busy, onSave, onCancel }: { v: VersionMeta; cta: string; busy: boolean; onSave: (p: Presentation) => void; onCancel: () => void }) {
  const { t, lang } = useFM();
  const ar = lang === "ar";
  const [sel, setSel] = useState<Scenario[]>(v.presentation?.scenarios ?? ALL_SC);
  const [def, setDef] = useState<Scenario>(v.presentation?.default_scenario ?? "base");
  const [report, setReport] = useState<boolean>(v.presentation?.allow_report !== false);
  const toggle = (sc: Scenario) => setSel((x) => {
    const n = x.includes(sc) ? x.filter((y) => y !== sc) : ALL_SC.filter((y) => y === sc || x.includes(y));
    if (!n.length) return x;
    if (!n.includes(def)) setDef(n.includes("base") ? "base" : n[0]);
    return n;
  });
  return (
    <div className="mt-3 rounded-xl border border-[#e1e7ef] bg-[#f8f9fc] p-3.5">
      <p className="text-[13.5px] font-bold text-ink-900">{ar ? "السيناريوهات التي يراها من تشارك معه لوحة التحكم" : "Scenarios people you share the dashboard with can see"}</p>
      <p className="mt-0.5 text-[12.5px] text-ink-600">{ar ? "يظهر زر فوق كل الصفحات للتبديل بين السيناريوهات المختارة، وتفتح اللوحة على السيناريو الافتراضي." : "A switcher on top of every page lets them change between the chosen scenarios; the dashboard opens on the default one."}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {ALL_SC.map((sc) => (
          <div key={sc} className={clsx("rounded-lg border bg-white p-2.5", sel.includes(sc) ? "border-brand-600" : "border-[#e1e7ef]")}>
            <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-semibold text-ink-900">
              <input type="checkbox" className="h-4 w-4 accent-[#6d3af2]" checked={sel.includes(sc)} onChange={() => toggle(sc)} />
              {t(`sc_${sc}` as "sc_base")}
            </label>
            <label className={clsx("mt-1.5 flex items-center gap-2 text-[12.5px]", sel.includes(sc) ? "cursor-pointer text-ink-600" : "text-ink-300")}>
              <input type="radio" name={`def-${v.id}`} className="h-3.5 w-3.5 accent-[#6d3af2]" disabled={!sel.includes(sc)} checked={def === sc} onChange={() => setDef(sc)} />
              {ar ? "يفتح عليه أولًا" : "Opens first"}
            </label>
          </div>
        ))}
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-[#e1e7ef] bg-white p-2.5 text-[13.5px] text-ink-900">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#6d3af2]" checked={report} onChange={(e) => setReport(e.target.checked)} />
        <span><b>{ar ? "السماح بالعرض الكامل والطباعة" : "Allow the full report and printing"}</b>
          <span className="block text-[12.5px] text-ink-600">{ar ? "يظهر زر «العرض الكامل / طباعة» لمن تشارك معه اللوحة، ويعرض كل الفصول وراء بعض مع إمكانية الحفظ PDF." : "Viewers get a “Full report / print” button showing every chapter in sequence, printable to PDF."}</span></span>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => onSave({ scenarios: sel, default_scenario: def, allow_report: report })}
          className="rounded-full bg-brand-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{cta}</button>
        <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-600 hover:bg-ink-100">{ar ? "إلغاء" : "Cancel"}</button>
      </div>
    </div>
  );
}
