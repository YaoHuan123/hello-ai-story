import type { DisplayLocale } from "../../../content/displayLocale";
import {
  interviewOutputLocale,
  systemWithOutputLocale,
  withOutputLocale,
} from "../../../content/interviewOutputLocale";
import { stringifyForAi } from "./client";
import { loadVideoPromptParts } from "./loadPrompt";

export type VideoLlmChatMessage = { role: "system" | "user"; content: string };

/** 视频 LLM 入参 JSON（注入 `outputLocale`）。 */
export function stringifyVideoPipeline(
  pipeline: Record<string, unknown>,
  locale?: DisplayLocale,
): string {
  return stringifyForAi(withOutputLocale(pipeline, locale));
}

export function buildVideoLlmUserContent(
  userSuffix: string,
  pipeline: Record<string, unknown>,
  locale?: DisplayLocale,
): string {
  return userSuffix.replace("{{PIPELINE_JSON}}", stringifyVideoPipeline(pipeline, locale));
}

/** 加载 create-video 提示词并组装 system/user 消息（方案 A）。 */
export function buildVideoLlmMessages(
  promptBasename: string,
  pipeline: Record<string, unknown>,
  locale?: DisplayLocale,
): { messages: VideoLlmChatMessage[]; locale: DisplayLocale } {
  const loc = locale ?? interviewOutputLocale();
  const { systemText, userSuffix } = loadVideoPromptParts(promptBasename);
  return {
    locale: loc,
    messages: [
      { role: "system", content: systemWithOutputLocale(systemText, loc) },
      { role: "user", content: buildVideoLlmUserContent(userSuffix, pipeline, loc) },
    ],
  };
}

/** 单测：返回带 outputLocale 的 pipeline JSON 字符串。 */
export function videoPipelineJsonForTest(
  pipeline: Record<string, unknown>,
  locale: DisplayLocale,
): string {
  return stringifyVideoPipeline(pipeline, locale);
}
