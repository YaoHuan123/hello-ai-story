import { chatJson } from "../topic/llm.js";
import { loadWatchQuizGradePrompt } from "../campaign/loadWatchQuizPrompt.js";

export type GradeResult = {
  correct: boolean;
  reason: string;
};

function isStubMode(): boolean {
  return process.env.WATCH_QUIZ_STUB === "1" || process.env.NODE_ENV === "test";
}

/** 开发/测试 stub：近似匹配，不再一律判对。 */
function stubGrade(referenceAnswer: string, userAnswer: string): GradeResult {
  const ua = userAnswer.trim();
  if (!ua) {
    return { correct: false, reason: "未作答" };
  }

  const ref = referenceAnswer.trim();
  const refLower = ref.toLowerCase();
  const ansLower = ua.toLowerCase();

  if (ansLower === refLower) {
    return { correct: true, reason: "回答正确" };
  }
  if (refLower.includes(ansLower) && ua.length >= 2) {
    return { correct: true, reason: "回答正确" };
  }
  if (ansLower.includes(refLower.slice(0, Math.min(12, refLower.length))) && refLower.length >= 4) {
    return { correct: true, reason: "回答基本正确" };
  }

  const tokens = ref
    .split(/[\s，。、；！？!?,.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (tokens.length > 0) {
    const hit = tokens.filter((t) => ansLower.includes(t.toLowerCase())).length;
    const need = Math.max(1, Math.ceil(tokens.length * 0.35));
    if (hit >= need) {
      return { correct: true, reason: "回答基本正确" };
    }
  }

  return { correct: false, reason: "与参考答案不符，请再想想" };
}

type LlmGradeOutput = { correct?: boolean; reason?: string };

export async function gradeQuizAnswer(input: {
  question: string;
  referenceAnswer: string;
  userAnswer: string;
}): Promise<GradeResult> {
  const userAnswer = input.userAnswer.trim();
  if (!userAnswer) {
    return { correct: false, reason: "请先输入答案" };
  }

  if (isStubMode()) {
    return stubGrade(input.referenceAnswer, userAnswer);
  }

  const { systemText, userSuffix } = loadWatchQuizGradePrompt();
  const payload = {
    question: input.question,
    referenceAnswer: input.referenceAnswer,
    userAnswer,
  };
  const userContent = userSuffix.replace("{{INPUT_JSON}}", JSON.stringify(payload, null, 2));
  const raw = await chatJson<LlmGradeOutput>([
    { role: "system", content: systemText },
    { role: "user", content: userContent },
  ]);

  const correct = raw.correct === true;
  const reason =
    typeof raw.reason === "string" && raw.reason.trim()
      ? raw.reason.trim()
      : correct
        ? "回答正确"
        : "回答不正确";
  return { correct, reason };
}
