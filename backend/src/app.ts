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
import { describeAliyunSmsMode } from "./services/auth/aliyunSms.service";
import { describeAppleAuthMode } from "./services/auth/appleAuth.service";
import { createWalletRouter } from "./routes/wallet.routes";
import { createCampaignRouter } from "./routes/campaign.routes";
import { createWatchRouter } from "./routes/watch.routes";
import type { CampaignPlanService } from "./campaign/campaignPlan.service";
import type { QuizQuestionService } from "./campaign/quizQuestion.service";
import { PublishedVideoService } from "./campaign/publishedVideo.service";
import { WatchFeedService } from "./watch/watchFeed.service";
import { WatchQuizService } from "./watch/watchQuiz.service";
import type { WalletService } from "./wallet/wallet.service";
import { isMockRechargeEnabled } from "./wallet/wallet.service";
import { listPublicStyles } from "./video/biography/llm/steps/videoStyles.js";
import { mountLegalPages } from "./routes/legal.routes";

export function createApp(
  db: DatabaseSync,
  authService: AuthService,
  walletService: WalletService,
  campaignPlanService: CampaignPlanService,
  quizQuestionService: QuizQuestionService,
): Express {
  initAuthMiddleware(db);

  const app = express();
  app.use(cors());
  // 地点图上传走 base64 JSON，需大于默认 100kb 限制
  app.use(express.json({ limit: "15mb" }));

  const configDir = path.resolve(process.cwd(), "config");
  app.use("/static/video-styles", express.static(path.join(configDir, "video-styles")));

  app.get("/api/health", (_req, res) => {
    const sms = describeAliyunSmsMode();
    const apple = describeAppleAuthMode();
    res.json({
      ok: true,
      message: "Backend is running",
      timestamp: new Date().toISOString(),
      locale: APP_LOCALE,
      sms: {
        mode: sms.mode,
        provider: "aliyun",
        forcedMock: sms.forcedMock,
        missingEnvCount: sms.missingEnv.length,
      },
      apple: {
        mode: apple.mode,
        forcedMock: apple.forcedMock,
        missingEnvCount: apple.missingEnv.length,
      },
      wallet: {
        mockRechargeEnabled: isMockRechargeEnabled(),
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
  app.use("/api/wallet", createWalletRouter(walletService));
  app.use("/api/campaigns", createCampaignRouter(db, campaignPlanService, quizQuestionService));
  const watchFeedService = new WatchFeedService(db);
  const publishedVideoService = new PublishedVideoService(db);
  const watchQuizService = new WatchQuizService(db, watchFeedService, publishedVideoService);
  app.use("/api/watch", createWatchRouter(watchFeedService, watchQuizService));
  // 生产子路由须先于 /api/interviews：否则访谈 router 的全局 auth 会挡住 cover?token= 等媒体 GET
  app.use("/api/interviews/:interviewId", createProductionRouter());
  app.use("/api/interviews", createInterviewRouter());

  mountLegalPages(app);

  return app;
}
