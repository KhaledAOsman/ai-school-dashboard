import { translate, type TranslationKey } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import type { Expense } from "@/modules/finance/services/financeApi";

const STATUS_TONE: Record<Expense["status"], "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

const STATUS_KEYS: Record<Expense["status"], TranslationKey> = {
  draft: "expense_status_draft",
  pending_approval: "expense_status_pending_approval",
  approved: "expense_status_approved",
  rejected: "expense_status_rejected",
  cancelled: "expense_status_cancelled",
};

export function StatusBadge({ status, dot = true }: { status: Expense["status"]; dot?: boolean }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot={dot} className={status === "cancelled" ? "line-through opacity-70" : ""}>
      {translate("ar", STATUS_KEYS[status])}
    </Badge>
  );
}
