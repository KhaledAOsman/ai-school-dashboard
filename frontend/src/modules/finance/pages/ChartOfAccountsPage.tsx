import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Check, ChevronDown, ChevronLeft, FolderTree, Landmark, Layers, Pencil, Plus, X } from "lucide-react";
import { translate } from "@/i18n";
import {
  useAccountTotals,
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useFunding,
  useUpdateCategory,
} from "@/modules/finance/hooks/useFinance";
import { useBudgetLines } from "@/modules/finance/hooks/useBudget";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useAccountingAccounts } from "@/modules/finance/hooks/useAccounting";
import { Money } from "@/modules/finance/accounting/shared";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatSAR, fromCents, toCents } from "@/modules/finance/utils";
import type { AccountTotal, Category } from "@/modules/finance/services/financeApi";

interface Totals {
  cents: number;
  count: number;
}

function CodeTag({ code }: { code: string | null }) {
  if (!code) return null;
  return <span className="ltr-content rounded-md bg-ink-100 px-1.5 py-0.5 text-[12px] font-semibold text-ink-600">{code}</span>;
}

function Amount({ cents, bold }: { cents: number; bold?: boolean }) {
  return <span className={`ltr-content text-sm ${bold ? "font-bold text-ink-900" : "font-semibold text-ink-800"}`}>{formatSAR(fromCents(cents))}</span>;
}

/** Inline "name + optional code" editor used to add or rename an account. */
function AccountEditor({
  initialName = "",
  initialCode = "",
  codeHint,
  onSave,
  onCancel,
  saving,
}: {
  initialName?: string;
  initialCode?: string;
  codeHint?: string;
  onSave: (name: string, code: string) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="my-1.5 rounded-lg bg-ink-50 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-24 shrink-0">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={codeHint ?? "الكود"} className="ltr-content text-sm" />
        </div>
        <div className="min-w-[160px] flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الحساب" className="text-sm" autoFocus />
        </div>
        <Button
          type="button"
          size="sm"
          variant="primary"
          isLoading={saving}
          onClick={async () => {
            setError(null);
            if (!name.trim()) return setError("اكتب اسم الحساب");
            try {
              await onSave(name.trim(), code.trim());
            } catch (e) {
              const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
              setError(msg ?? "تعذّر الحفظ");
            }
          }}
        >
          <Check size={14} />
          حفظ
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X size={14} />
        </Button>
      </div>
      {codeHint && <p className="mt-1 text-[12px] text-ink-400">سيب الكود فاضي ويتحط تلقائي ({codeHint})</p>}
      {error && <p className="mt-1 text-[12.5px] text-danger-600">{error}</p>}
    </div>
  );
}

