import type { DatabaseSync } from "node:sqlite";
import { CampaignPlanService } from "../../src/campaign/campaignPlan.service";
import { PlanPortionService } from "../../src/campaign/planPortion.service";
import { PublishedVideoService } from "../../src/campaign/publishedVideo.service";
import type { WalletService } from "../../src/wallet/wallet.service";
import { WatchTaskDispatchService } from "../../src/watch/dispatch/watchTaskDispatch.service";

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
