import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Plus, Trash2 } from "lucide-react";
import { translate } from "@/i18n";
import {
  useCategories,
  useCreateExpense,
  useExpense,
  useUpdateExpense,
} from "@/modules/finance/hooks/useFinance";
import { useBudgetLines, useStaff, useStaffDepartments } from "@/modules/finance/hooks/useBudget";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { formatSAR, fromCents, periodLabel, toCents } from "@/modules/finance/utils";
import { financeApi, type Category } from "@/modules/finance/services/financeApi";
import { useQuery } from "@tanstack/react-query";

interface Line {
  label: string;
  amount: string;
  accountId: string; // "" = the invoice's account
  staffId?: string | null; // kept as-is when editing (e.g. one payroll transfer split per person)
  url?: string | null;
}

const EXTERNAL = "__external";
const TRANSFER_FEE = "17.25";
const emptyLine = (): Line => ({ label: "", amount: "", accountId: "" });

/** Accounts a line can be charged to: leaf accounts, grouped under their group. */
function AccountOptions({ categories }: { categories: Category[] }) {
  return (
    <>
      {categories.map((root) =>
        root.children.length > 0 ? (
          <optgroup key={root.id} label={root.code ? `${root.code} · ${root.name}` : root.name}>
            {root.children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} · ${c.name}` : c.name}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={root.id} value={root.id}>
            {root.code ? `${root.code} · ${root.name}` : root.name}
          </option>
        )
      )}
    </>
  );
}

/**
 * One invoice = one actual payment/transfer. A transfer often carries several
 * costs (salary + bonus + commission + the bank's transfer fee): each one is a
 * line charged to its own account, and the invoice total is their sum.
 */
export function ExpenseFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;

  const { data: categories } = useCategories();
  const { data: staff } = useStaff();
  const { data: departments } = useStaffDepartments();
  const { data: existing } = useExpense(id);
  const { data: payers = [] } = useQuery({ queryKey: ["expense-payers"], queryFn: financeApi.listPayers, staleTime: 5 * 60_000 });
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense(id ?? "");
  const canApprove = usePermission(PERMISSIONS.FINANCE_EXPENSE_APPROVE);
  const canSubmit = usePermission(PERMISSIONS.FINANCE_EXPENSE_SUBMIT);

  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [payee, setPayee] = useState(searchParams.get("staff") ?? ""); // staff id or EXTERNAL
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Editing: fill the form once from the saved invoice.
  useEffect(() => {
    if (!isEdit || !existing || loaded) return;
    setExpenseDate(existing.expense_date);
    setCategoryId(existing.category_id);
    setSubcategoryId(existing.subcategory_id ?? "");
    setPayee(existing.staff_id ?? (existing.vendor ? EXTERNAL : ""));
    setVendor(existing.vendor ?? "");
    setDescription(existing.description ?? "");
    setNotes(existing.notes ?? "");
    setInvoiceNumber(existing.invoice_number ?? "");
    setInvoiceDate(existing.invoice_date ?? "");
    setInvoiceUrl(existing.invoice_url ?? "");
    setPaidBy(existing.paid_by ?? "");
    setPeriodMonth(existing.period_month ?? "");
    if (existing.breakdown && existing.breakdown.length > 0) {
      setLines(
        existing.breakdown.map((l) => ({
          label: l.label,
          amount: String(l.amount),
          accountId: l.account_id ?? "",
          staffId: l.staff_id ?? null,
          url: l.url ?? null,
        }))
      );
    } else {
      setLines([{ label: existing.description ?? "", amount: String(existing.amount), accountId: "" }]);
    }
    setLoaded(true);
  }, [isEdit, existing, loaded]);

  // A person opened from the staff page: fill in their department's account.
  useEffect(() => {
    if (isEdit || !payee || payee === EXTERNAL || categoryId || !staff || !departments) return;
    const person = staff.find((s) => s.id === payee);
    const dept = departments.find((d) => d.id === person?.department_id);
    if (dept?.category_id) setCategoryId(dept.category_id);
  }, [isEdit, payee, categoryId, staff, departments]);

  const roots = useMemo(() => categories ?? [], [categories]);
  const selectedCategory = roots.find((c) => c.id === categoryId);
  const byId = useMemo(() => {
    const m = new Map<string, { name: string; code: string | null }>();
    for (const r of roots) {
      m.set(r.id, { name: r.name, code: r.code });
      for (const c of r.children) m.set(c.id, { name: c.name, code: c.code });
    }
    return m;
  }, [roots]);

  // People are filtered by the chosen account: each department is paid from one account group.
  const people = useMemo(() => {
    const all = staff ?? [];
    if (!categoryId) return all;
    const depts = new Set((departments ?? []).filter((d) => d.category_id === categoryId).map((d) => d.id));
    if (depts.size === 0) return all;
    return all.filter((s) => depts.has(s.department_id) || s.id === payee);
  }, [staff, departments, categoryId, payee]);

  // Picking a person fills in their department's account.
  function choosePayee(value: string) {
    setPayee(value);
    if (value && value !== EXTERNAL) {
      const person = (staff ?? []).find((s) => s.id === value);
      const dept = (departments ?? []).find((d) => d.id === person?.department_id);
      if (dept?.category_id && dept.category_id !== categoryId) {
        setCategoryId(dept.category_id);
        setSubcategoryId("");
      }
      if (person) setVendor(person.full_name);
    }
  }

  const totalCents = lines.reduce((sum, l) => sum + toCents(l.amount), 0);
  const total = fromCents(totalCents);
  const mainAccount = byId.get(subcategoryId || categoryId);
  // Budget impact: every line is charged to an account; the account's group
  // belongs to (at most) one approved budget line.
  const { data: budgetLines } = useBudgetLines({ status: "approved" });
  const budgetMonth = periodMonth || expenseDate.slice(0, 7);
  const budgetImpact = useMemo(() => {
    const rootOf = new Map<string, string>();
    for (const r of roots) {
      rootOf.set(r.id, r.id);
      for (const c of r.children) rootOf.set(c.id, r.id);
    }
    const lineOfRoot = new Map<string, (typeof budgetLines extends (infer T)[] | undefined ? T : never)>();
    for (const bl of budgetLines ?? []) for (const c of bl.categories) lineOfRoot.set(rootOf.get(c.id) ?? c.id, bl);
    const per = new Map<string, number>();
    let outside = 0;
    for (const l of lines) {
      const acc = l.accountId || subcategoryId || categoryId;
      if (!acc || !l.amount) continue;
      const bl = lineOfRoot.get(rootOf.get(acc) ?? acc);
      const cents = toCents(l.amount);
      if (bl) per.set(bl.id, (per.get(bl.id) ?? 0) + cents);
      else outside += cents;
    }
    const rows = Array.from(per.entries()).map(([id, cents]) => {
      const bl = (budgetLines ?? []).find((b) => b.id === id)!;
      const m = bl.monthly.find((x) => x.month === budgetMonth);
      const budget = m ? Number(m.budget) : Number(bl.budgeted_amount);
      const spent = m ? Number(m.spent) : 0;
      return { id, name: bl.name, budget, spent, invoice: cents / 100, after: budget - spent - cents / 100 };
    });
    return { rows, outside: outside / 100 };
  }, [budgetLines, roots, lines, categoryId, subcategoryId, budgetMonth]);

  const mainAccountName = mainAccount ? (mainAccount.code ? `${mainAccount.code} · ${mainAccount.name}` : mainAccount.name) : "حساب الفاتورة";

  function setLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addFeeLine() {
    const feeAccount = roots.flatMap((r) => r.children).find((c) => c.code === "5710");
    setLines((prev) => [...prev, { label: "رسوم التحويل الدولي", amount: TRANSFER_FEE, accountId: feeAccount?.id ?? "" }]);
  }

  async function save(mode: "draft" | "submit" | "approve") {
    setError(null);
    if (!categoryId) {
      setError("اختر الحساب");
      return;
    }
    const clean = lines.filter((l) => l.label.trim() || l.amount.trim());
    if (clean.length === 0 || clean.some((l) => l.amount.trim() === "")) {
      setError("كل بند لازم يكون له مبلغ");
      return;
    }
    if (!(totalCents > 0)) {
      setError("إجمالي الفاتورة لازم يكون أكبر من صفر");
      return;
    }
    if (payee === EXTERNAL && !vendor.trim()) {
      setError("اكتب اسم الجهة");
      return;
    }

    const person = payee && payee !== EXTERNAL ? (staff ?? []).find((s) => s.id === payee) : undefined;
    // A single plain line is just the invoice amount; otherwise keep every line with its account.
    const single = clean.length === 1 && !clean[0].accountId && !clean[0].staffId && !clean[0].url;
    const breakdown = single
      ? isEdit
        ? []
        : null
      : clean.map((l) => ({
          label: l.label.trim() || description.trim() || "بند",
          amount: fromCents(toCents(l.amount)),
          account_id: l.accountId || null,
          staff_id: l.staffId ?? null,
          url: l.url ?? null,
        }));

    const text = (v: string) => (isEdit ? v : v.trim() || null);
    const desc = description.trim() || (single ? clean[0].label.trim() : "");
    const payload = {
      amount: total,
      expense_date: expenseDate,
      category_id: categoryId,
      subcategory_id: subcategoryId || null,
      staff_id: person ? person.id : null,
      vendor: person ? person.full_name : payee === EXTERNAL ? vendor.trim() : text(""),
      description: text(desc),
      notes: text(notes),
      invoice_number: text(invoiceNumber),
      invoice_url: text(invoiceUrl),
      paid_by: text(paidBy),
      ...(invoiceDate ? { invoice_date: invoiceDate } : {}),
      ...(periodMonth ? { period_month: periodMonth } : {}),
      breakdown,
    };

    try {
      if (isEdit) {
        await updateExpense.mutateAsync({ ...payload, change_reason: "تعديل من نموذج الفاتورة" });
        navigate(`/finance/expenses/${id}`);
      } else {
        const created = await createExpense.mutateAsync({
          ...payload,
          approve_now: mode === "approve",
          submit_now: mode === "submit",
        });
        navigate(`/finance/expenses/${created.id}`);
      }
    } catch (err) {
      const data = (err as { response?: { data?: { detail?: unknown; error?: { message?: string } } } })?.response?.data;
      const detail = typeof data?.detail === "string" ? data.detail : undefined;
      setError(data?.error?.message ?? detail ?? translate("ar", "common_error"));
    }
  }

  const saving = createExpense.isPending || updateExpense.isPending;

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowRight size={15} />
        رجوع
      </button>

      <h1 className="mb-6 text-[26px] font-bold tracking-tight text-ink-900">{isEdit ? "تعديل الفاتورة" : "فاتورة / تحويل جديد"}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(isEdit ? "draft" : canApprove ? "approve" : canSubmit ? "submit" : "draft");
        }}
        className="space-y-5"
      >
        <Card>
          <h2 className="mb-4 text-[16px] font-bold text-ink-900">الحساب والمستفيد</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="الحساب">
              <Select
                required
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubcategoryId("");
                }}
              >
                <option value="">اختر الحساب</option>
                {roots.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} · ${c.name}` : c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            {selectedCategory && selectedCategory.children.length > 0 && (
              <FormField label="الحساب الفرعي">
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
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="المستفيد" hint={categoryId ? "بيظهر فريق الحساب المختار بس" : undefined}>
              <Select value={payee} onChange={(e) => choosePayee(e.target.value)}>
                <option value="">—</option>
                {people.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} — {s.department_name}
                  </option>
                ))}
                <option value={EXTERNAL}>جهة خارجية (اشتراك، مورّد…)</option>
              </Select>
            </FormField>
            {payee === EXTERNAL && (
              <FormField label="اسم الجهة">
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="مثال: Zoom" />
              </FormField>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-bold text-ink-900">بنود الفاتورة</h2>
            <p className="text-[13px] text-ink-600">
              الإجمالي: <span className="ltr-content text-[15px] font-bold text-ink-900">{formatSAR(total)}</span>
            </p>
          </div>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 rounded-lg border border-ink-100 p-2.5 sm:border-0 sm:p-0">
                <Input
                  value={line.label}
                  onChange={(e) => setLine(i, { label: e.target.value })}
                  placeholder="البند (راتب، بونص، 7 فيديو…)"
                  className="col-span-12 sm:col-span-4"
                />
                <div className="col-span-12 sm:col-span-5">
                  <Select value={line.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })} title="الحساب اللي البند بيتحمّل عليه">
                    <option value="">{mainAccountName}</option>
                    <AccountOptions categories={roots} />
                  </Select>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  value={line.amount}
                  onChange={(e) => setLine(i, { amount: e.target.value })}
                  placeholder="المبلغ"
                  className="ltr-content col-span-9 sm:col-span-2"
                />
                <button
                  type="button"
                  onClick={() => setLines((prev) => (prev.length === 1 ? [emptyLine()] : prev.filter((_, j) => j !== i)))}
                  className="col-span-3 flex items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-50 hover:text-danger-600 sm:col-span-1"
                  title="حذف البند"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className="link-underline flex items-center gap-1.5 text-[13px] font-medium text-brand-600"
            >
              <Plus size={14} />
              إضافة بند
            </button>
            <button type="button" onClick={addFeeLine} className="link-underline flex items-center gap-1.5 text-[13px] font-medium text-brand-600">
              <Plus size={14} />
              رسوم تحويل دولي (17.25)
            </button>
          </div>
          <p className="mt-2 text-[12.5px] text-ink-500">الخصم يتسجّل بالسالب (مثال: ‎-50).</p>
        </Card>

        {(budgetImpact.rows.length > 0 || budgetImpact.outside > 0) && (
          <Card>
            <h2 className="mb-3 text-[16px] font-bold text-ink-900">أثر الفاتورة على الميزانية — {periodLabel(budgetMonth)}</h2>
            <div className="divide-y divide-ink-100 text-sm">
              {budgetImpact.rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="font-medium text-ink-800">{r.name}</span>
                  <span className="text-ink-500">
                    مصروف <span className="ltr-content text-ink-800">{formatSAR(r.spent)}</span> من{" "}
                    <span className="ltr-content text-ink-800">{formatSAR(r.budget)}</span> · الفاتورة{" "}
                    <span className="ltr-content font-semibold text-ink-900">{formatSAR(r.invoice)}</span> ·{" "}
                    <span className={r.after < 0 ? "font-semibold text-danger-600" : "text-ink-700"}>
                      {r.after < 0 ? `هتتجاوز بـ ${formatSAR(-r.after)}` : `يتبقى ${formatSAR(r.after)}`}
                    </span>
                  </span>
                </div>
              ))}
              {budgetImpact.outside > 0 && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-ink-600">خارج بنود الميزانية</span>
                  <span className="ltr-content font-semibold text-ink-800">{formatSAR(budgetImpact.outside)}</span>
                </div>
              )}
            </div>
          </Card>
        )}

        <Card>
          <h2 className="mb-4 text-[16px] font-bold text-ink-900">التحويل وإثباته</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="تاريخ التحويل">
              <Input type="date" required value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="ltr-content" />
            </FormField>
            <FormField label="الشهر اللي الدفعة عنه" hint="مثلاً راتب شهر 8 اتحوّل في سبتمبر">
              <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className="ltr-content" />
            </FormField>
          </div>
          <div className="mt-4">
            <FormField label="رابط الفاتورة / إثبات التحويل" hint="رابط Drive. وتقدر ترفع الملف نفسه من صفحة الفاتورة بعد الحفظ.">
              <Input type="url" value={invoiceUrl} onChange={(e) => setInvoiceUrl(e.target.value)} className="ltr-content text-left" placeholder="https://" />
            </FormField>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="رقم الفاتورة">
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="ltr-content" />
            </FormField>
            <FormField label="تاريخ الفاتورة">
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="ltr-content" />
            </FormField>
            <FormField label="دفعه شريك؟" hint="فاضي = من حساب المشروع">
              <Input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} list="payers-list" placeholder="اسم الشريك" />
              <datalist id="payers-list">
                {payers.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </FormField>
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <FormField label="الوصف">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="مثال: تحويل راتب شهر 8 — آية" />
            </FormField>
            <FormField label="ملاحظات">
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

        <div className="flex flex-wrap gap-3">
          {isEdit ? (
            <Button type="submit" variant="primary" isLoading={saving}>
              حفظ التعديلات
            </Button>
          ) : (
            <>
              {canApprove ? (
                <Button type="button" variant="primary" isLoading={saving} onClick={() => save("approve")}>
                  حفظ واعتماد
                </Button>
              ) : canSubmit ? (
                <Button type="button" variant="primary" isLoading={saving} onClick={() => save("submit")}>
                  حفظ وإرسال للاعتماد
                </Button>
              ) : null}
              <Button type="button" variant="outline" disabled={saving} onClick={() => save("draft")}>
                حفظ كمسودة
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            {translate("ar", "common_cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
