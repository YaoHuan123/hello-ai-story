/** UI 展示用备选上限（与老项目 `mergeSuggestedAnswers` 一致）。 */
export const MAX_DISPLAY_SUGGESTIONS = 4;

/**
 * 合并逐题备选与开答前批量备选：去重，最多 {@link MAX_DISPLAY_SUGGESTIONS} 条。
 *
 * 顺序与老项目一致：**逐题在前、批量在后**，优先保留逐题推断结果。
 */
export function mergeSuggestedAnswersForDisplay(
  currentSuggested: readonly string[],
  batchSuggested: readonly string[],
  max = MAX_DISPLAY_SUGGESTIONS,
): string[] {
  const out: string[] = [];
  for (const raw of [...currentSuggested, ...batchSuggested]) {
    const s = String(raw ?? "").trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
