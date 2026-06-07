import type { DisplayLocale } from "../displayLocale";

export function toDisplayYesNo(value: string, locale: DisplayLocale): string {
  const t = value.trim();
  if (locale !== "zh") return t;
  if (t === "Yes") return "是";
  if (t === "No") return "否";
  return t;
}

export function toCanonicalYesNo(value: string, locale: DisplayLocale): string {
  const t = value.trim();
  if (locale === "zh") {
    if (t === "是") return "Yes";
    if (t === "否") return "No";
  }
  if (t === "Yes" || t === "No") return t;
  return t;
}
