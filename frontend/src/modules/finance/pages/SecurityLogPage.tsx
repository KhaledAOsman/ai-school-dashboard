import { useQuery } from "@tanstack/react-query";
import { translate } from "@/i18n";
import { logsApi } from "@/modules/finance/services/logsApi";
import clsx from "clsx";

const EVENT_COLOR: Record<string, string> = {
  login_failed: "text-red-600",
  account_locked: "text-red-600",
  authorization_failed: "text-red-600",
  mfa_failed: "text-red-600",
  login_success: "text-green-600",
};

export function SecurityLogPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["security-logs"],
    queryFn: () => logsApi.listSecurityLogs(200),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">{translate("ar", "nav_security_log")}</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">{translate("ar", "common_loading")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-right px-4 py-3 font-medium">التوقيت</th>
                <th className="text-right px-4 py-3 font-medium">الحدث</th>
                <th className="text-right px-4 py-3 font-medium">عنوان IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(logs ?? []).map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 ltr-content text-xs">{new Date(log.timestamp).toLocaleString("ar-SA")}</td>
                  <td className={clsx("px-4 py-3 ltr-content font-medium", EVENT_COLOR[log.event_type] ?? "text-gray-700")}>
                    {log.event_type}
                  </td>
                  <td className="px-4 py-3 ltr-content text-xs">{log.ip_address ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
