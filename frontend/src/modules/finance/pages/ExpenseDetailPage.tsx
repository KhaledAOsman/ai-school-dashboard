import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Download, Trash2, Paperclip, History, ArrowLeftCircle, ArrowRight, CalendarDays, Store, type LucideIcon } from "lucide-react";
import { translate } from "@/i18n";
import {
  useExpense,
  useSubmitExpense,
  useApproveExpense,
  useRejectExpense,
  useCancelExpense,
  useResubmitExpense,
  useRestoreExpenseVersion,
  useAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from "@/modules/finance/hooks/useFinance";
import { financeApi } from "@/modules/finance/services/financeApi";
import { StatusBadge } from "@/modules/finance/components/StatusBadge";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";

function formatSAR(value: string | number): string {
  return `${Number(value).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-400">
        <Icon size={15} />
      </span>
      <div>
        <p className="text-xs text-ink-500">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-ink-900">{value}</p>
      </div>
    </div>
  );
}

export function ExpenseDetailPage() {
  const { expenseId } = useParams<{ expenseId: string }>();
  const id = expenseId as string;
  const navigate = useNavigate();

  const { data: expense, isLoading } = useExpense(id);
  const { data: attachments } = useAttachments(id);

  const submitExpense = useSubmitExpense(id);
  const approveExpense = useApproveExpense(id);
  const rejectExpense = useRejectExpense(id);
  const cancelExpense = useCancelExpense(id);
  const resubmitExpense = useResubmitExpense(id);
  const restoreVersion = useRestoreExpenseVersion(id);
  const uploadAttachment = useUploadAttachment(id);
  const deleteAttachment = useDeleteAttachment(id);

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const canSubmit = usePermission(PERMISSIONS.FINANCE_EXPENSE_SUBMIT);
  const canApprove = usePermission(PERMISSIONS.FINANCE_EXPENSE_APPROVE);
  const canReject = usePermission(PERMISSIONS.FINANCE_EXPENSE_REJECT);
  const canUpdate = usePermission(PERMISSIONS.FINANCE_EXPENSE_UPDATE);
  const canRestoreVersion = usePermission(PERMISSIONS.FINANCE_EXPENSE_RESTORE_VERSION);
  const canUpload = usePermission(PERMISSIONS.FINANCE_ATTACHMENT_UPLOAD);
  const canDownload = usePermission(PERMISSIONS.FINANCE_ATTACHMENT_DOWNLOAD);
  const canDeleteAttachment = usePermission(PERMISSIONS.FINANCE_ATTACHMENT_DELETE);

  if (isLoading || !expense) {
    return <p className="text-sm text-ink-500">{translate("ar", "common_loading")}</p>;
  }

  async function handleDownload(attachmentId: string, filename: string) {
    const blob = await financeApi.downloadAttachment(id, attachmentId);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      await uploadAttachment.mutateAsync(file);
      e.target.value = "";
    }
  }

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate("/finance/expenses")}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowRight size={15} />
        كل المصروفات
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="ltr-content text-[34px] font-bold leading-tight tracking-tight text-ink-900">{formatSAR(expense.amount)}</p>
          <p className="mt-1 text-sm text-ink-500">{expense.vendor ?? expense.description ?? "—"}</p>
        </div>
        <StatusBadge status={expense.status} />
      </div>

      <div className="space-y-5">
        <Card>
          <div className="grid grid-cols-2 gap-5">
            <DetailRow icon={CalendarDays} label={translate("ar", "expense_date")} value={<span className="ltr-content">{expense.expense_date}</span>} />
            <DetailRow icon={Store} label={translate("ar", "expense_vendor")} value={expense.vendor ?? "—"} />
          </div>
          {expense.description && (
            <div className="mt-4 border-t border-ink-100 pt-4">
              <p className="text-xs text-ink-500">{translate("ar", "expense_description")}</p>
              <p className="mt-1 text-sm text-ink-800">{expense.description}</p>
            </div>
          )}
        </Card>

        {/* Actions */}
        <div className="flex flex-wrap gap-2.5">
          {expense.status === "draft" && canSubmit && (
            <Button variant="primary" onClick={() => submitExpense.mutate()}>
              {translate("ar", "expense_submit_for_approval")}
            </Button>
          )}
          {expense.status === "pending_approval" && canApprove && (
            <Button variant="success" onClick={() => approveExpense.mutate()}>
              {translate("ar", "expense_approve")}
            </Button>
          )}
          {expense.status === "pending_approval" && canReject && !showRejectForm && (
            <Button variant="danger" onClick={() => setShowRejectForm(true)}>
              {translate("ar", "expense_reject")}
            </Button>
          )}
          {expense.status === "rejected" && canSubmit && (
            <Button variant="primary" onClick={() => resubmitExpense.mutate()}>
              <ArrowLeftCircle size={16} />
              {translate("ar", "expense_edit")}
            </Button>
          )}
          {(expense.status === "draft" || expense.status === "pending_approval") && canUpdate && (
            <Button variant="outline" onClick={() => cancelExpense.mutate()}>
              {translate("ar", "expense_status_cancelled")}
            </Button>
          )}
        </div>

        {showRejectForm && (
          <Card className="animate-scale-in">
            <CardHeader>
              <CardTitle>{translate("ar", "expense_reject")}</CardTitle>
            </CardHeader>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="اذكر سبب الرفض..." rows={3} />
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                onClick={async () => {
                  await rejectExpense.mutateAsync(rejectReason);
                  setShowRejectForm(false);
                  setRejectReason("");
                }}
                disabled={!rejectReason.trim()}
              >
                {translate("ar", "common_confirm")}
              </Button>
              <Button variant="ghost" onClick={() => setShowRejectForm(false)}>
                {translate("ar", "common_cancel")}
              </Button>
            </div>
          </Card>
        )}

        {expense.status === "rejected" && expense.rejection_reason && (
          <Card className="bg-danger-50/40 ring-1 ring-inset ring-danger-100">
            <p className="text-xs font-semibold text-danger-700">سبب الرفض</p>
            <p className="mt-1 text-sm text-ink-800">{expense.rejection_reason}</p>
          </Card>
        )}

        {/* Attachments */}
        <Card>
          <CardHeader>
            <CardTitle>{translate("ar", "expense_attachments")}</CardTitle>
            {canUpload && (
              <label className="link-underline cursor-pointer text-[13px] font-medium text-brand-600">
                {translate("ar", "expense_upload_attachment")}
                <input type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,.webp" />
              </label>
            )}
          </CardHeader>
          {(attachments ?? []).length === 0 ? (
            <EmptyState icon={Paperclip} title="لا توجد مرفقات" />
          ) : (
            <div className="divide-y divide-ink-100">
              {(attachments ?? []).map((att) => (
                <div key={att.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="flex items-center gap-2 text-ink-800">
                    <Paperclip size={14} className="text-ink-400" />
                    {att.original_filename}
                  </span>
                  <div className="flex items-center gap-3">
                    {canDownload && (
                      <button onClick={() => handleDownload(att.id, att.original_filename)} className="text-ink-400 transition-colors hover:text-brand-600" title="تنزيل">
                        <Download size={16} />
                      </button>
                    )}
                    {canDeleteAttachment && (
                      <button onClick={() => deleteAttachment.mutate(att.id)} className="text-ink-400 transition-colors hover:text-danger-600" title="حذف">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Version history */}
        <Card>
          <CardHeader>
            <CardTitle>{translate("ar", "expense_history")}</CardTitle>
          </CardHeader>
          <div className="relative space-y-0">
            {expense.versions.slice().reverse().map((v, idx, arr) => (
              <div key={v.id} className="relative flex gap-3 pb-5 last:pb-0">
                {idx !== arr.length - 1 && <span className="absolute right-[9px] top-5 h-full w-px bg-ink-200" />}
                <span className="z-10 mt-1 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-brand-50 ring-2 ring-white">
                  <History size={11} className="text-brand-600" />
                </span>
                <div className="flex flex-1 items-center justify-between">
                  <div>
                    <span className="ltr-content text-sm font-semibold text-ink-800">v{v.version_number}</span>
                    <span className="mr-2 text-sm text-ink-500">{v.change_reason}</span>
                  </div>
                  {canRestoreVersion && v.version_number !== expense.current_version && (
                    <button
                      onClick={() => restoreVersion.mutate({ versionNumber: v.version_number })}
                      className="link-underline text-xs font-medium text-brand-600"
                    >
                      استرجاع
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
