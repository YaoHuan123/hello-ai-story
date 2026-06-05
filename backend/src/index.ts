import { PORT } from "./config";
import { initDb } from "./db/init";
import { createApp } from "./app";
import { AuthService } from "./services/auth/auth.service";
import { AliyunSmsService } from "./services/auth/aliyunSms.service";
import { AuthAuditLogService } from "./services/auth/authAuditLog.service";
import { SmsRateLimitService } from "./services/auth/smsRateLimit.service";

const db = initDb();
const aliyunSmsService = new AliyunSmsService();
const smsRateLimitService = new SmsRateLimitService(db);
const authAuditLogService = new AuthAuditLogService(db);
const authService = new AuthService(db, aliyunSmsService, smsRateLimitService, authAuditLogService);

const app = createApp(db, authService);

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
