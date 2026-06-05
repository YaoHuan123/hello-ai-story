import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { writeJsonAtomic } from "../orchestrator/pipelineDisk.js";

export const VIDEO_LLM_TRACE_SUBDIR = path.join("trace", "llm");

type VideoLlmTraceContext = {
  traceDir: string;
  nextSeq: number;
  lastCall?: { seq: number; baseName: string };
};

const storage = new AsyncLocalStorage<VideoLlmTraceContext>();

function traceEnabled(): boolean {
  const v = (process.env.VIDEO_LLM_TRACE ?? "on").trim().toLowerCase();
  return v !== "0" && v !== "off" && v !== "false" && v !== "no";
}

export function videoLlmTraceDirForTask(taskRoot: string): string {
  return path.join(taskRoot, VIDEO_LLM_TRACE_SUBDIR);
}

export function runWithVideoLlmTrace<T>(traceDir: string, fn: () => Promise<T>): Promise<T> {
  if (!traceEnabled()) {
    return fn();
  }
  fs.mkdirSync(traceDir, { recursive: true });
  return storage.run({ traceDir, nextSeq: 1 }, fn);
}

function sanitizeStepId(stepId: string): string {
  return stepId.replace(/[^\w.-]+/g, "_").slice(0, 80) || "chat";
}

function appendManifest(traceDir: string, line: Record<string, unknown>): void {
  const manifestPath = path.join(traceDir, "manifest.jsonl");
  fs.appendFileSync(manifestPath, `${JSON.stringify(line)}\n`, "utf-8");
}

export function writeVideoLlmTraceInput(params: {
  debugStepId: string;
  depth: number;
  attempt: number;
  request: Record<string, unknown>;
}): { seq: number; baseName: string } | null {
  const ctx = storage.getStore();
  if (!ctx || !traceEnabled()) return null;

  const seq = ctx.nextSeq++;
  const baseName = `${String(seq).padStart(5, "0")}-${sanitizeStepId(params.debugStepId)}`;
  const inputPath = path.join(ctx.traceDir, `${baseName}-input.json`);
  writeJsonAtomic(inputPath, {
    seq,
    debugStepId: params.debugStepId,
    at: new Date().toISOString(),
    depth: params.depth,
    attempt: params.attempt,
    ...params.request,
  });
  ctx.lastCall = { seq, baseName };
  return ctx.lastCall;
}

export function writeVideoLlmTraceOutput(params: {
  baseName: string;
  seq: number;
  debugStepId: string;
  ok: boolean;
  output: Record<string, unknown>;
}): void {
  const ctx = storage.getStore();
  if (!ctx || !traceEnabled()) return;

  const outputPath = path.join(ctx.traceDir, `${params.baseName}-output.json`);
  writeJsonAtomic(outputPath, {
    seq: params.seq,
    debugStepId: params.debugStepId,
    at: new Date().toISOString(),
    ok: params.ok,
    ...params.output,
  });
  appendManifest(ctx.traceDir, {
    seq: params.seq,
    debugStepId: params.debugStepId,
    inputFile: `${params.baseName}-input.json`,
    outputFile: `${params.baseName}-output.json`,
    ok: params.ok,
    at: new Date().toISOString(),
  });
}

export function writeVideoLlmTraceParseError(params: {
  debugStepId: string;
  raw: string;
  error: unknown;
}): void {
  const ctx = storage.getStore();
  if (!ctx || !traceEnabled() || !ctx.lastCall) return;

  const { baseName, seq } = ctx.lastCall;
  const errPath = path.join(ctx.traceDir, `${baseName}-parse-error.json`);
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  writeJsonAtomic(errPath, {
    seq,
    debugStepId: params.debugStepId,
    at: new Date().toISOString(),
    message,
    rawLength: params.raw.length,
    rawPreview: params.raw.slice(0, 4000),
  });
  appendManifest(ctx.traceDir, {
    seq,
    debugStepId: params.debugStepId,
    parseErrorFile: `${baseName}-parse-error.json`,
    ok: false,
    at: new Date().toISOString(),
  });
}
