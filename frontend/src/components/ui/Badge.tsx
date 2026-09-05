import clsx from "clsx";

type BadgeTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger";

const toneStyles: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200/70",
  brand: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100",
  accent: "bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-100",
  success: "bg-success-50 text-success-700 ring-1 ring-inset ring-success-100",
  warning: "bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-100",
  danger: "bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-100",
};

const dotStyles: Record<BadgeTone, string> = {
  neutral: "bg-ink-400",
  brand: "bg-brand-500",
  accent: "bg-accent-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
};

export function Badge({
  tone = "neutral",
  dot = true,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        toneStyles[tone],
        className
      )}
    >
      {dot && <span className={clsx("h-1.5 w-1.5 rounded-full", dotStyles[tone])} />}
      {children}
    </span>
  );
}
