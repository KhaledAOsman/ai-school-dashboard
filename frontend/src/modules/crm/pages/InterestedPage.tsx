/**
 * "عملاء مهتمون" (interested clients) - leads whose report has been sent
 * (stage in INTERESTED_GROUP_STAGES: report_sent, follow_up, converted,
 * lost). This is where the real sales-conversion work happens: repeated
 * follow-up attempts, tracked with a visible counter, then either convert
 * or mark lost. Closing a lead after 3+ follow-up attempts requires an
 * extra confirmation step, since that's a real decision to give up on a
 * lead that's had real effort put into it.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { XCircle, MessageCircle, UserCheck, AlertTriangle } from "lucide-react";
import { translate } from "@/i18n";
import { useLeadsSearch, useLogFollowUp, useConvertLead, useLoseLead } from "@/modules/crm/hooks/useCRM";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { STAGE_LABEL, STAGE_TONE, SOURCE_ICON } from "@/modules/crm/pages/LeadsListPage";
import type { LeadSource } from "@/modules/crm/services/crmApi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Field";

/** Requires typing an exact confirmation phrase before closing a lead
 * that's had 3+ follow-up attempts - a plain click is too easy to
 * mis-tap for a decision this costly (real effort already spent on this
 * lead). */
function LoseConfirmDialog({ requireStrongConfirm, onConfirm, onCancel, isLoading }: {
  requireStrongConfirm: boolean; onConfirm: (reason: string) => void; onCancel: () => void; isLoading: boolean;
}) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = reason.trim().length > 0 && (!requireStrongConfirm || confirmText.trim() === "تأكيد");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2.5">
          <AlertTriangle size={20} className="text-danger-600" />
          <h3 className="text-lg font-bold text-ink-900">تأكيد إغلاق العميل</h3>
        </div>
        {requireStrongConfirm && (
          <p className="mb-3 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-800">
            تم بذل 3 محاولات متابعة أو أكثر مع هذا العميل. تأكد من رغبتك في إغلاقه نهائيًا كمفقود.
          </p>
        )}
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="سبب إغلاق العميل (إلزامي)" className="mb-3" />
        {requireStrongConfirm && (
          <div className="mb-3">
            <label className="mb-1 block text-xs text-ink-500">اكتب كلمة "تأكيد" للمتابعة</label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-danger-400 focus:ring-1 focus:ring-danger-400"
              placeholder="تأكيد"
            />
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="danger" disabled={!canConfirm} isLoading={isLoading} onClick={() => onConfirm(reason)}>تأكيد الإغلاق</Button>
          <Button variant="ghost" onClick={onCancel}>إلغاء</Button>
        </div>
      </div>
    </div>
  );
}

