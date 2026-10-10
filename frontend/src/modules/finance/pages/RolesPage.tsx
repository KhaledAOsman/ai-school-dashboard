import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, Plus, ShieldCheck } from "lucide-react";
import { adminApi, type AdminPermission, type AdminRole } from "@/modules/finance/services/adminApi";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

/** Arabic names for every permission, grouped the way the app is organised. */
const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "المصروفات والفواتير",
    items: [
      ["finance.expense.view", "عرض الفواتير والمصروفات"],
      ["finance.expense.create", "إضافة فاتورة"],
      ["finance.expense.update", "تعديل فاتورة"],
      ["finance.expense.submit", "إرسال فاتورة للاعتماد"],
      ["finance.expense.approve", "اعتماد الفواتير"],
      ["finance.expense.reject", "رفض الفواتير"],
      ["finance.expense.delete", "أرشفة فاتورة / حذف إيداع"],
      ["finance.expense.restore_version", "استرجاع نسخة سابقة من فاتورة"],
      ["finance.attachment.upload", "رفع مرفقات"],
      ["finance.attachment.download", "تحميل مرفقات"],
      ["finance.attachment.delete", "حذف مرفقات"],
    ],
  },
  {
    title: "المحاسبة والتقارير",
    items: [
      ["finance.report.view", "عرض القوائم المالية والتقارير"],
      ["finance.report.export", "تصدير التقارير"],
      ["finance.category.view", "عرض شجرة الحسابات"],
      ["finance.category.create", "إضافة حساب"],
      ["finance.category.update", "تعديل حساب"],
      ["finance.category.delete", "أرشفة حساب"],
    ],
  },
  {
    title: "الميزانية",
    items: [
      ["finance.budget.view", "عرض بنود الميزانية"],
      ["finance.budget.create", "إضافة بند ميزانية"],
      ["finance.budget.update", "تعديل بند ميزانية"],
      ["finance.budget.submit", "إرسال بند للاعتماد"],
      ["finance.budget.approve", "اعتماد بنود الميزانية"],
      ["finance.budget.reject", "رفض بنود الميزانية"],
      ["finance.budget.archive", "أرشفة بند ميزانية"],
    ],
  },
  {
    title: "الموظفين",
    items: [
      ["finance.staff.view", "عرض الموظفين ومدفوعاتهم"],
      ["finance.staff.create", "إضافة موظف"],
      ["finance.staff.update", "تعديل موظف وراتبه"],
    ],
  },
  {
    title: "الاشتراكات والحملات",
    items: [
      ["subscriptions.view", "عرض الاشتراكات المدفوعة"],
      ["subscriptions.manage", "إضافة وتعديل الاشتراكات"],
      ["campaigns.view", "عرض الحملات الإعلانية"],
      ["campaigns.manage", "إضافة وتعديل الحملات"],
    ],
  },
  {
    title: "العملاء (CRM)",
    items: [
      ["crm.lead.view", "عرض العملاء المسندين له"],
      ["crm.lead.view_all", "عرض كل العملاء وإعادة توزيعهم"],
      ["crm.lead.create", "إضافة عملاء جدد"],
      ["crm.lead.manage", "متابعة العملاء (حجز، حضور، تحويل…)"],
      ["crm.lead.legacy_booking", "تحويل الحجوزات القديمة"],
      ["crm.lead.delete", "حذف عميل نهائيًا"],
      ["crm.teacher.view", "عرض المعلمين ومواعيدهم"],
      ["crm.teacher.manage", "إدارة المعلمين ومواعيدهم"],
    ],
  },
  {
    title: "لوحات المؤشرات",
    items: [
      ["dashboards.view", "عرض لوحات المؤشرات"],
      ["dashboards.kpi.view", "عرض مؤشرات أداء المشروع"],
      ["dashboards.manage", "إعداد لوحات المؤشرات"],
    ],
  },
  {
    title: "الإدارة والأمان",
    items: [
      ["users.view", "عرض المستخدمين"],
      ["users.create", "إضافة مستخدم"],
      ["users.update", "تعديل مستخدم وأدواره"],
      ["users.disable", "إيقاف مستخدم"],
      ["roles.view", "عرض الأدوار"],
      ["roles.create", "إضافة دور"],
      ["roles.update", "تعديل صلاحيات الأدوار"],
      ["roles.delete", "حذف دور"],
      ["permissions.view", "عرض الصلاحيات"],
      ["audit.view", "سجل العمليات"],
      ["security_logs.view", "سجل الأمان"],
      ["settings.view", "عرض الإعدادات"],
      ["settings.manage", "تعديل الإعدادات"],
    ],
  },
];

const ROLE_NAME_AR: Record<string, string> = {
  Owner: "المالك",
  Admin: "مدير النظام",
  "Finance Manager": "المدير المالي",
  Director: "المدير",
  "General Manager": "المدير العام",
  "Sales Rep": "مندوب مبيعات",
  "Sales Manager": "مدير المبيعات",
  "Sales-Call center": "مبيعات — كول سنتر",
  Kpi: "مؤشرات الأداء (عرض فقط)",
};

