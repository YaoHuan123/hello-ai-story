import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { authMiddleware } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { buildAdminUsageReport } from "../services/adminUsage.service.js";

export function createAdminRouter(db: DatabaseSync): Router {
  const router = Router();

  router.get("/usage", authMiddleware, requireAdmin, (_req, res) => {
    try {
      res.status(200).json(buildAdminUsageReport(db));
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取用量统计失败";
      res.status(500).json({ code: "ADMIN_USAGE_FAILED", message });
    }
  });

  return router;
}
