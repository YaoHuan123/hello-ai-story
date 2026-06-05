import type { VideoProductionMode } from "../types/production";

export type PipelineStepDef = {
  id: string;
  label: string;
  phase: "prep" | "narrative" | "voice" | "visual" | "render";
};

const PREP_STEP_DEFS: PipelineStepDef[] = [
  { id: "10", label: "素材润色", phase: "prep" },
  { id: "20", label: "时代背景", phase: "prep" },
  { id: "30", label: "时代子场景", phase: "prep" },
  { id: "40", label: "时代场景包", phase: "prep" },
  { id: "50", label: "时代场景补全", phase: "prep" },
  { id: "60", label: "事件分离", phase: "prep" },
  { id: "70", label: "上下文扩写", phase: "prep" },
  { id: "80", label: "分割去重", phase: "prep" },
];

const BIO_POST_PREP: PipelineStepDef[] = [
  { id: "90", label: "个人子场景", phase: "narrative" },
  { id: "100", label: "交叉验证", phase: "narrative" },
  { id: "110", label: "环境叙事", phase: "narrative" },
  { id: "120", label: "场景润色", phase: "narrative" },
  { id: "130", label: "姓名统一", phase: "narrative" },
  { id: "140", label: "阶段替换", phase: "narrative" },
  { id: "150", label: "合并叙事", phase: "narrative" },
  { id: "160", label: "旁白生成", phase: "voice" },
  { id: "170", label: "旁白连贯", phase: "voice" },
  { id: "180", label: "TTS 配音", phase: "voice" },
  { id: "190", label: "视觉规划", phase: "visual" },
  { id: "200", label: "视觉扩展", phase: "visual" },
  { id: "210", label: "风格前缀", phase: "visual" },
  { id: "220", label: "用户地点图", phase: "visual" },
  { id: "230", label: "地理标识", phase: "visual" },
  { id: "240", label: "文生图", phase: "visual" },
  { id: "250", label: "视频片段", phase: "render" },
  { id: "260", label: "合并成片", phase: "render" },
];

const STUDIO_POST_PREP: PipelineStepDef[] = [
  { id: "iv_script", label: "对话脚本", phase: "narrative" },
  { id: "iv_tts", label: "TTS 配音", phase: "voice" },
  { id: "iv_duration_align", label: "时长对齐", phase: "voice" },
  { id: "iv_clips", label: "片段渲染", phase: "render" },
  { id: "iv_merge", label: "合并成片", phase: "render" },
];

const STUDIO_PREP_IDS = new Set(["10", "60", "70", "80"]);

export const PHASE_LABELS: Record<PipelineStepDef["phase"], string> = {
  prep: "准备",
  narrative: "叙事",
  voice: "配音",
  visual: "画面",
  render: "成片",
};

export function pipelineStepsForMode(mode: VideoProductionMode): PipelineStepDef[] {
  if (mode === "interview_studio") {
    const prep = PREP_STEP_DEFS.filter((s) => STUDIO_PREP_IDS.has(s.id));
    return [...prep, ...STUDIO_POST_PREP];
  }
  return [...PREP_STEP_DEFS, ...BIO_POST_PREP];
}

export function stepLabel(stepId: string): string {
  const all = [...PREP_STEP_DEFS, ...BIO_POST_PREP, ...STUDIO_POST_PREP];
  return all.find((s) => s.id === stepId)?.label ?? stepId;
}

export type StepVisualState = "done" | "active" | "pending" | "failed";

export function resolveStepStates(
  steps: PipelineStepDef[],
  completedSteps: string[],
  status: "pending" | "queued" | "running" | "success" | "failed",
): Array<PipelineStepDef & { state: StepVisualState }> {
  const done = new Set(completedSteps);
  let activeId: string | null = null;

  if (status === "running" || status === "queued") {
    for (const step of steps) {
      if (!done.has(step.id)) {
        activeId = step.id;
        break;
      }
    }
  }

  return steps.map((step) => {
    if (done.has(step.id)) return { ...step, state: "done" as const };
    if (status === "failed" && step.id === activeId) return { ...step, state: "failed" as const };
    if (step.id === activeId && (status === "running" || status === "queued")) {
      return { ...step, state: "active" as const };
    }
    return { ...step, state: "pending" as const };
  });
}

export function pipelineProgressPercent(
  steps: PipelineStepDef[],
  completedSteps: string[],
  status: "pending" | "queued" | "running" | "success" | "failed",
): number {
  if (status === "success") return 100;
  if (steps.length === 0) return 0;
  const done = completedSteps.filter((id) => steps.some((s) => s.id === id)).length;
  const base = (done / steps.length) * 100;
  if (status === "running" && done < steps.length) {
    return Math.min(99, base + 100 / steps.length / 2);
  }
  return Math.round(base);
}
