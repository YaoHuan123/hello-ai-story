import cors from "cors";
import express, { type Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { initAuthMiddleware } from "./middleware/auth";
import { createAuthRouter } from "./routes/auth.routes";
import { createInterviewRouter } from "./routes/interview.routes";
import { createProductionRouter } from "./routes/production.routes";
import type { AuthService } from "./services/auth/auth.service";

export function createApp(db: DatabaseSync, authService: AuthService): Express {
  initAuthMiddleware(db);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      message: "Backend is running",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/auth", createAuthRouter(authService));
  app.use("/api/interviews", createInterviewRouter());
  app.use("/api/interviews/:interviewId", createProductionRouter());

  return app;
}
