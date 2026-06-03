import type { DatabaseSync } from "node:sqlite";

export type AuthAuditEvent =
  | "sms_send"
  | "sms_login_success"
  | "sms_login_failed"
  | "change_phone_success"
  | "change_phone_failed"
  | "delete_account";

export interface AuthAuditRecord {
  event: AuthAuditEvent;
  userId?: string | null;
  phone?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  reason?: string | null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 180;

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export class AuthAuditLogService {
  constructor(private readonly db: DatabaseSync) {}

  record(entry: AuthAuditRecord): void {
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO audit_auth_log (event, user_id, phone_mask, ip, ua, reason, ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        entry.event,
        entry.userId ?? null,
        maskPhone(entry.phone ?? null),
        entry.ip ?? null,
        (entry.userAgent ?? null) && String(entry.userAgent).slice(0, 256),
        entry.reason ?? null,
        now,
      );

    if (Math.random() < 0.01) {
      this.db
        .prepare("DELETE FROM audit_auth_log WHERE ts < ?")
        .run(now - RETENTION_DAYS * ONE_DAY_MS);
    }
  }
}
