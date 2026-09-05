/**
 * Minimal, dependency-free i18n layer.
 *
 * Design: a flat key -> string dictionary per locale. The app currently
 * ships Arabic (default, RTL) and English (LTR) is fully wired up so a
 * translator can fill in en.ts without any code changes elsewhere - see
 * docs/architecture.md "Adding a language".
 */
import { ar } from "./ar";
import { en } from "./en";

export type Locale = "ar" | "en";
export type TranslationKey = keyof typeof ar;

const dictionaries: Record<Locale, Record<string, string>> = { ar, en };

export function isRTL(locale: Locale): boolean {
  return locale === "ar";
}

export function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = dictionaries[locale] ?? dictionaries.ar;
  let template = dict[key] ?? dictionaries.ar[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      template = template.replace(`{${k}}`, String(v));
    }
  }
  return template;
}
