/**
 * 故事素材用户目录路径（Tier5/6 已不再使用 story-entries，保留供测试或后续对接）。
 */
import path from "node:path";
import { getUserRootDir } from "../../services/workspace.service";

/** 故事素材子目录名（与访谈正文模块后续可对接）。 */
export const MATERIAL_DIR = "素材";
export const STORY_ENTRIES_FILE = "story-entries.json";

/** `{userRoot}/素材/story-entries.json` */
export function storyEntriesPath(userId: string): string {
  return path.join(getUserRootDir(userId), MATERIAL_DIR, STORY_ENTRIES_FILE);
}
