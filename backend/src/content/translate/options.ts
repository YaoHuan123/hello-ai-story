import type { DisplayLocale } from "../displayLocale";
import { getDisplayFieldOption } from "../displayCatalog";

export function toDisplayFieldChoices(
  canonicalChoices: string[],
  optionsKey: string | undefined,
  locale: DisplayLocale,
): string[] {
  if (locale === "en" || !optionsKey) return canonicalChoices;
  return canonicalChoices.map((c) => getDisplayFieldOption(optionsKey, c, locale) ?? c);
}

export function toCanonicalFieldChoice(
  displayValue: string,
  canonicalChoices: string[],
  optionsKey: string | undefined,
  locale: DisplayLocale,
): string | undefined {
  const t = displayValue.trim();
  if (locale === "en" || !optionsKey) {
    return canonicalChoices.find((c) => c === t);
  }
  for (const c of canonicalChoices) {
    const zh = getDisplayFieldOption(optionsKey, c, locale);
    if (zh === t || c === t) return c;
  }
  return canonicalChoices.find((c) => c === t);
}
