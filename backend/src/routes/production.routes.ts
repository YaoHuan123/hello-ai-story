import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authMiddleware, verifyUserIdFromRequest } from "../middleware/auth";
import { assertInterviewExists, type InterviewScope } from "../services/interviewWorkspace.service";
import { getProductionReadiness } from "../services/productionReadiness.service";
import { runTextPipeline } from "../text/orchestrator/runTextPipeline";
import { deleteTextTask } from "../text/deleteTextTask";
import { getTextTaskProgress, listTextTasks } from "../text/textTaskQuery";
import { openTextTask } from "../text/orchestrator/textTaskWorkspace";
import { listTextTaskArtifacts, openTextArtifactFile } from "../text/textTaskArtifacts";
import {
  addInterviewPlaceImage,
  deleteInterviewPlaceImage,
  getInterviewPlaceImage,
  listInterviewPlaceImages,
  resolveInterviewPlaceImageAbs,
} from "../services/interviewPlaceImages.service";
import {
  getVideoTaskProgress,
  listVideoTasks,
  listVideoTaskArtifacts,
  openVideoArtifactFile,
  openVideoTaskCoverFile,
  deleteVideoTask,
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
  styleId: z.string().min(1).max(120).optional(),
  textTaskId: z.string().uuid().optional(),
  polishMode: polishModeSchema,
  throughStep: z.string().max(64).optional(),
  taskId: z.string().uuid().optional(),
});