function InterestedRow({ lead, canManage }: {
  lead: {
    id: string; full_name: string; phone: string; stage: string; teacher_name: string | null;
    source: string | null; assigned_to_name: string | null; follow_up_count: number;
    is_converted: boolean; is_lost: boolean; updated_at: string;
  };
  canManage: boolean;
}) {
  const logFollowUp = useLogFollowUp(lead.id);
  const convertLead = useConvertLead(lead.id);
  const loseLead = useLoseLead(lead.id);
  const [note, setNote] = useState("");
  const [showLoseDialog, setShowLoseDialog] = useState(false);

  const isTerminal = lead.is_converted || lead.is_lost;
  const source = lead.source as LeadSource | null;

  return (
    <div className="grid grid-cols-12 items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-ink-50/70">
      <Link to={`/crm/leads/${lead.id}`} className="col-span-2 truncate text-[15px] font-medium text-ink-900 hover:text-brand-600">{lead.full_name}</Link>
      <div className="ltr-content col-span-1 truncate text-center text-xs text-ink-500">{lead.phone}</div>
      <div className="col-span-1 truncate text-center text-xs text-ink-600">{lead.teacher_name || "—"}</div>
      <div className="col-span-1 flex justify-center">
        {source && SOURCE_ICON[source] ? (
          <span className={`flex h-7 w-7 items-center justify-center rounded-md ${SOURCE_ICON[source].className}`} title={SOURCE_ICON[source].label}>
            {(() => { const { Icon } = SOURCE_ICON[source]; return <Icon size={13} />; })()}
          </span>
        ) : <span className="text-xs text-ink-300">—</span>}
      </div>
      <div className="col-span-1 text-center">
        <Badge tone={lead.follow_up_count >= 3 ? "warning" : "neutral"} dot={false}>{lead.follow_up_count} محاولة</Badge>
      </div>
      <div className="col-span-1 truncate text-center text-xs text-ink-400">{lead.assigned_to_name || "—"}</div>
      <div className="col-span-1"><Badge tone={STAGE_TONE[lead.stage as keyof typeof STAGE_TONE]} dot={false}>{STAGE_LABEL[lead.stage as keyof typeof STAGE_LABEL]}</Badge></div>
      <div className="col-span-4">
        {isTerminal ? (
          <span className="text-xs text-ink-400">{lead.is_converted ? "تم التحويل" : "مفقود"}</span>
        ) : canManage ? (
          <div className="flex items-center gap-1.5">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظة المتابعة (مثال: طلب وقت للتفكير)..."
              className="h-8 flex-1 rounded-md border border-ink-200 px-2 text-xs outline-none focus:border-brand-400"
            />
            <button
              onClick={async () => { await logFollowUp.mutateAsync(note || undefined); setNote(""); }}
              disabled={logFollowUp.isPending || !note.trim()}
              title="تسجيل محاولة متابعة"
              className="rounded-md p-1.5 text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-40"
            >
              <MessageCircle size={15} />
            </button>
            <button onClick={() => convertLead.mutate(undefined)} disabled={convertLead.isPending} title="تحويل إلى عميل فعلي" className="rounded-md p-1.5 text-success-600 transition-colors hover:bg-success-50">
              <UserCheck size={15} />
            </button>
            <button onClick={() => setShowLoseDialog(true)} title="إغلاق كمفقود" className="rounded-md p-1.5 text-danger-500 transition-colors hover:bg-danger-50">
              <XCircle size={15} />
            </button>
          </div>
        ) : null}
      </div>
      {showLoseDialog && (
        <LoseConfirmDialog
          requireStrongConfirm={lead.follow_up_count >= 3}
          isLoading={loseLead.isPending}
          onCancel={() => setShowLoseDialog(false)}
          onConfirm={async (reason) => { await loseLead.mutateAsync(reason); setShowLoseDialog(false); }}
        />
      )}
    </div>
  );
}

export function InterestedPage() {
  const canManage = usePermission(PERMISSIONS.CRM_LEAD_MANAGE);
  const [hideTerminal, setHideTerminal] = useState(true);

  const { data, isLoading } = useLeadsSearch({ page: 1, page_size: 200, group: "interested" });

  const items = (data?.items ?? []).filter((l) => !hideTerminal || (!l.is_converted && !l.is_lost));

  return (
    <div className="max-w-none">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">عملاء مهتمون</h1>
          <p className="mt-1 text-sm text-ink-500">متابعة العملاء بعد حضور المحاضرة لتحويلهم إلى عملاء فعليين</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <input type="checkbox" checked={hideTerminal} onChange={(e) => setHideTerminal(e.target.checked)} className="rounded" />
          إخفاء المحوّلين والمفقودين
        </label>
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-400">لا يوجد عملاء مهتمون حاليًا</div>
        ) : (
          <>
            <div className="grid grid-cols-12 gap-3 border-b border-ink-100 bg-ink-50/70 px-6 py-3 text-center text-[13px] font-semibold text-ink-500">
              <div className="col-span-2 text-start">الاسم</div>
              <div className="col-span-1">الهاتف</div>
              <div className="col-span-1">المدرّس</div>
              <div className="col-span-1">المصدر</div>
              <div className="col-span-1">المحاولات</div>
              <div className="col-span-1">المسؤول</div>
              <div className="col-span-1">الحالة</div>
              <div className="col-span-4">إجراء</div>
            </div>
            <div className="divide-y divide-ink-100">
              {items.map((lead) => <InterestedRow key={lead.id} lead={lead} canManage={canManage} />)}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
