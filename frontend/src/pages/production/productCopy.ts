import { t } from "../../i18n";
import type { ProductionReadiness, TextTaskStatus, VideoTaskStatus } from "../../types/production";

export function readinessProductHint(
  readiness: ProductionReadiness | null,
  kind: "text" | "video",
): string {
  if (!readiness) return t("production.readinessLoading");
  if (!readiness.ready) {
    return t("production.readinessNeedInterview");
  }
  return kind === "text"
    ? t("production.readinessTextReady")
    : t("production.readinessVideoReady");
}

export function textTaskStatusLabel(status: TextTaskStatus): string {
  const map: Record<TextTaskStatus, string> = {
    pending: t("production.statusPending"),
    running: t("production.statusRunning"),
    success: t("production.statusSuccess"),
    failed: t("production.statusFailedShort"),
  };
  return map[status] ?? status;
}

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
