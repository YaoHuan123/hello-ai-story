import { t } from "../../i18n";
import type { VideoTaskStatus } from "../../types/production";

export function videoTaskStatusLabel(status: VideoTaskStatus): string {
  const map: Record<VideoTaskStatus, string> = {
    pending: t("production.statusPending"),
    queued: t("production.statusQueued"),
    running: t("production.statusRunning"),
    success: t("production.statusSuccess"),
    failed: t("production.statusFailedShort"),
  };
  return map[status] ?? status;
}

/** 产品页始终走 LLM 正式成文；stub 仅保留给后端测试/集成用。 */
export function defaultPolishMode(): "llm" {
  return "llm";
}
