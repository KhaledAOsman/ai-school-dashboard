/**
 * Small, dependency-free motion helpers for the executive dashboard.
 * - Reveal: fades/slides a block in the first time it scrolls into view.
 * - AnimatedText: counts the first number inside a formatted string up from 0.
 * - useMounted: flips true on the next frame so CSS width/stroke transitions play.
 * Everything is skipped for users who prefer reduced motion.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); } },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  const style: CSSProperties = { transitionDelay: shown ? `${delay}ms` : "0ms" };
  return (
    <div
      ref={ref}
      style={style}
      className={`transition-[opacity,transform] duration-700 ease-out-expo will-change-transform ${shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

export function useMounted(delay = 60): boolean {
  const [m, setM] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (m) return;
    const t = setTimeout(() => setM(true), delay);
    return () => clearTimeout(t);
  }, [m, delay]);
  return m;
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** Counts a number from 0 to `value` (re-runs when `value` changes). */
export function useCountUp(value: number, duration = 1100): number {
  const [v, setV] = useState(() => (prefersReducedMotion() ? value : 0));
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setV(value); return; }
    const start = performance.now();
    const base = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const cur = base + (value - base) * easeOutExpo(t);
      setV(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return v;
}

const NUM = /\d[\d,]*(?:\.\d+)?/;

/** "ر.س 6,000" / "54.7%" / "10 / 100": animates the first number, keeps all other text. */
export function AnimatedText({ text, className }: { text: string; className?: string }) {
  const m = NUM.exec(text);
  const target = m ? Number(m[0].replace(/,/g, "")) : 0;
  const decimals = m && m[0].includes(".") ? m[0].split(".")[1].length : 0;
  const v = useCountUp(Number.isFinite(target) ? target : 0);
  if (!m) return <span className={className}>{text}</span>;
  const shown = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span className={className}>{text.slice(0, m.index)}{shown}{text.slice(m.index + m[0].length)}</span>;
}
