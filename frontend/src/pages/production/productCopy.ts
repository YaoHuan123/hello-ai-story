import type { ProductionReadiness, TextTaskStatus, VideoTaskStatus } from "../../types/production";

export function readinessProductHint(
  readiness: ProductionReadiness | null,
  kind: "text" | "video",
): string {
  if (!readiness) return "正在了解您的故事进度…";
  if (!readiness.ready) {
    return "请先完成采访聊天，收集足够的故事内容。";
  }
  return kind === "text"
    ? "故事内容已就绪，可以生成正式文本。"
    : "故事内容已就绪，可以开始生成视频。";
}

const TEXT_STATUS: Record<TextTaskStatus, string> = {
  pending: "准备中",
  running: "生成中",
  success: "已完成",
  failed: "未成功",
};

const VIDEO_STATUS: Record<VideoTaskStatus, string> = {
  pending: "准备中",
  queued: "排队中",
  running: "生成中",
  success: "已完成",
  failed: "未成功",
};

export function textTaskStatusLabel(status: TextTaskStatus): string {
  return TEXT_STATUS[status] ?? status;
}

export function videoTaskStatusLabel(status: VideoTaskStatus): string {
  return VIDEO_STATUS[status] ?? status;
}

/** 产品页始终走 LLM 正式成文；stub 仅保留给后端测试/集成用。 */
export function defaultPolishMode(): "llm" {
  return "llm";
}
