import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[30px] font-bold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1.5 text-[16px] text-ink-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}
