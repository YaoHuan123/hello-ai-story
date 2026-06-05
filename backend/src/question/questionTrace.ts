import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { getInterviewRootDir } from "../services/interviewWorkspace.service";

export type QuestionTraceSpan = {
  step: string;
  durationMs: number;
  ok: boolean;
  at: string;
  detail?: string;
  inputFile?: string;
  outputFile?: string;
};

type QuestionTraceContext = {
  operation: string;
  traceDir: string;
  interviewId: string;
  t0: number;
  spans: QuestionTraceSpan[];
  nextLlmSeq: number;
};

const storage = new AsyncLocalStorage<QuestionTraceContext>();

/** 默认 dev 开启；生产可设 QUESTION_LLM_TRACE=0 关闭。 */
export function questionTraceEnabled(): boolean {
  const v = (process.env.QUESTION_LLM_TRACE ?? "on").trim().toLowerCase();
  return v !== "0" && v !== "off" && v !== "false" && v !== "no";
}

export function interviewQuestionTraceRoot(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), "出题", "trace");
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function appendManifest(traceDir: string, line: Record<string, unknown>): void {
  fs.mkdirSync(traceDir, { recursive: true });
  fs.appendFileSync(path.join(traceDir, "manifest.jsonl"), `${JSON.stringify(line)}\n`, "utf-8");
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^\w.-]+/g, "_").slice(0, 80) || "chatJson";
}

function logSummary(ctx: QuestionTraceContext, err: unknown): void {
  const totalMs = Date.now() - ctx.t0;
  const lines = ctx.spans.map(
    (s) => `  ${s.step.padEnd(28)} ${String(s.durationMs).padStart(6)}ms ${s.ok ? "ok" : "FAIL"}`,
  );
  const head = `[question.trace] ${ctx.operation} total=${totalMs}ms interview=${ctx.interviewId}`;
  if (err instanceof Error) {
    console.warn(`${head} error=${err.message}\n${lines.join("\n")}\n  traceDir: ${ctx.traceDir}`);
  } else {
    console.info(`${head}\n${lines.join("\n")}\n  traceDir: ${ctx.traceDir}`);
  }
}

function flushTrace(scope: InterviewScope, ctx: QuestionTraceContext, err: unknown): void {
  const totalMs = Date.now() - ctx.t0;
  const summary = {
    operation: ctx.operation,
    interviewId: ctx.interviewId,
    totalMs,
    ok: !err,
    error: err instanceof Error ? err.message : err ? String(err) : undefined,
    at: new Date().toISOString(),
    spans: ctx.spans,
  };
  writeJson(path.join(ctx.traceDir, "summary.json"), summary);
  appendManifest(ctx.traceDir, { type: "summary", ...summary });
  writeJson(path.join(interviewQuestionTraceRoot(scope), "latest-run.json"), {
    traceDir: ctx.traceDir,
    operation: ctx.operation,
    totalMs,
    at: summary.at,
    spans: ctx.spans,
  });
  logSummary(ctx, err);
}

/**
 * 包裹一次 HTTP 出题请求（如 getCurrentQuestion），落盘各 LLM 子步骤耗时。
 * 目录：`采访/{id}/出题/trace/{timestamp}-{operation}/`
 */
export async function runWithQuestionTrace<T>(
  scope: InterviewScope,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!questionTraceEnabled()) {
    return fn();
  }
  const traceDir = path.join(interviewQuestionTraceRoot(scope), `${Date.now()}-${operation}`);
  fs.mkdirSync(traceDir, { recursive: true });
  const ctx: QuestionTraceContext = {
    operation,
    traceDir,
    interviewId: scope.interviewId,
    t0: Date.now(),
    spans: [],
    nextLlmSeq: 1,
  };
  return storage.run(ctx, async () => {
    try {
      const result = await fn();
      flushTrace(scope, ctx, null);
      return result;
    } catch (error) {
      flushTrace(scope, ctx, error);
      throw error;
    }
  });
}

