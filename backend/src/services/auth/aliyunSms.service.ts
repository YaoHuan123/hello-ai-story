import DypnsapiClient, {
  CheckSmsVerifyCodeRequest,
  SendSmsVerifyCodeRequest,
} from "@alicloud/dypnsapi20170525";
import { Config as OpenApiConfig } from "@alicloud/openapi-core/dist/utils";
import type { SmsScene } from "./smsRateLimit.service";

type SmsTemplateMap = Record<SmsScene, string>;

type AliyunSmsEnv = {
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  schemeName?: string;
  templates: SmsTemplateMap;
};

export class AliyunSmsError extends Error {
  readonly code: string;
  readonly requestId?: string;

  constructor(code: string, message: string, requestId?: string) {
    super(message);
    this.name = "AliyunSmsError";
    this.code = code;
    this.requestId = requestId;
  }
}

const ALIYUN_SMS_REQUIRED_ENV_KEYS = [
  "ALIYUN_ACCESS_KEY_ID",
  "ALIYUN_ACCESS_KEY_SECRET",
  "ALIYUN_DYPNSAPI_SIGN_NAME",
  "ALIYUN_DYPNSAPI_TEMPLATE_CODE_LOGIN",
  "ALIYUN_DYPNSAPI_TEMPLATE_CODE_CHANGE_PHONE_OLD",
  "ALIYUN_DYPNSAPI_TEMPLATE_CODE_CHANGE_PHONE_NEW",
  "ALIYUN_DYPNSAPI_TEMPLATE_CODE_DELETE_ACCOUNT",
] as const;

export const ALIYUN_SMS_DEV_MOCK_CODE = "123456";
const OTP_VALID_SECONDS = 300;

function trimEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function requiredEnv(name: string): string {
  const value = trimEnv(name);
  if (!value) {
    throw new Error(`MISSING_ENV:${name}`);
  }
  return value;
}

function pick(primary: string, fallback: string): string {
  return trimEnv(primary) || trimEnv(fallback);
}

function requiredEither(primary: string, fallback: string): string {
  const value = pick(primary, fallback);
  if (!value) throw new Error(`MISSING_ENV:${primary}`);
  return value;
}

function readEnv(): AliyunSmsEnv {
  return {
    accessKeyId: requiredEnv("ALIYUN_ACCESS_KEY_ID"),
    accessKeySecret: requiredEnv("ALIYUN_ACCESS_KEY_SECRET"),
    signName: requiredEither("ALIYUN_DYPNSAPI_SIGN_NAME", "ALIYUN_SMS_SIGN_NAME"),
    schemeName: trimEnv("ALIYUN_DYPNSAPI_SCHEME_NAME") || undefined,
    templates: {
      login: requiredEither("ALIYUN_DYPNSAPI_TEMPLATE_CODE_LOGIN", "ALIYUN_SMS_TEMPLATE_CODE_LOGIN"),
      change_phone_old: requiredEither(
        "ALIYUN_DYPNSAPI_TEMPLATE_CODE_CHANGE_PHONE_OLD",
        "ALIYUN_SMS_TEMPLATE_CODE_CHANGE_PHONE_OLD",
      ),
      change_phone_new: requiredEither(
        "ALIYUN_DYPNSAPI_TEMPLATE_CODE_CHANGE_PHONE_NEW",
        "ALIYUN_SMS_TEMPLATE_CODE_CHANGE_PHONE_NEW",
      ),
      delete_account: requiredEither(
        "ALIYUN_DYPNSAPI_TEMPLATE_CODE_DELETE_ACCOUNT",
        "ALIYUN_SMS_TEMPLATE_CODE_DELETE_ACCOUNT",
      ),
    },
  };
}

function listMissingEnvKeys(): string[] {
  return ALIYUN_SMS_REQUIRED_ENV_KEYS.filter((k) => {
    if (k === "ALIYUN_DYPNSAPI_SIGN_NAME") return !pick("ALIYUN_DYPNSAPI_SIGN_NAME", "ALIYUN_SMS_SIGN_NAME");
    if (k === "ALIYUN_DYPNSAPI_TEMPLATE_CODE_LOGIN") {
      return !pick("ALIYUN_DYPNSAPI_TEMPLATE_CODE_LOGIN", "ALIYUN_SMS_TEMPLATE_CODE_LOGIN");
    }
    if (k === "ALIYUN_DYPNSAPI_TEMPLATE_CODE_CHANGE_PHONE_OLD") {
      return !pick("ALIYUN_DYPNSAPI_TEMPLATE_CODE_CHANGE_PHONE_OLD", "ALIYUN_SMS_TEMPLATE_CODE_CHANGE_PHONE_OLD");
    }
    if (k === "ALIYUN_DYPNSAPI_TEMPLATE_CODE_CHANGE_PHONE_NEW") {
      return !pick("ALIYUN_DYPNSAPI_TEMPLATE_CODE_CHANGE_PHONE_NEW", "ALIYUN_SMS_TEMPLATE_CODE_CHANGE_PHONE_NEW");
    }
    if (k === "ALIYUN_DYPNSAPI_TEMPLATE_CODE_DELETE_ACCOUNT") {
      return !pick("ALIYUN_DYPNSAPI_TEMPLATE_CODE_DELETE_ACCOUNT", "ALIYUN_SMS_TEMPLATE_CODE_DELETE_ACCOUNT");
    }
    return !trimEnv(k);
  });
}

