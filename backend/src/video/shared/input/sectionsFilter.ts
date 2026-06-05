import type { AnsweredSection } from "../../../topic/types";
import type { ClassifyPipelineJson } from "../llm/steps/step60Classify.js";

export type TurnReasonItem = {
  order: number;
  question: string;
  answer: string;
  savedAt?: string;
};

/** 保留至少一条有效 qa 的小节（与 `commitSection` 校验一致）。 */
export function filterSectionsForVideo(sections: AnsweredSection[]): AnsweredSection[] {
  const out: AnsweredSection[] = [];
  for (const section of sections) {
    const name = section.name.trim();
    if (!name) continue;
    const qa = (section.qa ?? []).filter(
      (pair) => String(pair.q ?? "").trim() && String(pair.a ?? "").trim(),
    );
    if (qa.length === 0) continue;
    out.push({ name, qa });
  }
  return out;
}

/** 单节 qa 拼成 step-10 LLM 输入用的 source 文本（问：答，多行）。 */
export function joinSectionQaSource(section: AnsweredSection): string {
  return section.qa
    .map((pair) => `${String(pair.q ?? "").trim()}：${String(pair.a ?? "").trim()}`)
    .filter((line) => line !== "：")
    .join("\n");
}

/** step-10 LLM 输入：扁化节名 + 预拼 source，不含 turnReasonAnswers。 */
export function buildMaterialPolishLlmInput(sections: AnsweredSection[]): {
  sections: Array<{ name: string; source: string }>;
} {
  return {
    sections: filterSectionsForVideo(sections).map((s) => ({
      name: s.name,
      source: joinSectionQaSource(s),
    })),
  };
}

/** step 20 / 60 送模前：空 turnReasonAnswers 省略；条内只保留 question、answer。 */
export function classifyPipelineForLlm(pipeline: ClassifyPipelineJson): Record<string, unknown> {
  const out: Record<string, unknown> = {
    polishedTemplateInstanceSummaries: pipeline.polishedTemplateInstanceSummaries,
  };
  const items = pipeline.turnReasonAnswers?.items ?? [];
  if (items.length > 0) {
    out.turnReasonAnswers = {
      items: items.map(({ question, answer }) => ({ question, answer })),
    };
  }
  return out;
}

/** 无 LLM 时的 stub 润色（仅测试 / smoke）。 */
export function buildStubPolishedFromSections(sections: AnsweredSection[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const section of filterSectionsForVideo(sections)) {
    const chunks = section.qa.map((pair) => `${pair.q.trim()}：${pair.a.trim()}`);
    out[section.name] = `${section.name}：${chunks.join("；")}`;
  }
  return out;
}

export function buildDownstreamPipelineJson(params: {
  polishedTemplateInstanceSummaries: Record<string, string>;
  turnReasonAnswers?: TurnReasonItem[];
}): ClassifyPipelineJson {
  const out: ClassifyPipelineJson = {
    polishedTemplateInstanceSummaries: params.polishedTemplateInstanceSummaries,
  };
  const items = (params.turnReasonAnswers ?? []).filter(
    (t) => String(t.question ?? "").trim() && String(t.answer ?? "").trim(),
  );
  if (items.length > 0) {
    out.turnReasonAnswers = { items };
  }
  return out;
}
