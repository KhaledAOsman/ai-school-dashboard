import { useState } from "react";
import { FileDown, FolderTree } from "lucide-react";
import { translate } from "@/i18n";
import { useCategoryBreakdown } from "@/modules/finance/hooks/useFinance";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

const BAR_COLORS = ["#6d3af2", "#9f70ff", "#bea3ff", "#d9ccff", "#ff8a3d", "#ffcfa1", "#5a26d6", "#e7e0ff"];

function formatSAR(value: number): string {
  return `${Number(value).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

export function ReportsPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { data: breakdown } = useCategoryBreakdown(dateFrom || undefined, dateTo || undefined);

  const rows = (breakdown ?? []) as { category_id: string; category_name: string; total: number }[];
  const sorted = rows.slice().sort((a, b) => Number(b.total) - Number(a.total));
  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total), 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">{translate("ar", "nav_reports")}</h1>
          <p className="mt-1 text-sm text-ink-500">تحليل تفصيلي لتوزيع المصروفات حسب التصنيف</p>
        </div>
        <Button variant="outline" size="sm">
          <FileDown size={15} />
          تصدير
        </Button>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="ltr-content w-44" />
        <span className="text-sm text-ink-400">إلى</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="ltr-content w-44" />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{translate("ar", "dashboard_category_breakdown")}</CardTitle>
            <CardSubtitle>مرتبة تنازليًا حسب الإجمالي</CardSubtitle>
          </div>
        </CardHeader>

        {sorted.length === 0 ? (
          <EmptyState icon={FolderTree} title="لا توجد بيانات لهذه الفترة" />
        ) : (
          <div className="space-y-3">
            {sorted.map((row, i) => {
              const pct = grandTotal > 0 ? (Number(row.total) / grandTotal) * 100 : 0;
              return (
                <div key={row.category_id} className="flex items-center gap-3">
                  <span className="ltr-content w-6 shrink-0 text-xs font-semibold text-ink-400">{i + 1}</span>
                  <span className="w-32 shrink-0 truncate text-[13.5px] font-medium text-ink-800">{row.category_name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out-expo"
                      style={{ width: `${pct}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
                    />
                  </div>
                  <span className="ltr-content w-12 shrink-0 text-xs text-ink-500">{pct.toFixed(1)}%</span>
                  <span className="ltr-content w-28 shrink-0 text-left text-sm font-semibold text-ink-900">{formatSAR(row.total)}</span>
                </div>
              );
            })}
            <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4">
              <span className="text-sm font-medium text-ink-600">الإجمالي الكلي</span>
              <span className="ltr-content text-base font-bold text-ink-900">{formatSAR(grandTotal)}</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
