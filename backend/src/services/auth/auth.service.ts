import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { DatabaseSync } from "node:sqlite";
import { JWT_EXPIRES_IN, JWT_SECRET } from "../../config";
import type { AuthSuccessResponse, JwtPayload, UserRecord } from "../../types";
import { normalizePhoneDigits } from "../../utils/phone";
import type { AliyunSmsService } from "./aliyunSms.service";
import type { AuthAuditLogService } from "./authAuditLog.service";
import type { SmsRateLimitService, SmsScene } from "./smsRateLimit.service";
import { createUserWorkspace, getUserRootDir } from "../workspace.service";

export interface AuthRequestContext {
  ip?: string;
  userAgent?: string;
}

const createUserId = (): string => randomBytes(12).toString("base64url").slice(0, 16);

export class AuthService {
  private readonly db: DatabaseSync;
  private readonly sms: AliyunSmsService;
  private readonly smsRateLimit: SmsRateLimitService;
  private readonly audit: AuthAuditLogService;

  constructor(
    db: DatabaseSync,
    sms: AliyunSmsService,
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

  loginWithSmsCode = async (phoneRaw: string, code: string, ctx: AuthRequestContext = {}): Promise<AuthSuccessResponse> => {
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
    this.audit.record({ event: "sms_login_success", userId: result.userId, phone, ip: ctx.ip, userAgent: ctx.userAgent });
    return result;
  };

  getById = (userId: string): UserRecord | undefined => {
    return this.db
      .prepare("SELECT id, phone, data_dir, created_at, role, preferred_material_id, token_version FROM users WHERE id = ?")
      .get(userId) as UserRecord | undefined;
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
    if (newPhone === row.phone) {
      return { phone: row.phone };
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
      await this.sms.checkSmsCode(row.phone, oldCode.trim());
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
    await this.sms.checkSmsCode(row.phone, code.trim());

    this.db.exec("BEGIN");
    try {
      // 当前工程尚未迁移 materials/texts/user_tags；仅删除 users，避免误删不存在表导致事务失败。
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
    const existing = this.findByPhone(phone);
    const row = existing ?? this.createUserForPhone(phone);
    const token = this.signToken({ userId: row.id, phone: row.phone, tv: row.token_version });
    return { token, userId: row.id, phone: row.phone, dataDir: row.data_dir };
  }

  private findByPhone(phone: string): UserRecord | undefined {
    return this.db
      .prepare("SELECT id, phone, data_dir, created_at, role, preferred_material_id, token_version FROM users WHERE phone = ?")
      .get(phone) as UserRecord | undefined;
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
    const phone = normalizePhoneDigits(String(phoneRaw));
    if (!phone) {
      throw new Error("INVALID_PHONE");
    }
    return phone;
  }

  private signToken(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"] });
  }
}
