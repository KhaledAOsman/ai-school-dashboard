import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Wallet } from "lucide-react";
import { translate } from "@/i18n";
import { useCategories, useCreateExpense } from "@/modules/finance/hooks/useFinance";
import { useBudgetLines, useStaff } from "@/modules/finance/hooks/useBudget";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";

function formatSAR(value: string | number): string {
  return `${Number(value).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

export function ExpenseFormPage() {
  const navigate = useNavigate();
  const { data: categories } = useCategories();
  const { data: approvedBudgetLines } = useBudgetLines({ status: "approved" });
  const { data: staff } = useStaff();
  const createExpense = useCreateExpense();

  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [budgetLineId, setBudgetLineId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedCategory = categories?.find((c) => c.id === categoryId);
  const selectedBudgetLine = approvedBudgetLines?.find((b) => b.id === budgetLineId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await createExpense.mutateAsync({
        amount,
        expense_date: expenseDate,
        category_id: categoryId,
        subcategory_id: subcategoryId || null,
        budget_line_id: budgetLineId || null,
        staff_id: staffId || null,
        vendor: vendor || null,
        description: description || null,
      });
      navigate(`/finance/expenses/${created.id}`);
    } catch {
      setError(translate("ar", "common_error"));
    }
  }

  return (
    <div className="max-w-lg">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowRight size={15} />
        رجوع
      </button>

      <h1 className="mb-6 text-[26px] font-bold tracking-tight text-ink-900">{translate("ar", "expense_new")}</h1>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label={translate("ar", "expense_amount")}>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="ltr-content"
                placeholder="0.00"
              />
            </FormField>
            <FormField label={translate("ar", "expense_date")}>
              <Input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="ltr-content"
              />
            </FormField>
          </div>

          <FormField label={translate("ar", "expense_category")}>
            <Select
              required
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSubcategoryId("");
              }}
            >
              <option value="">اختر تصنيفًا</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

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
            <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3.5 py-2.5 text-xs text-brand-700 ring-1 ring-inset ring-brand-100">
              <Wallet size={14} className="shrink-0" />
              هذا المصروف سيُخصم من ميزانية "{selectedBudgetLine.name}" — المتبقي حاليًا {formatSAR(selectedBudgetLine.remaining_amount)}
            </div>
          )}

          <FormField label="الموظف/المدرّس المرتبط (اختياري)" hint="استخدمه لتسجيل راتب فرد محدد">
            <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">بدون ربط بفرد</option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label={translate("ar", "expense_vendor")}>
            <Input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="اسم المورّد" />
          </FormField>

          <FormField label={translate("ar", "expense_description")}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="وصف مختصر (اختياري)" />
          </FormField>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700 ring-1 ring-inset ring-danger-100">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" isLoading={createExpense.isPending}>
              {translate("ar", "common_save")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              {translate("ar", "common_cancel")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
