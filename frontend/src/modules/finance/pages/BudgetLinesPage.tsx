import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Wallet, AlertCircle } from "lucide-react";
import { translate } from "@/i18n";
import {
  useBudgetLines,
  useCreateBudgetLine,
  useSubmitBudgetLine,
  useApproveBudgetLine,
  useRejectBudgetLine,
  useArchiveBudgetLine,
} from "@/modules/finance/hooks/useBudget";
import { useCategories } from "@/modules/finance/hooks/useFinance";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import type { BudgetLineWithSpend, BudgetLineKind, BudgetPeriod } from "@/modules/finance/services/budgetApi";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";

function formatSAR(value: string | number): string {
  return `${Number(value).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

const STATUS_TONE = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
  archived: "neutral",
} as const;

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  pending_approval: "بانتظار اعتماد المدير",
  approved: "معتمدة",
  rejected: "مرفوضة",
  archived: "مؤرشفة",
};

const KIND_LABEL: Record<string, string> = { fixed: "ثابت", variable: "متغيّر" };
const PERIOD_LABEL: Record<string, string> = {
  one_time: "مرة واحدة",
  monthly: "شهري",
  quarterly: "ربع سنوي",
  yearly: "سنوي",
};

function BudgetLineCard({ line }: { line: BudgetLineWithSpend }) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const submitLine = useSubmitBudgetLine(line.id);
  const approveLine = useApproveBudgetLine(line.id);
  const rejectLine = useRejectBudgetLine(line.id);
  const archiveLine = useArchiveBudgetLine(line.id);

  const canSubmit = usePermission(PERMISSIONS.FINANCE_BUDGET_SUBMIT);
  const canApprove = usePermission(PERMISSIONS.FINANCE_BUDGET_APPROVE);
  const canReject = usePermission(PERMISSIONS.FINANCE_BUDGET_REJECT);
  const canArchive = usePermission(PERMISSIONS.FINANCE_BUDGET_ARCHIVE);

  const pctClamped = Math.min(100, line.spent_pct);
  const isOverBudget = line.spent_pct > 100;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink-900">{line.name}</h3>
            <Badge tone={STATUS_TONE[line.status]}>{STATUS_LABEL[line.status]}</Badge>
            <Badge tone="brand" dot={false}>{KIND_LABEL[line.kind]}</Badge>
            <Badge tone="neutral" dot={false}>{PERIOD_LABEL[line.period]}</Badge>
          </div>
          {line.description && <p className="mt-1 text-sm text-ink-500">{line.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {line.categories.map((c) => (
              <Link
                key={c.id}
                to={`/finance/chart-of-accounts?category=${c.id}`}
                className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-200"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-left">
          <p className="ltr-content text-xl font-bold text-ink-900">{formatSAR(line.budgeted_amount)}</p>
          <p className="text-xs text-ink-400">الميزانية المخصصة</p>
        </div>
      </div>

      {/* Spend progress */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-ink-500">
            صُرف <span className="ltr-content font-semibold text-ink-800">{formatSAR(line.spent_amount)}</span>
          </span>
          <span className={isOverBudget ? "font-semibold text-danger-600" : "text-ink-500"}>
            {isOverBudget ? "تجاوز الميزانية" : `متبقي ${formatSAR(line.remaining_amount)}`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out-expo ${isOverBudget ? "bg-danger-500" : "bg-brand-600"}`}
            style={{ width: `${pctClamped}%` }}
          />
        </div>
      </div>

      {line.status === "rejected" && line.rejection_reason && (
        <div className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700 ring-1 ring-inset ring-danger-100">
          <span className="font-semibold">سبب الرفض: </span>
          {line.rejection_reason}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {line.status === "draft" && canSubmit && (
          <Button size="sm" variant="primary" onClick={() => submitLine.mutate()}>
            إرسال لاعتماد المدير
          </Button>
        )}
        {line.status === "pending_approval" && canApprove && (
          <Button size="sm" variant="success" onClick={() => approveLine.mutate()}>
            اعتماد الميزانية
          </Button>
        )}
        {line.status === "pending_approval" && canReject && !showRejectForm && (
          <Button size="sm" variant="danger" onClick={() => setShowRejectForm(true)}>
            رفض
          </Button>
        )}
        {line.status === "approved" && canArchive && (
          <Button size="sm" variant="outline" onClick={() => archiveLine.mutate()}>
            أرشفة
          </Button>
        )}
      </div>

      {showRejectForm && (
        <div className="mt-3 animate-scale-in space-y-2">
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="سبب رفض هذه الميزانية..." rows={2} />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={!rejectReason.trim()}
              onClick={async () => {
                await rejectLine.mutateAsync(rejectReason);
                setShowRejectForm(false);
                setRejectReason("");
              }}
            >
              تأكيد الرفض
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowRejectForm(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function CreateBudgetLineForm({ onDone }: { onDone: () => void }) {
  const { data: categories } = useCategories();
  const createLine = useCreateBudgetLine();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<BudgetLineKind>("fixed");
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");
  const [amount, setAmount] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const flatCategories = (categories ?? []).flatMap((c) => [c, ...c.children]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (categoryIds.length === 0) {
      setError("اختر تصنيفًا واحدًا على الأقل");
      return;
    }
    try {
      await createLine.mutateAsync({
        name,
        description: description || null,
        kind,
        period,
        budgeted_amount: amount,
        category_ids: categoryIds,
      });
      onDone();
    } catch {
      setError("تعذّر إنشاء بند الميزانية");
    }
  }

  return (
    <Card className="mb-5 animate-scale-in">
      <CardHeader>
        <CardTitle>بند ميزانية جديد</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="اسم البند">
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: رواتب المدرسين - سبتمبر" />
          </FormField>
          <FormField label="الميزانية المخصصة (ر.س)">
            <Input required type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="ltr-content" placeholder="0.00" />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="النوع">
            <Select value={kind} onChange={(e) => setKind(e.target.value as BudgetLineKind)}>
              <option value="fixed">ثابت</option>
              <option value="variable">متغيّر</option>
            </Select>
          </FormField>
          <FormField label="الدورية">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}>
              <option value="monthly">شهري</option>
              <option value="quarterly">ربع سنوي</option>
              <option value="yearly">سنوي</option>
              <option value="one_time">مرة واحدة</option>
            </Select>
          </FormField>
        </div>

        <FormField label="التصنيفات المرتبطة (يمكن اختيار أكثر من واحد)">
          <div className="flex flex-wrap gap-2 rounded-lg bg-ink-50 p-3">
            {flatCategories.map((c) => {
              const selected = categoryIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setCategoryIds((prev) => (selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]))
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected ? "bg-brand-600 text-white" : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-100"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
            {flatCategories.length === 0 && <p className="text-xs text-ink-400">أنشئ تصنيفًا أولًا من صفحة التصنيفات</p>}
          </div>
        </FormField>

        <FormField label="وصف (اختياري)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </FormField>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700 ring-1 ring-inset ring-danger-100">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" variant="primary" isLoading={createLine.isPending}>
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

export function BudgetLinesPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { data: lines, isLoading } = useBudgetLines({ status: statusFilter || undefined });
  const canCreate = usePermission(PERMISSIONS.FINANCE_BUDGET_CREATE);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">بنود الميزانية</h1>
          <p className="mt-1 text-sm text-ink-500">
            تخطيط الميزانيات (رواتب، اشتراكات، حملات تسويقية) واعتمادها قبل الصرف الفعلي
          </p>
        </div>
        {canCreate && !showCreateForm && (
          <Button variant="primary" size="lg" onClick={() => setShowCreateForm(true)}>
            <Plus size={17} />
            بند جديد
          </Button>
        )}
      </div>

      {showCreateForm && <CreateBudgetLineForm onDone={() => setShowCreateForm(false)} />}

      <div className="mb-4 flex gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-60">
          <option value="">كل الحالات</option>
          <option value="draft">مسودة</option>
          <option value="pending_approval">بانتظار اعتماد المدير</option>
          <option value="approved">معتمدة</option>
          <option value="rejected">مرفوضة</option>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-500">{translate("ar", "common_loading")}</p>
      ) : (lines ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={Wallet} title="لا توجد بنود ميزانية بعد" description="أنشئ أول بند ميزانية لبدء التخطيط المالي" />
        </Card>
      ) : (
        <div className="space-y-4">
          {(lines ?? []).map((line) => (
            <BudgetLineCard key={line.id} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}
