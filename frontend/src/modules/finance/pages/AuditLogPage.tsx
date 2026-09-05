import { useQuery } from "@tanstack/react-query";
import { translate } from "@/i18n";
import { logsApi } from "@/modules/finance/services/logsApi";

export function AuditLogPage() {
  const { data: logs, isLoading } = useQuery({ queryKey: ["audit-logs"], queryFn: () => logsApi.listAuditLogs(200) });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">{translate("ar", "nav_audit_log")}</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">{translate("ar", "common_loading")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-right px-4 py-3 font-medium">التوقيت</th>
                <th className="text-right px-4 py-3 font-medium">الإجراء</th>
                <th className="text-right px-4 py-3 font-medium">النوع</th>
                <th className="text-right px-4 py-3 font-medium">المعرّف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(logs ?? []).map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 ltr-content text-xs">{new Date(log.timestamp).toLocaleString("ar-SA")}</td>
                  <td className="px-4 py-3 ltr-content">{log.action}</td>
                  <td className="px-4 py-3">{log.resource_type}</td>
                  <td className="px-4 py-3 ltr-content text-xs truncate max-w-[160px]">{log.resource_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