/** 记录编排层一步（如 prep.dedupe）；须在 runWithQuestionTrace 内调用。 */
export async function traceQuestionStep<T>(step: string, fn: () => Promise<T>): Promise<T> {
  const ctx = storage.getStore();
  const t0 = Date.now();
  if (!ctx) {
    return fn();
  }
  try {
    const result = await fn();
    const span: QuestionTraceSpan = {
      step,
      durationMs: Date.now() - t0,
      ok: true,
      at: new Date().toISOString(),
    };
    ctx.spans.push(span);
    appendManifest(ctx.traceDir, { type: "span", ...span });
    return result;
  } catch (error) {
    const span: QuestionTraceSpan = {
      step,
      durationMs: Date.now() - t0,
      ok: false,
      at: new Date().toISOString(),
      detail: error instanceof Error ? error.message : String(error),
    };
    ctx.spans.push(span);
    appendManifest(ctx.traceDir, { type: "span", ...span });
    throw error;
  }
}

/** 由 topic/llm.chatJson 调用，记录单次 LLM HTTP 往返耗时。 */
export function recordQuestionLlmCall(params: {
  label: string;
  durationMs: number;
  ok: boolean;
  detail?: string;
  inputFile?: string;
  outputFile?: string;
}): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  const span: QuestionTraceSpan = {
    step: `llm.${params.label}`,
    durationMs: params.durationMs,
    ok: params.ok,
    at: new Date().toISOString(),
    ...(params.detail ? { detail: params.detail } : {}),
    ...(params.inputFile ? { inputFile: params.inputFile } : {}),
    ...(params.outputFile ? { outputFile: params.outputFile } : {}),
  };
  ctx.spans.push(span);
  appendManifest(ctx.traceDir, { type: "llm", ...span });
}

/** 由 topic/llm.chatJson 调用，保存发给 LLM 的完整请求体（不含 API Key）。 */
export function writeQuestionLlmInput(params: {
  label: string;
  request: Record<string, unknown>;
}): string | undefined {
  const ctx = storage.getStore();
  if (!ctx || !questionTraceEnabled()) return undefined;

  const seq = ctx.nextLlmSeq++;
  const file = `llm-${String(seq).padStart(4, "0")}-${sanitizeLabel(params.label)}-input.json`;
  writeJson(path.join(ctx.traceDir, file), {
    seq,
    label: params.label,
    at: new Date().toISOString(),
    request: params.request,
  });
  appendManifest(ctx.traceDir, {
    type: "llm-input",
    seq,
    label: params.label,
    inputFile: file,
    at: new Date().toISOString(),
  });
  return file;
}

/** 由 topic/llm.chatJson 调用，保存 LLM 输出（成功或失败）。 */
export function writeQuestionLlmOutput(params: {
  label: string;
  inputFile?: string;
  ok: boolean;
  output: Record<string, unknown>;
}): string | undefined {
  const ctx = storage.getStore();
  if (!ctx || !questionTraceEnabled()) return undefined;

  const inputMatch = params.inputFile?.match(/^llm-(\d+)-(.+)-input\.json$/);
  const seqText = inputMatch?.[1] ?? String(ctx.nextLlmSeq++).padStart(4, "0");
  const labelPart = inputMatch?.[2] ?? sanitizeLabel(params.label);
  const file = `llm-${seqText}-${labelPart}-output.json`;
  writeJson(path.join(ctx.traceDir, file), {
    label: params.label,
    at: new Date().toISOString(),
    ok: params.ok,
    ...(params.inputFile ? { inputFile: params.inputFile } : {}),
    ...params.output,
  });
  appendManifest(ctx.traceDir, {
    type: "llm-output",
    label: params.label,
    ok: params.ok,
    outputFile: file,
    ...(params.inputFile ? { inputFile: params.inputFile } : {}),
    at: new Date().toISOString(),
  });
  return file;
}

const llmLabel = new AsyncLocalStorage<string>();

export function runWithLlmTraceLabel<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return llmLabel.run(label, fn);
}

export function currentLlmTraceLabel(): string | undefined {
  return llmLabel.getStore();
}
