import { chatJson, getVideoLlmEnv, stringifyForAi } from "../client.js";
import { loadVideoPromptParts } from "../loadPrompt.js";

const PROMPT_FILE = "step-70_context-expand-events.md";

/** 模型偶发将 segmentIndex 以字符串返回；仅接受可解析为有限数字的值（非业务兜底，属 JSON 形态归一）。 */
function parseSegmentIndex78(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

export type ContextExpandPipelineInput = {
  polishedEventSummaries: Record<string, string>;
  polishedContextSummaries: Record<string, string>;
};

export type PolishedEventSummariesContextExpandedItem = {
  segmentIndex: number;
  narrative: string;
  timeLabel: string;
  title?: string;
  relatedTemplateIds?: string[];
};

/** 将未知 JSON 规范为 id→字符串 的对象（步骤 79/85 管道复用）。 */
export function normalizeStringRecordFromUnknown(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") {
      out[k] = val.trim();
    } else if (val != null && typeof val !== "object") {
      out[k] = String(val);
    }
  }
  return out;
}

/** 将时间线片段数组 JSON 规范为强类型列表（跳过无效项）。 */
export function normalizeTimelineSegmentItemsFromUnknown(v: unknown): PolishedEventSummariesContextExpandedItem[] {
  if (!Array.isArray(v)) {
    return [];
  }
  const out: PolishedEventSummariesContextExpandedItem[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const o = item as Record<string, unknown>;
    const segIdx = parseSegmentIndex78(o.segmentIndex);
    if (segIdx === null) {
      continue;
    }
    if (typeof o.narrative !== "string" || !o.narrative.trim()) {
      continue;
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      continue;
    }
    const row: PolishedEventSummariesContextExpandedItem = {
      segmentIndex: segIdx,
      narrative: o.narrative.trim(),
      timeLabel: o.timeLabel.trim(),
    };
    if (typeof o.title === "string" && o.title.trim()) {
      row.title = o.title.trim();
    }
    if (Array.isArray(o.relatedTemplateIds)) {
      const ids = o.relatedTemplateIds.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      if (ids.length) {
        row.relatedTemplateIds = ids;
      }
    }
    out.push(row);
  }
  return out;
}

function bodyFromTemplateInstance(o: Record<string, unknown>): string {
  if (typeof o.summary === "string" && o.summary.trim()) {
    return o.summary.trim();
  }
  if ("data" in o) {
    const d = o.data;
    if (typeof d === "string" && d.trim()) {
      return d.trim();
    }
    if (d === null || d === undefined) {
      return "";
    }
    if (typeof d === "object") {
      return JSON.stringify(d);
    }
    return String(d);
  }
  return "";
}

/**
 * 从步骤 60 落盘对象（templateInstances + segmentKindById）派生 demo 所需的
 * polishedEventSummaries / polishedContextSummaries（id → 展示正文）。
 */
export function derivePolishedSummariesFromClassifyRaw(raw: Record<string, unknown>): {
  polishedEventSummaries: Record<string, string>;
  polishedContextSummaries: Record<string, string>;
} {
  const polishedEventSummaries: Record<string, string> = {};
  const polishedContextSummaries: Record<string, string> = {};

  const ti = raw.templateInstances;
  const sk = raw.segmentKindById;
  if (!Array.isArray(ti) || ti.length === 0) {
    return { polishedEventSummaries, polishedContextSummaries };
  }
  if (!sk || typeof sk !== "object" || Array.isArray(sk)) {
    return { polishedEventSummaries, polishedContextSummaries };
  }
  const segmentKindById = sk as Record<string, unknown>;

  for (const item of ti) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id) {
      continue;
    }
    const kind = segmentKindById[id];
    if (kind !== "event" && kind !== "context") {
      continue;
    }
    const text = bodyFromTemplateInstance(o);
    if (kind === "event") {
      polishedEventSummaries[id] = text;
    } else {
      polishedContextSummaries[id] = text;
    }
  }

  return { polishedEventSummaries, polishedContextSummaries };
}

