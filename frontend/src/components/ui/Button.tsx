import { forwardRef, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "success";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 hover:shadow-md active:bg-brand-800 disabled:bg-ink-200 disabled:text-ink-400 disabled:shadow-none",
  secondary:
    "bg-brand-100 text-brand-900 hover:bg-brand-200 active:bg-brand-200 disabled:bg-ink-100 disabled:text-ink-400",
  outline:
    "bg-transparent text-brand-600 ring-1 ring-inset ring-brand-600 hover:bg-brand-50 active:bg-brand-100 disabled:text-ink-300 disabled:ring-ink-200",
  ghost:
    "bg-transparent text-ink-700 hover:bg-ink-100 active:bg-ink-200 disabled:text-ink-300",
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 hover:shadow-md active:bg-danger-700 disabled:bg-ink-200 disabled:text-ink-400 disabled:shadow-none",
  success:
    "bg-success-600 text-white hover:bg-success-700 hover:shadow-md active:bg-success-700 disabled:bg-ink-200 disabled:text-ink-400 disabled:shadow-none",
};

// Pill buttons, 14/20 semibold with 0.1px tracking (SaasAble / Material 3 label style).
const sizeStyles: Record<Size, string> = {
  sm: "h-10 px-4 text-[14px] gap-2 rounded-full",
  md: "h-11 px-6 text-[15px] gap-2 rounded-full",
  lg: "h-14 px-8 text-[16px] gap-2 rounded-full",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          "inline-flex items-center justify-center font-semibold tracking-[0.1px] transition-all duration-150 ease-out-expo focus:outline-none disabled:cursor-not-allowed",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