const scheduleStudioSchema = z.object({
  hostVoice: ttsVoiceSchema,
  guestVoice: ttsVoiceSchema,
  qaGranularity: z.enum(["hybrid", "per_event", "batch"]).optional(),
  textTaskId: z.string().uuid().optional(),
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

const placeImageUploadSchema = z.object({
  placeKey: z.string().min(1).max(120),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataBase64: z.string().min(8).max(12_000_000),
  originalName: z.string().max(200).optional(),
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
    code === "VIDEO_COVER_NOT_FOUND" ||
    code === "TEXT_ARTIFACT_NOT_FOUND" ||
    code === "TEXT_ARTICLE_NOT_FOUND"
  ) {
    res.status(404).json({ code, message: "产物尚未生成或不存在" });
    return true;
  }
  if (code === "VIDEO_ARTIFACT_PATH_INVALID" || code === "PLACE_IMAGE_PATH_INVALID") {
    res.status(400).json({ code, message: "产物路径无效" });
    return true;
  }
  if (code === "PLACE_IMAGE_NOT_FOUND") {
    res.status(404).json({ code, message: "地点图片不存在" });
    return true;
  }
  if (code.startsWith("PLACE_IMAGE_")) {
    const detail = msg.split(":").slice(1).join(":").trim();
    res.status(400).json({ code, message: detail || "地点图片请求无效" });
    return true;
  }
  if (code === "VIDEO_TASK_SCOPE_MISMATCH" || code === "TEXT_TASK_SCOPE_MISMATCH") {
    res.status(403).json({ code, message: "无权访问该任务" });
    return true;
  }
  if (code === "TEXT_TASK_DELETE_BUSY" || code === "VIDEO_TASK_DELETE_BUSY") {
    const detail = msg.split(":").slice(1).join(":").trim();
    res.status(409).json({ code, message: detail || "任务进行中，暂不可删除" });
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
    code === "VIDEO_PIPELINE_NO_SECTIONS" ||
    code === "VIDEO_PIPELINE_NO_STORY_TEXT" ||
    code === "STORY_ARTICLE_MISSING" ||
    code === "VIDEO_STYLE_NOT_FOUND" ||
    code === "INVALID_PARAMS"
  ) {
    const detail = msg.split(":").slice(1).join(":").trim();
    const friendly =
      code === "VIDEO_PIPELINE_NO_SECTIONS" || code === "TEXT_PIPELINE_NO_SECTIONS"
        ? detail || "请先完成访谈问答"
        : code === "VIDEO_PIPELINE_NO_STORY_TEXT"
          ? detail || "请先在「创作文本」生成故事文本"
          : code === "STORY_ARTICLE_MISSING"
            ? detail || "所选故事文本不可用"
            : code === "VIDEO_STYLE_NOT_FOUND"
              ? detail || "所选视频风格不存在"
              : detail || "请求参数有误";
    res.status(400).json({ code, message: friendly });
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
 * - GET|POST|DELETE /assets/place-images（产品 UI 当前不做，见 docs/place-images-material-wall.md）
 * - GET    /assets/place-images/:imageId/file
 * - GET  /production/readiness
 * - GET  /video/tasks
 * - GET  /video/tasks/:taskId
 * - POST /video/biography
 * - POST /video/studio
 * - POST /video/tasks/:taskId/retry
 * - GET  /video/tasks/:taskId/artifacts
 * - GET  /video/tasks/:taskId/artifacts/file?rel=
 * - GET  /video/tasks/:taskId/video
 * - GET  /video/tasks/:taskId/cover（Bearer 或 query token=，供 img 标签）
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

  // 须在 authMiddleware 之前：img 标签只能用 query token= 鉴权
  router.get("/video/tasks/:taskId/cover", (req: Request<TaskRouteParams>, res) => {
    const userId = verifyUserIdFromRequest(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      const file = openVideoTaskCoverFile(scope, taskId);
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.sendFile(path.resolve(file.absPath));
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "读取成片封面失败" });
    }
  });

  router.use(authMiddleware);

  router.get("/assets/place-images", (req: Request<InterviewRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    try {
      assertInterviewExists(scope);
      res.status(200).json(listInterviewPlaceImages(scope));
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "读取地点图片失败" });
    }
  });

  router.post("/assets/place-images", (req: Request<InterviewRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const parsed = placeImageUploadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    try {
      assertInterviewExists(scope);
      const item = addInterviewPlaceImage(scope, parsed.data);
      res.status(201).json({ item, index: listInterviewPlaceImages(scope) });
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "上传地点图片失败" });
    }
  });

  router.delete("/assets/place-images/:imageId", (req: Request<InterviewRouteParams & { imageId: string }>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const imageId = req.params.imageId.trim();
    try {
      assertInterviewExists(scope);
      deleteInterviewPlaceImage(scope, imageId);
      res.status(200).json(listInterviewPlaceImages(scope));
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "删除地点图片失败" });
    }
  });

  router.get(
    "/assets/place-images/:imageId/file",
    (req: Request<InterviewRouteParams & { imageId: string }>, res) => {
      const userId = requireUserId(req);
      if (!userId) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
        return;
      }
      const scope = scopeFromInterviewReq(req, userId);
      const imageId = req.params.imageId.trim();
      try {
        assertInterviewExists(scope);
        const item = getInterviewPlaceImage(scope, imageId);
        const abs = resolveInterviewPlaceImageAbs(scope, item);
        if (!fs.existsSync(abs)) {
          res.status(404).json({ code: "PLACE_IMAGE_NOT_FOUND", message: "图片文件不存在" });
          return;
        }
        res.setHeader("Content-Type", item.mimeType);
        res.sendFile(abs);
      } catch (error) {
        if (mapProductionError(res, error)) return;
        res.status(500).json({ code: "INTERNAL_ERROR", message: "读取地点图片失败" });
      }
    },
  );

  router.get("/production/readiness", (req: Request<InterviewRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    try {
      assertInterviewExists(scope);
      res.status(200).json(getProductionReadiness(scope));
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "查询生产就绪状态失败" });
    }
  });

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

  router.delete("/video/tasks/:taskId", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      deleteVideoTask(scope, taskId);
      res.status(204).send();
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "删除成片任务失败" });
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

  router.delete("/text/tasks/:taskId", (req: Request<TaskRouteParams>, res) => {
    const userId = requireUserId(req);
    if (!userId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const scope = scopeFromInterviewReq(req, userId);
    const taskId = req.params.taskId.trim();
    try {
      assertInterviewExists(scope);
      deleteTextTask(scope, taskId);
      res.status(204).send();
    } catch (error) {
      if (mapProductionError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "删除文本任务失败" });
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
