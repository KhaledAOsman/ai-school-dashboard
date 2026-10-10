import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Plus, Trash2, Wallet } from "lucide-react";
import { translate } from "@/i18n";
import {
  useCategories,
  useCreateExpense,
  useExpense,
  useExpenses,
  useUpdateExpense,
} from "@/modules/finance/hooks/useFinance";
import { useBudgetLines, useStaff } from "@/modules/finance/hooks/useBudget";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { formatSAR, fromCents, toCents } from "@/modules/finance/utils";

interface Line {
  label: string;
  amount: string;
}

/**
 * One form for both creating and editing a payment / invoice. Everything the
 * bookkeeping needs lives here: invoice number + date + link, who paid, the
 * month it is for, and (for variable pay) itemised lines that must add up to
 * the amount.
 */
export function ExpenseFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;

  const { data: categories } = useCategories();
  const { data: approvedBudgetLines } = useBudgetLines({ status: "approved" });
  const { data: staff } = useStaff();
  const { data: existing } = useExpense(id);
  const { data: allExpenses } = useExpenses({ limit: 500 });
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense(id ?? "");

  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [budgetLineId, setBudgetLineId] = useState("");
  const [staffId, setStaffId] = useState(searchParams.get("staff") ?? "");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [itemised, setItemised] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ label: "", amount: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Editing: fill the form once from the saved expense.
  useEffect(() => {
    if (!isEdit || !existing || loaded) return;
    setAmount(String(existing.amount));
    setExpenseDate(existing.expense_date);
    setCategoryId(existing.category_id);
    setSubcategoryId(existing.subcategory_id ?? "");
    setBudgetLineId(existing.budget_line_id ?? "");
    setStaffId(existing.staff_id ?? "");
    setVendor(existing.vendor ?? "");
    setDescription(existing.description ?? "");
    setNotes(existing.notes ?? "");
    setInvoiceNumber(existing.invoice_number ?? "");
    setInvoiceDate(existing.invoice_date ?? "");
    setInvoiceUrl(existing.invoice_url ?? "");
    setPaidBy(existing.paid_by ?? "");
    setPeriodMonth(existing.period_month ?? "");
    if (existing.breakdown && existing.breakdown.length > 0) {
      setItemised(true);
      setLines(existing.breakdown.map((l) => ({ label: l.label, amount: String(l.amount) })));
    }
    setLoaded(true);
  }, [isEdit, existing, loaded]);

  // New payment for a person (from the staff page): prefill the payee name.
  useEffect(() => {
    if (isEdit || !staffId || vendor) return;
    const person = (staff ?? []).find((s) => s.id === staffId);
    if (person) setVendor(person.full_name);
  }, [isEdit, staffId, staff, vendor]);

  const selectedCategory = categories?.find((c) => c.id === categoryId);
  const selectedBudgetLine = approvedBudgetLines?.find((b) => b.id === budgetLineId);
  const payers = useMemo(
    () => Array.from(new Set((allExpenses ?? []).map((e) => e.paid_by).filter((v): v is string => !!v))),
    [allExpenses]
  );

  const linesCents = lines.reduce((sum, l) => sum + toCents(l.amount), 0);
  const finalAmount = itemised ? fromCents(linesCents) : amount;

  function setLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanLines = lines.filter((l) => l.label.trim() || l.amount.trim());
    if (itemised) {
      if (cleanLines.length === 0 || cleanLines.some((l) => !l.label.trim() || l.amount.trim() === "")) {
        setError("كل بند لازم يكون له اسم ومبلغ");
        return;
      }
    }
    if (!(toCents(finalAmount) > 0)) {
      setError("المبلغ لازم يكون أكبر من صفر");
      return;
    }

    // When editing, an empty string clears a text field; when creating, send null.
    const text = (v: string) => (isEdit ? v : v.trim() || null);
    const payload = {
      amount: finalAmount,
      expense_date: expenseDate,
      category_id: categoryId,
      subcategory_id: subcategoryId || null,
      budget_line_id: budgetLineId || null,
      staff_id: staffId || null,
      vendor: text(vendor),
      description: text(description),
      notes: text(notes),
      invoice_number: text(invoiceNumber),
      invoice_url: text(invoiceUrl),
      paid_by: text(paidBy),
      ...(invoiceDate ? { invoice_date: invoiceDate } : {}),
      ...(periodMonth ? { period_month: periodMonth } : {}),
      breakdown: itemised ? cleanLines.map((l) => ({ label: l.label.trim(), amount: fromCents(toCents(l.amount)) })) : isEdit ? [] : null,
    };

    try {
      if (isEdit) {
        await updateExpense.mutateAsync({ ...payload, change_reason: "تعديل من نموذج الفاتورة" });
        navigate(`/finance/expenses/${id}`);
      } else {
        const created = await createExpense.mutateAsync(payload);
        navigate(`/finance/expenses/${created.id}`);
      }
    } catch (err) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(message ?? translate("ar", "common_error"));
    }
  }

  const saving = createExpense.isPending || updateExpense.isPending;

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowRight size={15} />
        رجوع
      </button>

      <h1 className="mb-6 text-[26px] font-bold tracking-tight text-ink-900">
        {isEdit ? "تعديل الفاتورة / الدفعة" : translate("ar", "expense_new")}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <h2 className="mb-4 text-[16px] font-bold text-ink-900">بيانات الفاتورة</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="رقم الفاتورة (اختياري)">
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="ltr-content" />
            </FormField>
            <FormField label="تاريخ الفاتورة (اختياري)">
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="ltr-content" />
            </FormField>
          </div>
          <div className="mt-4">
            <FormField label="رابط الفاتورة / إيصال التحويل (اختياري)" hint="رابط Drive أو أي مكان محفوظ فيه الفاتورة. تقدر كمان ترفع الملف من صفحة المصروف بعد الحفظ.">
              <Input type="url" value={invoiceUrl} onChange={(e) => setInvoiceUrl(e.target.value)} className="ltr-content text-left" placeholder="https://" />
            </FormField>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-[16px] font-bold text-ink-900">الدفع</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={itemised ? "المبلغ (مجموع البنود)" : translate("ar", "expense_amount")}>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required={!itemised}
                readOnly={itemised}
                value={itemised ? finalAmount : amount}
                onChange={(e) => setAmount(e.target.value)}
                className="ltr-content"
                placeholder="0.00"
              />
            </FormField>
            <FormField label="تاريخ الدفع">
              <Input type="date" required value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="ltr-content" />
            </FormField>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="الشهر اللي الدفعة عنه (اختياري)" hint="مثلاً راتب شهر 8 اتدفع في سبتمبر">
              <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className="ltr-content" />
            </FormField>
            <FormField label="مين دفع؟ (اختياري)" hint="سيبه فاضي لو دُفع من حساب المشروع">
              <Input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} list="payers-list" placeholder="اسم الشريك" />
              <datalist id="payers-list">
                {payers.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </FormField>
          </div>

          <div className="mt-5 border-t border-ink-100 pt-4">
            <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-medium text-ink-800">
              <input
                type="checkbox"
                checked={itemised}
                onChange={(e) => {
                  setItemised(e.target.checked);
                  if (e.target.checked && lines.length === 1 && !lines[0].label && !lines[0].amount && amount) {
                    setLines([{ label: "", amount }]);
                  }
                }}
                className="h-4 w-4 accent-brand-600"
              />
              تقسيم المبلغ إلى بنود (أجر أساسي، فيديوهات، بونص، خصم…)
            </label>

            {itemised && (
              <div className="mt-4 space-y-2.5">
                {lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={line.label}
                      onChange={(e) => setLine(i, { label: e.target.value })}
                      placeholder="البند (مثال: 7 فيديو)"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={line.amount}
                      onChange={(e) => setLine(i, { amount: e.target.value })}
                      placeholder="المبلغ"
                      className="ltr-content w-32"
                    />
                    <button
                      type="button"
                      onClick={() => setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)))}
                      className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-ink-50 hover:text-danger-600"
                      title="حذف البند"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setLines((prev) => [...prev, { label: "", amount: "" }])}
                    className="link-underline flex items-center gap-1.5 text-[13px] font-medium text-brand-600"
                  >
                    <Plus size={14} />
                    إضافة بند
                  </button>
                  <p className="text-[13px] text-ink-600">
                    المجموع: <span className="ltr-content font-bold text-ink-900">{formatSAR(finalAmount)}</span>
                  </p>
                </div>
                <p className="text-[12.5px] text-ink-500">الخصم يتسجّل بمبلغ بالسالب (مثال: -50).</p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-[16px] font-bold text-ink-900">التصنيف والمستفيد</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={translate("ar", "expense_category")}>
                <Select
                  required
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setSubcategoryId("");
                  }}
                >
                  <option value="">اختر حساب</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code ? `${c.code} · ${c.name}` : c.name}
                    </option>
                  ))}
                </Select>
              </FormField>

              {selectedCategory && selectedCategory.children.length > 0 && (
                <FormField label={translate("ar", "expense_subcategory")}>
                  <Select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
                    <option value="">—</option>
                    {selectedCategory.children.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code ? `${c.code} · ${c.name}` : c.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="الشخص (لو الدفعة لفريلانسر)" hint="بيربط الدفعة بسجل الشخص ويظهر في صفحة الموظفين">
                <Select
                  value={staffId}
                  onChange={(e) => {
                    setStaffId(e.target.value);
                    const person = (staff ?? []).find((s) => s.id === e.target.value);
                    if (person && !vendor) setVendor(person.full_name);
                  }}
                >
                  <option value="">بدون ربط بشخص</option>
                  {(staff ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} — {s.department_name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="المستفيد / المورّد">
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="الاسم أو الشركة" />
              </FormField>
            </div>

            <FormField label="بند الميزانية (اختياري)" hint="يظهر هنا فقط البنود المعتمدة من المدير">
              <Select value={budgetLineId} onChange={(e) => setBudgetLineId(e.target.value)}>
                <option value="">بدون ربط بميزانية</option>
                {(approvedBudgetLines ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — متبقي {formatSAR(b.remaining_amount)}
                  </option>
                ))}
              </Select>
            </FormField>

            {selectedBudgetLine && (
              <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3.5 py-2.5 text-xs text-brand-700 ring-1 ring-inset ring-brand-200/70">
                <Wallet size={14} className="shrink-0" />
                هذا المصروف سيُخصم من ميزانية "{selectedBudgetLine.name}" — المتبقي حاليًا {formatSAR(selectedBudgetLine.remaining_amount)}
              </div>
            )}

            <FormField label={translate("ar", "expense_description")}>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="وصف مختصر" />
            </FormField>
            <FormField label="ملاحظات (اختياري)">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </FormField>
          </div>
        </Card>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700 ring-1 ring-inset ring-danger-100">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" variant="primary" isLoading={saving}>
            {translate("ar", "common_save")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            {translate("ar", "common_cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
