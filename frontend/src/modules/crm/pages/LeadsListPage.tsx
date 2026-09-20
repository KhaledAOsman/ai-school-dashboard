/**
 * Shared stage labels/tones + the "leads" (العملاء المحتملون) table page.
 * Admins/managers with CRM_LEAD_VIEW_ALL always see every lead - there is
 * no "mine only" toggle, since that permission means exactly "see
 * everything" by definition.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users, Search, ChevronRight, ChevronLeft, Upload, X, Instagram, Music2, Ghost, Sparkles } from "lucide-react";
import { translate } from "@/i18n";
import {
  useLeadsSearch,
  useLeadSources,
  useBulkAssignLeads,
  useLogCallAttempt,
  useReassignLead,
  useUpdateLead,
  useBookSlot,
  useNotInterestedLead,
} from "@/modules/crm/hooks/useCRM";
import type { LeadStage, CallOutcome, LeadSource } from "@/modules/crm/services/crmApi";
import { adminApi } from "@/modules/finance/services/adminApi";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { LeadImportPanel } from "@/modules/crm/pages/LeadImportPanel";
import { CreateLeadForm } from "@/modules/crm/pages/CreateLeadForm";
import { TeacherScheduleModal } from "@/modules/crm/pages/TeacherScheduleModal";

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: "جديد",
  contacted: "تم الاتصال",
  not_answered: "لم يتم الرد",
  booked: "تم حجز الموعد",
  confirmed_whatsapp: "تأكيد واتساب",
  confirmed_call: "تأكيد هاتفي",
  zoom_sent: "تم إرسال الزوم",
  attendance_recorded: "تم تسجيل الحضور",
  report_sent: "تم إرسال التقرير",
  follow_up: "متابعة",
  converted: "تم التحويل",
  lost: "مفقود",
  not_interested: "غير مهتم",
};

export const STAGE_TONE: Record<LeadStage, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  new: "neutral",
  contacted: "brand",
  not_answered: "warning",
  booked: "brand",
  confirmed_whatsapp: "brand",
  confirmed_call: "brand",
  zoom_sent: "brand",
  attendance_recorded: "warning",
  report_sent: "warning",
  follow_up: "warning",
  converted: "success",
  lost: "danger",
  not_interested: "danger",
};

export const SOURCE_ICON: Record<LeadSource, { Icon: typeof Instagram; label: string; className: string }> = {
  instagram: { Icon: Instagram, label: "انستجرام", className: "text-pink-600 bg-pink-50" },
  tiktok: { Icon: Music2, label: "تيك توك", className: "text-ink-900 bg-ink-100" },
  snapchat: { Icon: Ghost, label: "سناب شات", className: "text-yellow-600 bg-yellow-50" },
  organic: { Icon: Sparkles, label: "عضوي", className: "text-brand-600 bg-brand-50" },
};

function userLabel(u: { full_name: string; email: string }): string {
  return u.full_name ? `${u.full_name} — ${u.email}` : u.email;
}

const STATUS_COLOR: Record<string, string> = {
  new: "bg-ink-50 border-ink-200 text-ink-700",
  contacted: "bg-brand-50 border-brand-300 text-brand-700",
  not_answered: "bg-warning-50 border-warning-300 text-warning-700",
};

function StatusDropdown({ leadId, currentStage }: { leadId: string; currentStage: LeadStage }) {
  const logCallAttempt = useLogCallAttempt(leadId);
  const colorClass = STATUS_COLOR[currentStage] ?? STATUS_COLOR.new;
  return (
    <select
      value={currentStage === "new" ? "new" : currentStage}
      onChange={(e) => {
        const value = e.target.value as CallOutcome;
        if (value === "contacted" || value === "not_answered") logCallAttempt.mutate({ outcome: value });
      }}
      disabled={logCallAttempt.isPending}
      className={`w-full cursor-pointer whitespace-nowrap rounded-lg border-2 px-2 py-2 text-center text-[12.5px] font-semibold outline-none transition-colors ${colorClass}`}
    >
      <option value="new" disabled={currentStage !== "new"}>جديد</option>
      <option value="contacted">تم الاتصال</option>
      <option value="not_answered">لم يتم الرد</option>
    </select>
  );
}

function BookingStatusDropdown({ leadId }: { leadId: string }) {
  const notInterested = useNotInterestedLead(leadId);
  const bookSlot = useBookSlot(leadId);
  const [showSchedule, setShowSchedule] = useState(false);

  return (
    <>
      <select
        value=""
        onChange={(e) => {
          const value = e.target.value;
          if (value === "not_interested") notInterested.mutate(undefined);
          else if (value === "booked") setShowSchedule(true);
        }}
        disabled={notInterested.isPending}
        className="w-full cursor-pointer whitespace-nowrap rounded-lg border-2 px-2 py-2 text-[12.5px] font-semibold outline-none transition-colors bg-ink-50 border-ink-200 text-ink-700 hover:border-brand-300 focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
      >
        <option value="">تحديد الحجز...</option>
        <option value="not_interested">غير مهتم</option>
        <option value="booked">تم الحجز</option>
      </select>
      {showSchedule && (
        <TeacherScheduleModal onClose={() => setShowSchedule(false)} isBooking={bookSlot.isPending} onConfirm={(slotId) => bookSlot.mutateAsync(slotId)} />
      )}
    </>
  );
}

function SourceIconPicker({ leadId, currentSource }: { leadId: string; currentSource: string | null }) {
  const updateLead = useUpdateLead(leadId);
  const [open, setOpen] = useState(false);
  const current = currentSource as LeadSource | null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${current ? SOURCE_ICON[current].className : "bg-ink-100 text-ink-300"}`}
        title={current ? SOURCE_ICON[current].label : "تحديد المصدر"}
      >
        {current ? (() => { const { Icon } = SOURCE_ICON[current]; return <Icon size={16} />; })() : <Plus size={14} />}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 flex gap-1 rounded-lg bg-white p-1.5 shadow-lg ring-1 ring-ink-200">
          {(Object.keys(SOURCE_ICON) as LeadSource[]).map((key) => {
            const { Icon, label, className } = SOURCE_ICON[key];
            return (
              <button key={key} onClick={async () => { await updateLead.mutateAsync({ source: key }); setOpen(false); }} className={`flex h-9 w-9 items-center justify-center rounded-lg ${className} transition-transform hover:scale-110`} title={label}>
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InlineNoteEdit({ leadId, currentNote }: { leadId: string; currentNote: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentNote ?? "");
  const updateLead = useUpdateLead(leadId);

  async function save() {
    setEditing(false);
    if (value === (currentNote ?? "")) return;
    await updateLead.mutateAsync({ notes: value || null });
  }

  if (editing) {
    return (
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setValue(currentNote ?? ""); setEditing(false); } }}
        className="w-full rounded-lg border border-brand-300 bg-white px-2.5 py-2 text-[13px] text-ink-800 outline-none ring-1 ring-brand-400" />
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="w-full whitespace-normal break-words rounded-lg px-2.5 py-2 text-start text-[13px] leading-snug text-ink-600 transition-colors hover:bg-ink-100" title="اضغط للتعديل">
      {currentNote || <span className="text-ink-300">إضافة ملاحظة...</span>}
    </button>
  );
}

function InlineAssignSelect({ leadId, currentAssignedTo, users }: { leadId: string; currentAssignedTo: string | null; users: { id: string; full_name: string; email: string }[] }) {
  const reassign = useReassignLead(leadId);
  return (
    <select value={currentAssignedTo ?? ""} onChange={(e) => e.target.value && reassign.mutate(e.target.value)} disabled={reassign.isPending}
      className="w-full cursor-pointer truncate rounded-lg border border-ink-200 bg-white px-1.5 py-2 text-[13px] text-ink-700 outline-none transition-colors hover:border-brand-300 focus:border-brand-400 focus:ring-1 focus:ring-brand-400">
      <option value="">بدون إسناد</option>
      {users.map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
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
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignTarget, setBulkAssignTarget] = useState("");

  const canViewAll = usePermission(PERMISSIONS.CRM_LEAD_VIEW_ALL);
  const canCreate = usePermission(PERMISSIONS.CRM_LEAD_CREATE);

  const { data: sources } = useLeadSources();
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: adminApi.listUsers, enabled: canViewAll });
  const bulkAssign = useBulkAssignLeads();

  const { data, isLoading, isFetching } = useLeadsSearch({
    page, page_size: 50, group: "leads",
    search: search || undefined, stage: stageFilter || undefined, source: sourceFilter || undefined,
    assigned_to: canViewAll ? assignedFilter || undefined : undefined,
  });

  function submitSearch(e: React.FormEvent) { e.preventDefault(); setSearch(searchInput); setPage(1); }
  function toggleSelect(id: string) { setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function toggleSelectAll() {
    if (!data) return;
    setSelectedIds((prev) => (data.items.every((l) => prev.has(l.id)) ? new Set() : new Set(data.items.map((l) => l.id))));
  }
  async function handleBulkAssign() {
    if (!bulkAssignTarget || selectedIds.size === 0) return;
    await bulkAssign.mutateAsync({ leadIds: Array.from(selectedIds), assignedTo: bulkAssignTarget });
    setSelectedIds(new Set()); setBulkAssignTarget("");
  }

  const allOnPageSelected = data ? data.items.length > 0 && data.items.every((l) => selectedIds.has(l.id)) : false;

  return (
    <div className="max-w-none">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">العملاء المحتملون</h1>
          <p className="mt-1 text-sm text-ink-500">{data ? `${data.total.toLocaleString("ar-SA")} عميل بانتظار الحجز` : "عملاء لم يتم حجز موعد لهم بعد"}</p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={() => setShowImportPanel((v) => !v)}><Upload size={16} />استيراد من Excel</Button>
            <Button variant="primary" size="lg" onClick={() => setShowCreateForm((v) => !v)}><Plus size={17} />عميل جديد</Button>
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
            <option value="contacted">تم الاتصال</option>
            <option value="not_answered">لم يتم الرد</option>
          </Select>
          <Select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} className="w-44">
            <option value="">كل المصادر</option>
            {(sources ?? []).map((s) => <option key={s} value={s}>{SOURCE_ICON[s as LeadSource]?.label ?? s}</option>)}
          </Select>
          {canViewAll && (
            <Select value={assignedFilter} onChange={(e) => { setAssignedFilter(e.target.value); setPage(1); }} className="w-52">
              <option value="">كل الموظفين</option>
              {(users ?? []).map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
            </Select>
          )}
          {(search || stageFilter || sourceFilter || assignedFilter) && (
            <button onClick={() => { setSearchInput(""); setSearch(""); setStageFilter(""); setSourceFilter(""); setAssignedFilter(""); setPage(1); }} className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
              <X size={13} />مسح الفلاتر
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
              {(users ?? []).map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
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
            <div className={`grid grid-cols-12 gap-2 border-b border-ink-100 bg-ink-50/70 px-4 py-3 text-center text-[13px] font-semibold text-ink-500 ${isFetching ? "opacity-60" : ""}`}>
              {canViewAll && <div className="col-span-1 flex items-center justify-center"><input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} className="rounded" /></div>}
              <div className={`${canViewAll ? "col-span-2" : "col-span-2"} text-start`}>الاسم</div>
              <div className="col-span-2">الهاتف</div>
              <div className="col-span-2">الحالة</div>
              <div className="col-span-2">حالة الحجز</div>
              <div className="col-span-2">ملاحظات</div>
              <div className="col-span-1">المسؤول</div>
            </div>
            <div className="divide-y divide-ink-100">
              {data.items.map((lead) => (
                <div key={lead.id} className="grid grid-cols-12 items-center gap-2 px-4 py-2.5 text-center text-sm transition-colors hover:bg-ink-50/70">
                  {canViewAll && <div className="col-span-1 flex items-center justify-center"><input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} className="rounded" /></div>}
                  <div className={`${canViewAll ? "col-span-2" : "col-span-2"} flex items-center gap-1.5 overflow-hidden text-start`}>
                    <div className="shrink-0"><SourceIconPicker leadId={lead.id} currentSource={lead.source} /></div>
                    <Link to={`/crm/leads/${lead.id}`} className="truncate text-[14px] font-medium text-ink-900 hover:text-brand-600">{lead.full_name}</Link>
                  </div>
                  <div className="ltr-content col-span-2 text-center text-[13px] leading-tight text-ink-600 break-all" title={lead.phone}>{lead.phone}</div>
                  <div className="col-span-2"><StatusDropdown leadId={lead.id} currentStage={lead.stage} /></div>
                  <div className="col-span-2"><BookingStatusDropdown leadId={lead.id} /></div>
                  <div className="col-span-2"><InlineNoteEdit leadId={lead.id} currentNote={lead.notes} /></div>
                  <div className="col-span-1">
                    {canViewAll ? <InlineAssignSelect leadId={lead.id} currentAssignedTo={lead.assigned_to} users={users ?? []} /> : <span className="block truncate text-xs text-ink-400" title={lead.assigned_to_name || ""}>{lead.assigned_to_name || "—"}</span>}
                  </div>
                </div>
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
