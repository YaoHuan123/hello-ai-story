import {
  PHASE_LABELS,
  pipelineProgressPercent,
  pipelineStepsForMode,
  resolveStepStates,
  type PipelineStepDef,
} from "../../constants/videoPipelineSteps";
import type { VideoProductionMode, VideoTaskStatus } from "../../types/production";

type Props = {
  productionMode: VideoProductionMode;
  status: VideoTaskStatus;
  completedSteps: string[];
  compact?: boolean;
};

function groupByPhase(steps: Array<PipelineStepDef & { state: string }>) {
  const groups: Array<{ phase: PipelineStepDef["phase"]; steps: typeof steps }> = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    if (last?.phase === step.phase) {
      last.steps.push(step);
    } else {
      groups.push({ phase: step.phase, steps: [step] });
    }
  }
  return groups;
}

export function PipelineProgress({ productionMode, status, completedSteps, compact }: Props) {
  const defs = pipelineStepsForMode(productionMode);
  const steps = resolveStepStates(defs, completedSteps, status);
  const percent = pipelineProgressPercent(defs, completedSteps, status);
  const groups = groupByPhase(steps);

  const statusLine =
    status === "success"
      ? "已完成"
      : status === "failed"
        ? "已失败"
        : status === "running"
          ? "生成中"
          : status === "queued"
            ? "排队中"
            : "待处理";

  return (
    <div className="pipeline-progress">
      <div className="pipeline-progress__header">
        <span className="pipeline-progress__status">{statusLine}</span>
        <span className="pipeline-progress__percent">{percent}%</span>
      </div>
      <div className="pipeline-progress__bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="pipeline-progress__bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {!compact && (
        <div className="pipeline-progress__phases">
          {groups.map((group) => (
            <div key={group.phase} className="pipeline-progress__phase">
              <div className="pipeline-progress__phase-title">{PHASE_LABELS[group.phase]}</div>
              <ul className="pipeline-progress__steps">
                {group.steps.map((step) => (
                  <li key={step.id} className={`pipeline-step pipeline-step--${step.state}`}>
                    <span className="pipeline-step__dot" aria-hidden />
                    <span className="pipeline-step__id">{step.id}</span>
                    <span className="pipeline-step__label">{step.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
