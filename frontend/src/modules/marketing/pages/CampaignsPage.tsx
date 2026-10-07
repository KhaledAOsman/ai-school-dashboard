import { useState, type FormEvent } from "react";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import {
  useCampaigns,
  useCreateCampaign,
  useDeleteCampaign,
  useUpdateCampaign,
} from "@/modules/marketing/hooks/useMarketing";
import type { Campaign, Platform } from "@/modules/marketing/services/marketingApi";
import { apiErrorMessage, formatNumber, formatSAR, PLATFORM_LABELS } from "@/modules/marketing/lib";

interface FormState {
  platform: Platform;
  name: string;
  objective: string;
  spend: string;
  results_count: string;
  results_label: string;
  counts_as_leads: boolean;
  form_leads: string;
  website_leads: string;
  messaging_conversations: string;
  period_start: string;
  period_end: string;
  period_label: string;
  notes: string;
}

const EMPTY: FormState = {
  platform: "snapchat",
  name: "",
  objective: "",
  spend: "",
  results_count: "",
  results_label: "",
  counts_as_leads: false,
  form_leads: "",
  website_leads: "",
  messaging_conversations: "",
  period_start: "",
  period_end: "",
  period_label: "",
  notes: "",
};

export function CampaignsPage() {
  const { data, isLoading } = useCampaigns();
  const create = useCreateCampaign();
  const update = useUpdateCampaign();
  const remove = useDeleteCampaign();
  const canManage = usePermission(PERMISSIONS.CAMPAIGNS_MANAGE);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Platform | "all">("all");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
    setShowForm(true);
  }

  function openEdit(c: Campaign) {
    setEditingId(c.id);
    setForm({
      platform: c.platform,
      name: c.name,
      objective: c.objective ?? "",
      spend: c.spend,
      results_count: c.results_count?.toString() ?? "",
      results_label: c.results_label ?? "",
      counts_as_leads: c.counts_as_leads,
      form_leads: c.form_leads?.toString() ?? "",
      website_leads: c.website_leads?.toString() ?? "",
      messaging_conversations: c.messaging_conversations?.toString() ?? "",
      period_start: c.period_start ?? "",
      period_end: c.period_end ?? "",
      period_label: c.period_label ?? "",
      notes: c.notes ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      platform: form.platform,
      name: form.name.trim(),
      objective: form.objective.trim() || null,
      spend: form.spend || "0",
      results_count: form.results_count === "" ? null : Number(form.results_count),
      results_label: form.results_label.trim() || null,
      counts_as_leads: form.counts_as_leads,
      form_leads: form.form_leads === "" ? null : Number(form.form_leads),
      website_leads: form.website_leads === "" ? null : Number(form.website_leads),
      messaging_conversations: form.messaging_conversations === "" ? null : Number(form.messaging_conversations),
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      period_label: form.period_label.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editingId) await update.mutateAsync({ id: editingId, payload });
      else await create.mutateAsync(payload);
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleDelete(c: Campaign) {
    if (!window.confirm(`حذف الحملة "${c.name}"؟`)) return;
    await remove.mutateAsync(c.id);
  }

  const items = (data?.items ?? []).filter((c) => filter === "all" || c.platform === filter);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الحملات الإعلانية</h1>
          <p className="mt-1 text-sm text-ink-500">
            الإنفاق والنتائج على المنصات الثلاث — إجمالي الإنفاق {isLoading ? "…" : formatSAR(data?.total_spend ?? 0)}
          </p>
        </div>
        {canManage && !showForm && (
          <Button variant="primary" size="lg" onClick={openCreate}>
            <Plus size={17} />
            إضافة حملة
          </Button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(data?.platforms ?? []).map((p) => (
          <Card key={p.platform} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-medium text-ink-500">{PLATFORM_LABELS[p.platform]}</p>
              <Badge tone="neutral" dot={false}>{p.campaigns} حملة</Badge>
            </div>
            <p className="ltr-content mt-2 text-[24px] font-bold tracking-tight text-ink-900">{formatSAR(p.spend)}</p>
            <p className="mt-1 text-xs text-ink-500">
              {formatNumber(p.leads)} عميل محتمل · تكلفة العميل {p.cost_per_lead ? formatSAR(p.cost_per_lead) : "—"}
            </p>
          </Card>
        ))}
      </div>

      {showForm && canManage && (
        <Card className="mb-5 animate-scale-in">
          <CardHeader>
            <CardTitle>{editingId ? "تعديل حملة" : "حملة جديدة"}</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="المنصة">
                <Select value={form.platform} onChange={(e) => set("platform", e.target.value as Platform)}>
                  {Object.entries(PLATFORM_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="اسم الحملة">
                <Input required value={form.name} onChange={(e) => set("name", e.target.value)} />
              </FormField>
              <FormField label="الهدف (اختياري)">
                <Input value={form.objective} onChange={(e) => set("objective", e.target.value)} placeholder="Leads / Traffic ..." />
              </FormField>
              <FormField label="الإنفاق (ر.س)">
                <Input required type="number" min="0" step="0.01" dir="ltr" value={form.spend} onChange={(e) => set("spend", e.target.value)} />
              </FormField>
              <FormField label="عدد النتائج">
                <Input type="number" min="0" dir="ltr" value={form.results_count} onChange={(e) => set("results_count", e.target.value)} />
              </FormField>
              <FormField label="نوع النتيجة">
                <Input value={form.results_label} onChange={(e) => set("results_label", e.target.value)} placeholder="عميل محتمل / نقرة ..." />
              </FormField>
              <FormField label="بداية الفترة (اختياري)">
                <Input type="date" dir="ltr" value={form.period_start} onChange={(e) => set("period_start", e.target.value)} />
              </FormField>
              <FormField label="نهاية الفترة (اختياري)">
                <Input type="date" dir="ltr" value={form.period_end} onChange={(e) => set("period_end", e.target.value)} />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={form.counts_as_leads} onChange={(e) => set("counts_as_leads", e.target.checked)} />
              النتائج تُحتسب عملاء محتملين (وليست نقرات أو مشاهدات)
            </label>
            <div className="rounded-xl border border-ink-200 p-4">
              <p className="mb-1 text-sm font-semibold text-ink-900">تفصيل النتائج (اختياري)</p>
              <p className="mb-3 text-xs text-ink-500">
                رقم «النتائج» في الحساب الإعلاني يجمع أنواعاً مختلفة. نماذج الليد فقط تُصدَّر ببيانات العميل، أما نتائج الموقع والمحادثات فلا يوجد لها صف في ملف الليدز.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField label="ليدز النماذج (Meta leads)">
                  <Input type="number" min="0" dir="ltr" value={form.form_leads} onChange={(e) => set("form_leads", e.target.value)} />
                </FormField>
                <FormField label="ليدز الموقع (Website leads)">
                  <Input type="number" min="0" dir="ltr" value={form.website_leads} onChange={(e) => set("website_leads", e.target.value)} />
                </FormField>
                <FormField label="محادثات (Messaging)">
                  <Input type="number" min="0" dir="ltr" value={form.messaging_conversations} onChange={(e) => set("messaging_conversations", e.target.value)} />
                </FormField>
              </div>
            </div>
            <FormField label="وصف الفترة" hint="مثال: تراكمي حتى تاريخ كذا — عند ترك التواريخ فارغة تُحتسب الحملة على النصف الحالي">
              <Input value={form.period_label} onChange={(e) => set("period_label", e.target.value)} />
            </FormField>
            <FormField label="ملاحظات">
              <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </FormField>
            {error && <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" isLoading={create.isPending || update.isPending}>
                {editingId ? "حفظ التعديل" : "حفظ الحملة"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mb-3 flex gap-2">
        {(["all", "snapchat", "meta", "tiktok"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors " +
              (filter === k ? "bg-brand-600 text-white" : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50")
            }
          >
            {k === "all" ? "الكل" : PLATFORM_LABELS[k]}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {items.length === 0 && !isLoading ? (
          <EmptyState icon={Megaphone} title="لا توجد حملات" description="أضف حملة لتظهر تكلفتها في مؤشرات التسويق" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs text-ink-500">
                  <th className="px-5 py-3 text-start font-medium">المنصة</th>
                  <th className="px-3 py-3 text-start font-medium">الحملة</th>
                  <th className="px-3 py-3 text-start font-medium">الإنفاق</th>
                  <th className="px-3 py-3 text-start font-medium">النتائج</th>
                  <th className="px-3 py-3 text-start font-medium">الفترة</th>
                  {canManage && <th className="px-3 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-ink-50">
                    <td className="px-5 py-3"><Badge tone="brand">{PLATFORM_LABELS[c.platform]}</Badge></td>
                    <td className="px-3 py-3 font-medium text-ink-900">
                      {c.name}
                      {c.objective && <span className="block text-xs font-normal text-ink-400">{c.objective}</span>}
                    </td>
                    <td className="ltr-content px-3 py-3 font-semibold text-ink-900">{formatSAR(c.spend)}</td>
                    <td className="px-3 py-3 text-ink-700">
                      {c.results_count === null ? <span className="text-ink-400">{c.results_label ?? "—"}</span> : (
                        <>
                          <span className="ltr-content font-medium">{formatNumber(c.results_count)}</span>{" "}
                          <span className="text-xs text-ink-500">{c.results_label}</span>
                          {c.counts_as_leads && <Badge tone="success" dot={false} className="ms-2">ليد</Badge>}
                        </>
                      )}
                      {(c.form_leads != null || c.website_leads != null || c.messaging_conversations != null) && (
                        <span className="mt-1 block text-xs text-ink-500">
                          نماذج {formatNumber(c.form_leads ?? 0)} · موقع {formatNumber(c.website_leads ?? 0)} · محادثات {formatNumber(c.messaging_conversations ?? 0)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-500">
                      {c.period_start || c.period_end ? `${c.period_start ?? "…"} → ${c.period_end ?? "…"}` : c.period_label ?? "تراكمي"}
                    </td>
                    {canManage && (
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(c)} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="تعديل">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => handleDelete(c)} className="rounded-md p-1.5 text-ink-400 hover:bg-danger-50 hover:text-danger-600" aria-label="حذف">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
