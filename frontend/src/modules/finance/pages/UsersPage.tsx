import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { translate } from "@/i18n";
import { adminApi } from "@/modules/finance/services/adminApi";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";

export function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: adminApi.listUsers });
  const { data: roles } = useQuery({ queryKey: ["admin-roles"], queryFn: adminApi.listRoles });

  const canCreate = usePermission(PERMISSIONS.USERS_CREATE);
  const canDisable = usePermission(PERMISSIONS.USERS_DISABLE);

  const createUser = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const disableUser = useMutation({
    mutationFn: adminApi.disableUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createUser.mutateAsync({
        email,
        full_name: fullName,
        temporary_password: password,
        role_ids: selectedRoles,
      });
      setEmail("");
      setFullName("");
      setPassword("");
      setSelectedRoles([]);
    } catch {
      setError(translate("ar", "common_error"));
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">{translate("ar", "nav_users")}</h1>

      {canCreate && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              required
              placeholder={translate("ar", "login_email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              required
              placeholder="الاسم الكامل"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              placeholder="كلمة مرور مؤقتة"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ltr-content rounded-lg border border-gray-300 px-3 py-2 text-sm col-span-2"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(roles ?? []).map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(r.id)}
                  onChange={(e) =>
                    setSelectedRoles((prev) =>
                      e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id)
                    )
                  }
                />
                {r.name}
              </label>
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-right px-4 py-3 font-medium">{translate("ar", "login_email")}</th>
              <th className="text-right px-4 py-3 font-medium">الأدوار</th>
              <th className="text-right px-4 py-3 font-medium">الحالة</th>
              <th className="text-right px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 ltr-content">{u.email}</td>
                <td className="px-4 py-3">{u.roles.join("، ")}</td>
                <td className="px-4 py-3">{u.status}</td>
                <td className="px-4 py-3">
                  {canDisable && u.status === "active" && (
                    <button
                      onClick={() => disableUser.mutate(u.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      تعطيل
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
