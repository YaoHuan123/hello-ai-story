import { productionTtsVoiceHints } from "../content/interviewTtsVoices";
import type { InterviewScope } from "./interviewWorkspace.service";
import { getSections } from "./answeredSections.service";
import { assertStoryTextReady, listStoryTextTaskOptions, type StoryTextTaskOption } from "../text/storyArticleSource.js";
import { filterSectionsForVideo } from "../video/shared/input/sectionsFilter.js";

export type ProductionReadiness = {
  /** `已答/sections.json` 中的小节数 */
  sectionCount: number;
  /** 至少一条有效 qa 的小节数（与成片 pipeline 一致） */
  usableSectionCount: number;
  sectionNames: string[];
  ready: boolean;
  /** 是否存在可用于成片的故事正文 */
  hasStoryText: boolean;
  /** 可选用作成片素材的文本任务（按创建时间降序） */
  storyTextTasks: StoryTextTaskOption[];
  latestStoryTextTaskId?: string;
  message: string;
  /** 采访展示语言（`meta.locale`） */
  locale: "zh" | "en";
  /** 与 locale 匹配的默认成片 TTS 音色 */
  biographyTtsVoice: string;
  studioHostVoice: string;
  studioGuestVoice: string;
};

/** 采访是否具备启动文本/成片生产的最低条件。 */
export function getProductionReadiness(scope: InterviewScope): ProductionReadiness {
  const sections = getSections(scope);
  const filtered = filterSectionsForVideo(sections);
  const sectionNames = filtered.map((s) => s.name.trim()).filter(Boolean);
  const storyTextTasks = listStoryTextTaskOptions(scope);
  const latestStoryTextTaskId = storyTextTasks[0]?.taskId;
  const tts = productionTtsVoiceHints(scope);

  if (filtered.length === 0) {
    return {
      sectionCount: sections.length,
      usableSectionCount: 0,
      sectionNames: [],
      ready: false,
      hasStoryText: storyTextTasks.length > 0,
      storyTextTasks,
      ...(latestStoryTextTaskId ? { latestStoryTextTaskId } : {}),
      message: "尚无有效访谈内容。请先在「访谈」页完成至少一个小节的问答，再进入生产。",
      locale: tts.locale,
      biographyTtsVoice: tts.biographyTtsVoice,
      studioHostVoice: tts.studioHostVoice,
      studioGuestVoice: tts.studioGuestVoice,
    };
  }

  return {
    sectionCount: sections.length,
    usableSectionCount: filtered.length,
    sectionNames,
    ready: true,
    hasStoryText: storyTextTasks.length > 0,
    storyTextTasks,
    ...(latestStoryTextTaskId ? { latestStoryTextTaskId } : {}),
    message: `已收集 ${filtered.length} 个小节，可以开始生产。`,
    locale: tts.locale,
    biographyTtsVoice: tts.biographyTtsVoice,
    studioHostVoice: tts.studioHostVoice,
    studioGuestVoice: tts.studioGuestVoice,
  };
}

export function assertProductionReady(scope: InterviewScope): void {
  const readiness = getProductionReadiness(scope);
  if (!readiness.ready) {
    throw new Error(`VIDEO_PIPELINE_NO_SECTIONS: ${readiness.message}`);
  }
}

export function assertVideoProductionReady(scope: InterviewScope, textTaskId?: string): void {
  assertProductionReady(scope);
  assertStoryTextReady(scope, textTaskId);
}
