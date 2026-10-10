import type { ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { periodLabel } from "@/modules/finance/utils";

/** 1,234.50 - plain, tabular, no currency (the whole book is in SAR). */
export function fmt(v: string | number | null | undefined, opts: { dash?: boolean } = {}): string {
  const n = Number(v ?? 0);
  if (opts.dash && Math.abs(n) < 0.005) return "—";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < -0.004 ? `(${s})` : s;
}

export function Money({ v, dash, bold, className = "" }: { v: string | number | null | undefined; dash?: boolean; bold?: boolean; className?: string }) {
  const n = Number(v ?? 0);
  return (
    <span className={`ltr-content tabular-nums ${bold ? "font-bold text-ink-900" : "text-ink-800"} ${n < -0.004 ? "text-danger-600" : ""} ${className}`}>
      {fmt(v, { dash })}
    </span>
  );
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportHeader({ title, subtitle, onExport, children }: { title: string; subtitle?: string; onExport?: () => void; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[22px] font-bold tracking-tight text-ink-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {children}
        {onExport && (
          <Button variant="secondary" size="md" onClick={onExport}>
            <Download size={16} />
            تصدير Excel
          </Button>
        )}
        <Button variant="secondary" size="md" onClick={() => window.print()}>
          <Printer size={16} />
          طباعة
        </Button>
      </div>
    </div>
  );
}

export function DateRange({ from, to, onFrom, onTo, single }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; single?: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
      {!single && (
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-700">من</span>
          <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="ltr-content !w-auto !py-2.5" />
        </label>
      )}
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-700">{single ? "حتى تاريخ" : "إلى"}</span>
        <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="ltr-content !w-auto !py-2.5" />
      </label>
      {(from || to) && (
        <button
          onClick={() => {
            onFrom("");
            onTo("");
          }}
          className="pb-2.5 text-sm font-medium text-brand-600 hover:underline"
        >
          مسح التواريخ
        </button>
      )}
    </div>
  );
}

export const th = "whitespace-nowrap px-4 py-3 text-right text-xs font-semibold text-ink-500";
export const td = "px-4 py-2.5";

export const SOURCE_LABEL: Record<string, string> = {
  expense: "مصروف",
  funding: "تمويل",
  revenue: "إيراد",
  manual: "قيد يدوي",
};

export const monthHeader = (m: string) => periodLabel(m);
