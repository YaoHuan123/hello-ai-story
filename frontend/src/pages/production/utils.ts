import { getLocale, t } from "../../i18n";
import type { VideoTaskStatus } from "../../types/production";

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const tag = getLocale() === "zh" ? "zh-CN" : "en-US";
  return d.toLocaleString(tag, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isVideoActive(status: VideoTaskStatus): boolean {
  return status === "queued" || status === "running" || status === "pending";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseApiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return t("common.requestFailed");
}

const TEXT_SUMMARY_LEN = 120;

export function summarizeText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= TEXT_SUMMARY_LEN) return trimmed;
  return `${trimmed.slice(0, TEXT_SUMMARY_LEN)}…`;
}
