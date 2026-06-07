import type { ContentLocale } from "../../src/content/locale";
import type { InterviewScope } from "../../src/services/interviewWorkspace.service";
import { createInterview } from "../../src/services/interviewWorkspace.service";
import { createUserWorkspace } from "../../src/services/workspace.service";

export function interviewScope(userId: string, interviewId: string): InterviewScope {
  return { userId, interviewId };
}

/** 与 VIDEO_DEMO_* 音色前缀对齐，避免成片测试 locale/音色校验失败。 */
export function resolveVideoTestLocale(): ContentLocale {
  const sample = (
    process.env.VIDEO_DEMO_TTS_VOICE ??
    process.env.VIDEO_DEMO_HOST_VOICE ??
    ""
  )
    .trim()
    .toLowerCase();
  if (sample.startsWith("en_")) return "en";
  if (sample.startsWith("zh_")) return "zh";
  const app = (process.env.APP_LOCALE ?? "zh").trim().toLowerCase();
  return app === "en" ? "en" : "zh";
}

/** 创建用户工作区并新建一场采访，返回作用域。 */
export function setupUserWithInterview(
  userId: string,
  opts?: { title?: string; locale?: ContentLocale },
): InterviewScope {
  createUserWorkspace(userId);
  const meta = createInterview(userId, opts);
  return { userId, interviewId: meta.id };
}
