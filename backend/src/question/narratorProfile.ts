import type { AnsweredSection } from "../topic/types";

const BASIC_PROFILE_NAME = "基本档案";

/** 从「基本档案」节 qa 提取叙事者画像（供备选推测 prompt，不读 template-config）。 */
export function narratorProfileFromSections(sections: AnsweredSection[]): Record<string, string> {
  const basic = sections.find((s) => s.name.trim() === BASIC_PROFILE_NAME);
  if (!basic?.qa?.length) return {};

  const out: Record<string, string> = {};
  for (const { q, a } of basic.qa) {
    const answer = String(a ?? "").trim();
    if (!answer) continue;
    const question = String(q ?? "").trim();
    if (/称呼|姓名/.test(question)) out["姓名"] = answer;
    else if (/出生.*几|几.*出生/.test(question)) out["出生年月"] = answer;
    else if (/出生.*城市|地区|哪里出生/.test(question)) out["出生地"] = answer;
    else if (/学历/.test(question)) out["最高学历"] = answer;
    else if (/已婚|婚姻/.test(question)) out["婚姻状况"] = answer;
    else if (/子女/.test(question)) out["子女"] = answer;
  }
  return out;
}
