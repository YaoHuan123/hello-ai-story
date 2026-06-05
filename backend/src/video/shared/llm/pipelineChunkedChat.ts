/**
 * 同一份提示词、按输入数组切片、并发提交、按输入顺序拼接输出。
 * 适用步骤 120 / 140 / 130 / 30 / 40 / 50 / 80 / 100 / 230 等逐条独立处理的 LLM 步。
 */
export async function runChatPerSliceConcat<TInputItem, TOutputItem>(args: {
  items: readonly TInputItem[];
  chunkSize: number;
  runOnce: (slice: TInputItem[]) => Promise<TOutputItem[]>;
}): Promise<TOutputItem[]> {
  const { items, chunkSize, runOnce } = args;
  if (items.length === 0) return [];
  if (items.length <= chunkSize) return runOnce(items.slice());

  const chunks: TInputItem[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  const parts = await Promise.all(chunks.map((c) => runOnce(c)));
  return parts.flat();
}

export function resolveChatMaxItemsPerCall(): number {
  const raw = process.env.OPENAI_CHAT_MAX_ITEMS_PER_CALL?.trim();
  if (!raw) return 4;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 4;
  return Math.min(100, Math.max(1, Math.floor(n)));
}