function coerceContextExpand70Root(parsed: unknown): Record<string, unknown> {
  if (Array.isArray(parsed)) {
    return { polishedEventSummariesContextExpanded: parsed };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("CONTEXT_EXPAND_70_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  if (Array.isArray(root.polishedEventSummariesContextExpanded)) {
    return root;
  }
  if (typeof root.narrative === "string" && typeof root.timeLabel === "string") {
    return { polishedEventSummariesContextExpanded: [root] };
  }
  throw new Error("CONTEXT_EXPAND_70_INVALID: 缺少 polishedEventSummariesContextExpanded");
}

function assertPolishedEventSummariesContextExpandedShape(
  parsed: unknown,
): PolishedEventSummariesContextExpandedItem[] {
  const root = coerceContextExpand70Root(parsed);
  const arr = root.polishedEventSummariesContextExpanded;
  if (!Array.isArray(arr)) {
    throw new Error("CONTEXT_EXPAND_70_INVALID: polishedEventSummariesContextExpanded 须为数组");
  }

  const out: PolishedEventSummariesContextExpandedItem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("CONTEXT_EXPAND_70_INVALID: 数组项须为对象");
    }
    const o = item as Record<string, unknown>;
    if (typeof o.narrative !== "string" || !o.narrative.trim()) {
      throw new Error("CONTEXT_EXPAND_70_INVALID: narrative 须为非空字符串");
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      throw new Error("CONTEXT_EXPAND_70_INVALID: timeLabel 须为非空字符串");
    }
    const row: PolishedEventSummariesContextExpandedItem = {
      segmentIndex: out.length + 1,
      narrative: o.narrative.trim(),
      timeLabel: o.timeLabel.trim(),
    };
    if (typeof o.title === "string" && o.title.trim()) {
      row.title = o.title.trim();
    }
    if (Array.isArray(o.relatedTemplateIds)) {
      const ids = o.relatedTemplateIds.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      if (ids.length) {
        row.relatedTemplateIds = ids;
      }
    }
    out.push(row);
  }
  return out;
}

export async function runContextExpandFromPipelineJson(
  pipeline: ContextExpandPipelineInput,
): Promise<PolishedEventSummariesContextExpandedItem[]> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
  const pipelineStr = stringifyForAi(pipeline);
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(
      [
        { role: "system", content: systemText },
        { role: "user", content: userContent },
      ],
      {
        debugStepId: "context_expand_78",
        temperature: 0.2,
        useJsonObject: true,
      },
    );
  } catch (e) {
    throw wrapContextExpandCallError(e);
  }

  return assertPolishedEventSummariesContextExpandedShape(parsed);
}

function wrapContextExpandCallError(inner: unknown): Error {
  const msg = inner instanceof Error ? inner.message : String(inner);
  const timeoutMs = getVideoLlmEnv().connectTimeoutMs;

  if (
    /OPENAI_FETCH_CONNECT_TIMEOUT_MS|内未完成|整次 HTTP|AbortError|超时/.test(msg) ||
    /fetch_abort/.test(msg)
  ) {
    return new Error(
      `CONTEXT_EXPAND_70_INVALID: 步骤 78 请求超时或整次 HTTP 在 ${timeoutMs}ms 内未完成（含推理与响应传输，由 OPENAI_FETCH_CONNECT_TIMEOUT_MS 控制，与 max_tokens 截断无关）。详情：${msg}`,
    );
  }

  if (/未找到成对的闭合大括号|可能被截断/.test(msg)) {
    return new Error(
      `CONTEXT_EXPAND_70_INVALID: 模型返回内容疑似过长被截断，无法解析为 JSON。可尝试提高 OPENAI_MAX_OUTPUT_TOKENS 或换更长输出的模型。详情：${msg}`,
    );
  }

  return new Error(`CONTEXT_EXPAND_70_INVALID: 模型调用或响应解析失败。详情：${msg}`);
}
