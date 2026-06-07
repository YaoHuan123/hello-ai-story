import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { DatabaseSync } from "node:sqlite";
import { JWT_EXPIRES_IN, JWT_SECRET } from "../../config";
import type { AuthSuccessResponse, JwtPayload, UserRecord } from "../../types";
import { normalizePhoneE164, phoneLookupKeys } from "../../utils/phone";
import type { SmsCodeProvider } from "./smsProvider";
import type { AuthAuditLogService } from "./authAuditLog.service";
import type { SmsRateLimitService, SmsScene } from "./smsRateLimit.service";
import { createUserWorkspace, getUserRootDir } from "../workspace.service";

export interface AuthRequestContext {
  ip?: string;
  userAgent?: string;
}

const USER_SELECT =
  "SELECT id, phone, data_dir, created_at, role, preferred_material_id, token_version FROM users";

const createUserId = (): string => randomBytes(12).toString("base64url").slice(0, 16);

export class AuthService {
  private readonly db: DatabaseSync;
  private readonly sms: SmsCodeProvider;
  private readonly smsRateLimit: SmsRateLimitService;
  private readonly audit: AuthAuditLogService;

  constructor(
    db: DatabaseSync,
    sms: SmsCodeProvider,
    smsRateLimit: SmsRateLimitService,
    audit: AuthAuditLogService,
  ) {
    this.db = db;
    this.sms = sms;
    this.smsRateLimit = smsRateLimit;
    this.audit = audit;
  }

  sendSmsCode = async (
    phoneRaw: string,
    ip: string,
    scene: SmsScene,
    ctx: AuthRequestContext = {},
  ): Promise<{ requestId?: string; bizId?: string }> => {
    const phone = this.normalizePhoneOrThrow(phoneRaw);
    this.smsRateLimit.assertCanSend(phone, ip, scene);
    const result = await this.sms.sendSmsCode(phone, scene);
    this.audit.record({ event: "sms_send", phone, ip, userAgent: ctx.userAgent, reason: scene });
    return result;
  };

  loginWithSmsCode = async (
    phoneRaw: string,
    code: string,
    ctx: AuthRequestContext = {},
  ): Promise<AuthSuccessResponse> => {
    const phone = this.normalizePhoneOrThrow(phoneRaw);
    try {
      await this.sms.checkSmsCode(phone, code.trim());
    } catch (error) {
      this.audit.record({
        event: "sms_login_failed",
        phone,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        reason: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
    const result = this.ensureUserByPhone(phone);
    this.audit.record({
      event: "sms_login_success",
      userId: result.userId,
      phone,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return result;
  };

  getById = (userId: string): UserRecord | undefined => {
    return this.db.prepare(`${USER_SELECT} WHERE id = ?`).get(userId) as UserRecord | undefined;
  };

  changePhone = async (
    userId: string,
    newPhoneRaw: string,
    newCode: string,
    oldCode: string,
    ctx: AuthRequestContext = {},
  ): Promise<{ phone: string }> => {
    const row = this.getById(userId);
    if (!row) {
      throw new Error("USER_NOT_FOUND");
    }
    const newPhone = this.normalizePhoneOrThrow(newPhoneRaw);
    const currentPhone = this.ensureCanonical(row.phone);
    if (newPhone === currentPhone) {
      return { phone: currentPhone };
    }
    const taken = this.db.prepare("SELECT id FROM users WHERE phone = ? AND id != ?").get(newPhone, userId) as
      | { id: string }
      | undefined;
    if (taken) {
      this.audit.record({
        event: "change_phone_failed",
        userId,
        phone: newPhone,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        reason: "PHONE_TAKEN",
      });
      throw new Error("PHONE_TAKEN");
    }
    try {
      await this.sms.checkSmsCode(currentPhone, oldCode.trim());
      await this.sms.checkSmsCode(newPhone, newCode.trim());
    } catch (error) {
      this.audit.record({
        event: "change_phone_failed",
        userId,
        phone: newPhone,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        reason: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
    this.db
      .prepare("UPDATE users SET phone = ?, token_version = token_version + 1 WHERE id = ?")
      .run(newPhone, userId);
    this.db.prepare("DELETE FROM sms_send_log WHERE phone = ?").run(currentPhone);
    this.db.prepare("DELETE FROM sms_send_log WHERE phone = ?").run(row.phone);
    this.audit.record({
      event: "change_phone_success",
      userId,
      phone: newPhone,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { phone: newPhone };
  };

  deleteAccount = async (userId: string, code: string, ctx: AuthRequestContext = {}): Promise<void> => {
    const row = this.getById(userId);
    if (!row) {
      throw new Error("USER_NOT_FOUND");
    }
    await this.sms.checkSmsCode(this.ensureCanonical(row.phone), code.trim());

    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const expectedRoot = getUserRootDir(userId);
    if (path.resolve(row.data_dir) === path.resolve(expectedRoot) && fs.existsSync(row.data_dir)) {
      fs.rmSync(row.data_dir, { recursive: true, force: true });
    }
    this.audit.record({
      event: "delete_account",
      userId,
      phone: row.phone,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  };

  private ensureUserByPhone(phone: string): AuthSuccessResponse {
    let row = this.findByPhone(phone);
    if (row && row.phone !== phone) {
      this.db.prepare("UPDATE users SET phone = ? WHERE id = ?").run(phone, row.id);
      row = { ...row, phone };
    }
    const resolved = row ?? this.createUserForPhone(phone);
    const token = this.signToken({ userId: resolved.id, phone: resolved.phone, tv: resolved.token_version });
    return {
      token,
      userId: resolved.id,
      phone: resolved.phone,
      dataDir: resolved.data_dir,
    };
  }

  private findByPhone(phone: string): UserRecord | undefined {
    for (const key of phoneLookupKeys(phone)) {
      const row = this.db.prepare(`${USER_SELECT} WHERE phone = ?`).get(key) as UserRecord | undefined;
      if (row) return row;
    }
    return undefined;
  }

  private createUserForPhone(phone: string): UserRecord {
    const userId = createUserId();
    const dataDir = createUserWorkspace(userId);
    this.db.prepare("INSERT INTO users (id, phone, data_dir) VALUES (?, ?, ?)").run(userId, phone, dataDir);
    const row = this.getById(userId);
    if (!row) {
      throw new Error("USER_CREATE_FAILED");
    }
    return row;
  }

  private normalizePhoneOrThrow(phoneRaw: string): string {
    const phone = normalizePhoneE164(String(phoneRaw));
    if (!phone) {
      throw new Error("INVALID_PHONE");
    }
    return phone;
  }

  private ensureCanonical(phone: string): string {
    const canonical = normalizePhoneE164(phone);
    if (!canonical) {
      throw new Error("INVALID_PHONE");
    }
    return canonical;
  }

  private signToken(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"] });
  }
}
