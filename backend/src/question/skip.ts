import { isExtendKey } from "./topicPersist";
import type { QuestionSet } from "../topic/types";

/** 与前端展示一致：用户跳过时的落盘答案。 */
export const INTERVIEW_SKIP_LABEL = "（跳过）";

/**
 * 是否允许跳过当前题：
 * - 扩展追问（`__extend_*`）
 * - 非 catalog（热点 / 生成题 / 素材题等）
 * - catalog 选填字段（key 含「选填」）
 */
export function isQuestionSkippable(questionSet: QuestionSet, key: string): boolean {
  const k = key.trim();
  if (!k) return false;
  if (isExtendKey(k)) return true;
  if (questionSet.kind !== "catalog") return true;
  if (k.includes("必填")) return false;
  if (k.includes("选填")) return true;
  return false;
}
