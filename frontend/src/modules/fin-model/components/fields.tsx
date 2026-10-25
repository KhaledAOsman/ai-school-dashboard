import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { RefreshCw } from "lucide-react";

const input = "w-full rounded-lg bg-white px-3 py-2 text-[14px] text-ink-900 ring-1 ring-inset ring-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:bg-ink-50 disabled:text-ink-500";

export function FieldShell({ label, hint, children, auto }: { label: string; hint?: string; children: ReactNode; auto?: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12.5px] font-semibold text-ink-800">{label}</span>
      {children}
      {auto}
      {hint && <span className="mt-1 block text-[11.5px] leading-4 text-ink-500">{hint}</span>}
    </label>
  );
}

/** Number input that keeps the user's text while typing; `kind` controls display (% shows value × 100). */
export function NumInput({ value, onChange, kind = "num", disabled, min, max, step }: {
  value: number; onChange: (v: number) => void; kind?: "num" | "money" | "pct" | "int"; disabled?: boolean; min?: number; max?: number; step?: number;
}) {
  const toText = (v: number) => (kind === "pct" ? String(+(v * 100).toFixed(4)) : String(v ?? 0));
  const [text, setText] = useState(toText(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(toText(value)); }, [value, focus]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative" dir="ltr">
      <input
        type="number" inputMode="decimal" className={clsx(input, "text-right tabular-nums", kind === "pct" && "pe-7")}
        value={text} disabled={disabled} min={min} max={max} step={step ?? (kind === "int" ? 1 : "any")}
        onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); setText(toText(value)); }}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(kind === "pct" ? n / 100 : kind === "int" ? Math.round(n) : n);
        }}
      />
      {kind === "pct" && <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-500">%</span>}
    </div>
  );
}

export function TextInput({ value, onChange, disabled, dir }: { value: string; onChange: (v: string) => void; disabled?: boolean; dir?: "rtl" | "ltr" }) {
  return <input className={input} value={value ?? ""} disabled={disabled} dir={dir} onChange={(e) => onChange(e.target.value)} />;
}

export function MonthInput({ value, onChange, disabled, allowEmpty }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean; allowEmpty?: boolean }) {
  return (
    <input type="month" dir="ltr" className={input} value={value ?? ""} disabled={disabled}
      onChange={(e) => onChange(e.target.value || (allowEmpty ? null : value))} />
  );
}

export function SelectInput<T extends string | number>({ value, onChange, options, disabled }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean;
}) {
  return (
    <select className={clsx(input, "cursor-pointer")} value={String(value)} disabled={disabled}
      onChange={(e) => { const o = options.find((x) => String(x.value) === e.target.value); if (o) onChange(o.value); }}>
      {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-800 disabled:opacity-60">
      <span className={clsx("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-brand-600" : "bg-ink-300")}>
        <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "start-[18px]" : "start-0.5")} />
      </span>
      {label}
    </button>
  );
}

/** "Auto from actual data" switch shown under a calibrated field. */
export function AutoBadge({ on, onToggle, actual, basis, disabled, lang, format }: {
  on: boolean; onToggle: () => void; actual: number | undefined; basis?: string; disabled?: boolean; lang: "ar" | "en"; format: (v: number) => string;
}) {
  if (actual === undefined) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-600">
      <button type="button" disabled={disabled} onClick={onToggle}
        className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold", on ? "border-brand-600 text-brand-700" : "border-ink-300 text-ink-600")}>
        <RefreshCw size={11} /> {on ? (lang === "ar" ? "تلقائي من الفعلي" : "Auto from actuals") : (lang === "ar" ? "يدوي" : "Manual")}
      </button>
      <span title={basis}>{lang === "ar" ? "الفعلي:" : "Actual:"} <b className="ltr-content">{format(actual)}</b></span>
    </span>
  );
}
