import { Router, type Response } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { createUserWorkspace } from "../services/workspace.service";
import {
  createInterview,
  assertInterviewExists,
  deleteInterview,
  listInterviews,
  type InterviewScope,
} from "../services/interviewWorkspace.service";
import { getInterviewDisplayLocale, runWithDisplayLocaleSync } from "../content/displayLocale";
import { getInterviewChatHistoryForDisplay } from "../services/interviewChatHistory.service";
import { getCurrentQuestionTraced, submit } from "../services/interviewOrchestrator.service";
import { synthesizeCurrentQuestionTts } from "../services/interviewQuestionTts.service";

const submitSchema = z
  .object({
    key: z.string().min(1).max(300),
    text: z.string().min(1).max(4000),
    value: z.string().max(8000).optional().default(""),
    skip: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.skip && !data.value.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "value 不能为空（跳过时请传 skip: true）",
        path: ["value"],
      });
    }
  });

const createInterviewSchema = z.object({
  title: z.string().max(200).optional(),
});

function scopeFromReq(userId: string, interviewId: string): InterviewScope {
  return { userId, interviewId: interviewId.trim() };
}

/**
 * 出题/编排器错误 → HTTP。返回 true 表示已写响应。
 */
function mapInterviewError(res: Response, error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message || "";
  const code = msg.split(":")[0]?.trim() || "INTERVIEW_ERROR";

  console.warn("[interview.error]", {
    name: error.name,
    message: msg,
    stack: error.stack?.split("\n").slice(0, 6).join("\n"),
  });

  if (code === "INTERVIEW_NOT_FOUND") {
    res.status(404).json({ code, message: "采访不存在" });
    return true;
  }
  if (code.endsWith("MISSING_INPUT") || code === "INVALID_PARAMS") {
    res.status(400).json({ code, message: "请求参数有误" });
    return true;
  }
  if (code === "INVALID_FIELD_ANSWER") {
    const detail = msg.split(":").slice(1).join(":").trim();
    res.status(400).json({ code, message: detail || "答案格式不正确" });
    return true;
  }
  if (code === "QUESTION_NOT_SKIPPABLE") {
    res.status(400).json({ code, message: "当前题目不可跳过" });
    return true;
  }
  if (code === "TOPIC_PICK_NOT_FOUND") {
    res.status(400).json({ code, message: "所选主题不存在或已失效，请重新获取题目" });
    return true;
  }
  if (
    code === "QUESTION_ENGINE_NO_SESSION" ||
    code === "QUESTION_ENGINE_COMPLETE" ||
    code === "QUESTION_ENGINE_DUPLICATE" ||
    code === "INTERVIEW_TOPIC_IN_PROGRESS"
  ) {
    res.status(409).json({ code, message: "提交与当前进度不一致，请重新获取当前题目" });
    return true;
  }
  if (
    code.startsWith("LLM_") ||
    code === "DISPLAY_TRANSLATE_INVALID" ||
    code === "EXTEND_INVALID" ||
    code === "TOPIC_LLM_INVALID" ||
    code === "DEDUPE_INVALID" ||
    code === "COLLOQUIALIZE_INVALID" ||
    code === "SUGGEST_BATCH_INVALID" ||
    code === "REFINE_INVALID" ||
    code === "SUGGEST_CURRENT_INVALID" ||
    error.name === "AbortError"
  ) {
    res.status(502).json({ code: "AI_SERVICE_UNAVAILABLE", message: "AI 服务暂不可用，请稍后再试" });
    return true;
  }
  if (code === "INTERVIEW_TTS_EMPTY" || code === "INTERVIEW_TTS_FAILED") {
    res.status(502).json({ code: "TTS_UNAVAILABLE", message: "语音播报暂不可用，请稍后再试" });
    return true;
  }
  return false;
}

/**
 * 访谈 HTTP 层（均需登录）：
 * - POST /api/interviews              创建采访
 * - GET  /api/interviews              列出采访
 * - DELETE /api/interviews/:id        删除采访
 * - GET  /api/interviews/:id/current      读当前题
 * - GET  /api/interviews/:id/current/tts  当前展示题 TTS（audio/mpeg）
 * - POST /api/interviews/:id/submit       交（主题 / 答案）
 */
export const createInterviewRouter = (): Router => {
  const router = Router();
  router.use(authMiddleware);

  router.post("/", (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = createInterviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    try {
      createUserWorkspace(user.userId);
      const meta = createInterview(user.userId, { title: parsed.data.title });
      res.status(201).json(meta);
    } catch (error) {
      if (mapInterviewError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "创建采访失败" });
    }
  });

  router.get("/", (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    createUserWorkspace(user.userId);
    res.status(200).json({ interviews: listInterviews(user.userId) });
  });

  router.get("/:interviewId/messages", async (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromReq(user.userId, req.params.interviewId);
    try {
      assertInterviewExists(scope);
      const messages = await getInterviewChatHistoryForDisplay(scope);
      res.status(200).json({ messages });
    } catch (error) {
      if (mapInterviewError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "获取聊天记录失败" });
    }
  });

  router.get("/:interviewId/current/tts", async (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromReq(user.userId, req.params.interviewId);
    try {
      assertInterviewExists(scope);
      const { audio, locale } = await synthesizeCurrentQuestionTts(scope);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Interview-Locale", locale);
      res.status(200).send(audio);
    } catch (error) {
      if (mapInterviewError(res, error)) return;
      res.status(500).json({ code: "INTERVIEW_TTS_FAILED", message: "语音合成失败" });
    }
  });

  router.get("/:interviewId/current", async (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromReq(user.userId, req.params.interviewId);
    try {
      assertInterviewExists(scope);
      const question = await getCurrentQuestionTraced(scope);
      res.status(200).json(question);
    } catch (error) {
      if (mapInterviewError(res, error)) return;
      res.status(500).json({ code: "CURRENT_QUESTION_FAILED", message: "获取当前题目失败" });
    }
  });

  router.delete("/:interviewId", (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    try {
      deleteInterview(user.userId, req.params.interviewId);
      res.status(200).json({ ok: true as const });
    } catch (error) {
      if (mapInterviewError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "删除采访失败" });
    }
  });

  router.post("/:interviewId/submit", (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const scope = scopeFromReq(user.userId, req.params.interviewId);
    try {
      assertInterviewExists(scope);
      const locale = getInterviewDisplayLocale(scope);
      runWithDisplayLocaleSync(locale, () => submit(scope, parsed.data));
      res.status(200).json({ ok: true as const });
    } catch (error) {
      if (mapInterviewError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "提交失败" });
    }
  });

  return router;
};
