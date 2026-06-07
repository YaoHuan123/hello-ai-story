import { QUESTION_TEXT_MAX_CHARS } from "../content/displayLocale";
import type { ColloquializeItem } from "./types";
const REASON_MAX_LEN = 60;

function assertQuestionText(question: string, questionText: string): void {
  if (/请填写|^\[|fieldKey|please fill|fill in\b|enter your/i.test(questionText)) {
    throw new Error("COLLOQUIALIZE_INVALID: questionText 不得为填表指令或字段名复述");
  }
  if (
    /选项|选择对应|点选|按钮|UI/i.test(questionText) ||
    /select from|tap to|choose one of|pick from/i.test(questionText)
  ) {
    throw new Error(`COLLOQUIALIZE_INVALID: questionText 不得包含选项操作提示（${question}）`);
  }
}

/**
 * 解析口语化 LLM 输出。
 *
 * @throws COLLOQUIALIZE_INVALID | COLLOQUIALIZE_MISSING_INPUT
 */
export function parseColloquialize(
  parsed: unknown,
  allowedQuestions: readonly string[],
): ColloquializeItem[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("COLLOQUIALIZE_INVALID: 模型输出不是对象");
  }
  const root = parsed as Record<string, unknown>;
  if ("error" in root) {
    throw new Error(`COLLOQUIALIZE_MISSING_INPUT: ${JSON.stringify(root)}`);
  }
  const arr = root.questions;
  if (!Array.isArray(arr)) {
    throw new Error("COLLOQUIALIZE_INVALID: questions 须为数组");
  }
  if (arr.length !== allowedQuestions.length) {
    throw new Error(
      `COLLOQUIALIZE_INVALID: questions 条数 ${arr.length} 与输入 ${allowedQuestions.length} 不一致`,
    );
  }

  const allowed = new Set(allowedQuestions);
  const seen = new Set<string>();
  const out: ColloquializeItem[] = [];

  for (let idx = 0; idx < arr.length; idx++) {
    const item = arr[idx];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("COLLOQUIALIZE_INVALID: questions 项须为对象");
    }
    const row = item as Record<string, unknown>;
    // 优先用 i (index)，兼容旧格式 question
    const iRaw = row.i;
    let question: string;
    if (typeof iRaw === "number") {
      if (!Number.isInteger(iRaw) || iRaw < 0 || iRaw >= allowedQuestions.length) {
        throw new Error(`COLLOQUIALIZE_INVALID: i=${iRaw} 超出范围 (0-${allowedQuestions.length - 1})`);
      }
      question = allowedQuestions[iRaw]!;
    } else {
      // 旧格式兼容
      question = String(row.question ?? row.fieldKey ?? "").trim();
    }
    const questionText = String(row.questionText ?? "").trim();
    const reason = String(row.reason ?? "").trim();

    if (!question || !allowed.has(question)) {
      throw new Error(`COLLOQUIALIZE_INVALID: 非法 question="${question}"`);
    }
    if (seen.has(question)) {
      throw new Error(`COLLOQUIALIZE_INVALID: 重复 question="${question}"`);
    }
    seen.add(question);
    if (row.skip === true) {
      throw new Error(`COLLOQUIALIZE_INVALID: 口语化步不得 skip（${question}）`);
    }
    if (!questionText) {
      throw new Error(`COLLOQUIALIZE_INVALID: questionText 缺失（${question}）`);
    }
    const maxLen = QUESTION_TEXT_MAX_CHARS;
    if (questionText.length > maxLen) {
      throw new Error(`COLLOQUIALIZE_INVALID: questionText 超过 ${maxLen} 字`);
    }
    assertQuestionText(question, questionText);
    if (reason.length > REASON_MAX_LEN) {
      throw new Error("COLLOQUIALIZE_INVALID: reason 超过 60 字");
    }
    out.push({ question, questionText, ...(reason ? { reason } : {}) });
  }

  for (const q of allowedQuestions) {
    if (!seen.has(q)) {
      throw new Error(`COLLOQUIALIZE_INVALID: 缺少 question="${q}"`);
    }
  }
  return out;
}
