import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";

const TABS = [
  { to: ".", label: "نظرة عامة", end: true },
  { to: "journal", label: "دفتر اليومية" },
  { to: "ledger", label: "دفتر الأستاذ" },
  { to: "trial-balance", label: "ميزان المراجعة" },
  { to: "income-statement", label: "قائمة الدخل" },
  { to: "balance-sheet", label: "المركز المالي" },
  { to: "cash-flow", label: "التدفقات النقدية" },
];

/** Shell of the accounting area: one page title + a tab strip for the books and statements. */
export function AccountingLayout() {
  return (
    <div className="max-w-6xl">
      <div className="print:hidden">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">المحاسبة</h1>
        <p className="mt-1 text-sm text-ink-500">القيود والدفاتر والقوائم المالية — بتتولّد تلقائيًا من المصروفات والتمويل والإيرادات</p>
        <div className="thin-scrollbar -mx-1 mt-5 mb-6 flex gap-1 overflow-x-auto border-b border-ink-150 px-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                clsx(
                  "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-[14.5px] font-semibold transition-colors",
                  isActive ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
