import { systemWithOutputLocale, withOutputLocale } from "../content/interviewOutputLocale";
import type { ChatMessage } from "./llm";

/** Tier5～8 preprocess 提示词：`{{PIPELINE_JSON}}` 占位替换为带 outputLocale 的 payload。 */
export function topicPipelineLlmMessages(
  system: string,
  userTemplate: string,
  payload: Record<string, unknown>,
): ChatMessage[] {
  const userContent = userTemplate.replace(
    "{{PIPELINE_JSON}}",
    JSON.stringify(withOutputLocale(payload), null, 2),
  );
  return [
    { role: "system", content: systemWithOutputLocale(system) },
    { role: "user", content: userContent },
  ];
}

/** Tier1～4 interview 提示词：`{{INPUT_JSON}}` 占位。 */
export function topicInputLlmMessages(
  system: string,
  userTemplate: string,
  payload: Record<string, unknown>,
): ChatMessage[] {
  const userContent = userTemplate.replace(
    "{{INPUT_JSON}}",
    JSON.stringify(withOutputLocale(payload), null, 2),
  );
  return [
    { role: "system", content: systemWithOutputLocale(system) },
    { role: "user", content: userContent },
  ];
}
