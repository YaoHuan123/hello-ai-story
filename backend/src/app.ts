import cors from "cors";
import express, { type Express } from "express";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { initAuthMiddleware } from "./middleware/auth";
import { authMiddleware } from "./middleware/auth";
import { createAuthRouter } from "./routes/auth.routes";
import { createInterviewRouter } from "./routes/interview.routes";
import { createProductionRouter } from "./routes/production.routes";
import type { AuthService } from "./services/auth/auth.service";
import { APP_LOCALE } from "./config";
import { describeCombinedSmsMode } from "./services/auth/routingSms.service";
import { listPublicStyles } from "./video/biography/llm/steps/videoStyles.js";

export function createApp(db: DatabaseSync, authService: AuthService): Express {
  initAuthMiddleware(db);

  const app = express();
  app.use(cors());
  // 地点图上传走 base64 JSON，需大于默认 100kb 限制
  app.use(express.json({ limit: "15mb" }));

  const configDir = path.resolve(process.cwd(), "config");
  app.use("/static/video-styles", express.static(path.join(configDir, "video-styles")));

  app.get("/api/health", (_req, res) => {
    const sms = describeCombinedSmsMode();
    res.json({
      ok: true,
      message: "Backend is running",
      timestamp: new Date().toISOString(),
      locale: APP_LOCALE,
      sms: {
        mode: sms.mode,
        china: {
          provider: sms.china.provider,
          mode: sms.china.mode,
          forcedMock: sms.china.forcedMock,
          missingEnvCount: sms.china.missingEnv.length,
        },
        overseas: {
          provider: sms.overseas.provider,
          mode: sms.overseas.mode,
          forcedMock: sms.overseas.forcedMock,
          missingEnvCount: sms.overseas.missingEnv.length,
        },
      },
    });
  });

  app.get("/api/production/video-styles", authMiddleware, (_req, res) => {
    try {
      res.status(200).json(listPublicStyles(configDir, APP_LOCALE));
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取视频风格失败";
      res.status(500).json({ code: "VIDEO_STYLES_LOAD_FAILED", message });
    }
  });

  app.use("/api/auth", createAuthRouter(authService));
  // 生产子路由须先于 /api/interviews：否则访谈 router 的全局 auth 会挡住 cover?token= 等媒体 GET
  app.use("/api/interviews/:interviewId", createProductionRouter());
  app.use("/api/interviews", createInterviewRouter());

  return app;
}
