import type { NextFunction, Request, Response } from "express";
import type { DatabaseSync, StatementSync } from "node:sqlite";

let roleLookup: StatementSync | null = null;

export function initAdminMiddleware(db: DatabaseSync): void {
  roleLookup = db.prepare("SELECT role FROM users WHERE id = ?");
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.userId) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Missing Bearer token" });
    return;
  }
  if (!roleLookup) {
    res.status(500).json({ code: "ADMIN_MIDDLEWARE_NOT_INIT", message: "Admin middleware not initialized" });
    return;
  }
  const row = roleLookup.get(req.user.userId) as { role?: string } | undefined;
  if (row?.role !== "admin") {
    res.status(403).json({ code: "FORBIDDEN", message: "Admin access required" });
    return;
  }
  next();
}
