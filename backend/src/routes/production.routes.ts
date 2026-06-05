import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { assertInterviewExists, type InterviewScope } from "../services/interviewWorkspace.service";
import { runTextPipeline } from "../text/orchestrator/runTextPipeline";
import { getTextTaskProgress, listTextTasks } from "../text/textTaskQuery";
import { openTextTask } from "../text/orchestrator/textTaskWorkspace";
import { listTextTaskArtifacts, openTextArtifactFile } from "../text/textTaskArtifacts";
import {
  getVideoTaskProgress,
  listVideoTasks,
  listVideoTaskArtifacts,
  openVideoArtifactFile,
  retryScheduledVideoTask,
  scheduleBiographyVideoTask,
  scheduleStudioVideoTask,
} from "../video/worker/index";

const polishModeSchema = z.enum(["llm", "stub"]).optional();

/** 302 / 火山 voice_type 形态；拒绝 default-voice 等占位符 */
const ttsVoiceSchema = z
  .string()
  .min(8)
  .max(200)
  .regex(/^zh_[a-z0-9_]+$/i, "须为火山 voice_type，如 zh_male_M392_conversation_wvae_bigtts");

const scheduleBiographySchema = z.object({
  ttsVoice: ttsVoiceSchema,
  styleConfigPath: z.string().max(500).optional(),
  polishMode: polishModeSchema,
  throughStep: z.string().max(64).optional(),
  taskId: z.string().uuid().optional(),
});

const scheduleStudioSchema = z.object({
  hostVoice: ttsVoiceSchema,
  guestVoice: ttsVoiceSchema,
  qaGranularity: z.enum(["hybrid", "per_event", "batch"]).optional(),
  polishMode: polishModeSchema,
  throughStep: z.string().max(64).optional(),
  taskId: z.string().uuid().optional(),
});

const createTextTaskSchema = z.object({
  mode: polishModeSchema,
});

const artifactRelQuerySchema = z.object({
  rel: z.string().min(1).max(500),
});

