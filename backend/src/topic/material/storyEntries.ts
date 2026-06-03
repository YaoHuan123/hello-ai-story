import fs from "node:fs";
import path from "node:path";
import type { StoryEntry } from "./types";
import type { StoryEntriesFile } from "./types";
import { storyEntriesPath } from "./paths";

/** Tier5 素材分析最少条目数（与老项目 tier5-8 门槛一致）。 */
export const MIN_STORY_ENTRIES = 5;

/** 读取用户故事素材；文件缺失或损坏时返回空数组（不抛错）。 */
export function readStoryEntries(userId: string): StoryEntry[] {
  const p = storyEntriesPath(userId);
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as StoryEntriesFile;
    if (!Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter((e) => e?.id?.trim() && e?.text?.trim());
  } catch {
    return [];
  }
}

/** 写入/覆盖 `story-entries.json`（访谈模块或测试桩调用）。 */
export function writeStoryEntries(userId: string, entries: StoryEntry[]): void {
  const p = storyEntriesPath(userId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const data: StoryEntriesFile = { entries };
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}
