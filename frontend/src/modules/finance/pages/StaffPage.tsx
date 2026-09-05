import { useState, type FormEvent } from "react";
import { Plus, Users, GraduationCap, FolderPlus } from "lucide-react";
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

function formatSAR(value: string | number | null): string {
  if (value === null) return "—";
  return `${Number(value).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

function StaffRow({ id, fullName, salary, active, canUpdate }: { id: string; fullName: string; salary: string | null; active: boolean; canUpdate: boolean }) {
  const updateStaff = useUpdateStaff(id);
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <GraduationCap size={14} />
        </span>
        <span className="text-sm font-medium text-ink-900">{fullName}</span>
        {!active && <Badge tone="neutral">غير نشط</Badge>}
      </div>
      <div className="flex items-center gap-4">
        <span className="ltr-content text-sm font-semibold text-ink-800">{formatSAR(salary)}</span>
        {canUpdate && (
          <button onClick={() => updateStaff.mutate({ is_active: !active })} className="link-underline text-xs font-medium text-brand-600">
            {active ? "إلغاء التفعيل" : "تفعيل"}
          </button>
        )}
      </div>
    </div>
  );
}

/** One collapsible department section with its headcount + salary rollup. */
function DepartmentSection({
  departmentName,
  memberCount,
  totalSalary,
  members,
  canUpdate,
}: {
  departmentName: string;
  memberCount: number;
  totalSalary: string;
  members: { id: string; full_name: string; base_salary: string | null; is_active: boolean }[];
  canUpdate: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-ink-900">{departmentName}</h3>
          <p className="mt-0.5 text-xs text-ink-500">{memberCount} فرد</p>
        </div>
        <div className="text-left">
          <p className="ltr-content text-lg font-bold text-ink-900">{formatSAR(totalSalary)}</p>
          <p className="text-xs text-ink-400">إجمالي الرواتب</p>
        </div>
      </div>
      {members.length > 0 ? (
        <div className="mt-3 divide-y divide-ink-100 border-t border-ink-100 pt-1">
          {members.map((m) => (
            <StaffRow key={m.id} id={m.id} fullName={m.full_name} salary={m.base_salary} active={m.is_active} canUpdate={canUpdate} />
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

  const [showForm, setShowForm] = useState(false);
  const [showAddDept, setShowAddDept] = useState(false);
  const [fullName, setFullName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [salary, setSalary] = useState("");
  const [email, setEmail] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!departmentId) return;
    await createStaff.mutateAsync({
      full_name: fullName,
      department_id: departmentId,
      base_salary: salary || null,
      email: email || null,
    });
    setFullName("");
    setSalary("");
    setEmail("");
    setShowForm(false);
  }

  const totalHeadcount = (grouped ?? []).reduce((sum, g) => sum + g.member_count, 0);
  const grandTotalSalary = (grouped ?? []).reduce((sum, g) => sum + Number(g.total_salary), 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الموظفين</h1>
          <p className="mt-1 text-sm text-ink-500">
            {totalHeadcount} فرد إجمالًا — بإجمالي رواتب {formatSAR(grandTotalSalary)}
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

            <div className="grid grid-cols-2 gap-4">
              <FormField label="الراتب الأساسي (ر.س)">
                <Input type="number" step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} className="ltr-content" />
              </FormField>
              <FormField label="البريد الإلكتروني (اختياري)">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ltr-content text-left" />
              </FormField>
            </div>
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
              totalSalary={g.total_salary}
              members={g.members}
              canUpdate={canUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
