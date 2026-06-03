import type { DatabaseSync } from "node:sqlite";

export type SmsScene = "login" | "change_phone_old" | "change_phone_new" | "delete_account";

const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class SmsRateLimitService {
  constructor(private readonly db: DatabaseSync) {}

  assertCanSend(phone: string, ip: string, scene: SmsScene): void {
    const now = Date.now();
    this.db.prepare("DELETE FROM sms_send_log WHERE ts < ?").run(now - ONE_DAY_MS);

    const recentPhone = this.db
      .prepare("SELECT COUNT(*) AS count FROM sms_send_log WHERE phone = ? AND ts >= ?")
      .get(phone, now - ONE_MINUTE_MS) as { count: number };
    if (recentPhone.count > 0) {
      throw new Error("SMS_RATE_LIMITED");
    }

    const dailyPhone = this.db
      .prepare("SELECT COUNT(*) AS count FROM sms_send_log WHERE phone = ? AND ts >= ?")
      .get(phone, now - ONE_DAY_MS) as { count: number };
    if (dailyPhone.count >= 5) {
      throw new Error("SMS_RATE_LIMITED");
    }

    const dailyIp = this.db
      .prepare("SELECT COUNT(*) AS count FROM sms_send_log WHERE ip = ? AND ts >= ?")
      .get(ip, now - ONE_DAY_MS) as { count: number };
    if (dailyIp.count >= 30) {
      throw new Error("SMS_RATE_LIMITED");
    }

    this.db
      .prepare("INSERT INTO sms_send_log (phone, ip, scene, ts) VALUES (?, ?, ?, ?)")
      .run(phone, ip, scene, now);
  }
}
