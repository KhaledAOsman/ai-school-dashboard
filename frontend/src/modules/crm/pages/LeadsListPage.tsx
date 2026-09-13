/**
 * Shared stage labels/tones + the "leads" (العملاء المحتملون) table page -
 * customer service's first-contact working list. A lead here has NOT been
 * booked yet (stage is new / not_answered / unreachable). Call-outcome
 * buttons AND the teacher/slot picker both live directly in the row, so a
 * rep can log a call attempt or book a lecture without leaving the table -
 * this is the Excel-like inline-everything workflow requested.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users, Search, ChevronRight, ChevronLeft, Upload, X, Phone, PhoneMissed, PhoneOff } from "lucide-react";
import { translate } from "@/i18n";
import {
  useLeadsSearch,
  useLeadSources,
  useBulkAssignLeads,
  useLogCallAttempt,
  useReassignLead,
  useUpdateLead,
  useBookSlot,
  useCRMTeachers,
} from "@/modules/crm/hooks/useCRM";
import type { LeadStage, CallOutcome } from "@/modules/crm/services/crmApi";
import { adminApi } from "@/modules/finance/services/adminApi";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select, Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { LeadImportPanel } from "@/modules/crm/pages/LeadImportPanel";
import { CreateLeadForm } from "@/modules/crm/pages/CreateLeadForm";

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: "جديد",
  not_answered: "لم يتم الرد",
  unreachable: "لم يتم الاتصال",
  booked: "تم حجز الموعد",
  confirmed_whatsapp: "تأكيد واتساب",
  confirmed_call: "تأكيد هاتفي",
  zoom_sent: "تم إرسال الزوم",
  attendance_recorded: "تم تسجيل الحضور",
  report_sent: "تم إرسال التقرير",
  follow_up: "متابعة",
  converted: "تم التحويل",
  lost: "مفقود",
};

export const STAGE_TONE: Record<LeadStage, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  new: "neutral",
  not_answered: "warning",
  unreachable: "danger",
  booked: "brand",
  confirmed_whatsapp: "brand",
  confirmed_call: "brand",
  zoom_sent: "brand",
  attendance_recorded: "warning",
  report_sent: "warning",
  follow_up: "warning",
  converted: "success",
  lost: "danger",
};

function InlineCallButtons({ leadId }: { leadId: string }) {
  const logCallAttempt = useLogCallAttempt(leadId);

  async function log(outcome: CallOutcome) {
    await logCallAttempt.mutateAsync({ outcome });
  }

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => log("connected")} disabled={logCallAttempt.isPending} title="تم الاتصال"
        className="rounded-md p-1.5 text-success-600 transition-colors hover:bg-success-50 disabled:opacity-50">
        <Phone size={14} />
      </button>
      <button onClick={() => log("not_answered")} disabled={logCallAttempt.isPending} title="لم يتم الرد"
        className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 disabled:opacity-50">
        <PhoneMissed size={14} />
      </button>
      <button onClick={() => log("unreachable")} disabled={logCallAttempt.isPending} title="لم يتم الاتصال"
        className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 disabled:opacity-50">
        <PhoneOff size={14} />
      </button>
    </div>
  );
}

function InlineBookPicker({ leadId }: { leadId: string }) {
  const { data: teachers } = useCRMTeachers();
  const bookSlot = useBookSlot(leadId);
  const [teacherId, setTeacherId] = useState("");

  const selectedTeacher = teachers?.find((t) => t.id === teacherId);

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={teacherId}
        onChange={(e) => setTeacherId(e.target.value)}
        className="w-28 cursor-pointer rounded-md border-0 bg-ink-50 px-1.5 py-1 text-xs text-ink-700 outline-none focus:ring-1 focus:ring-brand-400"
      >
        <option value="">حجز موعد...</option>
        {(teachers ?? []).map((t) => (
          <option key={t.id} value={t.id} disabled={t.available_slots.length === 0}>
            {t.full_name} ({t.available_slots.length})
          </option>
        ))}
      </select>
      {selectedTeacher && selectedTeacher.available_slots.length > 0 && (
        <select
          onChange={(e) => e.target.value && bookSlot.mutate(e.target.value)}
          disabled={bookSlot.isPending}
          className="w-24 cursor-pointer rounded-md border-0 bg-brand-50 px-1.5 py-1 text-xs text-brand-700 outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">اختر موعد</option>
          {selectedTeacher.available_slots.map((slot) => (
            <option key={slot.id} value={slot.id}>{slot.slot_date} {slot.slot_time.slice(0, 5)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function InlineSourceEdit({ leadId, currentSource }: { leadId: string; currentSource: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentSource ?? "");
  const updateLead = useUpdateLead(leadId);

  async function save() {
    setEditing(false);
    if (value === (currentSource ?? "")) return;
    await updateLead.mutateAsync({ source: value || null });
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setValue(currentSource ?? ""); setEditing(false); }
        }}
        className="w-full rounded-md border border-brand-300 bg-white px-1.5 py-1 text-xs text-ink-800 outline-none ring-1 ring-brand-400"
      />
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="w-full truncate rounded-md px-1.5 py-1 text-start text-xs text-ink-600 transition-colors hover:bg-ink-100" title="اضغط للتعديل">
      {currentSource || <span className="text-ink-300">إضافة مصدر...</span>}
    </button>
  );
}

function InlineAssignSelect({ leadId, currentAssignedTo, users }: { leadId: string; currentAssignedTo: string | null; users: { id: string; full_name: string; email: string }[] }) {
  const reassign = useReassignLead(leadId);
  return (
    <select
      value={currentAssignedTo ?? ""}
      onChange={(e) => e.target.value && reassign.mutate(e.target.value)}
      disabled={reassign.isPending}
      className="w-full cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-1 text-xs text-ink-600 outline-none transition-colors hover:bg-ink-100 focus:bg-white focus:ring-1 focus:ring-brand-400"
    >
      <option value="">بدون إسناد</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
      ))}
    </select>
  );
}

export function LeadsListPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignTarget, setBulkAssignTarget] = useState("");

  const canViewAll = usePermission(PERMISSIONS.CRM_LEAD_VIEW_ALL);
  const canCreate = usePermission(PERMISSIONS.CRM_LEAD_CREATE);

  const { data: sources } = useLeadSources();
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: adminApi.listUsers, enabled: canViewAll });
  const bulkAssign = useBulkAssignLeads();

  const { data, isLoading, isFetching } = useLeadsSearch({
    page,
    page_size: 50,
    group: "leads",
    search: search || undefined,
    stage: stageFilter || undefined,
    source: sourceFilter || undefined,
    assigned_to: canViewAll ? assignedFilter || undefined : undefined,
    mine_only: canViewAll ? mineOnly : undefined,
  });

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    setSelectedIds((prev) => {
      const allSelected = data.items.every((l) => prev.has(l.id));
      if (allSelected) return new Set();
      return new Set(data.items.map((l) => l.id));
    });
  }

  async function handleBulkAssign() {
    if (!bulkAssignTarget || selectedIds.size === 0) return;
    await bulkAssign.mutateAsync({ leadIds: Array.from(selectedIds), assignedTo: bulkAssignTarget });
    setSelectedIds(new Set());
    setBulkAssignTarget("");
  }

  const allOnPageSelected = data ? data.items.length > 0 && data.items.every((l) => selectedIds.has(l.id)) : false;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">العملاء المحتملون</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data ? `${data.total.toLocaleString("ar-SA")} عميل بانتظار الحجز` : "عملاء لم يتم حجز موعد لهم بعد"}
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={() => setShowImportPanel((v) => !v)}>
              <Upload size={16} />
              استيراد من Excel
            </Button>
            <Button variant="primary" size="lg" onClick={() => setShowCreateForm((v) => !v)}>
              <Plus size={17} />
              عميل جديد
            </Button>
          </div>
        )}
      </div>

      {showCreateForm && <CreateLeadForm onDone={() => setShowCreateForm(false)} />}
      {showImportPanel && <LeadImportPanel onDone={() => setShowImportPanel(false)} />}

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={submitSearch} className="min-w-[220px] flex-1">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="بحث بالاسم أو رقم الهاتف..." className="pr-9" />
            </div>
          </form>

          <Select value={stageFilter} onChange={(e) => { setStageFilter(e.target.value); setPage(1); }} className="w-44">
            <option value="">كل الحالات</option>
            <option value="new">جديد</option>
            <option value="not_answered">لم يتم الرد</option>
            <option value="unreachable">لم يتم الاتصال</option>
          </Select>

          <Select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} className="w-44">
            <option value="">كل المصادر</option>
            {(sources ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>

          {canViewAll && (
            <>
              <Select value={assignedFilter} onChange={(e) => { setAssignedFilter(e.target.value); setPage(1); }} className="w-48">
                <option value="">كل الموظفين</option>
                {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </Select>
              <label className="flex items-center gap-2 whitespace-nowrap px-1 text-sm text-ink-600">
                <input type="checkbox" checked={mineOnly} onChange={(e) => { setMineOnly(e.target.checked); setPage(1); }} className="rounded" />
                عرض عملائي أنا فقط
              </label>
            </>
          )}

          {(search || stageFilter || sourceFilter || assignedFilter || mineOnly) && (
            <button
              onClick={() => { setSearchInput(""); setSearch(""); setStageFilter(""); setSourceFilter(""); setAssignedFilter(""); setMineOnly(false); setPage(1); }}
              className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800"
            >
              <X size={13} />
              مسح الفلاتر
            </button>
          )}
        </div>
      </Card>

      {canViewAll && selectedIds.size > 0 && (
        <Card className="mb-4 flex animate-scale-in items-center gap-3 border-brand-100 bg-brand-50 p-3.5">
          <span className="text-sm font-medium text-brand-800">تم تحديد {selectedIds.size} عميل</span>
          <div className="mr-auto flex items-center gap-2">
            <Select value={bulkAssignTarget} onChange={(e) => setBulkAssignTarget(e.target.value)} className="w-56">
              <option value="">إسناد إلى موظف...</option>
              {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
            </Select>
            <Button size="sm" variant="primary" disabled={!bulkAssignTarget} isLoading={bulkAssign.isPending} onClick={handleBulkAssign}>إسناد الكل</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={Users} title="لا يوجد عملاء محتملون بمطابقة هذا البحث" />
        ) : (
          <>
            <div className={`grid grid-cols-12 gap-3 border-b border-ink-100 bg-ink-50/70 px-5 py-2.5 text-xs font-semibold text-ink-500 ${isFetching ? "opacity-60" : ""}`}>
              {canViewAll && <div className="col-span-1 flex items-center"><input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} className="rounded" /></div>}
              <div className={canViewAll ? "col-span-2" : "col-span-3"}>الاسم</div>
              <div className="col-span-1">الهاتف</div>
              <div className="col-span-2">الحالة / اتصال</div>
              <div className="col-span-3">حجز موعد</div>
              <div className="col-span-2">الإحالة</div>
              <div className="col-span-1">المسؤول</div>
            </div>
            <div className="divide-y divide-ink-100">
              {data.items.map((lead) => (
                <div key={lead.id} className="grid grid-cols-12 items-center gap-3 px-5 py-2 text-sm transition-colors hover:bg-ink-50/70">
                  {canViewAll && <div className="col-span-1 flex items-center"><input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} className="rounded" /></div>}
                  <Link to={`/crm/leads/${lead.id}`} className={`${canViewAll ? "col-span-2" : "col-span-3"} truncate font-medium text-ink-900 hover:text-brand-600`}>
                    {lead.full_name}
                  </Link>
                  <div className="ltr-content col-span-1 truncate text-left text-xs text-ink-600">{lead.phone}</div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Badge tone={STAGE_TONE[lead.stage]} dot={false}>{STAGE_LABEL[lead.stage]}</Badge>
                    <InlineCallButtons leadId={lead.id} />
                  </div>
                  <div className="col-span-3">
                    <InlineBookPicker leadId={lead.id} />
                  </div>
                  <div className="col-span-2"><InlineSourceEdit leadId={lead.id} currentSource={lead.source} /></div>
                  <div className="col-span-1">
                    {canViewAll ? (
                      <InlineAssignSelect leadId={lead.id} currentAssignedTo={lead.assigned_to} users={users ?? []} />
                    ) : (
                      <span className="truncate text-xs text-ink-400">{lead.assigned_to_name || "—"}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-ink-100 px-5 py-3">
              <p className="text-xs text-ink-500">
                صفحة {data.page.toLocaleString("ar-SA")} من {data.total_pages.toLocaleString("ar-SA")} — {data.total.toLocaleString("ar-SA")} عميل
              </p>
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
