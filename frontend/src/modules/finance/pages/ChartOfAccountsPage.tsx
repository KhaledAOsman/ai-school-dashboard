import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronLeft, FolderTree, Landmark, Layers } from "lucide-react";
import { translate } from "@/i18n";
import { useAccountTotals, useCategories, useFunding } from "@/modules/finance/hooks/useFinance";
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

/** A top-level account: running total over everything posted to it (and its sub-accounts). */
function AccountNode({ account, totals, defaultOpen }: { account: Category; totals: AccountTotal[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

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
          <span className="truncate text-[14.5px] font-semibold text-ink-900">{account.name}</span>
          {own.count > 0 && <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[12.5px] font-medium text-ink-500">{own.count}</span>}
        </div>
        <Amount cents={own.cents} bold />
      </button>

      {open && (
        <div className="mr-5 space-y-0.5 border-r border-ink-100 pb-3 pr-4">
          {account.children.map((child) => {
            const t = subTotals.get(child.id) ?? { cents: 0, count: 0 };
            return (
              <Link
                key={child.id}
                to={`/finance/expenses?category=${account.id}&sub=${child.id}`}
                className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-ink-50"
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

  const roots = useMemo(() => [...(categories ?? [])].sort((a, b) => (a.code ?? "~").localeCompare(b.code ?? "~")), [categories]);
  const rows = totals ?? [];
  const grand = rows.reduce((s, r) => s + toCents(r.total), 0);
  const grandCount = rows.reduce((s, r) => s + r.count, 0);

  const fundingRows = funding ?? [];
  const fundingTotal = fundingRows.reduce((s, f) => s + toCents(f.amount), 0);
  const fundingBySource = Array.from(new Set(fundingRows.map((f) => f.source_name))).map((name) => ({
    name,
    cents: fundingRows.filter((f) => f.source_name === name).reduce((s, f) => s + toCents(f.amount), 0),
  }));
  const [fundingOpen, setFundingOpen] = useState(false);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-[26px] font-bold tracking-tight text-ink-900">شجرة الحسابات</h1>
      <p className="mb-6 text-sm text-ink-500">كل حساب بكوده وإجماليه، وتحته الحسابات الفرعية. اضغط على حساب فرعي لتشوف فواتيره.</p>

      <Card className="mb-5 p-5">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : roots.length === 0 ? (
          <EmptyState icon={FolderTree} title="لا توجد حسابات بعد" description="أنشئ حسابات من صفحة التصنيفات أولًا" />
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between px-2 pb-2 text-xs font-semibold text-ink-500">
              <span>حسابات المصروفات (5000)</span>
              <span>الإجمالي</span>
            </div>
            {roots.map((c, i) => (
              <AccountNode key={c.id} account={c} totals={rows} defaultOpen={i === 0} />
            ))}
            <div className="mt-2 flex items-center justify-between rounded-lg bg-ink-50 px-3 py-3">
              <span className="text-sm font-semibold text-ink-700">إجمالي المصروفات ({grandCount} دفعة)</span>
              <Amount cents={grand} bold />
            </div>
          </>
        )}
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
