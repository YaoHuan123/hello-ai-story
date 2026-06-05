import { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL } from "../../../config";
import {
  writeVideoLlmTraceInput,
  writeVideoLlmTraceOutput,
  writeVideoLlmTraceParseError,
} from "./videoLlmTrace.js";

export type ChatMessage = { role: "system" | "user"; content: string };

export type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  useJsonObject?: boolean;
  thinking?: "enabled" | "disabled" | "auto";
  debugStepId?: string;
};

const MAX_OUTPUT_TOKENS_DEFAULT = 32_768;

const GLOBAL_BIO_MEMOIR_PREFIX =
  "个人怀旧自传插画，私人童年回忆纪实画面，非商用纪念创作。个人怀旧自传插画，私人童年回忆纪实画面，非商用纪念创作。个人怀旧自传插画，私人童年回忆纪实画面，非商用纪念创作。";

function isGlobalPrefixEnabled(): boolean {
  const v = (process.env.OPENAI_GLOBAL_SYSTEM_PREFIX ?? "on").trim().toLowerCase();
  return v !== "0" && v !== "off" && v !== "false" && v !== "no";
}

function applyGlobalPrefix(messages: ChatMessage[]): ChatMessage[] {
  if (!isGlobalPrefixEnabled()) return messages;
  return messages.map((m) => {
    if (m.role !== "system") return m;
    const base = (m.content ?? "").trim();
    return { ...m, content: base ? `${GLOBAL_BIO_MEMOIR_PREFIX}\n\n${base}` : GLOBAL_BIO_MEMOIR_PREFIX };
  });
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function maxOutputTokens(): number {
  const raw = process.env.OPENAI_MAX_OUTPUT_TOKENS?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 256 && n <= 262_144) return n;
  }
  return MAX_OUTPUT_TOKENS_DEFAULT;
}

function chatGlobalConcurrency(): number {
  const n = Number.parseInt(process.env.OPENAI_CHAT_GLOBAL_CONCURRENCY?.trim() ?? "16", 10);
  if (!Number.isFinite(n) || n < 1) return 16;
  return Math.min(256, Math.floor(n));
}

let chatActive = 0;
const chatWaiters: Array<() => void> = [];

async function acquireChatSlot(): Promise<() => void> {
  const limit = chatGlobalConcurrency();
  if (chatActive < limit) {
    chatActive++;
  } else {
    await new Promise<void>((resolve) => chatWaiters.push(resolve));
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = chatWaiters.shift();
    if (next) next();
    else chatActive--;
  };
}

export function getVideoLlmEnv(): {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** 与旧流水线错误文案兼容 */
  connectTimeoutMs: number;
  fetchRetryCount: number;
  fetchRetryDelayMs: number;
} {
  const timeoutMs = parsePositiveInt(process.env.OPENAI_FETCH_CONNECT_TIMEOUT_MS, 600_000);
  return {
    apiKey: OPENAI_API_KEY,
    baseUrl: OPENAI_BASE_URL,
    model: OPENAI_MODEL,
    timeoutMs,
    connectTimeoutMs: timeoutMs,
    fetchRetryCount: parsePositiveInt(process.env.OPENAI_FETCH_RETRY_COUNT, 3),
    fetchRetryDelayMs: parsePositiveInt(process.env.OPENAI_FETCH_RETRY_DELAY_MS, 1500),
  };
}

export function stringifyForAi(value: unknown): string {
  const pretty = ["1", "true", "yes"].includes(
    (process.env.OPENAI_DEBUG_JSON_PRETTY ?? "").trim().toLowerCase(),
  );
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstNewline = trimmed.indexOf("\n");
  const lastFence = trimmed.lastIndexOf("```");
  if (lastFence > firstNewline) return trimmed.slice(firstNewline + 1, lastFence).trim();
  return trimmed;
}

function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 末位兜底修复：按括号栈重写一段以 `{` 开头的 JSON，纠正
 * (1) 响应截断导致的未闭合括号/字符串；(2) 用错闭合符（如该 `]` 却写成 `}`）。
 * 仅在严格解析失败后尝试，故不影响合法 JSON。
 */
function repairJsonBrackets(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;

  let out = "";
  const stack: Array<"}" | "]"> = [];
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      out += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "{") {
      stack.push("}");
      out += c;
      continue;
    }
    if (c === "[") {
      stack.push("]");
      out += c;
      continue;
    }
    if (c === "}" || c === "]") {
      // 用错闭合符时：先补出栈顶应有的闭合符，直到与当前字符匹配。
      while (stack.length > 0 && stack[stack.length - 1] !== c) {
        out += stack.pop();
      }
      if (stack.length === 0) {
        // 多余的闭合符，丢弃。
        continue;
      }
      stack.pop();
      out += c;
      continue;
    }
    out += c;
  }

  if (inString) out += '"';
  // 去掉结尾残缺 token 后的悬挂逗号，再补齐未闭合括号。
  out = out.replace(/,\s*$/, "");
  while (stack.length > 0) {
    out += stack.pop();
  }
  return out;
}

