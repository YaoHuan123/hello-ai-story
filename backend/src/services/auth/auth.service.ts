import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { DatabaseSync } from "node:sqlite";
import { JWT_EXPIRES_IN, JWT_SECRET } from "../../config";
import type { AuthSuccessResponse, JwtPayload, LoginMethod, UserRecord } from "../../types";
import { isChinaCanonicalPhone, normalizePhoneE164, phoneLookupKeys, toAliyunLocalPhone } from "../../utils/phone";
import { verifyAppleIdentityToken } from "./appleAuth.service";
import type { SmsCodeProvider } from "./smsProvider";
import type { AuthAuditLogService } from "./authAuditLog.service";
import type { SmsRateLimitService, SmsScene } from "./smsRateLimit.service";
import { createUserWorkspace, getUserRootDir } from "../workspace.service";

export interface AuthRequestContext {
  ip?: string;
  userAgent?: string;
}

const USER_SELECT =
  "SELECT id, phone, apple_sub, login_method, apple_email, data_dir, created_at, role, preferred_material_id, token_version FROM users";

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
    const phone = this.normalizeChinaPhoneOrThrow(phoneRaw);
    this.smsRateLimit.assertCanSend(phone, ip, scene);
    const localPhone = toAliyunLocalPhone(phone);
    const result = await this.sms.sendSmsCode(localPhone, scene);
    this.audit.record({ event: "sms_send", phone, ip, userAgent: ctx.userAgent, reason: scene });
    return result;
  };

  loginWithSmsCode = async (
    phoneRaw: string,
    code: string,
    ctx: AuthRequestContext = {},
  ): Promise<AuthSuccessResponse> => {
    const phone = this.normalizeChinaPhoneOrThrow(phoneRaw);
    try {
      await this.sms.checkSmsCode(toAliyunLocalPhone(phone), code.trim());
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

  loginWithApple = async (identityToken: string, ctx: AuthRequestContext = {}): Promise<AuthSuccessResponse> => {
    let identity: { sub: string; email?: string };
    try {
      identity = await verifyAppleIdentityToken(identityToken);
    } catch (error) {
      this.audit.record({
        event: "apple_login_failed",
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        reason: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }

    const result = this.ensureUserByAppleSub(identity.sub, identity.email);
    this.audit.record({
      event: "apple_login_success",
      userId: result.userId,
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
    if (row.login_method !== "phone" || !row.phone) {
      throw new Error("AUTH_METHOD_NOT_SUPPORTED");
    }
    const newPhone = this.normalizeChinaPhoneOrThrow(newPhoneRaw);
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
      await this.sms.checkSmsCode(toAliyunLocalPhone(currentPhone), oldCode.trim());
      await this.sms.checkSmsCode(toAliyunLocalPhone(newPhone), newCode.trim());
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

  deleteAccount = async (
    userId: string,
    payload: { code?: string; identityToken?: string },
    ctx: AuthRequestContext = {},
  ): Promise<void> => {
    const row = this.getById(userId);
    if (!row) {
      throw new Error("USER_NOT_FOUND");
    }

    if (row.login_method === "apple") {
      if (!payload.identityToken?.trim()) {
        throw new Error("APPLE_TOKEN_REQUIRED");
      }
      const identity = await verifyAppleIdentityToken(payload.identityToken);
      if (identity.sub !== row.apple_sub) {
        throw new Error("APPLE_TOKEN_INVALID");
      }
    } else {
      if (!payload.code?.trim()) {
        throw new Error("SMS_CODE_REQUIRED");
      }
      if (!row.phone) {
        throw new Error("USER_NOT_FOUND");
      }
      await this.sms.checkSmsCode(toAliyunLocalPhone(this.ensureCanonical(row.phone)), payload.code.trim());
    }

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
      phone: row.phone ?? undefined,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      reason: row.login_method,
    });
  };

  private ensureUserByPhone(phone: string): AuthSuccessResponse {
    let row = this.findByPhone(phone);
    if (row && row.phone !== phone) {
      this.db.prepare("UPDATE users SET phone = ? WHERE id = ?").run(phone, row.id);
      row = { ...row, phone };
    }
    const resolved = row ?? this.createUserForPhone(phone);
    return this.issueAuthResponse(resolved);
  }

  private ensureUserByAppleSub(sub: string, email?: string): AuthSuccessResponse {
    let row = this.db.prepare(`${USER_SELECT} WHERE apple_sub = ?`).get(sub) as UserRecord | undefined;
    if (row && email && !row.apple_email) {
      this.db.prepare("UPDATE users SET apple_email = ? WHERE id = ?").run(email, row.id);
      row = { ...row, apple_email: email };
    }
    const resolved = row ?? this.createUserForApple(sub, email);
    return this.issueAuthResponse(resolved);
  }

  private issueAuthResponse(user: UserRecord): AuthSuccessResponse {
    const loginMethod: LoginMethod = user.login_method === "apple" ? "apple" : "phone";
    const token = this.signToken({
      userId: user.id,
      tv: user.token_version,
      loginMethod,
      phone: user.phone ?? undefined,
    });
    return {
      token,
      userId: user.id,
      dataDir: user.data_dir,
      loginMethod,
      phone: user.phone ?? undefined,
      appleEmail: user.apple_email ?? undefined,
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
    this.db
      .prepare("INSERT INTO users (id, phone, data_dir, login_method) VALUES (?, ?, ?, 'phone')")
      .run(userId, phone, dataDir);
    const row = this.getById(userId);
    if (!row) {
      throw new Error("USER_CREATE_FAILED");
    }
    return row;
  }

  private createUserForApple(sub: string, email?: string): UserRecord {
    const userId = createUserId();
    const dataDir = createUserWorkspace(userId);
    this.db
      .prepare(
        "INSERT INTO users (id, apple_sub, apple_email, data_dir, login_method) VALUES (?, ?, ?, ?, 'apple')",
      )
      .run(userId, sub, email ?? null, dataDir);
    const row = this.getById(userId);
    if (!row) {
      throw new Error("USER_CREATE_FAILED");
    }
    return row;
  }

  private normalizeChinaPhoneOrThrow(phoneRaw: string): string {
    const phone = normalizePhoneE164(String(phoneRaw));
    if (!phone) {
      throw new Error("INVALID_PHONE");
    }
    if (!isChinaCanonicalPhone(phone)) {
      throw new Error("DOMESTIC_PHONE_ONLY");
    }
    return phone;
  }

  private ensureCanonical(phone: string): string {
    const canonical = normalizePhoneE164(phone);
    if (!canonical || !isChinaCanonicalPhone(canonical)) {
      throw new Error("INVALID_PHONE");
    }
    return canonical;
  }

  private signToken(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"] });
  }
}
