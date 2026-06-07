import type { SmsScene } from "./smsRateLimit.service";
import { toTwilioE164 } from "../../utils/phone";

export class TwilioVerifyError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "TwilioVerifyError";
    this.code = code;
    this.status = status;
  }
}

const REQUIRED_ENV_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
] as const;

export const TWILIO_VERIFY_DEV_MOCK_CODE = "123456";

function trimEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function listMissingEnvKeys(): string[] {
  return REQUIRED_ENV_KEYS.filter((k) => !trimEnv(k));
}

function isDevMockForced(): boolean {
  const v = (process.env.TWILIO_VERIFY_DEV_MOCK ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isProductionEnv(): boolean {
  return (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

function decideMode(): { mode: "real" | "mock"; missing: string[] } {
  const missing = listMissingEnvKeys();
  if (isDevMockForced()) {
    return { mode: "mock", missing };
  }
  if (missing.length === 0) {
    return { mode: "real", missing };
  }
  if (!isProductionEnv()) {
    return { mode: "mock", missing };
  }
  return { mode: "real", missing };
}

export type TwilioVerifyModeInfo = {
  mode: "real" | "mock";
  forcedMock: boolean;
  production: boolean;
  missingEnv: string[];
};

export function describeTwilioVerifyMode(): TwilioVerifyModeInfo {
  const missing = listMissingEnvKeys();
  const { mode } = decideMode();
  return {
    mode,
    forcedMock: isDevMockForced(),
    production: isProductionEnv(),
    missingEnv: missing,
  };
}

type TwilioErrorBody = {
  code?: number;
  message?: string;
  status?: string;
  more_info?: string;
};

export class TwilioVerifyService {
  constructor() {
    const { mode, missing } = decideMode();
    if (mode === "mock") {
      console.warn("[twilio_verify.dev_mock.enabled]", {
        forced: isDevMockForced(),
        production: isProductionEnv(),
        missingEnv: missing,
        fixedCode: TWILIO_VERIFY_DEV_MOCK_CODE,
      });
    }
  }

  private isMockMode(): boolean {
    return decideMode().mode === "mock";
  }

  private getConfig(): { accountSid: string; authToken: string; serviceSid: string } {
    const missing = listMissingEnvKeys();
    if (missing.length > 0) {
      throw new Error(`MISSING_ENV:${missing[0]}`);
    }
    return {
      accountSid: trimEnv("TWILIO_ACCOUNT_SID"),
      authToken: trimEnv("TWILIO_AUTH_TOKEN"),
      serviceSid: trimEnv("TWILIO_VERIFY_SERVICE_SID"),
    };
  }

  private authHeader(): string {
    const { accountSid, authToken } = this.getConfig();
    const token = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    return `Basic ${token}`;
  }

  private async twilioPost(path: string, body: Record<string, string>): Promise<unknown> {
    const url = `https://verify.twilio.com/v2/Services/${path}`;
    const form = new URLSearchParams(body);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const text = await response.text();
    let payload: TwilioErrorBody | Record<string, unknown> = {};
    try {
      payload = text.trim() ? (JSON.parse(text) as TwilioErrorBody) : {};
    } catch {
      throw new TwilioVerifyError(
        "TWILIO_VERIFY_BAD_RESPONSE",
        `Twilio Verify returned non-JSON (HTTP ${response.status})`,
        response.status,
      );
    }
    if (!response.ok) {
      const err = payload as TwilioErrorBody;
      const code = String(err.code ?? err.status ?? "TWILIO_VERIFY_FAILED");
      throw new TwilioVerifyError(code, err.message || "Twilio Verify request failed", response.status);
    }
    return payload;
  }

  async sendSmsCode(phone: string, scene: SmsScene): Promise<{ requestId?: string; bizId?: string }> {
    if (this.isMockMode()) {
      const requestId = `twilio-dev-mock-${Date.now()}`;
      console.info("[twilio_verify.dev_mock.send]", { phone, scene, requestId });
      return { requestId, bizId: requestId };
    }

    const { serviceSid } = this.getConfig();
    const to = toTwilioE164(phone);
    const payload = (await this.twilioPost(`${serviceSid}/Verifications`, {
      To: to,
      Channel: "sms",
    })) as { sid?: string; status?: string };

    return { requestId: payload.sid, bizId: payload.status };
  }

  async checkSmsCode(phone: string, code: string): Promise<void> {
    if (this.isMockMode()) {
      if (code.trim() !== TWILIO_VERIFY_DEV_MOCK_CODE) {
        throw new TwilioVerifyError("SMS_VERIFY_FAILED", "短信验证码错误或已过期");
      }
      return;
    }

    const { serviceSid } = this.getConfig();
    const to = toTwilioE164(phone);
    try {
      const payload = (await this.twilioPost(`${serviceSid}/VerificationCheck`, {
        To: to,
        Code: code.trim(),
      })) as { status?: string; valid?: boolean };
      if (payload.status !== "approved") {
        throw new TwilioVerifyError("SMS_VERIFY_FAILED", "短信验证码错误或已过期");
      }
    } catch (error) {
      if (error instanceof TwilioVerifyError) {
        if (error.status === 404 || error.code === "20404") {
          throw new TwilioVerifyError("SMS_VERIFY_FAILED", "短信验证码错误或已过期", error.status);
        }
        throw error;
      }
      throw error;
    }
  }
}
