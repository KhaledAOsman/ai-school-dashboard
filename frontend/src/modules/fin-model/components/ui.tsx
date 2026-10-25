import type { ReactNode } from "react";
import clsx from "clsx";
import { Info } from "lucide-react";
import { AnimatedText, Reveal } from "@/components/motion";
import { useFM } from "../context";
import { compact, money } from "../i18n";

export const CARD = "rounded-xl border border-[#e1e7ef] bg-white shadow-card";

export function Panel({ title, subtitle, action, children, className, delay = 0 }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; delay?: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <section className={clsx(CARD, "h-full p-4 sm:p-5 print:break-inside-avoid print:shadow-none", className)}>
        {(title || action) && (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {title && <h3 className="text-[16px] font-bold text-ink-900">{title}</h3>}
              {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-600">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </section>
    </Reveal>
  );
}

export function Kpi({ label, value, sub, hint, tone = "default", delay = 0, animate = true }: {
  label: string; value: string; sub?: ReactNode; hint?: string; tone?: "default" | "good" | "bad" | "accent"; delay?: number; animate?: boolean;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <div className={clsx(CARD, "flex h-full flex-col p-4 print:shadow-none")}>
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-600">
          <span>{label}</span>
          {hint && <span title={hint} className="cursor-help text-ink-400 print:hidden"><Info size={13} /></span>}
        </p>
        <p className={clsx("ltr-content mt-1.5 text-right text-[19px] font-bold leading-7 tracking-tight sm:text-[24px] sm:leading-8",
          tone === "good" ? "text-[#136c3a]" : tone === "bad" ? "text-[#a02a24]" : tone === "accent" ? "text-brand-600" : "text-ink-900")}>
          {animate ? <AnimatedText text={value} /> : value}
        </p>
        {sub && <div className="mt-auto pt-1.5 text-[12.5px] text-ink-600">{sub}</div>}
      </div>
    </Reveal>
  );
}

/** Money for KPI cards: "1.25 مليون ر.س" */
export function useMoney() {
  const { lang, t } = useFM();
  return {
    big: (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${compact(v, lang)} ${t("sar")}`),
    full: (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${money(v, { parens: false })} ${t("sar")}`),
  };
}

export function ChartTooltip({ active, payload, label, formatter, labelFormatter }: {
  active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string;
  formatter?: (v: number, key: string) => string; labelFormatter?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#e1e7ef] bg-white px-3 py-2 text-[12.5px] shadow-lg">
      <p className="mb-1 font-semibold text-ink-900">{labelFormatter ? labelFormatter(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-700">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          <span>{p.name}</span>
          <span className="ltr-content ms-auto ps-3 font-semibold text-ink-900">{formatter ? formatter(p.value, p.dataKey) : money(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-full border border-[#e1e7ef] bg-white p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={clsx("rounded-full font-semibold transition-colors", size === "sm" ? "px-3 py-1 text-[12.5px]" : "px-3.5 py-1.5 text-[13px]",
            value === o.value ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-brand-50")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "good" }) {
  return (
    <div className={clsx("rounded-xl border px-4 py-3 text-[13.5px] leading-6",
      tone === "warn" ? "border-[#f5d0a9] bg-[#fff7ef] text-[#8a4a12]" : tone === "good" ? "border-[#bfe5cf] bg-[#f1fbf5] text-[#136c3a]" : "border-[#e1e7ef] bg-[#f8f9fc] text-ink-700")}>
      {children}
    </div>
  );
}
