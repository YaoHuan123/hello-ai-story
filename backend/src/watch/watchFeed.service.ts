import type { DatabaseSync } from "node:sqlite";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import type { PublishedVideoWatchRecord, WatchFeedItem, WatchVideoDetail } from "./types";
import { localDistributionDate } from "./dispatch/watchDispatchSchedule.js";

const FEED_SELECT = `
  SELECT
    pv.id,
    pv.plan_id,
    pv.owner_user_id,
    pv.interview_id,
    pv.task_id,
    pv.title,
    pv.reward_points,
    pv.quiz_question_count,
    pv.status,
    pv.published_at,
    cp.status AS plan_status,
    cp.end_year
  FROM published_videos pv
  INNER JOIN campaign_plans cp ON cp.id = pv.plan_id
`;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function mapFeedItem(row: PublishedVideoWatchRecord): WatchFeedItem {
  return {
    publishId: row.id,
    title: row.title,
    rewardPoints: row.reward_points,
    quizQuestionCount: row.quiz_question_count,
    publishedAt: row.published_at,
    planEndYear: row.end_year,
  };
}

function isWatchable(row: PublishedVideoWatchRecord, currentYear: number): boolean {
  return row.status === "published" && row.plan_status === "active" && row.end_year >= currentYear;
}

function isOwnVideo(row: PublishedVideoWatchRecord, viewerUserId: string): boolean {
  return row.owner_user_id === viewerUserId;
}

export class WatchFeedService {
  constructor(private readonly db: DatabaseSync) {}

  private today(now = new Date()): string {
    return localDistributionDate(now);
  }

  private hasTodayAssignment(viewerUserId: string, publishId: string, now = new Date()): boolean {
    const row = this.db
      .prepare(
        `SELECT id FROM watch_task_assignments
         WHERE viewer_user_id = ? AND publish_id = ? AND distribution_date = ?`,
      )
      .get(viewerUserId, publishId, this.today(now)) as { id: string } | undefined;
    return Boolean(row);
  }

  markAssignmentCompleted(
    viewerUserId: string,
    publishId: string,
    pendingRewardPoints: number,
    now = new Date(),
  ): void {
    const ts = now.toISOString();
    this.db
      .prepare(
        `UPDATE watch_task_assignments
         SET status = 'completed', completed_at = ?, pending_reward_points = ?
         WHERE viewer_user_id = ? AND publish_id = ? AND distribution_date = ? AND status = 'pending'`,
      )
      .run(ts, pendingRewardPoints, viewerUserId, publishId, this.today(now));
  }

  listFeed(viewerUserId: string, opts?: { limit?: number; cursor?: string }): { items: WatchFeedItem[]; nextCursor?: string } {
    const currentYear = new Date().getFullYear();
    const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const cursor = opts?.cursor?.trim();
    const distributionDate = this.today();

    let rows: PublishedVideoWatchRecord[];
    if (cursor) {
      rows = this.db
        .prepare(
          `${FEED_SELECT}
           INNER JOIN watch_task_assignments wta ON wta.publish_id = pv.id
           WHERE wta.viewer_user_id = ?
             AND wta.distribution_date = ?
             AND wta.status = 'pending'
             AND pv.status = 'published'
             AND cp.status = 'active'
             AND cp.end_year >= ?
             AND pv.published_at < ?
           ORDER BY pv.published_at DESC
           LIMIT ?`,
        )
        .all(viewerUserId, distributionDate, currentYear, cursor, limit + 1) as PublishedVideoWatchRecord[];
    } else {
      rows = this.db
        .prepare(
          `${FEED_SELECT}
           INNER JOIN watch_task_assignments wta ON wta.publish_id = pv.id
           WHERE wta.viewer_user_id = ?
             AND wta.distribution_date = ?
             AND wta.status = 'pending'
             AND pv.status = 'published'
             AND cp.status = 'active'
             AND cp.end_year >= ?
           ORDER BY pv.published_at DESC
           LIMIT ?`,
        )
        .all(viewerUserId, distributionDate, currentYear, limit + 1) as PublishedVideoWatchRecord[];
    }

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const items = slice.filter((row) => isWatchable(row, currentYear)).map(mapFeedItem);
    const nextCursor = hasMore ? slice[slice.length - 1]?.published_at : undefined;
    return { items, ...(nextCursor ? { nextCursor } : {}) };
  }

  getForViewer(publishId: string, viewerUserId: string): WatchVideoDetail | undefined {
    const row = this.getWatchableRecord(publishId, viewerUserId);
    if (!row) return undefined;
    return {
      ...mapFeedItem(row),
      planId: row.plan_id,
    };
  }

  resolveOwnerScope(
    publishId: string,
    viewerUserId: string,
  ): { scope: InterviewScope; taskId: string; detail: WatchVideoDetail } | undefined {
    const row = this.getWatchableRecord(publishId, viewerUserId);
    if (!row) return undefined;
    const detail = this.getForViewer(publishId, viewerUserId);
    if (!detail) return undefined;
    return {
      scope: { userId: row.owner_user_id, interviewId: row.interview_id },
      taskId: row.task_id,
      detail,
    };
  }

  getWatchableRecord(publishId: string, viewerUserId: string): PublishedVideoWatchRecord | undefined {
    const id = publishId.trim();
    if (!id) return undefined;
    if (!this.hasTodayAssignment(viewerUserId, id)) return undefined;
    const currentYear = new Date().getFullYear();
    const row = this.db
      .prepare(`${FEED_SELECT} WHERE pv.id = ?`)
      .get(id) as PublishedVideoWatchRecord | undefined;
    if (!row || !isWatchable(row, currentYear) || isOwnVideo(row, viewerUserId)) return undefined;
    return row;
  }

  /** 答题入口校验：区分「不存在」与「不能答自己的视频」。 */
  assertQuizAccess(publishId: string, viewerUserId: string): PublishedVideoWatchRecord {
    const id = publishId.trim();
    if (!id) {
      throw new Error("WATCH_NOT_FOUND");
    }
    const currentYear = new Date().getFullYear();
    const row = this.db
      .prepare(`${FEED_SELECT} WHERE pv.id = ?`)
      .get(id) as PublishedVideoWatchRecord | undefined;
    if (!row || !isWatchable(row, currentYear)) {
      throw new Error("WATCH_NOT_FOUND");
    }
    if (isOwnVideo(row, viewerUserId)) {
      throw new Error("QUIZ_OWNER_FORBIDDEN");
    }
    if (!this.hasTodayAssignment(viewerUserId, id)) {
      throw new Error("WATCH_NOT_FOUND");
    }
    return row;
  }
}
