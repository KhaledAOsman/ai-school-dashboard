/**
 * "عملاء مهتمون" (interested clients) - leads whose report has been sent
 * (stage in INTERESTED_GROUP_STAGES: report_sent, follow_up, converted,
 * lost). This is where the real sales-conversion work happens: repeated
 * follow-up attempts, then either convert or mark lost.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, MessageCircle, UserCheck } from "lucide-react";
import { translate } from "@/i18n";
import { useLeadsSearch, useLogFollowUp, useConvertLead, useLoseLead } from "@/modules/crm/hooks/useCRM";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { STAGE_LABEL, STAGE_TONE } from "@/modules/crm/pages/LeadsListPage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";

function InterestedRow({ leadId, fullName, phone, stage, teacherName, isConverted, isLost, canManage }: {
  leadId: string; fullName: string; phone: string; stage: string; teacherName: string | null;
  isConverted: boolean; isLost: boolean; canManage: boolean;
}) {
  const logFollowUp = useLogFollowUp(leadId);
  const convertLead = useConvertLead(leadId);
  const loseLead = useLoseLead(leadId);
  const [note, setNote] = useState("");
  const [showLoseInput, setShowLoseInput] = useState(false);
  const [lossReason, setLossReason] = useState("");

  const isTerminal = isConverted || isLost;

  return (
    <div className="grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-ink-50/70">
      <Link to={`/crm/leads/${leadId}`} className="col-span-2 truncate font-medium text-ink-900 hover:text-brand-600">{fullName}</Link>
      <div className="ltr-content col-span-2 truncate text-left text-xs text-ink-500">{phone}</div>
      <div className="col-span-2 truncate text-xs text-ink-600">{teacherName || "—"}</div>
      <div className="col-span-2"><Badge tone={STAGE_TONE[stage as keyof typeof STAGE_TONE]} dot={false}>{STAGE_LABEL[stage as keyof typeof STAGE_LABEL]}</Badge></div>
      <div className="col-span-4">
        {isTerminal ? (
          <span className="text-xs text-ink-400">{isConverted ? "تم التحويل" : "مفقود"}</span>
        ) : canManage ? (
          showLoseInput ? (
            <div className="flex items-center gap-1.5">
              <Input value={lossReason} onChange={(e) => setLossReason(e.target.value)} placeholder="سبب الفقدان" className="h-8 text-xs" />
              <Button size="sm" variant="danger" disabled={!lossReason.trim()} isLoading={loseLead.isPending} onClick={() => loseLead.mutate(lossReason)}>تأكيد</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowLoseInput(false)}>×</Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة متابعة..." className="h-8 w-28 text-xs" />
              <button
                onClick={async () => { await logFollowUp.mutateAsync(note || undefined); setNote(""); }}
                disabled={logFollowUp.isPending}
                title="تسجيل متابعة"
                className="rounded-md p-1.5 text-brand-600 transition-colors hover:bg-brand-50"
              >
                <MessageCircle size={15} />
              </button>
              <button onClick={() => convertLead.mutate(undefined)} disabled={convertLead.isPending} title="تحويل إلى عميل فعلي" className="rounded-md p-1.5 text-success-600 transition-colors hover:bg-success-50">
                <UserCheck size={15} />
              </button>
              <button onClick={() => setShowLoseInput(true)} title="إغلاق كمفقود" className="rounded-md p-1.5 text-danger-500 transition-colors hover:bg-danger-50">
                <XCircle size={15} />
              </button>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

export function InterestedPage() {
  const canManage = usePermission(PERMISSIONS.CRM_LEAD_MANAGE);
  const canViewAll = usePermission(PERMISSIONS.CRM_LEAD_VIEW_ALL);
  const [mineOnly, setMineOnly] = useState(false);
  const [hideTerminal, setHideTerminal] = useState(true);

  const { data, isLoading } = useLeadsSearch({
    page: 1,
    page_size: 200,
    group: "interested",
    mine_only: canViewAll ? mineOnly : undefined,
  });

  const items = (data?.items ?? []).filter((l) => !hideTerminal || (!l.is_converted && !l.is_lost));

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">عملاء مهتمون</h1>
          <p className="mt-1 text-sm text-ink-500">متابعة العملاء بعد حضور المحاضرة لتحويلهم إلى عملاء فعليين</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" checked={hideTerminal} onChange={(e) => setHideTerminal(e.target.checked)} className="rounded" />
            إخفاء المحوّلين والمفقودين
          </label>
          {canViewAll && (
            <label className="flex items-center gap-2 text-sm text-ink-600">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="rounded" />
              عملائي فقط
            </label>
          )}
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : items.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="لا يوجد عملاء مهتمون حاليًا" />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-3 border-b border-ink-100 bg-ink-50/70 px-5 py-2.5 text-xs font-semibold text-ink-500">
              <div className="col-span-2">الاسم</div>
              <div className="col-span-2">الهاتف</div>
              <div className="col-span-2">المدرّس</div>
              <div className="col-span-2">الحالة</div>
              <div className="col-span-4">إجراء</div>
            </div>
            <div className="divide-y divide-ink-100">
              {items.map((lead) => (
                <InterestedRow
                  key={lead.id}
                  leadId={lead.id}
                  fullName={lead.full_name}
                  phone={lead.phone}
                  stage={lead.stage}
                  teacherName={lead.teacher_name}
                  isConverted={lead.is_converted}
                  isLost={lead.is_lost}
                  canManage={canManage}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
