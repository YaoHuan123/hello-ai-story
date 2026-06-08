import { PORTIONS_PER_YEAR } from "./constants.js";

export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/** 将 calendar year 内第 slotIndex 份（0..99）映射为 YYYY-MM-DD。 */
export function scheduledDateForSlot(year: number, slotIndex: number): string {
  const dim = daysInYear(year);
  const clamped = Math.min(Math.max(slotIndex, 0), PORTIONS_PER_YEAR - 1);
  const dayOfYear = 1 + Math.floor((clamped * dim) / PORTIONS_PER_YEAR);
  const d = new Date(Date.UTC(year, 0, dayOfYear));
  return d.toISOString().slice(0, 10);
}

/** 失败后次年同日重试（如 2027-06-08 → 2028-06-08）。 */
export function nextRetryDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function pointsPerPortion(pointsPerYear: number): number {
  return pointsPerYear / PORTIONS_PER_YEAR;
}

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
