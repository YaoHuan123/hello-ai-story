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

const CODE_HINTS: Record<string, string> = {
  VIDEO_PIPELINE_NO_SECTIONS: "请先在「访谈」页完成至少一个小节的问答。",
  TEXT_PIPELINE_NO_SECTIONS: "请先在「访谈」页完成至少一个小节的问答。",
  VIDEO_STYLE_NOT_FOUND: "所选视频风格不可用，请重新选择。",
  AI_SERVICE_UNAVAILABLE: "AI 服务暂时不可用，请稍后再试。",
  VIDEO_QUEUE_RETRY_INVALID: "当前任务状态无法重试。",
  VIDEO_QUEUE_TASK_NOT_FAILED: "仅失败任务可重试；若修改了音色等配置，请新建任务。",
};

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
      title: "配音服务拒绝请求",
      detail: "当前音色 ID 可能未授权或不可用。",
      hint: "请换用 M392 男声等已开通音色，并新建任务（重试不会更新队列参数）。",
    };
  }

  if (/ECONNREFUSED|fetch failed|network/i.test(raw)) {
    return {
      title: "网络连接失败",
      detail: "无法连接后端或第三方服务。",
      hint: "请确认 API、worker 已启动。",
    };
  }

  if (/LLM_|OPENAI_|timeout/i.test(raw)) {
    return {
      title: "AI 生成失败",
      detail: detail || "模型调用出错或超时。",
      hint: CODE_HINTS.AI_SERVICE_UNAVAILABLE,
    };
  }

  if (/ffmpeg|ENOENT.*ffmpeg/i.test(raw)) {
    return {
      title: "视频渲染环境缺失",
      detail: "未找到 ffmpeg。",
      hint: "请在服务器安装 ffmpeg 并加入 PATH。",
    };
  }

  if (code && CODE_HINTS[code]) {
    return {
      title: detail || code,
      detail: detail || raw,
      hint: CODE_HINTS[code],
    };
  }

  if (code) {
    return {
      title: detail || "任务执行失败",
      detail: raw,
    };
  }

  return {
    title: "任务执行失败",
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
