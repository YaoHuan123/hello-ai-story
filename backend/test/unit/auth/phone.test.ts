import {
  isChinaCanonicalPhone,
  normalizePhoneE164,
  phoneLookupKeys,
  toAliyunLocalPhone,
} from "../../../src/utils/phone";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function testNormalize(): void {
  assert(normalizePhoneE164("13800138000") === "8613800138000", "CN local");
  assert(normalizePhoneE164("8613800138000") === "8613800138000", "CN canonical");
  assert(normalizePhoneE164("+8613800138000") === "8613800138000", "CN +86");
  assert(normalizePhoneE164("4155552671") === "14155552671", "US 10 digit");
  assert(isChinaCanonicalPhone("8613800138000"), "CN canonical check");
  assert(!isChinaCanonicalPhone("14155552671"), "US not CN");
  assert(normalizePhoneE164("invalid") === null, "reject garbage");
}

function testLookup(): void {
  const keys = phoneLookupKeys("8613800138000");
  assert(keys.includes("8613800138000") && keys.includes("13800138000"), "legacy lookup keys");
  assert(toAliyunLocalPhone("8613800138000") === "13800138000", "aliyun local");
}

testNormalize();
testLookup();
console.log("phone.test.ts OK");
