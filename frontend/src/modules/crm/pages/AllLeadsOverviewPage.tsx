/**
 * "كل العملاء" - read-only overview of every customer across every stage.
 *
 * Filtering is by the customer's CURRENT status (backend leads/status.py):
 * one tab per real situation, each with its live count for the current
 * search + source, and the counts always add up to «الكل». Search matches
 * the phone in any format (05..., 5..., 966..., +966 ...) and the name with
 * Arabic letter variants folded (احمد = أحمد, ه = ة).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Search, ChevronRight, ChevronLeft, X } from "lucide-react";
import { translate } from "@/i18n";
import { useLeadsSearch, useStatusCounts } from "@/modules/crm/hooks/useCRM";
import { SOURCE_ICON, STATUS_LABEL, STATUS_TONE } from "@/modules/crm/pages/LeadsListPage";
import type { LeadSource, LeadStatus } from "@/modules/crm/services/crmApi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select, Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";

/** Tabs in pipeline order: المحتملون -> الحجوزات -> المهتمون -> النتيجة. */
const STATUS_TABS: LeadStatus[] = [
  "new", "contacted", "not_answered",
  "awaiting_attendance", "not_attended",
  "attended", "report_sent", "follow_up",
  "converted", "lost", "not_interested",
];

const fmt = (n: number) => n.toLocaleString("ar-SA-u-nu-latn");

export function AllLeadsOverviewPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [source, setSource] = useState<LeadSource | "">("");
  const [page, setPage] = useState(1);

  // search as you type (short pause so every keystroke isn't a request)
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = { search: search || undefined, source: source || undefined };
  const { data: counts } = useStatusCounts(filters);
  const { data, isLoading, isFetching } = useLeadsSearch({ page, page_size: 50, ...filters, status: status || undefined });

  const hasFilters = !!(searchInput || status || source);

  return (
    <div className="max-w-none">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">كل العملاء</h1>
        <p className="mt-1 text-sm text-ink-500">
          {counts ? `${fmt(counts[""] ?? 0)} عميل${search || source ? " مطابق للبحث" : ""} — كل رقم جوال مرة واحدة` : "كل العملاء بدون تكرار حسب رقم الجوال"}
        </p>
      </div>

      {/* status tabs: counts follow the search + source, and add up to «الكل» */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-ink-200">
        {([""] as (LeadStatus | "")[]).concat(STATUS_TABS).map((key) => (
          <button
            key={key || "all"}
            onClick={() => { setStatus(key); setPage(1); }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[14px] font-semibold transition-colors ${
              status === key ? "border-brand-500 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {key ? STATUS_LABEL[key] : "الكل"}
            <span className="ms-1.5 text-[12px] font-medium text-ink-400">{counts ? fmt(counts[key] ?? 0) : ""}</span>
          </button>
        ))}
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="بحث بالاسم أو رقم الجوال (بأي صيغة)..." className="pr-9" />
          </div>
          <Select value={source} onChange={(e) => { setSource(e.target.value as LeadSource | ""); setPage(1); }} className="w-48">
            <option value="">كل المصادر</option>
            {(Object.keys(SOURCE_ICON) as LeadSource[]).map((s) => <option key={s} value={s}>{SOURCE_ICON[s].label}</option>)}
          </Select>
          {hasFilters && (
            <button onClick={() => { setSearchInput(""); setSearch(""); setStatus(""); setSource(""); setPage(1); }} className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
              <X size={13} />مسح الفلاتر
            </button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={Users} title="لا يوجد عملاء بمطابقة هذا البحث" />
        ) : (
          <>
            <div className={`grid grid-cols-12 gap-4 border-b border-ink-100 bg-ink-50/70 px-6 py-3 text-center text-[14px] font-semibold text-ink-500 ${isFetching ? "opacity-60" : ""}`}>
              <div className="col-span-3 text-start">الاسم</div>
              <div className="col-span-2">الجوال</div>
              <div className="col-span-1">المصدر</div>
              <div className="col-span-2">الحالة</div>
              <div className="col-span-2">المدرّس</div>
              <div className="col-span-1">المسؤول</div>
              <div className="col-span-1">تاريخ الإضافة</div>
            </div>
            <div className="divide-y divide-ink-100">
              {data.items.map((lead) => {
                const src = lead.source as LeadSource | null;
                return (
                  <Link to={`/crm/leads/${lead.id}`} key={lead.id} className="grid grid-cols-12 items-center gap-4 px-6 py-3 text-center text-sm transition-colors hover:bg-ink-50/70">
                    <div className="col-span-3 truncate text-start font-medium text-ink-900">{lead.full_name}</div>
                    <div className="ltr-content col-span-2 truncate text-ink-600">{lead.phone}</div>
                    <div className="col-span-1 flex justify-center">
                      {src && SOURCE_ICON[src] ? (
                        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${SOURCE_ICON[src].className}`} title={SOURCE_ICON[src].label}>
                          {(() => { const { Icon } = SOURCE_ICON[src]; return <Icon size={13} />; })()}
                        </span>
                      ) : <span className="text-xs text-ink-300">—</span>}
                    </div>
                    <div className="col-span-2 flex justify-center"><Badge tone={STATUS_TONE[lead.status] ?? "neutral"} dot={false}>{STATUS_LABEL[lead.status] ?? lead.stage}</Badge></div>
                    <div className="col-span-2 truncate text-ink-600">{lead.teacher_name || "—"}</div>
                    <div className="col-span-1 truncate text-xs text-ink-400" title={lead.assigned_to_name || ""}>{lead.assigned_to_name || "—"}</div>
                    <div className="ltr-content col-span-1 text-xs text-ink-400">{lead.created_at.slice(0, 10)}</div>
                  </Link>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-ink-100 px-6 py-3.5">
              <p className="text-xs text-ink-500">صفحة {fmt(data.page)} من {fmt(data.total_pages)} — {fmt(data.total)} عميل</p>
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
