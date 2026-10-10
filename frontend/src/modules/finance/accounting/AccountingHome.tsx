import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAccountingChecks, useBalanceSheet, useIncomeStatement } from "@/modules/finance/hooks/useAccounting";
import { Money } from "@/modules/finance/accounting/shared";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-[14px] font-medium text-ink-500">{label}</p>
      <p className="mt-2 text-[26px] font-bold tracking-tight">
        <Money v={value} bold className="!text-[26px]" />
        <span className="mr-1.5 text-sm font-medium text-ink-400">ر.س</span>
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}

const RULES = [
  ["مصروف معتمد", "من حساب المصروف (مدين) إلى النقدية 1110 (دائن)، وإذا دفعه شريك بالنيابة يروح لحساب 2200 «مستحق للشركاء»"],
  ["راتب شهر بيتحوّل في الشهر اللي بعده", "آخر الشهر المستحق: مصروف (مدين) ↔ أجور مستحقة 2110 (دائن). يوم التحويل: 2110 (مدين) ↔ النقدية (دائن)"],
  ["رسوم التحويل الدولي (17.00 / 17.25)", "مصروف مستقل على 5710 مع ربطه بالشخص"],
  ["تحويل شريك", "النقدية 1110 (مدين) ↔ تمويل الشركاء 3100 (دائن) — مش إيراد"],
  ["اشتراك طالب", "النقدية (مدين) + خصم 4900 (مدين) ↔ إيرادات اشتراكات 4100 (دائن بالسعر قبل الخصم)"],
];

export function AccountingHome() {
  const { data: checks } = useAccountingChecks();
  const { data: bs } = useBalanceSheet({});
  const { data: is } = useIncomeStatement({});

  const cash = bs?.assets.find((a) => a.code === "1110")?.amount ?? "0";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="رصيد النقدية" value={cash} hint="حساب التشغيل 1110" />
        <Kpi label="إجمالي الإيرادات" value={is?.total_revenue ?? "0"} hint="اشتراكات الطلاب بعد الخصم" />
        <Kpi label="إجمالي المصروفات" value={is?.total_expenses ?? "0"} hint="على أساس الاستحقاق (الشهر اللي يخصه)" />
        <Kpi label="صافي النتيجة" value={is?.net_income ?? "0"} hint="الإيرادات − المصروفات" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>فحوصات التطابق</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-ink-500">كل فحص بيقارن الدفاتر بالسجلات اللي الفريق بيشتغل عليها. لازم الكل يكون سليم قبل ما تسلّم للمحاسب.</p>
        <div className="divide-y divide-ink-100">
          {(checks ?? []).map((c) => (
            <div key={c.name} className="flex items-start gap-3 py-3">
              {c.info ? (
                <Info size={18} className="mt-0.5 shrink-0 text-ink-400" />
              ) : c.ok ? (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-600" />
              ) : (
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium text-ink-900">{c.name}</p>
                {c.note && <p className="mt-0.5 text-xs text-ink-500">{c.note}</p>}
              </div>
              <div className="text-left">
                <Money v={c.ledger} bold />
                {!c.info && <p className="text-[11.5px] text-ink-400">السجل: <span className="ltr-content">{Number(c.source).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></p>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إزاي بتتسجّل القيود</CardTitle>
        </CardHeader>
        <div className="divide-y divide-ink-100">
          {RULES.map(([t, d]) => (
            <div key={t} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
              <p className="text-[14.5px] font-semibold text-ink-900">{t}</p>
              <p className="text-sm text-ink-600">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-500">
          المصروفات اللي لسه مسودة أو منتظرة اعتماد أو مرفوضة أو ملغية مش بتدخل الدفاتر. التعديلات المحاسبية بتتسجّل من <Link to="journal" className="font-medium text-brand-600 hover:underline">دفتر اليومية ← قيد يدوي</Link>.
        </p>
      </Card>
    </div>
  );
}
