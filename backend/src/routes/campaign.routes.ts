import { Router, type Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import type { CampaignPlanService } from "../campaign/campaignPlan.service";
import { listPublishableVideos } from "../campaign/publishableVideos";
import type { QuizQuestionService } from "../campaign/quizQuestion.service";

const selectedQuestionSchema = z.object({
  question: z.string().trim().min(1).max(500),
  referenceAnswer: z.string().trim().min(1).max(2000),
});

const createPlanSchema = z.object({
  endYear: z.number().int().min(2000).max(2100),
  totalPointsBudget: z.number().int().positive().max(1_000_000),
  interviewId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
  questions: z.array(selectedQuestionSchema).min(1).max(200),
});

const generateQuestionsSchema = z.object({
  interviewId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
  excludeQuestions: z.array(z.string().trim().min(1)).max(200).optional(),
});

function mapCampaignError(res: Response, error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = error.message;
  if (code === "INVALID_END_YEAR") {
    res.status(400).json({ code, message: "结束年份须为今年或之后" });
    return true;
  }
  if (code === "INVALID_BUDGET" || code === "BUDGET_TOO_LARGE" || code === "BUDGET_NOT_DIVISIBLE") {
    res.status(400).json({
      code: code === "BUDGET_NOT_DIVISIBLE" ? code : "INVALID_BUDGET",
      message: code === "BUDGET_NOT_DIVISIBLE" ? "每年积分须能被 100 整除" : "投入积分无效",
    });
    return true;
  }
  if (code === "VIDEO_REQUIRED") {
    res.status(400).json({ code, message: "请选择要发布的视频" });
    return true;
  }
  if (code === "VIDEO_NOT_FOUND" || code === "VIDEO_NOT_READY") {
    res.status(400).json({ code: "VIDEO_NOT_READY", message: "所选视频不可用，请选已生成成功的成片" });
    return true;
  }
  if (code === "VIDEO_ALREADY_PUBLISHED") {
    res.status(400).json({ code, message: "该视频已发布到其他计划" });
    return true;
  }
  if (code === "QUIZ_QUESTIONS_REQUIRED") {
    res.status(400).json({ code, message: "请至少选择一道问答题" });
    return true;
  }
  if (code === "QUIZ_QUESTIONS_TOO_MANY") {
    res.status(400).json({ code, message: "所选题目过多" });
    return true;
  }
  if (code === "QUIZ_CONTENT_MISSING") {
    res.status(400).json({ code, message: "暂无可用故事内容，请先生成文本或完成采访" });
    return true;
  }
  if (code.startsWith("QUIZ_GENERATE_INVALID")) {
    res.status(502).json({ code: "QUIZ_GENERATE_FAILED", message: "题目生成失败，请重试" });
    return true;
  }
  if (code === "INSUFFICIENT_BALANCE") {
    res.status(400).json({ code, message: "积分余额不足，请先充值" });
    return true;
  }
  if (code === "PLAN_NOT_FOUND") {
    res.status(404).json({ code, message: "计划不存在" });
    return true;
  }
  return false;
}

export const createCampaignRouter = (
  db: DatabaseSync,
  campaignPlanService: CampaignPlanService,
  quizQuestionService: QuizQuestionService,
): Router => {
  const router = Router();

  router.get("/publishable-videos", authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const videos = listPublishableVideos(db, user.userId);
    res.status(200).json({ videos });
  });

  router.post("/quiz-questions/generate", authMiddleware, async (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = generateQuestionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    try {
      const questions = await quizQuestionService.generateBatch(user.userId, parsed.data);
      res.status(200).json({ questions });
    } catch (error) {
      if (mapCampaignError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "Generate questions failed" });
    }
  });

  router.post("/plans", authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = createPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    try {
      const plan = campaignPlanService.createPlan(user.userId, parsed.data);
      res.status(201).json(plan);
    } catch (error) {
      if (mapCampaignError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "Create plan failed" });
    }
  });

  router.get("/plans/mine", authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const plans = campaignPlanService.listMyPlans(user.userId);
    res.status(200).json({ plans });
  });

  router.get("/plans/:planId", authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const planId = String(req.params.planId ?? "").trim();
    if (!planId) {
      res.status(400).json({ code: "INVALID_PARAMS", message: "planId required" });
      return;
    }
    const plan = campaignPlanService.getPlanForCreator(user.userId, planId);
    if (!plan) {
      res.status(404).json({ code: "PLAN_NOT_FOUND", message: "计划不存在" });
      return;
    }
    res.status(200).json(plan);
  });

  return router;
};