/** A top-level account: running total over everything posted to it (and its sub-accounts). */
function AccountNode({
  account,
  totals,
  defaultOpen,
  budgetLine,
}: {
  account: Category;
  totals: AccountTotal[];
  defaultOpen: boolean;
  budgetLine?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState<string | null>(null); // account id being renamed
  const [adding, setAdding] = useState(false);
  const canCreate = usePermission(PERMISSIONS.FINANCE_CATEGORY_CREATE);
  const canUpdate = usePermission(PERMISSIONS.FINANCE_CATEGORY_UPDATE);
  const canArchive = usePermission(PERMISSIONS.FINANCE_CATEGORY_DELETE);
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const archiveCategory = useArchiveCategory();

  const sum = (rows: AccountTotal[]): Totals => ({
    cents: rows.reduce((s, r) => s + toCents(r.total), 0),
    count: rows.reduce((s, r) => s + r.count, 0),
  });
  const own = sum(totals.filter((t) => t.category_id === account.id));
  const subTotals = new Map(account.children.map((c) => [c.id, sum(totals.filter((t) => t.subcategory_id === c.id))]));
  const subSum = Array.from(subTotals.values()).reduce((s, t) => s + t.cents, 0);
  const subCount = Array.from(subTotals.values()).reduce((s, t) => s + t.count, 0);
  const direct: Totals = { cents: own.cents - subSum, count: own.count - subCount };

  return (
    <div className="border-b border-ink-100 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-start transition-colors hover:bg-ink-50"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {open ? <ChevronDown size={15} className="shrink-0 text-ink-400" /> : <ChevronLeft size={15} className="shrink-0 text-ink-400" />}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <FolderTree size={14} />
          </span>
          <CodeTag code={account.code} />
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold text-ink-900">{account.name}</span>
            <span className="block truncate text-[12px] font-normal text-ink-400">{budgetLine ? `بند الميزانية: ${budgetLine}` : "خارج بنود الميزانية"}</span>
          </span>
        </div>
        <Amount cents={own.cents} bold />
      </button>

      {open && (
        <div className="mr-5 space-y-0.5 border-r border-ink-100 pb-3 pr-4">
          {(canUpdate || canCreate || canArchive) && editing !== account.id && (
            <div className="flex flex-wrap gap-3 px-1 pb-1 pt-0.5 text-[12.5px] font-medium">
              {canUpdate && (
                <button onClick={() => setEditing(account.id)} className="flex items-center gap-1 text-ink-500 hover:text-brand-600">
                  <Pencil size={12} />
                  تعديل الحساب
                </button>
              )}
              {canCreate && (
                <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-brand-600">
                  <Plus size={12} />
                  حساب فرعي
                </button>
              )}
              {canArchive && own.count === 0 && (
                <button
                  onClick={() => window.confirm(`أرشفة الحساب ${account.code ?? ""} ${account.name}؟`) && archiveCategory.mutate(account.id)}
                  className="flex items-center gap-1 text-ink-400 hover:text-danger-600"
                >
                  <Archive size={12} />
                  أرشفة
                </button>
              )}
            </div>
          )}
          {editing === account.id && (
            <AccountEditor
              initialName={account.name}
              initialCode={account.code ?? ""}
              saving={updateCategory.isPending}
              onCancel={() => setEditing(null)}
              onSave={async (name, code) => {
                await updateCategory.mutateAsync({ id: account.id, name, code: code || null });
                setEditing(null);
              }}
            />
          )}
          {adding && (
            <AccountEditor
              codeHint={account.code ? `${account.code.slice(0, 2)}x0` : undefined}
              saving={createCategory.isPending}
              onCancel={() => setAdding(false)}
              onSave={async (name, code) => {
                await createCategory.mutateAsync({ name, code: code || null, parent_id: account.id });
                setAdding(false);
              }}
            />
          )}
          {account.children.map((child) => {
            const t = subTotals.get(child.id) ?? { cents: 0, count: 0 };
            if (editing === child.id) {
              return (
                <AccountEditor
                  key={child.id}
                  initialName={child.name}
                  initialCode={child.code ?? ""}
                  saving={updateCategory.isPending}
                  onCancel={() => setEditing(null)}
                  onSave={async (name, code) => {
                    await updateCategory.mutateAsync({ id: child.id, name, code: code || null });
                    setEditing(null);
                  }}
                />
              );
            }
            return (
              <div key={child.id} className="group flex items-center gap-1">
              <Link
                key={child.id}
                to={`/finance/expenses?category=${account.id}&sub=${child.id}`}
                className="-mx-2 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-ink-50"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-500">
                    <Layers size={12} />
                  </span>
                  <CodeTag code={child.code} />
                  <span className="truncate text-sm font-medium text-ink-800">{child.name}</span>
                  {t.count > 0 && <span className="shrink-0 text-[12.5px] text-ink-400">{t.count}</span>}
                </div>
                <Amount cents={t.cents} />
              </Link>
              {canUpdate && (
                <button onClick={() => setEditing(child.id)} title="تعديل" className="rounded p-1 text-ink-300 opacity-0 transition-opacity hover:text-brand-600 group-hover:opacity-100">
                  <Pencil size={13} />
                </button>
              )}
              {canArchive && t.count === 0 && (
                <button
                  onClick={() => window.confirm(`أرشفة الحساب ${child.code ?? ""} ${child.name}؟`) && archiveCategory.mutate(child.id)}
                  title="أرشفة"
                  className="rounded p-1 text-ink-300 opacity-0 transition-opacity hover:text-danger-600 group-hover:opacity-100"
                >
                  <Archive size={13} />
                </button>
              )}
              </div>
            );
          })}
          {direct.count > 0 && (
            <Link
              to={`/finance/expenses?category=${account.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-ink-500 transition-colors hover:bg-ink-50"
            >
              <span className="pr-8 text-sm">بدون حساب فرعي ({direct.count})</span>
              <Amount cents={direct.cents} />
            </Link>
          )}
          {account.children.length === 0 && own.count === 0 && <p className="py-2 text-xs text-ink-400">لا توجد حركات على هذا الحساب</p>}
        </div>
      )}
    </div>
  );
}

export function ChartOfAccountsPage() {
  const { data: categories, isLoading } = useCategories();
  const { data: totals } = useAccountTotals();
  const { data: funding } = useFunding();
  const { data: ledgerAccounts } = useAccountingAccounts();
  // Where each system account's movements come from (nobody posts to them by hand).
  const SOURCE: Record<string, string> = {
    "1110": "التمويل + الإيداعات − الفواتير المدفوعة",
    "1200": "الاشتراكات المدفوعة − الإيداعات وعمولاتها",
    "1300": "فواتير اتدفعت قبل الشهر اللي تخصه",
    "2110": "أجور شهر لسه متحوّلتش",
    "2120": "مصروفات شهر لسه متدفعتش",
    "2200": "فواتير دفعها شريك من جيبه",
    "2300": "اشتراكات مدفوعة مقدّمًا",
    "4100": "قسم الاشتراكات (السعر قبل الخصم)",
    "4900": "خصومات الاشتراكات",
  };
  const otherAccounts = (ledgerAccounts ?? []).filter((a) => a.type !== "expense" && a.code !== "3100" && a.code !== "3000");

  const roots = useMemo(() => [...(categories ?? [])].sort((a, b) => (a.code ?? "~").localeCompare(b.code ?? "~")), [categories]);
  const { data: budgetLines } = useBudgetLines({});
  const lineOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const bl of budgetLines ?? []) if (bl.status !== "archived") for (const c of bl.categories) m.set(c.id, bl.name);
    return m;
  }, [budgetLines]);
  const canCreateAccount = usePermission(PERMISSIONS.FINANCE_CATEGORY_CREATE);
  const createRoot = useCreateCategory();
  const [addingRoot, setAddingRoot] = useState(false);
  const rows = totals ?? [];
  const grand = rows.reduce((s, r) => s + toCents(r.total), 0);

  const fundingRows = funding ?? [];
  const fundingTotal = fundingRows.reduce((s, f) => s + toCents(f.amount), 0);
  const fundingBySource = Array.from(new Set(fundingRows.map((f) => f.source_name))).map((name) => ({
    name,
    cents: fundingRows.filter((f) => f.source_name === name).reduce((s, f) => s + toCents(f.amount), 0),
  }));
  const [fundingOpen, setFundingOpen] = useState(false);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">شجرة الحسابات</h1>
          <p className="mt-1 text-sm text-ink-500">دليل الحسابات الموحّد: الفواتير بتتسجّل على حساباته، وبنود الميزانية بتتربط بمجموعاته.</p>
        </div>
        {canCreateAccount && !addingRoot && (
          <Button variant="primary" size="lg" onClick={() => setAddingRoot(true)}>
            <Plus size={17} />
            حساب رئيسي
          </Button>
        )}
      </div>
      {addingRoot && (
        <Card className="mb-5 p-4">
          <p className="mb-1 text-sm font-semibold text-ink-800">حساب مصروفات رئيسي جديد</p>
          <AccountEditor
            codeHint="5x00"
            saving={createRoot.isPending}
            onCancel={() => setAddingRoot(false)}
            onSave={async (name, code) => {
              await createRoot.mutateAsync({ name, code: code || null, parent_id: null });
              setAddingRoot(false);
            }}
          />
        </Card>
      )}

      <Card className="mb-5 p-5">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : roots.length === 0 ? (
          <EmptyState icon={FolderTree} title="لا توجد حسابات بعد" description="أضف أول حساب رئيسي من الزرار فوق" />
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between px-2 pb-2 text-xs font-semibold text-ink-500">
              <span>حسابات المصروفات (5000)</span>
              <span>الإجمالي</span>
            </div>
            {roots.map((c, i) => (
              <AccountNode key={c.id} account={c} totals={rows} defaultOpen={i === 0} budgetLine={lineOf.get(c.id)} />
            ))}
            <div className="mt-2 flex items-center justify-between rounded-lg bg-ink-50 px-3 py-3">
              <span className="text-sm font-semibold text-ink-700">إجمالي المصروفات</span>
              <Amount cents={grand} bold />
            </div>
          </>
        )}
      </Card>

      <Card className="mb-5 p-5">
        <div className="mb-1 flex items-center justify-between px-2 pb-2 text-xs font-semibold text-ink-500">
          <span>حسابات النظام (1000 – 4000)</span>
          <span>الرصيد</span>
        </div>
        {otherAccounts.map((a) => (
          <Link
            key={a.code}
            to={`/finance/accounting/ledger?account=${a.code}`}
            className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-ink-50"
            style={{ paddingRight: `${8 + a.level * 18}px` }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <CodeTag code={a.code} />
              <span className="min-w-0">
                <span className={`block truncate text-sm ${a.has_children ? "font-semibold text-ink-900" : "font-medium text-ink-800"}`}>{a.name}</span>
                {SOURCE[a.code] && <span className="block truncate text-[12px] text-ink-400">{SOURCE[a.code]}</span>}
              </span>
            </div>
            {!a.has_children || Number(a.balance) !== 0 ? <Money v={a.balance} dash bold={a.has_children} /> : null}
          </Link>
        ))}
      </Card>

      <Card className="p-5">
        <button onClick={() => setFundingOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-start transition-colors hover:bg-ink-50">
          <div className="flex items-center gap-2.5">
            {fundingOpen ? <ChevronDown size={15} className="text-ink-400" /> : <ChevronLeft size={15} className="text-ink-400" />}
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
              <Landmark size={14} />
            </span>
            <CodeTag code="3100" />
            <span className="text-[14.5px] font-semibold text-ink-900">تمويل الشركاء (تحويلات واردة)</span>
          </div>
          <Amount cents={fundingTotal} bold />
        </button>
        {fundingOpen && (
          <div className="mr-5 mt-1 space-y-0.5 border-r border-ink-100 pr-4">
            {fundingBySource.map((s) => (
              <div key={s.name} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-800">{s.name}</span>
                <Amount cents={s.cents} />
              </div>
            ))}
            <Link to="/finance/funding" className="link-underline inline-block py-2 text-[13px] font-medium text-brand-600">
              عرض كل التحويلات
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
