import { PORT } from "./config";
import { initDb } from "./db/init";
import { createApp } from "./app";
import { AuthService } from "./services/auth/auth.service";
import { AliyunSmsService } from "./services/auth/aliyunSms.service";
import { AuthAuditLogService } from "./services/auth/authAuditLog.service";
import { SmsRateLimitService } from "./services/auth/smsRateLimit.service";
import { WalletService } from "./wallet/wallet.service";
import { CampaignPlanService } from "./campaign/campaignPlan.service";
import { PlanPortionService } from "./campaign/planPortion.service";
import { PublishedVideoService } from "./campaign/publishedVideo.service";
import { QuizQuestionService } from "./campaign/quizQuestion.service";
import { WatchDaySettlementService } from "./watch/dispatch/watchDaySettlement.service";
import { WatchDispatchSchedulerService } from "./watch/dispatch/watchDispatchScheduler.service";
import { WatchTaskDispatchService } from "./watch/dispatch/watchTaskDispatch.service";
import { WatchRewardSettlementService } from "./watch/watchRewardSettlement.service";

const db = initDb();
const smsService = new AliyunSmsService();
const smsRateLimitService = new SmsRateLimitService(db);
const authAuditLogService = new AuthAuditLogService(db);
const authService = new AuthService(db, smsService, smsRateLimitService, authAuditLogService);
const walletService = new WalletService(db);
const publishedVideoService = new PublishedVideoService(db);
const watchDispatchService = new WatchTaskDispatchService(db);
const watchRewardSettlement = new WatchRewardSettlementService(db, walletService);
const planPortionService = new PlanPortionService(db, walletService, watchDispatchService);
const campaignPlanService = new CampaignPlanService(db, publishedVideoService, planPortionService);
const quizQuestionService = new QuizQuestionService(db);
const watchDaySettlement = new WatchDaySettlementService(db, watchDispatchService, watchRewardSettlement);
const watchDispatchScheduler = new WatchDispatchSchedulerService(db, watchDaySettlement);

try {
  const orphaned = db
    .prepare(
      `DELETE FROM watch_quiz_sessions WHERE publish_id NOT IN (SELECT id FROM published_videos)`,
    )
    .run().changes;
  if (orphaned > 0) {
    console.log(`[watch-quiz] cleaned ${orphaned} orphan session(s)`);
  }
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.warn(`[watch-quiz] orphan cleanup skipped (${msg})`);
}

const app = createApp(db, authService, walletService, campaignPlanService, quizQuestionService);

const PORTION_TICK_MS = 60 * 60 * 1000;
void planPortionService.runDueExecutions();
watchDispatchScheduler.runHourlyTick();
setInterval(() => {
  void planPortionService.runDueExecutions();
  watchDispatchScheduler.runHourlyTick();
}, PORTION_TICK_MS);

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
