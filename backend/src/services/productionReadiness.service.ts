import type { InterviewScope } from "./interviewWorkspace.service";
import { getSections } from "./answeredSections.service";
import { filterSectionsForVideo } from "../video/shared/input/sectionsFilter.js";

export type ProductionReadiness = {
  /** `已答/sections.json` 中的小节数 */
  sectionCount: number;
  /** 至少一条有效 qa 的小节数（与成片 pipeline 一致） */
  usableSectionCount: number;
  sectionNames: string[];
  ready: boolean;
  message: string;
};

/** 采访是否具备启动文本/成片生产的最低条件。 */
export function getProductionReadiness(scope: InterviewScope): ProductionReadiness {
  const sections = getSections(scope);
  const filtered = filterSectionsForVideo(sections);
  const sectionNames = filtered.map((s) => s.name.trim()).filter(Boolean);

  if (filtered.length === 0) {
    return {
      sectionCount: sections.length,
      usableSectionCount: 0,
      sectionNames: [],
      ready: false,
      message: "尚无有效访谈内容。请先在「访谈」页完成至少一个小节的问答，再进入生产。",
    };
  }

  return {
    sectionCount: sections.length,
    usableSectionCount: filtered.length,
    sectionNames,
    ready: true,
    message: `已收集 ${filtered.length} 个小节，可以开始生产。`,
  };
}

export function assertProductionReady(scope: InterviewScope): void {
  const readiness = getProductionReadiness(scope);
  if (!readiness.ready) {
    throw new Error(`VIDEO_PIPELINE_NO_SECTIONS: ${readiness.message}`);
  }
}
