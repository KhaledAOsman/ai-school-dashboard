import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Users, GraduationCap, FolderPlus, ChevronDown, ChevronLeft } from "lucide-react";
import { translate } from "@/i18n";
import {
  useStaffGrouped,
  useStaffDepartments,
  useCreateStaff,
  useUpdateStaff,
  useCreateStaffDepartment,
} from "@/modules/finance/hooks/useBudget";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useExpenses } from "@/modules/finance/hooks/useFinance";
import { formatSAR, periodLabel } from "@/modules/finance/utils";
import type { StaffMember } from "@/modules/finance/services/budgetApi";

/** Payments made to one person, newest first (loaded only when expanded). */
function StaffPayments({ staffId }: { staffId: string }) {
  const { data: payments, isLoading } = useExpenses({ staff_id: staffId, limit: 200 });
  if (isLoading) return <p className="py-2 text-xs text-ink-400">جارٍ التحميل...</p>;
  if (!payments || payments.length === 0) return <p className="py-2 text-xs text-ink-400">لا توجد دفعات مسجّلة لهذا الشخص بعد</p>;
  return (
    <div className="divide-y divide-ink-100">
      {payments.map((p) => (
        <Link key={p.id} to={`/finance/expenses/${p.id}`} className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:text-brand-700">
          <span className="text-ink-700">
            <span className="ltr-content text-ink-500">{p.expense_date}</span>
            {p.period_month && <span className="mr-2 text-[12.5px] text-ink-400">عن {periodLabel(p.period_month)}</span>}
          </span>
          <span className={`ltr-content font-semibold ${p.status === "cancelled" ? "text-ink-300 line-through" : "text-ink-800"}`}>{formatSAR(p.amount)}</span>
        </Link>
      ))}
    </div>
  );
}