function sendArtifactFile(
  res: Response,
  file: { absPath: string; mimeType: string; filename: string },
  disposition: "inline" | "attachment",
): void {
  const abs = path.resolve(file.absPath);
  if (!fs.existsSync(abs)) {
    res.status(404).json({ code: "ARTIFACT_NOT_FOUND", message: "产物不存在" });
    return;
  }
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
  );
  const stream = fs.createReadStream(abs);
  stream.on("error", (err) => {
    if (!res.headersSent) {
      res.status(500).json({ code: "INTERNAL_ERROR", message: err.message });
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

type InterviewRouteParams = { interviewId: string };
type TaskRouteParams = InterviewRouteParams & { taskId: string };

function scopeFromReq(userId: string, interviewId: string): InterviewScope {
  return { userId, interviewId: interviewId.trim() };
}

function scopeFromInterviewReq(req: Request<InterviewRouteParams>, userId: string): InterviewScope {
  return scopeFromReq(userId, req.params.interviewId);
}

function requireUserId(req: Request): string | null {
  return req.user?.userId?.trim() || null;
}

function mapProductionError(res: Response, error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message || "";
  const code = msg.split(":")[0]?.trim() || "PRODUCTION_ERROR";

  console.warn("[production.error]", { code, message: msg });

  if (code === "INTERVIEW_NOT_FOUND" || code === "VIDEO_TASK_NOT_FOUND" || code === "TEXT_TASK_NOT_FOUND") {
    res.status(404).json({ code, message: "资源不存在" });
    return true;
  }
  if (
    code === "VIDEO_ARTIFACT_NOT_FOUND" ||
    code === "TEXT_ARTIFACT_NOT_FOUND" ||
    code === "TEXT_ARTICLE_NOT_FOUND"
  ) {
    res.status(404).json({ code, message: "产物尚未生成或不存在" });
    return true;
  }
  if (code === "VIDEO_ARTIFACT_PATH_INVALID") {
    res.status(400).json({ code, message: "产物路径无效" });
    return true;
  }
  if (code === "VIDEO_TASK_SCOPE_MISMATCH" || code === "TEXT_TASK_SCOPE_MISMATCH") {
    res.status(403).json({ code, message: "无权访问该任务" });
    return true;
  }
  if (
    code === "VIDEO_QUEUE_RETRY_INVALID" ||
    code === "VIDEO_QUEUE_INVALID" ||
    code === "VIDEO_QUEUE_TASK_NOT_FAILED" ||
    code === "VIDEO_QUEUE_TASK_NOT_FOUND"
  ) {
    res.status(409).json({ code, message: "任务状态不允许该操作" });
    return true;
  }
  if (code === "VIDEO_QUEUE_NOT_FOUND") {
    res.status(404).json({ code, message: "队列任务不存在" });
    return true;
  }
  if (
    code.endsWith("_MISSING_INPUT") ||
    code.endsWith("_REQUIRED") ||
    code.endsWith("_INVALID") ||
    code === "TEXT_PIPELINE_NO_SECTIONS" ||
    code === "INVALID_PARAMS"
  ) {
    res.status(400).json({ code, message: msg.split(":").slice(1).join(":").trim() || "请求参数有误" });
    return true;
  }
  if (code.startsWith("LLM_") || code.startsWith("OPENAI_") || code.includes("_LLM_")) {
    res.status(502).json({ code: "AI_SERVICE_UNAVAILABLE", message: "AI 服务暂不可用，请稍后再试" });
    return true;
  }
  return false;
}

/**
 * 成片 / 文本生产 HTTP（挂载于 `/api/interviews/:interviewId`，均需登录）。
 *
 * Video（异步，需 worker）：
 * - GET  /video/tasks
 * - GET  /video/tasks/:taskId
 * - POST /video/biography
 * - POST /video/studio
 * - POST /video/tasks/:taskId/retry
 * - GET  /video/tasks/:taskId/artifacts
 * - GET  /video/tasks/:taskId/artifacts/file?rel=
 * - GET  /video/tasks/:taskId/video
 *
 * Text（同步生成）：
 * - GET  /text/tasks
 * - POST /text/tasks
 * - GET  /text/tasks/:taskId
 * - GET  /text/tasks/:taskId/article
 * - GET  /text/tasks/:taskId/artifacts
 * - GET  /text/tasks/:taskId/artifacts/file
 */
export function createProductionRouter(): Router {
  const router = Router({ mergeParams: true });
  router.use(authMiddleware);

  router.get("/video/tasks", (req: Request<InterviewRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    try {
      assertInterviewExists(scope);
      res.status(200).json({ tasks: listVideoTasks(scope) });
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "列出成片任务失败" });
    }
  });

  router.get("/video/tasks/:taskId", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      res.status(200).json(getVideoTaskProgress(scope, taskId));
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "查询成片进度失败" });
    }
  });

  router.post("/video/biography", (req: Request<InterviewRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = scheduleBiographySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    try {
      assertInterviewExists(scope);
      const scheduled = scheduleBiographyVideoTask(scope, parsed.data);
      res.status(202).json({
        taskId: scheduled.videoTaskId,
        queueTaskId: scheduled.queueTaskId,
        kind: scheduled.queueRecord.kind,
        status: scheduled.queueRecord.status,
      });
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "创建传记成片任务失败" });
    }
  });

  router.post("/video/studio", (req: Request<InterviewRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = scheduleStudioSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    try {
      assertInterviewExists(scope);
      const scheduled = scheduleStudioVideoTask(scope, parsed.data);
      res.status(202).json({
        taskId: scheduled.videoTaskId,
        queueTaskId: scheduled.queueTaskId,
        kind: scheduled.queueRecord.kind,
        status: scheduled.queueRecord.status,
      });
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "创建演播室成片任务失败" });
    }
  });

  router.post("/video/tasks/:taskId/retry", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      const rec = retryScheduledVideoTask(scope, taskId);
      res.status(200).json({
        taskId: rec.videoTaskId,
        queueTaskId: rec.queueTaskId,
        status: rec.status,
      });
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "重试成片任务失败" });
    }
  });

  router.get("/video/tasks/:taskId/artifacts", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      res.status(200).json(listVideoTaskArtifacts(scope, taskId));
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "列出成片产物失败" });
    }
  });

  router.get("/video/tasks/:taskId/artifacts/file", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = artifactRelQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "缺少 rel 参数" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      const file = openVideoArtifactFile(scope, taskId, parsed.data.rel);
      const inline =
        file.mimeType.startsWith("video/") ||
        file.mimeType.startsWith("audio/") ||
        file.mimeType.startsWith("image/");
      sendArtifactFile(res, file, inline ? "inline" : "attachment");
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "下载成片产物失败" });
    }
  });

  router.get("/video/tasks/:taskId/video", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      const artifacts = listVideoTaskArtifacts(scope, taskId);
      if (!artifacts.primaryVideo.available || !artifacts.primaryVideo.relativePath) {
        res.status(404).json({ code: "VIDEO_ARTIFACT_NOT_FOUND", message: "完整视频尚未生成" });
        return;
      }
      const file = openVideoArtifactFile(scope, taskId, artifacts.primaryVideo.relativePath);
      sendArtifactFile(res, file, "inline");
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "读取完整视频失败" });
    }
  });

  router.get("/text/tasks", (req: Request<InterviewRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    try {
      assertInterviewExists(scope);
      res.status(200).json({ tasks: listTextTasks(scope) });
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "列出文本任务失败" });
    }
  });

  router.post("/text/tasks", async (req: Request<InterviewRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = createTextTaskSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    try {
      assertInterviewExists(scope);
      const result = await runTextPipeline(scope, {
        createTask: true,
        mode: parsed.data.mode,
      });
      res.status(201).json({
        taskId: result.taskId,
        status: result.status,
        completedSteps: result.stepResults.map((s) => s.stepId),
        articlePath: result.articlePath,
        progress: getTextTaskProgress(scope, result.taskId),
      });
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "生成文本失败" });
    }
  });

  router.get("/text/tasks/:taskId", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      res.status(200).json(getTextTaskProgress(scope, taskId));
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "查询文本任务失败" });
    }
  });

  router.get("/text/tasks/:taskId/article", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      const handle = openTextTask(scope, taskId);
      if (!fs.existsSync(handle.paths.articlePath)) {
        res.status(404).json({ code: "TEXT_ARTICLE_NOT_FOUND", message: "正式文章尚未生成" });
        return;
      }
      const raw = JSON.parse(fs.readFileSync(handle.paths.articlePath, "utf-8")) as Record<string, unknown>;
      const article = typeof raw.article === "string" ? raw.article : "";
      if (!article.trim()) {
        res.status(404).json({ code: "TEXT_ARTICLE_NOT_FOUND", message: "正式文章尚未生成" });
        return;
      }
      res.status(200).json({
        taskId,
        savedAt: typeof raw.savedAt === "string" ? raw.savedAt : undefined,
        sectionCount: typeof raw.sectionCount === "number" ? raw.sectionCount : undefined,
        skippedModel: typeof raw.skippedModel === "boolean" ? raw.skippedModel : undefined,
        article,
      });
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "读取正式文章失败" });
    }
  });

  router.get("/text/tasks/:taskId/artifacts", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      res.status(200).json(listTextTaskArtifacts(scope, taskId));
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "列出文本产物失败" });
    }
  });

  router.get("/text/tasks/:taskId/artifacts/file", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      const file = openTextArtifactFile(scope, taskId);
      sendArtifactFile(res, { ...file, mimeType: "application/json" }, "attachment");
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "下载文本产物失败" });
    }
  });

  return router;
}
