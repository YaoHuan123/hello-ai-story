/** 服务器本地自然日 YYYY-MM-DD。 */
export function localDistributionDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 每日第一个小时窗口（0 点整点小时）。 */
export function isDayStartWindow(now = new Date()): boolean {
  return now.getHours() === 0;
}

/** 每日最后一个小时窗口（23 点整点小时）。 */
export function isDayEndWindow(now = new Date()): boolean {
  return now.getHours() === 23;
}

export function dayStartRunKey(distributionDate: string): string {
  return `day_start:${distributionDate}`;
}

export function dayEndRunKey(distributionDate: string): string {
  return `day_end:${distributionDate}`;
}