export function parseModelJson<T>(raw: string, context: string): T {
  const cleaned = stripCodeFence(raw).trim();
  const balanced = extractBalancedJsonObject(cleaned);
  const repaired = repairJsonBrackets(cleaned);
  const attempts = [
    cleaned,
    balanced,
    balanced?.replace(/,(\s*[}\]])/g, "$1"),
    repaired,
    repaired?.replace(/,(\s*[}\]])/g, "$1"),
  ].filter((s): s is string => Boolean(s?.trim()));
  for (const s of attempts) {
    try {
      return JSON.parse(s) as T;
    } catch {
      /* try next */
    }
  }
  throw new Error(`${context}：无法解析为 JSON（长度 ${cleaned.length}）`);
}

function shouldAttachJsonObject(taskWantsJson: boolean, modelId: string): boolean {
  return taskWantsJson && !/doubao/i.test(modelId);
}

function resolveThinking(modelId: string, baseUrl: string, explicit?: ChatOptions["thinking"]) {
  if (explicit !== undefined) return explicit;
  const isArkDoubao =
    /doubao/i.test(modelId) ||
    (baseUrl.includes("ark.cn-beijing") && baseUrl.includes("volces.com"));
  return isArkDoubao ? ("disabled" as const) : undefined;
}

async function chatInternal(messages: ChatMessage[], opts: ChatOptions, depth: number): Promise<string> {
  const env = getVideoLlmEnv();
  if (!env.apiKey) {
    throw new Error("OPENAI_API_KEY 未配置");
  }

  const model = (opts.model ?? env.model).trim() || env.model;
  const useJson = opts.useJsonObject ?? true;
  const messagesToSend = depth === 0 ? applyGlobalPrefix(messages) : messages;
  const body: Record<string, unknown> = {
    model,
    messages: messagesToSend,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? maxOutputTokens(),
  };
  if (shouldAttachJsonObject(useJson, model)) {
    body.response_format = { type: "json_object" };
  }
  const thinking = resolveThinking(model, env.baseUrl, opts.thinking);
  if (thinking) body.thinking = { type: thinking };

  const url = `${env.baseUrl}/chat/completions`;
  const debugStepId = opts.debugStepId ?? "chatJson";
  let traceCall: ReturnType<typeof writeVideoLlmTraceInput> = null;
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    traceCall = writeVideoLlmTraceInput({
      debugStepId,
      depth,
      attempt,
      request: { url, body },
    });
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), env.timeoutMs);
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.apiKey}`,
            "Content-Type": "application/json",
            Connection: "close",
          },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      break;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (traceCall) {
        writeVideoLlmTraceOutput({
          ...traceCall,
          debugStepId,
          ok: false,
          output: { error: message, phase: "network" },
        });
      }
      if (attempt < env.fetchRetryCount) {
        await new Promise((r) => setTimeout(r, env.fetchRetryDelayMs * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (traceCall) {
      writeVideoLlmTraceOutput({
        ...traceCall,
        debugStepId,
        ok: false,
        output: { httpStatus: res.status, raw: text },
      });
    }
    if (useJson && res.status === 400 && text.includes("-10003")) {
      return chatInternal(messages, { ...opts, useJsonObject: false }, depth + 1);
    }
    throw new Error(`VIDEO_LLM_HTTP_${res.status}: ${text.slice(0, 400)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (traceCall) {
    writeVideoLlmTraceOutput({
      ...traceCall,
      debugStepId,
      ok: Boolean(content.trim()),
      output: { httpStatus: res.status, raw: content },
    });
  }
  if (!content.trim()) throw new Error("VIDEO_LLM_EMPTY_RESPONSE");
  return content;
}

async function chat(messages: ChatMessage[], opts: ChatOptions = {}, depth = 0): Promise<string> {
  if (depth > 0) return chatInternal(messages, opts, depth);
  const release = await acquireChatSlot();
  try {
    return await chatInternal(messages, opts, depth);
  } finally {
    release();
  }
}

export async function chatJson<T>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T> {
  const debugStepId = opts.debugStepId ?? "chatJson";
  const raw = await chat(messages, { ...opts, useJsonObject: opts.useJsonObject ?? true });
  try {
    return parseModelJson<T>(raw, debugStepId);
  } catch (e) {
    writeVideoLlmTraceParseError({ debugStepId, raw, error: e });
    throw e;
  }
}

/** 与文生图等无 system 消息的能力共用前缀开关。 */
export function prependGlobalBioMemoirPrefix(text: string): string {
  if (!isGlobalPrefixEnabled()) return text;
  const base = text.trim();
  return base ? `${GLOBAL_BIO_MEMOIR_PREFIX}\n\n${base}` : GLOBAL_BIO_MEMOIR_PREFIX;
}
