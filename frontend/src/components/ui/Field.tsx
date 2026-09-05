import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

const fieldBase =
  "w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 shadow-xs ring-1 ring-inset ring-ink-200 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50 disabled:text-ink-400 disabled:ring-ink-150";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={clsx(fieldBase, className)} {...props} />
  )
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={clsx(fieldBase, "cursor-pointer appearance-none pl-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
    </div>
  )
);
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={clsx(fieldBase, "resize-none", className)} {...props} />
  )
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={clsx("mb-1.5 block text-[13px] font-medium text-ink-700", className)} {...props} />;
}

export function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
