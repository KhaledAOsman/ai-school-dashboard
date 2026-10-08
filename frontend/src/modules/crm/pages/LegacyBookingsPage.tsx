import { Link } from "react-router-dom";
import { CalendarCheck, Trash2 } from "lucide-react";
import { translate } from "@/i18n";
import { useLeadsSearch, usePromoteLegacyBooking, useDeleteLead } from "@/modules/crm/hooks/useCRM";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

function LegacyRow({ id, name, phone, notes }: { id: string; name: string; phone: string; notes: string | null }) {
  const promote = usePromoteLegacyBooking(id);
  const del = useDeleteLead(id);
  const busy = promote.isPending || del.isPending;

  async function remove() {
    if (!window.confirm(`حذف بيانات الطالب «${name}» نهائياً؟ لا يمكن التراجع.`)) return;
    try {
      await del.mutateAsync();
    } catch (e: any) {
      window.alert(e?.response?.data?.detail || "تعذر الحذف");
    }
  }

  return (
    <div className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm transition-colors hover:bg-ink-50/70">
      <Link to={`/crm/leads/${id}`} className="col-span-3 truncate text-[15px] font-medium text-ink-900 hover:text-brand-600">{name}</Link>
      <div className="ltr-content col-span-2 text-[13px] text-ink-500">{phone}</div>
      <div className="col-span-3 line-clamp-2 text-[13px] leading-snug text-ink-500" title={notes ?? ""}>{notes || "—"}</div>
      <div className="col-span-3 flex flex-wrap justify-center gap-1.5">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => promote.mutate(undefined)}>تحويل للحجوزات</Button>
        <Button size="sm" variant="success" disabled={busy} onClick={() => promote.mutate(true)}>حضر</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => promote.mutate(false)}>لم يحضر</Button>
      </div>
      <div className="col-span-1 flex justify-center">
        <button onClick={remove} disabled={busy} title="حذف الطالب" className="rounded-full p-2 text-danger-600 transition-colors hover:bg-danger-50 disabled:opacity-40">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

/** System administrator only: customers recorded as "تم الحجز" in the old
 * sheet who never got a lecture appointment. The administrator moves each
 * one into الحجوزات and then records حضر / لم يحضر (or does both at once). */
export function LegacyBookingsPage() {
  const { data, isLoading } = useLeadsSearch({ page: 1, page_size: 200, group: "legacy" });
  const items = data?.items ?? [];

  return (
    <div className="max-w-none">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">تم الحجز بدون موعد</h1>
        <p className="mt-1 text-sm text-ink-500">
          {data
            ? `${data.total.toLocaleString("ar-SA-u-nu-latn")} عميل من البيانات القديمة، بانتظار تحويلهم إلى الحجوزات وتسجيل الحضور`
            : "بيانات قديمة لعملاء حُجز لهم قبل نظام المواعيد"}
        </p>
      </div>
      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-500">{translate("ar", "common_loading")}</p>
        ) : items.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="لا توجد حجوزات قديمة بدون موعد" />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-2 border-b border-ink-100 bg-ink-50/70 px-4 py-3 text-[14px] font-semibold text-ink-500">
              <div className="col-span-3">الاسم</div>
              <div className="col-span-2">الهاتف</div>
              <div className="col-span-3">ملاحظات</div>
              <div className="col-span-3 text-center">الإجراء</div>
              <div className="col-span-1 text-center">حذف</div>
            </div>
            <div className="divide-y divide-ink-100">
              {items.map((l) => (
                <LegacyRow key={l.id} id={l.id} name={l.full_name} phone={l.phone} notes={l.notes} />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
