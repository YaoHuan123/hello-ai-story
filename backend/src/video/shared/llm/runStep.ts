import { chatJson, getVideoLlmEnv, type ChatOptions } from "./client";
import { buildVideoLlmMessages } from "./localeLlm";

/**
 * 传记成片通用 LLM 步：加载提示词 → 注入 PIPELINE_JSON → chatJson → 校验输出。
 */
export async function runVideoLlmStep<T>(params: {
  promptBasename: string;
  pipeline: unknown;
  assert: (parsed: unknown) => T;
  debugStepId: string;
  temperature?: number;
  skipWhen?: () => boolean;
  emptyWhenSkipped?: T;
}): Promise<T> {
  if (params.skipWhen?.()) {
    return params.emptyWhenSkipped as T;
  }

  if (!getVideoLlmEnv().apiKey) {
    throw new Error("OPENAI_API_KEY 未配置");
  }

  const pipeline =
    params.pipeline && typeof params.pipeline === "object" && !Array.isArray(params.pipeline)
      ? (params.pipeline as Record<string, unknown>)
      : { pipeline: params.pipeline };
  const { messages } = buildVideoLlmMessages(params.promptBasename, pipeline);

  const chatOpts: ChatOptions = {
    debugStepId: params.debugStepId,
    temperature: params.temperature ?? 0.25,
    useJsonObject: true,
  };

  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(messages, chatOpts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${params.debugStepId.toUpperCase()}_LLM_FAILED: ${msg}`);
  }

  return params.assert(parsed);
}