function StaffRow({ member, canUpdate, canPay }: { member: StaffMember; canUpdate: boolean; canPay: boolean }) {
  const updateStaff = useUpdateStaff(member.id);
  const [open, setOpen] = useState(false);
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 items-center gap-2.5 text-start">
          {open ? <ChevronDown size={14} className="shrink-0 text-ink-400" /> : <ChevronLeft size={14} className="shrink-0 text-ink-400" />}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <GraduationCap size={14} />
          </span>
          <span className="truncate text-sm font-medium text-ink-900">{member.full_name}</span>
          {!member.is_active && <Badge tone="neutral">غير نشط</Badge>}
        </button>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-left">
            <p className="ltr-content text-sm font-semibold text-ink-800">{formatSAR(member.total_paid)}</p>
            <p className="text-[12px] text-ink-400">{member.payments_count} دفعة</p>
          </div>
          {canPay && (
            <Link to={`/finance/expenses/new?staff=${member.id}`} className="link-underline hidden text-xs font-medium text-brand-600 sm:inline">
              تسجيل دفعة
            </Link>
          )}
          {canUpdate && (
            <button onClick={() => updateStaff.mutate({ is_active: !member.is_active })} className="link-underline hidden text-xs font-medium text-ink-500 sm:inline">
              {member.is_active ? "إلغاء التفعيل" : "تفعيل"}
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mr-10 mt-2 rounded-lg bg-ink-50/60 px-3 py-1">
          <StaffPayments staffId={member.id} />
          <div className="flex gap-4 pb-2 pt-1 sm:hidden">
            {canPay && (
              <Link to={`/finance/expenses/new?staff=${member.id}`} className="text-xs font-medium text-brand-600">
                تسجيل دفعة
              </Link>
            )}
            {canUpdate && (
              <button onClick={() => updateStaff.mutate({ is_active: !member.is_active })} className="text-xs font-medium text-ink-500">
                {member.is_active ? "إلغاء التفعيل" : "تفعيل"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** One department section with its headcount and what was actually paid out. */
function DepartmentSection({
  departmentName,
  memberCount,
  totalPaid,
  members,
  canUpdate,
  canPay,
}: {
  departmentName: string;
  memberCount: number;
  totalPaid: string;
  members: StaffMember[];
  canUpdate: boolean;
  canPay: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-semibold text-ink-900">{departmentName}</h3>
          <p className="mt-0.5 text-xs text-ink-500">{memberCount} فرد</p>
        </div>
        <div className="text-left">
          <p className="ltr-content text-lg font-bold text-ink-900">{formatSAR(totalPaid)}</p>
          <p className="text-xs text-ink-400">إجمالي المدفوع</p>
        </div>
      </div>
      {members.length > 0 ? (
        <div className="mt-3 divide-y divide-ink-100 border-t border-ink-100 pt-1">
          {members.map((m) => (
            <StaffRow key={m.id} member={m} canUpdate={canUpdate} canPay={canPay} />
          ))}
        </div>
      ) : (
        <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-400">لا يوجد أفراد في هذا القسم بعد</p>
      )}
    </Card>
  );
}

function AddDepartmentInline({ onDone }: { onDone: (newId: string) => void }) {
  const [name, setName] = useState("");
  const createDept = useCreateStaffDepartment();

  async function handleAdd() {
    if (!name.trim()) return;
    const created = await createDept.mutateAsync(name.trim());
    setName("");
    onDone(created.id);
  }

  return (
    // Deliberately a <div>, not a nested <form> - this sits inside the
    // parent "New staff member" <form>, and HTML does not support nested
    // forms (the browser silently breaks submission handling if you try).
    <div className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        placeholder="اكتب اسم قسم جديد..."
        className="flex-1"
      />
      <Button type="button" variant="outline" size="md" isLoading={createDept.isPending} onClick={handleAdd}>
        <FolderPlus size={15} />
        إضافة القسم
      </Button>
    </div>
  );
}

export function StaffPage() {
  const { data: grouped, isLoading } = useStaffGrouped(true);
  const { data: departments } = useStaffDepartments();
  const createStaff = useCreateStaff();
  const canCreate = usePermission(PERMISSIONS.FINANCE_STAFF_CREATE);
  const canUpdate = usePermission(PERMISSIONS.FINANCE_STAFF_UPDATE);
  const canPay = usePermission(PERMISSIONS.FINANCE_EXPENSE_CREATE);

  const [showForm, setShowForm] = useState(false);
  const [showAddDept, setShowAddDept] = useState(false);
  const [fullName, setFullName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [email, setEmail] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!departmentId) return;
    await createStaff.mutateAsync({
      full_name: fullName,
      department_id: departmentId,
      email: email || null,
    });
    setFullName("");
    setEmail("");
    setShowForm(false);
  }

  const totalHeadcount = (grouped ?? []).reduce((sum, g) => sum + g.member_count, 0);
  const grandTotalPaid = (grouped ?? []).reduce((sum, g) => sum + Number(g.total_paid), 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الموظفين</h1>
          <p className="mt-1 text-sm text-ink-500">
            {totalHeadcount} فرد — إجمالي المدفوع لهم {formatSAR(grandTotalPaid)} (الأجر بالإنجاز، بيتسجّل من «مصروف جديد»)
          </p>
        </div>
        {canCreate && !showForm && (
          <Button variant="primary" size="lg" onClick={() => setShowForm(true)}>
            <Plus size={17} />
            إضافة فرد
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mb-5 animate-scale-in">
          <CardHeader>
            <CardTitle>فرد جديد</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="الاسم الكامل">
                <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </FormField>
              <FormField label="القسم">
                <Select required value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">اختر قسمًا</option>
                  {(departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            {!showAddDept ? (
              <button
                type="button"
                onClick={() => setShowAddDept(true)}
                className="link-underline flex items-center gap-1.5 text-xs font-medium text-brand-600"
              >
                <FolderPlus size={13} />
                القسم مش موجود؟ أضِف قسمًا جديدًا
              </button>
            ) : (
              <AddDepartmentInline
                onDone={(newId) => {
                  setDepartmentId(newId);
                  setShowAddDept(false);
                }}
              />
            )}

            <FormField label="البريد الإلكتروني (اختياري)" hint="مفيش راتب ثابت: كل دفعة بتتسجّل بمبلغها الفعلي من صفحة الفواتير.">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ltr-content text-left" />
            </FormField>
            <div className="flex gap-3">
              <Button type="submit" variant="primary" isLoading={createStaff.isPending}>
                {translate("ar", "common_save")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                {translate("ar", "common_cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-500">{translate("ar", "common_loading")}</p>
      ) : (grouped ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="لا توجد أقسام بعد" description="أضف قسمًا وفردًا من زرار 'إضافة فرد'" />
        </Card>
      ) : (
        <div className="space-y-4">
          {(grouped ?? []).map((g) => (
            <DepartmentSection
              key={g.department_id}
              departmentName={g.department_name}
              memberCount={g.member_count}
              totalPaid={g.total_paid}
              members={g.members}
              canUpdate={canUpdate}
              canPay={canPay}
            />
          ))}
        </div>
      )}
    </div>
  );
}
