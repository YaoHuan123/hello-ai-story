import path from "node:path";
import { Router, type Request, type Response } from "express";
import { authMiddleware, verifyUserIdFromRequest } from "../middleware/auth";
import {
  listVideoTaskArtifacts,
  openVideoArtifactFile,
  openVideoTaskCoverFile,
} from "../video/worker/index";
import type { WatchFeedService } from "../watch/watchFeed.service";
import type { WatchQuizService } from "../watch/watchQuiz.service";

type PublishRouteParams = { publishId: string };

function mapWatchError(res: Response, error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  if (msg.startsWith("VIDEO_COVER_NOT_FOUND") || msg.startsWith("VIDEO_ARTIFACT_NOT_FOUND")) {
    res.status(404).json({ code: "WATCH_MEDIA_NOT_FOUND", message: "视频或封面不可用" });
    return true;
  }
  if (msg.startsWith("VIDEO_TASK_NOT_FOUND")) {
    res.status(404).json({ code: "WATCH_MEDIA_NOT_FOUND", message: "视频不可用" });
    return true;
  }
  return false;
}

function mapQuizError(res: Response, error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  if (msg.includes("database is locked") || msg.includes("SQLITE_BUSY")) {
    res.status(503).json({ code: "DATABASE_BUSY", message: "服务繁忙，请稍后再试" });
    return true;
  }
  const code = msg;
  const map: Record<string, { status: number; message: string }> = {
    WATCH_NOT_FOUND: { status: 404, message: "视频不存在或已下线" },
    QUIZ_OWNER_FORBIDDEN: { status: 403, message: "不能答自己发布的视频" },
    QUIZ_NO_QUESTIONS: { status: 404, message: "该视频暂无题目" },
    QUIZ_SESSION_NOT_FOUND: { status: 404, message: "请先开始答题" },
    QUIZ_SESSION_COMPLETED: { status: 409, message: "答题已结束" },
    QUIZ_ANSWER_ALREADY_SUBMITTED: { status: 409, message: "该题已提交，请勿重复提交" },
    QUIZ_NO_CURRENT_QUESTION: { status: 400, message: "没有待答题目" },
    QUIZ_ANSWER_EMPTY: { status: 400, message: "请输入答案" },
    QUIZ_SESSION_CREATE_FAILED: { status: 500, message: "创建答题会话失败" },
  };
  const entry = map[code];
  if (!entry) return false;
  res.status(entry.status).json({ code, message: entry.message });
  return true;
}

function sendMediaFile(
  res: Response,
  file: { absPath: string; mimeType: string; filename: string },
): void {
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(path.resolve(file.absPath));
}

export function createWatchRouter(watchFeedService: WatchFeedService, watchQuizService: WatchQuizService): Router {
  const router = Router();

  router.get("/feed", authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const limitRaw = Number.parseInt(String(req.query.limit ?? ""), 10);
    const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const feed = watchFeedService.listFeed(user.userId, { limit, cursor });
    res.status(200).json(feed);
  });

  router.post("/:publishId/quiz/start", authMiddleware, (req: Request<PublishRouteParams>, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const publishId = String(req.params.publishId ?? "").trim();
    try {
      const session = watchQuizService.startQuiz(user.userId, publishId);
      res.status(200).json(session);
    } catch (error) {
      if (mapQuizError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "开始答题失败" });
    }
  });

  router.get("/:publishId/quiz/current", authMiddleware, (req: Request<PublishRouteParams>, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const publishId = String(req.params.publishId ?? "").trim();
    try {
      const session = watchQuizService.getCurrent(user.userId, publishId);
      res.status(200).json(session);
    } catch (error) {
      if (mapQuizError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "读取答题进度失败" });
    }
  });

  router.get("/:publishId/quiz/messages", authMiddleware, (req: Request<PublishRouteParams>, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const publishId = String(req.params.publishId ?? "").trim();
    try {
      const session = watchQuizService.getMessages(user.userId, publishId);
      res.status(200).json(session);
    } catch (error) {
      if (mapQuizError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "读取答题消息失败" });
    }
  });

  router.post("/:publishId/quiz/submit", authMiddleware, async (req: Request<PublishRouteParams>, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const publishId = String(req.params.publishId ?? "").trim();
    const answer = typeof req.body?.answer === "string" ? req.body.answer : "";
    try {
      const result = await watchQuizService.submitAnswer(user.userId, publishId, answer);
      res.status(200).json(result);
    } catch (error) {
      if (mapQuizError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "提交答案失败" });
    }
  });

  router.get("/:publishId/cover", (req: Request<PublishRouteParams>, res) => {
    const viewerUserId = verifyUserIdFromRequest(req);
    if (!viewerUserId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const publishId = String(req.params.publishId ?? "").trim();
    const resolved = watchFeedService.resolveOwnerScope(publishId, viewerUserId);
    if (!resolved) {
      res.status(404).json({ code: "WATCH_NOT_FOUND", message: "视频不存在或已下线" });
      return;
    }
    try {
      const file = openVideoTaskCoverFile(resolved.scope, resolved.taskId);
      sendMediaFile(res, file);
    } catch (error) {
      if (mapWatchError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "读取封面失败" });
    }
  });

  router.get("/:publishId/video", (req: Request<PublishRouteParams>, res) => {
    const viewerUserId = verifyUserIdFromRequest(req);
    if (!viewerUserId) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const publishId = String(req.params.publishId ?? "").trim();
    const resolved = watchFeedService.resolveOwnerScope(publishId, viewerUserId);
    if (!resolved) {
      res.status(404).json({ code: "WATCH_NOT_FOUND", message: "视频不存在或已下线" });
      return;
    }
    try {
      const artifacts = listVideoTaskArtifacts(resolved.scope, resolved.taskId);
      if (!artifacts.primaryVideo.available || !artifacts.primaryVideo.relativePath) {
        res.status(404).json({ code: "WATCH_MEDIA_NOT_FOUND", message: "完整视频尚未生成" });
        return;
      }
      const file = openVideoArtifactFile(resolved.scope, resolved.taskId, artifacts.primaryVideo.relativePath);
      sendMediaFile(res, file);
    } catch (error) {
      if (mapWatchError(res, error)) return;
      res.status(500).json({ code: "INTERNAL_ERROR", message: "读取视频失败" });
    }
  });

  router.get("/:publishId", authMiddleware, (req: Request<PublishRouteParams>, res) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }
    const publishId = String(req.params.publishId ?? "").trim();
    if (!publishId) {
      res.status(400).json({ code: "INVALID_PARAMS", message: "publishId required" });
      return;
    }
    const detail = watchFeedService.getForViewer(publishId, user.userId);
    if (!detail) {
      res.status(404).json({ code: "WATCH_NOT_FOUND", message: "视频不存在或已下线" });
      return;
    }
    res.status(200).json(detail);
  });

  return router;
}
