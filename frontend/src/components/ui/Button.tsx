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
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-md active:bg-brand-800 active:scale-[0.98] disabled:bg-ink-200 disabled:text-ink-400 disabled:shadow-none disabled:active:scale-100",
  secondary:
    "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200 active:scale-[0.98] disabled:bg-ink-100 disabled:text-ink-400",
  outline:
    "bg-white text-ink-700 shadow-xs ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300 active:bg-ink-100 active:scale-[0.98] disabled:text-ink-300",
  ghost:
    "bg-transparent text-ink-600 hover:bg-ink-100 active:bg-ink-200 active:scale-[0.98] disabled:text-ink-300",
  danger:
    "bg-danger-500 text-white shadow-sm hover:bg-danger-600 hover:shadow-md active:bg-danger-700 active:scale-[0.98] disabled:bg-ink-200 disabled:text-ink-400 disabled:shadow-none",
  success:
    "bg-success-500 text-white shadow-sm hover:bg-success-600 hover:shadow-md active:bg-success-700 active:scale-[0.98] disabled:bg-ink-200 disabled:text-ink-400 disabled:shadow-none",
};

const sizeStyles: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5 rounded-lg",
  md: "text-sm px-4 py-2.5 gap-2 rounded-lg",
  lg: "text-[15px] px-5 py-3 gap-2 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          "inline-flex items-center justify-center font-medium transition-all duration-150 ease-out-expo focus:outline-none disabled:cursor-not-allowed",
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
