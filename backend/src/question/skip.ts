import { isCatalogFieldOptional } from "../topic/catalog";
import { isExtendKey } from "./topicPersist";
import type { QuestionSet } from "../topic/types";

/** 中文落盘跳过标记（兼容旧数据与测试）。新写入请用 `interviewSkipLabel(locale)`。 */
export const INTERVIEW_SKIP_LABEL = "（跳过）";

/**
 * 是否允许跳过当前题：
 * - 扩展追问（`__extend_*`）
 * - 非 catalog（热点 / 生成题 / 素材题等）
 * - catalog 选填字段
 */
export function isQuestionSkippable(questionSet: QuestionSet, key: string): boolean {
  const k = key.trim();
  if (!k) return false;
  if (isExtendKey(k)) return true;
  if (questionSet.kind !== "catalog") return true;
  const title = questionSet.title.trim();
  if (!title) return false;
  if (isCatalogFieldOptional(title, k)) return true;
  if (k.includes("(optional)") || k.includes("选填")) return true;
  if (k.includes("(required)") || k.includes("必填")) return false;
  return false;
}
