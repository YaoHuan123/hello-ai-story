import { t } from "../i18n";

type ErrorParts = {
  code: string;
  detail: string;
  raw: string;
};

function parseErrorMessage(raw: string): ErrorParts {
  const trimmed = raw.trim();
  const colon = trimmed.indexOf(":");
  if (colon <= 0) {
    return { code: "", detail: trimmed, raw: trimmed };
  }
  return {
    code: trimmed.slice(0, colon).trim(),
    detail: trimmed.slice(colon + 1).trim(),
    raw: trimmed,
  };
}

function codeHint(code: string): string | undefined {
  const hints: Record<string, string> = {
    VIDEO_PIPELINE_NO_SECTIONS: t("production.errorNoSections"),
    TEXT_PIPELINE_NO_SECTIONS: t("production.errorNoSections"),
    VIDEO_STYLE_NOT_FOUND: t("production.errorStyleNotFound"),
    AI_SERVICE_UNAVAILABLE: t("production.errorAiUnavailable"),
    VIDEO_QUEUE_RETRY_INVALID: t("production.errorRetryInvalid"),
    VIDEO_QUEUE_TASK_NOT_FAILED: t("production.errorRetryNotFailed"),
  };
  return hints[code];
}

/** 将后端错误码 / 原始 message 转为用户可读说明。 */
export function formatProductionError(input: string | undefined | null): {
  title: string;
  detail: string;
  hint?: string;
} | null {
  if (!input?.trim()) return null;
  const { code, detail, raw } = parseErrorMessage(input);

  if (/3001|TTS.*403|voice_type|音色/i.test(raw)) {
    return {
      title: t("production.errorTtsTitle"),
      detail: t("production.errorTtsDetail"),
      hint: t("production.errorTtsHint"),
    };
  }

  if (/ECONNREFUSED|fetch failed|network/i.test(raw)) {
    return {
      title: t("production.errorNetworkTitle"),
      detail: t("production.errorNetworkDetail"),
      hint: t("production.errorNetworkHint"),
    };
  }

  if (/LLM_|OPENAI_|timeout/i.test(raw)) {
    return {
      title: t("production.errorLlmTitle"),
      detail: detail || t("production.errorLlmDetail"),
      hint: t("production.errorAiUnavailable"),
    };
  }

  if (/ffmpeg|ENOENT.*ffmpeg/i.test(raw)) {
    return {
      title: t("production.errorFfmpegTitle"),
      detail: t("production.errorFfmpegDetail"),
      hint: t("production.errorFfmpegHint"),
    };
  }

  const hint = code ? codeHint(code) : undefined;
  if (code && hint) {
    return {
      title: detail || code,
      detail: detail || raw,
      hint,
    };
  }

  if (code) {
    return {
      title: detail || t("production.errorTaskFailed"),
      detail: raw,
    };
  }

  return {
    title: t("production.errorTaskFailed"),
    detail: raw,
  };
}

/** 合并 meta.lastError 与 queue.error。 */
export function formatTaskFailure(
  lastError?: string,
  queueError?: { code: string; message: string },
): { title: string; detail: string; hint?: string } | null {
  if (queueError?.message) {
    const fromQueue = formatProductionError(`${queueError.code}: ${queueError.message}`);
    if (fromQueue) return fromQueue;
  }
  return formatProductionError(lastError);
}
