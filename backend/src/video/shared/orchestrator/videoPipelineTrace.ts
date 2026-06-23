import fs from "node:fs";
import path from "node:path";
import { VIDEO_LLM_TRACE_SUBDIR } from "../llm/videoLlmTrace.js";
import { writeJsonAtomic } from "./pipelineDisk.js";

export const VIDEO_PIPELINE_TRACE_SUBDIR = "trace";
export const VIDEO_PIPELINE_RUN_SUMMARY_REL = path.join(VIDEO_PIPELINE_TRACE_SUBDIR, "run-summary.json");

export type VideoPipelineStepSpan = {
  stepId: string;
  durationMs: number;
  ok: boolean;
  skipped?: boolean;
  outputRelativePath?: string;
  at: string;
};

export type VideoPipelineLastLlmTrace = {
  debugStepId?: string;
  inputFile?: string;
  outputFile?: string;
  parseErrorFile?: string;
};

export type VideoPipelineRunSummary = {
  taskId: string;
  startedAt: string;
  finishedAt: string;
  status: "running" | "success" | "failed";
  totalMs: number;
  failedStepId?: string;
  lastError?: string;
  /** 失败时指向 trace/llm/manifest.jsonl 最后一条 LLM 调用 */
  lastLlmTrace?: VideoPipelineLastLlmTrace;
  steps: VideoPipelineStepSpan[];
};

function pipelineTraceEnabled(): boolean {
  const v = (process.env.VIDEO_PIPELINE_TRACE ?? process.env.VIDEO_LLM_TRACE ?? "on").trim().toLowerCase();
  return v !== "0" && v !== "off" && v !== "false" && v !== "no";
}

function readLastLlmTraceEntry(taskRoot: string): VideoPipelineLastLlmTrace | undefined {
  const manifestPath = path.join(taskRoot, VIDEO_LLM_TRACE_SUBDIR, "manifest.jsonl");
  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }
  try {
    const lines = fs.readFileSync(manifestPath, "utf-8").trim().split("\n").filter(Boolean);
    const last = lines[lines.length - 1];
    if (!last) {
      return undefined;
    }
    const row = JSON.parse(last) as Record<string, unknown>;
    return {
      debugStepId: typeof row.debugStepId === "string" ? row.debugStepId : undefined,
      inputFile: typeof row.inputFile === "string" ? row.inputFile : undefined,
      outputFile: typeof row.outputFile === "string" ? row.outputFile : undefined,
      parseErrorFile: typeof row.parseErrorFile === "string" ? row.parseErrorFile : undefined,
    };
  } catch {
    return undefined;
  }
}

/** 成片 pipeline 步骤耗时与失败摘要（落盘 taskRoot/trace/run-summary.json）。 */
export class VideoPipelineRunTracer {
  private readonly taskRoot: string;
  private readonly taskId: string;
  private readonly startedAt: string;
  private readonly startMs: number;
  private readonly steps: VideoPipelineStepSpan[] = [];
  private status: VideoPipelineRunSummary["status"] = "running";
  private failedStepId?: string;
  private lastError?: string;

  constructor(taskRoot: string, taskId: string) {
    this.taskRoot = taskRoot;
    this.taskId = taskId;
    this.startedAt = new Date().toISOString();
    this.startMs = Date.now();
  }

  enabled(): boolean {
    return pipelineTraceEnabled();
  }

  recordStep(span: Omit<VideoPipelineStepSpan, "at">): void {
    if (!this.enabled()) {
      return;
    }
    this.steps.push({ ...span, at: new Date().toISOString() });
    this.flush();
  }

  async runStep<T extends { stepId: string; skipped?: boolean; outputRelativePath?: string }>(
    stepId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const t0 = Date.now();
    try {
      const result = await fn();
      this.recordStep({
        stepId: result.stepId ?? stepId,
        durationMs: Date.now() - t0,
        ok: true,
        skipped: result.skipped,
        outputRelativePath: result.outputRelativePath,
      });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.failedStepId = stepId;
      this.lastError = message;
      this.recordStep({ stepId, durationMs: Date.now() - t0, ok: false });
      this.status = "failed";
      this.flush();
      console.warn(
        `[video.trace] task=${this.taskId} failed at step=${stepId} (${Date.now() - this.startMs}ms) → trace/run-summary.json`,
      );
      throw e;
    }
  }

  finishSuccess(): void {
    if (!this.enabled()) {
      return;
    }
    this.status = "success";
    this.flush();
  }

  /** 步骤外抛错（如 prep 前置校验失败）时补写失败摘要。 */
  finishFailed(message: string, failedStepId?: string): void {
    if (!this.enabled() || this.status === "failed") {
      return;
    }
    this.status = "failed";
    this.lastError = message;
    if (failedStepId) {
      this.failedStepId = failedStepId;
    }
    this.flush();
    console.warn(
      `[video.trace] task=${this.taskId} failed (${Date.now() - this.startMs}ms) → trace/run-summary.json`,
    );
  }

  private flush(): void {
    const summary: VideoPipelineRunSummary = {
      taskId: this.taskId,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      status: this.status,
      totalMs: Date.now() - this.startMs,
      steps: [...this.steps],
    };
    if (this.failedStepId) {
      summary.failedStepId = this.failedStepId;
    }
    if (this.lastError) {
      summary.lastError = this.lastError;
    }
    if (this.status === "failed") {
      summary.lastLlmTrace = readLastLlmTraceEntry(this.taskRoot);
    }
    const outPath = path.join(this.taskRoot, VIDEO_PIPELINE_RUN_SUMMARY_REL);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    writeJsonAtomic(outPath, summary);
  }
}

export function videoPipelineRunSummaryPath(taskRoot: string): string {
  return path.join(taskRoot, VIDEO_PIPELINE_RUN_SUMMARY_REL);
}
