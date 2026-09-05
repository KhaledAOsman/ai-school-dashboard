import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
          <Icon size={22} />
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-ink-700">{title}</p>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
