import cors from "cors";
import express from "express";
import { PORT } from "./config";
import { initDb } from "./db/init";
import { initAuthMiddleware } from "./middleware/auth";
import { createAuthRouter } from "./routes/auth.routes";
import { createInterviewRouter } from "./routes/interview.routes";
import { AuthService } from "./services/auth/auth.service";
import { AliyunSmsService } from "./services/auth/aliyunSms.service";
import { AuthAuditLogService } from "./services/auth/authAuditLog.service";
import { SmsRateLimitService } from "./services/auth/smsRateLimit.service";

const app = express();
const db = initDb();
initAuthMiddleware(db);

const aliyunSmsService = new AliyunSmsService();
const smsRateLimitService = new SmsRateLimitService(db);
const authAuditLogService = new AuthAuditLogService(db);
const authService = new AuthService(db, aliyunSmsService, smsRateLimitService, authAuditLogService);

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

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
