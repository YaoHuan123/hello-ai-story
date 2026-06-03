import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { JWT_SECRET } from "../config";
import type { JwtPayload } from "../types";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

let tokenVersionLookup: StatementSync | null = null;

export const initAuthMiddleware = (db: DatabaseSync): void => {
  tokenVersionLookup = db.prepare("SELECT token_version FROM users WHERE id = ?");
};

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!tokenVersionLookup) {
    throw new Error("authMiddleware not initialized: call initAuthMiddleware(db) at startup");
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Missing Bearer token" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
    return;
  }

  const row = tokenVersionLookup.get(payload.userId) as { token_version?: number } | undefined;
  if (!row) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "登录状态已失效，请重新登录" });
    return;
  }
  if (typeof payload.tv !== "number" || payload.tv !== row.token_version) {
    res.status(401).json({ code: "TOKEN_REVOKED", message: "登录状态已失效，请重新登录" });
    return;
  }

  req.user = { userId: payload.userId, phone: payload.phone, tv: payload.tv };
  next();
};
