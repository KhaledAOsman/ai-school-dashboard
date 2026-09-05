import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { translate } from "@/i18n";
import { adminApi } from "@/modules/finance/services/adminApi";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";

export function RolesPage() {
  const queryClient = useQueryClient();
  const { data: roles } = useQuery({ queryKey: ["admin-roles"], queryFn: adminApi.listRoles });
  const { data: permissions } = useQuery({ queryKey: ["admin-permissions"], queryFn: adminApi.listPermissions });

  const canCreate = usePermission(PERMISSIONS.ROLES_CREATE);
  const canDelete = usePermission(PERMISSIONS.ROLES_DELETE);

  const createRole = useMutation({
    mutationFn: adminApi.createRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-roles"] }),
  });
  const deleteRole = useMutation({
    mutationFn: adminApi.deleteRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-roles"] }),
  });

  const [name, setName] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const permissionsByCategory = (permissions ?? []).reduce<Record<string, typeof permissions>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await createRole.mutateAsync({ name, permission_codes: selectedPerms });
      setName("");
      setSelectedPerms([]);
    } catch {
      setError(translate("ar", "common_error"));
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">{translate("ar", "nav_roles")}</h1>

      {canCreate && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <input
            type="text"
            required
            placeholder="اسم الدور الجديد"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="space-y-3 max-h-72 overflow-y-auto border border-gray-100 rounded-lg p-3">
            {Object.entries(permissionsByCategory).map(([category, perms]) => (
              <div key={category}>
                <p className="text-xs font-semibold text-gray-500 mb-1 uppercase">{category}</p>
                <div className="flex flex-wrap gap-2">
                  {perms!.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5 text-xs bg-gray-50 rounded px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selectedPerms.includes(p.code)}
                        onChange={(e) =>
                          setSelectedPerms((prev) =>
                            e.target.checked ? [...prev, p.code] : prev.filter((c) => c !== p.code)
                          )
                        }
                      />
                      <span className="ltr-content">{p.code}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            {translate("ar", "common_save")}
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {(roles ?? []).map((r) => (
          <div key={r.id} className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{r.name}</p>
              <p className="text-xs text-gray-500 ltr-content">{r.permission_codes.length} permissions</p>
            </div>
            {canDelete && !r.is_system_role && (
              <button onClick={() => deleteRole.mutate(r.id)} className="text-xs text-red-500 hover:text-red-700">
                {translate("ar", "common_delete")}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
