import { isBasicProfileTopicName } from "../topic/catalog";
import type { AnsweredSection } from "../topic/types";

/** 从基本档案节 qa 提取叙事者画像（供备选推测 prompt）。 */
export function narratorProfileFromSections(sections: AnsweredSection[]): Record<string, string> {
  const basic = sections.find((s) => isBasicProfileTopicName(s.name.trim()));
  if (!basic?.qa?.length) return {};

  const out: Record<string, string> = {};
  for (const { q, a } of basic.qa) {
    const answer = String(a ?? "").trim();
    if (!answer) continue;
    const question = String(q ?? "").trim();
    if (/称呼|姓名|full name|name/i.test(question)) out["姓名"] = answer;
    else if (/出生.*几|几.*出生|date of birth|born/i.test(question)) out["出生年月"] = answer;
    else if (/出生.*城市|地区|哪里出生|place of birth|birthplace/i.test(question)) out["出生地"] = answer;
    else if (/学历|education/i.test(question)) out["最高学历"] = answer;
    else if (/已婚|婚姻|married|marriage/i.test(question)) out["婚姻状况"] = answer;
    else if (/子女|children/i.test(question)) out["子女"] = answer;
  }
  return out;
}
