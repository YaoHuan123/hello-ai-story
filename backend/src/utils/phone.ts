/** 库内统一存 E.164 数字（无 +），如中国 8613812345678、美国 14155552671。 */

/** 无 + 前缀时按中国大陆手机号识别（1[3-9] 号段）。 */
const CN_LOCAL_RE = /^1[3-9]\d{9}$/;
const CN_CANONICAL_RE = /^861\d{10}$/;
const US_CANONICAL_RE = /^1[2-9]\d{9}$/;

function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

function isValidGenericE164(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * 将用户输入规范为 E.164 数字（无 +）。
 * 支持：+14155552671、14155552671、13812345678、8613812345678
 */
export function normalizePhoneE164(input: string): string | null {
  const trimmed = input.trim();
  const hadPlus = trimmed.startsWith("+");
  const digits = digitsOnly(hadPlus ? trimmed.slice(1) : trimmed);

  if (!digits) return null;

  // 用户显式写了 +：按国际号解析，避免 1 开头的美国号被当成中国本地号
  if (hadPlus) {
    if (CN_CANONICAL_RE.test(digits)) return digits;
    if (US_CANONICAL_RE.test(digits)) return digits;
    if (isValidGenericE164(digits)) return digits;
    return null;
  }

  if (CN_LOCAL_RE.test(digits)) {
    return `86${digits}`;
  }
  if (CN_CANONICAL_RE.test(digits)) {
    return digits;
  }
  if (digits.length === 10 && /^[2-9]\d{9}$/.test(digits)) {
    return `1${digits}`;
  }
  if (US_CANONICAL_RE.test(digits)) {
    return digits;
  }
  if (isValidGenericE164(digits)) {
    return digits;
  }
  return null;
}

/** @deprecated 使用 normalizePhoneE164；保留别名避免大范围重命名。 */
export function normalizePhoneDigits(input: string): string | null {
  return normalizePhoneE164(input);
}

export function isChinaCanonicalPhone(phone: string): boolean {
  return CN_CANONICAL_RE.test(phone);
}

/** 阿里云 Dypnsapi 需要 11 位国内号码（无区号）。 */
export function toAliyunLocalPhone(phone: string): string {
  if (isChinaCanonicalPhone(phone)) {
    return phone.slice(2);
  }
  throw new Error("NOT_CHINA_PHONE");
}

/** Twilio Verify 需要 +E.164。 */
export function toTwilioE164(phone: string): string {
  return `+${phone}`;
}

/** 查询用户时兼容旧库里的 11 位中国本地号。 */
export function phoneLookupKeys(phone: string): string[] {
  const keys = [phone];
  if (isChinaCanonicalPhone(phone)) {
    keys.push(phone.slice(2));
  }
  return keys;
}
