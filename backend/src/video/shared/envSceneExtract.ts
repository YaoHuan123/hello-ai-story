/** 从场景描述中提取 env_time；兼容中文与英文 timeLabel / 日期写法。 */
const ENV_TIME_PATTERNS: RegExp[] = [
  /\d{4}-\d{2}-\d{2}/,
  /\d{4}-\d{2}/,
  /\d{4}年\d{1,2}月/,
  /\d{4}年/,
  /\d{1,2}月\d{1,2}日/,
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/i,
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}/i,
  /\b(?:19|20)\d{2}\b/,
];

export function extractEnvTimeFromText(text: string, fallback: string): string {
  for (const re of ENV_TIME_PATTERNS) {
    const m = text.match(re);
    if (m?.[0]) return m[0];
  }
  return fallback;
}

/** 从场景描述中提取 env_location；兼容「在…」与 in/at …。 */
export function extractEnvLocationFromText(text: string): string {
  const zh = text.match(/在([^，。！？；：]+)/);
  if (zh?.[1]) return zh[1].trim();
  const afterCommaAt = text.match(/,\s*at\s+([^,.;:!?\n]+)/i);
  if (afterCommaAt?.[1]) return afterCommaAt[1].trim();
  const en = text.match(/\b(?:in|at)\s+([^,.;:!?\n]+)/i);
  if (en?.[1]) return en[1].trim();
  return "";
}
