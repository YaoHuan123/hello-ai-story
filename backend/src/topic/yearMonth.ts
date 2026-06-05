export const MIN_YEAR_MONTH = "1900-01";

export function maxYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function yearMonthFromParts(year: string, monthPart: string): string {
  if (!/^\d{4}$/.test(year)) return "";
  const mm = Number(monthPart);
  if (!Number.isFinite(mm) || mm < 1 || mm > 12) return "";
  return `${year}-${String(mm).padStart(2, "0")}`;
}

export function yearMonthFromDigits(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 6);
  if (d.length < 5) return "";
  const year = d.slice(0, 4);
  const rest = d.slice(4);
  if (rest.length === 1) return yearMonthFromParts(year, rest);
  return yearMonthFromParts(year, rest.slice(0, 2));
}

export function normalizeYearMonth(value: string): string {
  const t = value.trim();
  if (!t) return "";

  let m = t.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return yearMonthFromParts(m[1]!, m[2]!);

  m = t.match(/^(\d{4})年(\d{1,2})月?$/);
  if (m) return yearMonthFromParts(m[1]!, m[2]!);

  const digitsOnly = t.replace(/\D/g, "");
  if (digitsOnly.length >= 5) {
    return yearMonthFromDigits(digitsOnly);
  }

  return "";
}

export function normalizeYearMonthInRange(value: string): string {
  const ym = normalizeYearMonth(value);
  if (!ym) return "";
  return ym >= MIN_YEAR_MONTH && ym <= maxYearMonth() ? ym : "";
}
