import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import { translate } from "@/i18n";
import { useLeads, useCreateLead } from "@/modules/crm/hooks/useCRM";
import type { LeadStage } from "@/modules/crm/services/crmApi";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";

const STAGE_LABEL: Record<LeadStage, string> = {
  contacted: "تم التواصل",
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

const STAGE_TONE: Record<LeadStage, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  contacted: "neutral",
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

function LeadRow({
  id,
  fullName,
  phone,
  stage,
  teacherName,
  lectureDate,
  assignedToName,
}: {
  id: string;
  fullName: string;
  phone: string;
  stage: LeadStage;
  teacherName: string | null;
  lectureDate: string | null;
  assignedToName: string | null;
}) {
  return (
    <Link to={`/crm/leads/${id}`} className="block transition-colors hover:bg-ink-50/70">
      <div className="grid grid-cols-12 items-center gap-3 px-5 py-3.5 text-sm">
        <div className="col-span-3 font-medium text-ink-900">{fullName}</div>
        <div className="ltr-content col-span-2 text-left text-ink-600">{phone}</div>
        <div className="col-span-2">
          <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
        </div>
        <div className="col-span-2 text-ink-600">{teacherName || "—"}</div>
        <div className="ltr-content col-span-2 text-left text-ink-500">{lectureDate || "—"}</div>
        <div className="col-span-1 truncate text-xs text-ink-400">{assignedToName || "—"}</div>
      </div>
    </Link>
  );
}

function CreateLeadForm({ onDone }: { onDone: () => void }) {
  const createLead = useCreateLead();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await createLead.mutateAsync({ full_name: fullName, phone, source: source || null, notes: notes || null });
    onDone();
  }

  return (
    <Card className="mb-5 animate-scale-in">
      <CardHeader>
        <CardTitle>عميل محتمل جديد</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="اسم العميل">
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <FormField label="رقم الهاتف">
            <Input required value={phone} onChange={(e) => setPhone(e.target.value)} className="ltr-content text-left" />
          </FormField>
        </div>
        <FormField label="مصدر التواصل (اختياري)">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="مثال: إعلان فيسبوك، إحالة" />
        </FormField>
        <FormField label="ملاحظات (اختياري)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </FormField>
        <div className="flex gap-3">
          <Button type="submit" variant="primary" isLoading={createLead.isPending}>
            {translate("ar", "common_save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            {translate("ar", "common_cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function LeadsListPage() {
  const [stageFilter, setStageFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const canViewAll = usePermission(PERMISSIONS.CRM_LEAD_VIEW_ALL);
  const canManage = usePermission(PERMISSIONS.CRM_LEAD_MANAGE);

  const { data: leads, isLoading } = useLeads({
    stage: stageFilter || undefined,
    mine_only: canViewAll ? mineOnly : undefined,
  });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">العملاء المحتملون</h1>
          <p className="mt-1 text-sm text-ink-500">متابعة رحلة العميل من التواصل الأول حتى التحويل</p>
        </div>
        {canManage && !showForm && (
          <Button variant="primary" size="lg" onClick={() => setShowForm(true)}>
            <Plus size={17} />
            عميل جديد
          </Button>
        )}
      </div>

      {showForm && <CreateLeadForm onDone={() => setShowForm(false)} />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="w-56">
          <option value="">كل المراحل</option>
          {Object.entries(STAGE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {canViewAll && (
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="rounded" />
            عملائي فقط
          </label>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : (leads ?? []).length === 0 ? (
          <EmptyState icon={Users} title="لا يوجد عملاء محتملون بعد" />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-3 border-b border-ink-100 bg-ink-50/70 px-5 py-2.5 text-xs font-semibold text-ink-500">
              <div className="col-span-3">الاسم</div>
              <div className="col-span-2">الهاتف</div>
              <div className="col-span-2">المرحلة</div>
              <div className="col-span-2">المدرّس</div>
              <div className="col-span-2">موعد المحاضرة</div>
              <div className="col-span-1">المسؤول</div>
            </div>
            <div className="divide-y divide-ink-100">
              {(leads ?? []).map((lead) => (
                <LeadRow
                  key={lead.id}
                  id={lead.id}
                  fullName={lead.full_name}
                  phone={lead.phone}
                  stage={lead.stage}
                  teacherName={lead.teacher_name}
                  lectureDate={lead.lecture_date}
                  assignedToName={lead.assigned_to_name}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export { STAGE_LABEL, STAGE_TONE };