function isDevMockForced(): boolean {
  const v = (process.env.ALIYUN_DYPNSAPI_DEV_MOCK ?? process.env.ALIYUN_SMS_DEV_MOCK ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isProductionEnv(): boolean {
  return (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

export type AliyunSmsModeInfo = {
  mode: "real" | "mock";
  /** 为 true 时即使配齐密钥也走 mock（固定码 123456） */
  forcedMock: boolean;
  production: boolean;
  missingEnv: string[];
};

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

/** 供 health / 运维自检：当前短信走真实阿里云还是本地 mock。 */
export function describeAliyunSmsMode(): AliyunSmsModeInfo {
  const missing = listMissingEnvKeys();
  const { mode } = decideMode();
  return {
    mode,
    forcedMock: isDevMockForced(),
    production: isProductionEnv(),
    missingEnv: missing,
  };
}

export class AliyunSmsService {
  private envCache: AliyunSmsEnv | null = null;
  private clientCache: DypnsapiClient | null = null;

  constructor() {
    const { mode, missing } = decideMode();
    if (mode === "mock") {
      console.warn("[aliyun_sms.dev_mock.enabled]", {
        forced: isDevMockForced(),
        production: isProductionEnv(),
        missingEnv: missing,
        fixedCode: ALIYUN_SMS_DEV_MOCK_CODE,
      });
    }
  }

  private isMockMode(): boolean {
    return decideMode().mode === "mock";
  }

  private getEnv(): AliyunSmsEnv {
    if (!this.envCache) {
      this.envCache = readEnv();
    }
    return this.envCache;
  }

  private getClient(): DypnsapiClient {
    if (!this.clientCache) {
      const env = this.getEnv();
      this.clientCache = new DypnsapiClient(
        new OpenApiConfig({
          accessKeyId: env.accessKeyId,
          accessKeySecret: env.accessKeySecret,
          regionId: "cn-qingdao",
        }),
      );
    }
    return this.clientCache;
  }

  async sendSmsCode(phone: string, scene: SmsScene): Promise<{ requestId?: string; bizId?: string }> {
    if (this.isMockMode()) {
      const requestId = `dev-mock-${Date.now()}`;
      console.info("[aliyun_sms.dev_mock.send]", { phone, scene, requestId });
      return { requestId, bizId: requestId };
    }

    const env = this.getEnv();
    const templateCode = env.templates[scene];
    if (!templateCode) {
      throw new AliyunSmsError("SMS_TEMPLATE_NOT_CONFIGURED", `No template for scene: ${scene}`);
    }

    const validMinutes = String(Math.max(1, Math.round(OTP_VALID_SECONDS / 60)));
    const response = await this.getClient().sendSmsVerifyCode(
      new SendSmsVerifyCodeRequest({
        phoneNumber: phone,
        countryCode: "86",
        signName: env.signName,
        schemeName: env.schemeName,
        templateCode,
        templateParam: JSON.stringify({ code: "##code##", min: validMinutes }),
        codeLength: 6,
        codeType: 1,
        duplicatePolicy: 1,
        interval: 60,
        validTime: OTP_VALID_SECONDS,
        returnVerifyCode: false,
      }),
    );
    const body = response.body;
    if (body?.code !== "OK") {
      throw new AliyunSmsError(
        body?.code || "ALIYUN_DYPNSAPI_FAILED",
        body?.message || "Aliyun Dypnsapi request failed",
        body?.requestId ?? body?.model?.requestId,
      );
    }
    return { requestId: body.requestId ?? body.model?.requestId, bizId: body.model?.bizId };
  }

  async checkSmsCode(phone: string, code: string): Promise<void> {
    if (this.isMockMode()) {
      const submitted = code.trim();
      if (submitted !== ALIYUN_SMS_DEV_MOCK_CODE) {
        throw new AliyunSmsError("SMS_VERIFY_FAILED", "短信验证码错误或已过期");
      }
      return;
    }
    const env = this.getEnv();
    const response = await this.getClient().checkSmsVerifyCode(
      new CheckSmsVerifyCodeRequest({
        phoneNumber: phone,
        countryCode: "86",
        schemeName: env.schemeName,
        verifyCode: code.trim(),
        caseAuthPolicy: 1,
      }),
    );
    const body = response.body;
    if (body?.code !== "OK") {
      throw new AliyunSmsError(body?.code || "ALIYUN_DYPNSAPI_FAILED", body?.message || "短信验证码校验失败");
    }
    if (body?.success !== true || body.model?.verifyResult !== "PASS") {
      throw new AliyunSmsError("SMS_VERIFY_FAILED", "短信验证码错误或已过期");
    }
  }
}
