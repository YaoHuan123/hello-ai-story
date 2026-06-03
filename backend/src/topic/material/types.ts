/** 单条故事素材（润色/摘要文本）。 */
export type StoryEntry = {
  id: string;
  text: string;
};

/** `素材/story-entries.json` 文件结构。 */
export type StoryEntriesFile = {
  entries: StoryEntry[];
};
