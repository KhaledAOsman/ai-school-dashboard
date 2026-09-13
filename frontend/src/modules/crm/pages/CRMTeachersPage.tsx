import { useState, type FormEvent } from "react";
import { Plus, GraduationCap, CalendarPlus, Video, Pencil } from "lucide-react";
import { translate } from "@/i18n";
import { useCRMTeachers, useCreateCRMTeacher, useUpdateCRMTeacher, useAddTeacherSlot } from "@/modules/crm/hooks/useCRM";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";

function AddSlotInline({ teacherId }: { teacherId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const addSlot = useAddTeacherSlot(teacherId);

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
      >
        <CalendarPlus size={13} />
        إضافة موعد
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ltr-content w-36" />
      <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="ltr-content w-28" />
      <Button
        size="sm"
        variant="primary"
        disabled={!date || !time}
        isLoading={addSlot.isPending}
        onClick={async () => {
          await addSlot.mutateAsync({ date, time });
          setDate("");
          setTime("");
          setShowForm(false);
        }}
      >
        حفظ
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
        إلغاء
      </Button>
    </div>
  );
}

function ZoomLinkRow({ teacherId, zoomLink, canManage }: { teacherId: string; zoomLink: string | null; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(zoomLink ?? "");
  const updateTeacher = useUpdateCRMTeacher(teacherId);

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Video size={14} className="shrink-0 text-ink-400" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://zoom.us/j/..."
          className="ltr-content flex-1 text-left"
          autoFocus
        />
        <Button
          size="sm"
          variant="primary"
          isLoading={updateTeacher.isPending}
          onClick={async () => {
            await updateTeacher.mutateAsync({ zoom_link: value || null });
            setEditing(false);
          }}
        >
          حفظ
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(zoomLink ?? ""); }}>
          إلغاء
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Video size={14} className="shrink-0 text-ink-400" />
      {zoomLink ? (
        <a href={zoomLink} target="_blank" rel="noreferrer" className="link-underline truncate text-brand-600">
          {zoomLink}
        </a>
      ) : (
        <span className="text-ink-400">لا يوجد رابط زوم ثابت</span>
      )}
      {canManage && (
        <button onClick={() => setEditing(true)} className="shrink-0 text-ink-400 transition-colors hover:text-brand-600" title="تعديل رابط الزوم">
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
}

export function CRMTeachersPage() {
  const { data: teachers, isLoading } = useCRMTeachers();
  const createTeacher = useCreateCRMTeacher();
  const canManage = usePermission(PERMISSIONS.CRM_TEACHER_MANAGE);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [zoomLink, setZoomLink] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await createTeacher.mutateAsync({ fullName: name, zoomLink: zoomLink || null });
    setName("");
    setZoomLink("");
    setShowForm(false);
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">المعلمين والمواعيد</h1>
          <p className="mt-1 text-sm text-ink-500">المواعيد المتاحة ورابط الزوم الثابت لكل معلّم للمحاضرات المجانية التجريبية</p>
        </div>
        {canManage && !showForm && (
          <Button variant="primary" size="lg" onClick={() => setShowForm(true)}>
            <Plus size={17} />
            معلّم جديد
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mb-5 animate-scale-in">
          <CardHeader>
            <CardTitle>معلّم جديد</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="اسم المعلّم">
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label="رابط الزوم الثابت (اختياري)" hint="سيُستخدم تلقائيًا لكل محاضرة تُحجز مع هذا المعلّم">
                <Input value={zoomLink} onChange={(e) => setZoomLink(e.target.value)} placeholder="https://zoom.us/j/..." className="ltr-content text-left" />
              </FormField>
            </div>
            <div className="flex gap-3">
              <Button type="submit" variant="primary" isLoading={createTeacher.isPending}>
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
      ) : (teachers ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={GraduationCap} title="لا يوجد معلّمون بعد" />
        </Card>
      ) : (
        <div className="space-y-4">
          {(teachers ?? []).map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-ink-900">{t.full_name}</h3>
                {canManage && <AddSlotInline teacherId={t.id} />}
              </div>
              <div className="mt-2.5">
                <ZoomLinkRow teacherId={t.id} zoomLink={t.zoom_link} canManage={canManage} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {t.available_slots.length === 0 ? (
                  <p className="text-xs text-ink-400">لا توجد مواعيد متاحة حاليًا</p>
                ) : (
                  t.available_slots.map((slot) => (
                    <Badge key={slot.id} tone="brand" dot={false}>
                      {slot.slot_date} — {slot.slot_time}
                    </Badge>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
