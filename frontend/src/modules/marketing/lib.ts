/** Shared formatting helpers for the marketing / KPI pages. */
export function formatSAR(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${Number(value).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toLocaleString("ar-SA", { maximumFractionDigits: 2 });
}

export const PLATFORM_LABELS: Record<string, string> = {
  snapchat: "سناب شات",
  meta: "ميتا",
  tiktok: "تيك توك",
};

export const SOURCE_LABELS: Record<string, string> = {
  ...PLATFORM_LABELS,
  organic: "عضوي",
  other: "أخرى",
};

export function apiErrorMessage(err: unknown, fallback = "حدث خطأ غير متوقع"): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = (err as any)?.response?.data?.error;
  if (!e) return fallback;
  if (e.status_code === 422 && Array.isArray(e.details) && e.details.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return "تأكد من صحة البيانات: " + e.details.map((d: any) => String(d.msg).replace(/^Value error, /, "")).join(" — ");
  }
  if (typeof e.message === "string") return e.message;
  if (Array.isArray(e.message?.errors)) return e.message.errors.join(" — ");
  return fallback;
}