/** Checkbox matrix, one group per area, with "select all" per group. */
function PermissionPicker({
  all,
  selected,
  onChange,
  disabled,
}: {
  all: AdminPermission[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const known = new Set(GROUPS.flatMap((g) => g.items.map(([c]) => c)));
  const exists = new Set(all.map((p) => p.code));
  const extra = all.filter((p) => !known.has(p.code));
  const groups = [
    ...GROUPS.map((g) => ({ ...g, items: g.items.filter(([c]) => exists.has(c)) })),
    ...(extra.length ? [{ title: "أخرى", items: extra.map((p) => [p.code, p.description ?? p.code] as [string, string]) }] : []),
  ].filter((g) => g.items.length > 0);

  function toggle(codes: string[], on: boolean) {
    const next = new Set(selected);
    for (const c of codes) {
      if (on) next.add(c);
      else next.delete(c);
    }
    onChange(next);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {groups.map((g) => {
        const codes = g.items.map(([c]) => c);
        const allOn = codes.every((c) => selected.has(c));
        return (
          <div key={g.title} className="rounded-xl border border-ink-100 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[14px] font-bold text-ink-900">{g.title}</p>
              {!disabled && (
                <button type="button" onClick={() => toggle(codes, !allOn)} className="text-[12.5px] font-medium text-brand-600">
                  {allOn ? "إلغاء الكل" : "تحديد الكل"}
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {g.items.map(([code, label]) => (
                <label key={code} className={`flex items-center gap-2.5 text-[13.5px] ${disabled ? "text-ink-500" : "cursor-pointer text-ink-800"}`}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selected.has(code)}
                    onChange={(e) => toggle([code], e.target.checked)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoleRow({ role, all, canUpdate, canDelete }: { role: AdminRole; all: AdminPermission[]; canUpdate: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permission_codes));
  const isOwner = role.name === "Owner";
  const update = useMutation({
    mutationFn: (codes: string[]) => adminApi.updateRole(role.id, { permission_codes: codes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-roles"] }),
  });
  const remove = useMutation({
    mutationFn: () => adminApi.deleteRole(role.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-roles"] }),
  });
  const dirty = useMemo(() => {
    const a = new Set(role.permission_codes);
    return a.size !== selected.size || [...selected].some((c) => !a.has(c));
  }, [role.permission_codes, selected]);

  return (
    <div className="px-5 py-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-start">
        <span className="flex items-center gap-2.5">
          {open ? <ChevronDown size={15} className="text-ink-400" /> : <ChevronLeft size={15} className="text-ink-400" />}
          <span className="text-[15px] font-semibold text-ink-900">{ROLE_NAME_AR[role.name] ?? role.name}</span>
          {ROLE_NAME_AR[role.name] && <span className="ltr-content text-[12px] text-ink-400">{role.name}</span>}
        </span>
        <span className="text-[13px] text-ink-500">{isOwner ? "كل الصلاحيات" : `${role.permission_codes.length} صلاحية`}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {isOwner && <p className="text-[13px] text-ink-500">المالك معاه كل الصلاحيات دايمًا.</p>}
          <PermissionPicker all={all} selected={selected} onChange={setSelected} disabled={isOwner || !canUpdate} />
          {!isOwner && (canUpdate || canDelete) && (
            <div className="flex flex-wrap gap-2">
              {canUpdate && (
                <Button size="sm" variant="primary" disabled={!dirty} isLoading={update.isPending} onClick={() => update.mutate([...selected])}>
                  حفظ الصلاحيات
                </Button>
              )}
              {canUpdate && dirty && (
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(role.permission_codes))}>
                  تراجع
                </Button>
              )}
              {canDelete && !role.is_system_role && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (window.confirm("حذف الدور ده؟")) remove.mutate();
                  }}
                >
                  حذف الدور
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RolesPage() {
  const qc = useQueryClient();
  const { data: roles } = useQuery({ queryKey: ["admin-roles"], queryFn: adminApi.listRoles });
  const { data: permissions } = useQuery({ queryKey: ["admin-permissions"], queryFn: adminApi.listPermissions });
  const canCreate = usePermission(PERMISSIONS.ROLES_CREATE);
  const canUpdate = usePermission(PERMISSIONS.ROLES_UPDATE);
  const canDelete = usePermission(PERMISSIONS.ROLES_DELETE);

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: adminApi.createRole,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-roles"] }),
  });

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("اكتب اسم الدور");
      return;
    }
    try {
      await create.mutateAsync({ name: name.trim(), permission_codes: [...selected] });
      setName("");
      setSelected(new Set());
      setShowNew(false);
    } catch {
      setError("الاسم مستخدم قبل كده أو حصل خطأ");
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الأدوار والصلاحيات</h1>
          <p className="mt-1 text-sm text-ink-500">كل مستخدم بياخد صلاحياته من الأدوار اللي معاه (من صفحة المستخدمين).</p>
        </div>
        {canCreate && !showNew && (
          <Button variant="primary" size="lg" onClick={() => setShowNew(true)}>
            <Plus size={17} />
            دور جديد
          </Button>
        )}
      </div>

      {showNew && (
        <Card className="mb-5 animate-scale-in space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-brand-600" />
            <h2 className="text-[16px] font-bold text-ink-900">دور جديد</h2>
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الدور (مثال: محاسب)" />
          <PermissionPicker all={permissions ?? []} selected={selected} onChange={setSelected} />
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex gap-2">
            <Button variant="primary" isLoading={create.isPending} onClick={save}>
              حفظ
            </Button>
            <Button variant="ghost" onClick={() => setShowNew(false)}>
              إلغاء
            </Button>
          </div>
        </Card>
      )}

      <Card className="divide-y divide-ink-100 p-0">
        {(roles ?? []).map((r) => (
          <RoleRow key={r.id} role={r} all={permissions ?? []} canUpdate={canUpdate} canDelete={canDelete} />
        ))}
      </Card>
    </div>
  );
}
