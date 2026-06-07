import { PORT } from "./config";
import { initDb } from "./db/init";
import { createApp } from "./app";
import { AuthService } from "./services/auth/auth.service";
import { AliyunSmsService } from "./services/auth/aliyunSms.service";
import { AuthAuditLogService } from "./services/auth/authAuditLog.service";
import { RoutingSmsService } from "./services/auth/routingSms.service";
import { SmsRateLimitService } from "./services/auth/smsRateLimit.service";
import { TwilioVerifyService } from "./services/auth/twilioVerify.service";

const db = initDb();
const smsService = new RoutingSmsService(new AliyunSmsService(), new TwilioVerifyService());
const smsRateLimitService = new SmsRateLimitService(db);
const authAuditLogService = new AuthAuditLogService(db);
const authService = new AuthService(db, smsService, smsRateLimitService, authAuditLogService);

const app = createApp(db, authService);

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
