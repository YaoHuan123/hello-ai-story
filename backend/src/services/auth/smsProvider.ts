import type { SmsScene } from "./smsRateLimit.service";

export interface SmsCodeProvider {
  sendSmsCode(phone: string, scene: SmsScene): Promise<{ requestId?: string; bizId?: string }>;
  checkSmsCode(phone: string, code: string): Promise<void>;
}
