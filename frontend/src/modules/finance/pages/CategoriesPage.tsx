import { useState, type FormEvent } from "react";
import { Plus, FolderTree, Archive } from "lucide-react";
import { translate } from "@/i18n";
import { useCategories, useCreateCategory, useArchiveCategory } from "@/modules/finance/hooks/useFinance";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import type { Category } from "@/modules/finance/services/financeApi";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";

function CategoryRow({
  category,
  depth,
  canDelete,
  onArchive,
}: {
  category: Category;
  depth: number;
  canDelete: boolean;
  onArchive: (id: string) => void;
}) {
  return (
    <>
      <div
        className="group flex items-center justify-between border-b border-ink-100 py-3 last:border-0"
        style={{ paddingRight: depth * 24 }}
      >
        <div className="flex items-center gap-2.5">
          {depth > 0 && <span className="h-px w-4 bg-ink-300" />}
          <span className="text-sm font-medium text-ink-800">{category.name}</span>
        </div>
        {canDelete && (
          <button
            onClick={() => onArchive(category.id)}
            className="flex items-center gap-1 text-xs font-medium text-ink-400 opacity-0 transition-opacity hover:text-danger-600 group-hover:opacity-100"
          >
            <Archive size={13} />
            {translate("ar", "category_archive")}
          </button>
        )}
      </div>
      {category.children.map((child) => (
        <CategoryRow key={child.id} category={child} depth={depth + 1} canDelete={canDelete} onArchive={onArchive} />
      ))}
    </>
  );
}

export function CategoriesPage() {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const archiveCategory = useArchiveCategory();

  const canCreate = usePermission(PERMISSIONS.FINANCE_CATEGORY_CREATE);
  const canDelete = usePermission(PERMISSIONS.FINANCE_CATEGORY_DELETE);

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createCategory.mutateAsync({ name, parent_id: parentId || null });
    setName("");
    setParentId("");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-[26px] font-bold tracking-tight text-ink-900">{translate("ar", "nav_categories")}</h1>
      <p className="mb-6 text-sm text-ink-500">تنظيم المصروفات ضمن تصنيفات وتصنيفات فرعية</p>

      {canCreate && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>{translate("ar", "category_new")}</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="flex-1">
              <FormField label={translate("ar", "category_name")}>
                <Input type="text" required placeholder="مثال: التسويق" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
            </div>
            <div className="w-52">
              <FormField label="تصنيف أب (اختياري)">
                <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">بدون</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <Button type="submit" variant="primary">
              <Plus size={16} />
              {translate("ar", "common_save")}
            </Button>
          </form>
        </Card>
      )}

      <Card className="p-5">
        {(categories ?? []).length === 0 ? (
          <EmptyState icon={FolderTree} title="لا توجد تصنيفات بعد" />
        ) : (
          (categories ?? []).map((c) => (
            <CategoryRow key={c.id} category={c} depth={0} canDelete={canDelete} onArchive={(id) => archiveCategory.mutate(id)} />
          ))
        )}
      </Card>
    </div>
  );
}
