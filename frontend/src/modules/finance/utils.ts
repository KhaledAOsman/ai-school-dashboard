/** Small shared helpers for the finance pages. */
import type { Category } from "@/modules/finance/services/financeApi";

export function formatSAR(value: string | number | null | undefined): string {
  return `${Number(value ?? 0).toLocaleString("ar-SA-u-nu-latn", { maximumFractionDigits: 2, minimumFractionDigits: 0 })} ر.س`;
}

/** Integer cents, so sums of decimal amounts never drift ("0.1 + 0.2"). */
export function toCents(value: string | number): number {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** "2026-08" -> "أغسطس 2026" */
export function periodLabel(period: string | null | undefined): string {
  if (!period) return "—";
  const [y, m] = period.split("-");
  const idx = Number(m) - 1;
  return AR_MONTHS[idx] ? `${AR_MONTHS[idx]} ${y}` : period;
}

export interface FlatCategory {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  parentName: string | null;
}

/** id -> category info for every node (roots and sub-accounts) of the tree. */
export function flattenCategories(tree: Category[] | undefined): Map<string, FlatCategory> {
  const map = new Map<string, FlatCategory>();
  for (const root of tree ?? []) {
    map.set(root.id, { id: root.id, name: root.name, code: root.code, parentId: null, parentName: null });
    for (const child of root.children) {
      map.set(child.id, { id: child.id, name: child.name, code: child.code, parentId: root.id, parentName: root.name });
    }
  }
  return map;
}

export function accountLabel(cat: { name: string; code: string | null } | undefined): string {
  if (!cat) return "—";
  return cat.code ? `${cat.code} · ${cat.name}` : cat.name;
}
