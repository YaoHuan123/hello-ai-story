import type { DatabaseSync } from "node:sqlite";
import { CampaignPlanService } from "../../dist/campaign/campaignPlan.service.js";
import { PlanPortionService } from "../../dist/campaign/planPortion.service.js";
import { PublishedVideoService } from "../../dist/campaign/publishedVideo.service.js";
import type { WalletService } from "../../dist/wallet/wallet.service.js";
import { WatchTaskDispatchService } from "../../dist/watch/dispatch/watchTaskDispatch.service.js";

export function createCampaignServices(db: DatabaseSync, walletService: WalletService): {
  watchDispatch: WatchTaskDispatchService;
  planPortionService: PlanPortionService;
  publishedVideoService: PublishedVideoService;
  campaignPlanService: CampaignPlanService;
} {
  const watchDispatch = new WatchTaskDispatchService(db);
  const planPortionService = new PlanPortionService(db, walletService, watchDispatch);
  const publishedVideoService = new PublishedVideoService(db);
  const campaignPlanService = new CampaignPlanService(db, publishedVideoService, planPortionService);
  return { watchDispatch, planPortionService, publishedVideoService, campaignPlanService };
}
