type StepState = "done" | "active" | "upcoming";

type Props = {
  /** 0=访谈 1=文本 2=视频，表示当前推荐进行到的步骤 */
  activeIndex: number;
  className?: string;
};

const STEPS = ["访谈", "故事文本", "成片"] as const;

function stepState(index: number, activeIndex: number): StepState {
  if (index < activeIndex) return "done";
  if (index === activeIndex) return "active";
  return "upcoming";
}

export function WorkflowSteps({ activeIndex, className = "" }: Props) {
  return (
    <div className={`hs-workflow ${className}`.trim()} aria-label="创作流程">
      {STEPS.map((label, i) => {
        const state = stepState(i, activeIndex);
        return (
          <div
            key={label}
            className={`hs-workflow__step${state === "active" ? " hs-workflow__step--active" : ""}${state === "done" ? " hs-workflow__step--done" : ""}`}
          >
            <span className="hs-workflow__dot" aria-hidden>
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className="hs-workflow__label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
