/**
 * "كل العملاء" - read-only overview of every lead across every stage, for
 * a quick glance without the ability to edit anything (that happens in
 * the dedicated leads/bookings/interested pages).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Users, Search, ChevronRight, ChevronLeft } from "lucide-react";
import { translate } from "@/i18n";
import { useLeadsSearch } from "@/modules/crm/hooks/useCRM";
import { STAGE_LABEL, STAGE_TONE } from "@/modules/crm/pages/LeadsListPage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select, Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";

export function AllLeadsOverviewPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useLeadsSearch({
    page, page_size: 50, search: search || undefined, stage: stageFilter || undefined,
  });

  function submitSearch(e: React.FormEvent) { e.preventDefault(); setSearch(searchInput); setPage(1); }

  return (
    <div className="max-w-none">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">كل العملاء</h1>
        <p className="mt-1 text-sm text-ink-500">{data ? `${data.total.toLocaleString("ar-SA")} عميل بكل الحالات` : "نظرة عامة على جميع العملاء بكل الحالات (للعرض فقط)"}</p>
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={submitSearch} className="min-w-[220px] flex-1">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="بحث بالاسم أو رقم الهاتف..." className="pr-9" />
            </div>
          </form>
          <Select value={stageFilter} onChange={(e) => { setStageFilter(e.target.value); setPage(1); }} className="w-52">
            <option value="">كل الحالات</option>
            {Object.entries(STAGE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={Users} title="لا يوجد عملاء بمطابقة هذا البحث" />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-4 border-b border-ink-100 bg-ink-50/70 px-6 py-3 text-center text-[13px] font-semibold text-ink-500">
              <div className="col-span-3 text-start">الاسم</div>
              <div className="col-span-2">الهاتف</div>
              <div className="col-span-2">الحالة</div>
              <div className="col-span-2">المدرّس</div>
              <div className="col-span-2">المسؤول</div>
              <div className="col-span-1">تاريخ الإضافة</div>
            </div>
            <div className="divide-y divide-ink-100">
              {data.items.map((lead) => (
                <Link to={`/crm/leads/${lead.id}`} key={lead.id} className="grid grid-cols-12 items-center gap-4 px-6 py-3 text-center text-sm transition-colors hover:bg-ink-50/70">
                  <div className="col-span-3 truncate text-start font-medium text-ink-900">{lead.full_name}</div>
                  <div className="ltr-content col-span-2 truncate text-ink-600">{lead.phone}</div>
                  <div className="col-span-2 flex justify-center"><Badge tone={STAGE_TONE[lead.stage]} dot={false}>{STAGE_LABEL[lead.stage]}</Badge></div>
                  <div className="col-span-2 truncate text-ink-600">{lead.teacher_name || "—"}</div>
                  <div className="col-span-2 truncate text-xs text-ink-400">{lead.assigned_to_name || "—"}</div>
                  <div className="ltr-content col-span-1 text-xs text-ink-400">{lead.created_at.slice(0, 10)}</div>
                </Link>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-ink-100 px-6 py-3.5">
              <p className="text-xs text-ink-500">صفحة {data.page.toLocaleString("ar-SA")} من {data.total_pages.toLocaleString("ar-SA")} — {data.total.toLocaleString("ar-SA")} عميل</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronRight size={14} />السابق</Button>
                <Button size="sm" variant="outline" disabled={page >= data.total_pages} onClick={() => setPage((p) => p + 1)}>التالي<ChevronLeft size={14} /></Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
