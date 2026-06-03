import { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL } from "../config";

/** 发给模型的一条对话消息（仅用到 system 与 user 两种角色）。 */
export type ChatMessage = { role: "system" | "user"; content: string };

/** 整次请求（连接 + 等待模型返回完整响应）的超时上限。 */
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * 去掉模型可能套上的 ```json ... ``` Markdown 代码块围栏，取出内部 JSON 文本。
 * 无围栏时原样返回 trim 后的文本。
 */
function stripCodeFence(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("```")) {
    const firstNewline = t.indexOf("\n");
    const lastFence = t.lastIndexOf("```");
    if (lastFence > firstNewline) {
      return t.slice(firstNewline + 1, lastFence).trim();
    }
  }
  return t;
}

/**
 * 最小 OpenAI 兼容 chat 调用：发送消息、要求 JSON 输出并解析为对象。
 *
 * 模型与端点由 `OPENAI_*` 环境变量（经 config）决定；豆包 hybrid 模型走
 * `thinking: disabled`、不带 `response_format`，其余模型带 `json_object`。
 *
 * @typeParam T 期望解析出的 JSON 结构
 * @param messages system / user 消息序列
 * @returns 解析后的 JSON 对象
 * @throws LLM_HTTP_* 非 2xx；LLM_EMPTY_RESPONSE 空内容；LLM_BAD_JSON 无法解析；
 *         AbortError 超过 {@link REQUEST_TIMEOUT_MS}
 */
export async function chatJson<T>(messages: ChatMessage[]): Promise<T> {
  const isDoubao = /doubao/i.test(OPENAI_MODEL);
  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    messages,
    temperature: 0,
  };
  // 豆包 hybrid 模型不支持 response_format，且默认关闭 thinking 降延迟。
  if (isDoubao) {
    body.thinking = { type: "disabled" };
  } else {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM_HTTP_${res.status}: ${text.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) {
    throw new Error("LLM_EMPTY_RESPONSE: 模型未返回内容");
  }
  const cleaned = stripCodeFence(content);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`LLM_BAD_JSON: 无法解析模型输出：${cleaned.slice(0, 400)}`);
  }
}
