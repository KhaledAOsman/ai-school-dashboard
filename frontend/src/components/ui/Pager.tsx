import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Paged result envelope shared by every list endpoint that pages server-side. */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * Compact pager (RTL): "عرض 26–50 من 137" + previous / next.
 * Renders nothing while everything fits on one page.
 */
export function Pager({ page, pageSize, total, onChange, className = "" }: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  // the last row of the last page was deleted / filters shrank the set: step back
  useEffect(() => {
    if (page > pages) onChange(pages);
  }, [page, pages, onChange]);
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = "inline-flex h-8 items-center gap-1 rounded-full border border-[#e1e7ef] bg-white px-3 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-3 sm:px-6 ${className}`}>
      <p className="text-[12.5px] text-ink-500">
        عرض <bdi dir="ltr" className="font-semibold text-ink-700">{from}–{to}</bdi> من <span className="font-semibold text-ink-700">{total}</span> · صفحة {page} من {pages}
      </p>
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronRight size={14} />السابق</button>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onChange(page + 1)}>التالي<ChevronLeft size={14} /></button>
      </div>
    </div>
  );
}
