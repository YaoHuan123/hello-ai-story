import { resolveSmsRoute } from "../../../src/services/auth/routingSms.service";
import {
  normalizePhoneE164,
  phoneLookupKeys,
  toAliyunLocalPhone,
  toTwilioE164,
} from "../../../src/utils/phone";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function testNormalize(): void {
  assert(normalizePhoneE164("13800138000") === "8613800138000", "CN local");
  assert(normalizePhoneE164("8613800138000") === "8613800138000", "CN canonical");
  assert(normalizePhoneE164("+8613800138000") === "8613800138000", "CN +86");
  assert(normalizePhoneE164("4155552671") === "14155552671", "US 10 digit");
  assert(normalizePhoneE164("+14155552671") === "14155552671", "US E.164");
  assert(normalizePhoneE164("invalid") === null, "reject garbage");
}

function testRoute(): void {
  assert(resolveSmsRoute("8613800138000") === "aliyun_cn", "CN → aliyun");
  assert(resolveSmsRoute("14155552671") === "twilio_overseas", "US → twilio");
}

function testLookup(): void {
  const keys = phoneLookupKeys("8613800138000");
  assert(keys.includes("8613800138000") && keys.includes("13800138000"), "legacy lookup keys");
  assert(toAliyunLocalPhone("8613800138000") === "13800138000", "aliyun local");
  assert(toTwilioE164("14155552671") === "+14155552671", "twilio e164");
}

testNormalize();
testRoute();
testLookup();
console.log("phone.test.ts OK");
