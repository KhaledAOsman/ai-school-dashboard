import type { HTMLAttributes } from "react";
import clsx from "clsx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("surface animate-slide-up p-6", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("mb-5 flex items-center justify-between", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={clsx("text-[15px] font-semibold text-ink-900", className)} {...props} />;
}

export function CardSubtitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={clsx("mt-0.5 text-xs text-ink-500", className)} {...props} />;
}
