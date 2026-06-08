import type { DatabaseSync } from "node:sqlite";
import {
  dayEndRunKey,
  dayStartRunKey,
  isDayEndWindow,
  isDayStartWindow,
  localDistributionDate,
} from "./watchDispatchSchedule.js";
import type { WatchDaySettlementService } from "./watchDaySettlement.service.js";

export class WatchDispatchSchedulerService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly settlement: WatchDaySettlementService,
  ) {}

  private hasRun(runKey: string): boolean {
    const row = this.db.prepare("SELECT run_key FROM scheduler_runs WHERE run_key = ?").get(runKey) as
      | { run_key: string }
      | undefined;
    return Boolean(row);
  }

  private markRun(runKey: string, now: Date): void {
    this.db
      .prepare("INSERT OR REPLACE INTO scheduler_runs (run_key, ran_at) VALUES (?, ?)")
      .run(runKey, now.toISOString());
  }

  runHourlyTick(now = new Date()): void {
    const today = localDistributionDate(now);

    if (isDayEndWindow(now)) {
      const key = dayEndRunKey(today);
      if (!this.hasRun(key)) {
        this.settlement.runDayEnd(now);
        this.markRun(key, now);
      }
    }

    if (isDayStartWindow(now)) {
      const key = dayStartRunKey(today);
      if (!this.hasRun(key)) {
        this.settlement.runDayStart(now);
        this.markRun(key, now);
      }
    }
  }
}
