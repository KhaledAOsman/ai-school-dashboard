import type { ImgHTMLAttributes } from "react";

/**
 * AiSchool brand mark - the real uploaded logo file (frontend/public/logo.png),
 * referenced by absolute path so Vite serves it as-is without bundling.
 */
export function LogoMark({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/logo.png" alt="AiSchool" className={className} {...props} />;
}

/** Full lockup: just the logo image (it already includes the wordmark). */
export function LogoLockup({ className }: { className?: string }) {
  return <img src="/logo.png" alt="AiSchool" className={className ?? "h-8"} />;
}
