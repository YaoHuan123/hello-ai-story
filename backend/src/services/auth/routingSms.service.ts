import { isChinaCanonicalPhone, toAliyunLocalPhone } from "../../utils/phone";
import type { AliyunSmsService } from "./aliyunSms.service";
import type { SmsCodeProvider } from "./smsProvider";
import type { SmsScene } from "./smsRateLimit.service";
import { describeTwilioVerifyMode, type TwilioVerifyService } from "./twilioVerify.service";
import { describeAliyunSmsMode } from "./aliyunSms.service";

export type SmsRoute = "aliyun_cn" | "twilio_overseas";

export function resolveSmsRoute(phone: string): SmsRoute {
  if (isChinaCanonicalPhone(phone)) {
    return "aliyun_cn";
  }
  return "twilio_overseas";
}

export type CombinedSmsModeInfo = {
  china: ReturnType<typeof describeAliyunSmsMode> & { provider: "aliyun" };
  overseas: ReturnType<typeof describeTwilioVerifyMode> & { provider: "twilio_verify" };
  /** 与旧版 health 兼容：任一通道为 real 则为 real */
  mode: "real" | "mock";
};

export function describeCombinedSmsMode(): CombinedSmsModeInfo {
  const china = { ...describeAliyunSmsMode(), provider: "aliyun" as const };
  const overseas = { ...describeTwilioVerifyMode(), provider: "twilio_verify" as const };
  const mode = china.mode === "real" || overseas.mode === "real" ? "real" : "mock";
  return { china, overseas, mode };
}

export class RoutingSmsService implements SmsCodeProvider {
  constructor(
    private readonly aliyun: AliyunSmsService,
    private readonly twilio: TwilioVerifyService,
  ) {}

  async sendSmsCode(phone: string, scene: SmsScene): Promise<{ requestId?: string; bizId?: string }> {
    const route = resolveSmsRoute(phone);
    if (route === "aliyun_cn") {
      return this.aliyun.sendSmsCode(toAliyunLocalPhone(phone), scene);
    }
    return this.twilio.sendSmsCode(phone, scene);
  }

  async checkSmsCode(phone: string, code: string): Promise<void> {
    const route = resolveSmsRoute(phone);
    if (route === "aliyun_cn") {
      await this.aliyun.checkSmsCode(toAliyunLocalPhone(phone), code);
      return;
    }
    await this.twilio.checkSmsCode(phone, code);
  }
}
