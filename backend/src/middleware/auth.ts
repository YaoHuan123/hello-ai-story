import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { JWT_SECRET } from "../config";
import type { JwtPayload, LoginMethod } from "../types";

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

function resolvePayloadFromToken(token: string): JwtPayload | null {
  if (!tokenVersionLookup) {
    throw new Error("authMiddleware not initialized: call initAuthMiddleware(db) at startup");
  }
  try {
    const raw = jwt.verify(token, JWT_SECRET) as JwtPayload & { phone?: string; loginMethod?: LoginMethod };
    const row = tokenVersionLookup.get(raw.userId) as { token_version?: number } | undefined;
    if (!row) return null;
    if (typeof raw.tv !== "number" || raw.tv !== row.token_version) return null;
    return {
      userId: raw.userId,
      tv: raw.tv,
      loginMethod: raw.loginMethod ?? "phone",
      phone: raw.phone,
    };
  } catch {
    return null;
  }
}

/** 供 `<img src>` 等媒体路由：支持 Bearer 或 query `token=`。 */
export function verifyUserIdFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return resolvePayloadFromToken(header.slice("Bearer ".length).trim())?.userId ?? null;
  }
  const q = req.query.token;
  if (typeof q === "string" && q.trim()) {
    return resolvePayloadFromToken(q.trim())?.userId ?? null;
  }
  return null;
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Missing Bearer token" });
    return;
  }

  const payload = resolvePayloadFromToken(header.slice("Bearer ".length).trim());
  if (!payload) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
    return;
  }

  req.user = payload;
  next();
};
