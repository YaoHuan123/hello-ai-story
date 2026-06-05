/**
 * 字段元数据与答案规范化单元测试。
 * 运行：`npm run test:field-meta`
 */
import { getTopicFieldMeta } from "../../../src/topic/catalog";
import { normalizeFieldAnswer } from "../../../src/topic/fieldAnswer";
import { normalizeYearMonthInRange } from "../../../src/topic/yearMonth";

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  [ok] ${label}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${label}`, detail !== undefined ? detail : "");
  }
}

function main(): void {
  console.log("\n=== 基本档案字段类型 ===");
  const nameMeta = getTopicFieldMeta("基本档案", "姓名（必填）");
  check("姓名=text", nameMeta?.fieldType === "text", nameMeta);

  const genderMeta = getTopicFieldMeta("基本档案", "性别");
  check("性别=select", genderMeta?.fieldType === "select", genderMeta);
  check("性别选项含男/女", genderMeta?.fieldChoices?.includes("男") && genderMeta?.fieldChoices?.includes("女"));

  const birthMeta = getTopicFieldMeta("基本档案", "出生年月");
  check("出生年月=yearMonth", birthMeta?.fieldType === "yearMonth", birthMeta);

  const eduMeta = getTopicFieldMeta("基本档案", "学历");
  check("学历=select", eduMeta?.fieldType === "select" && (eduMeta.fieldChoices?.length ?? 0) > 0, eduMeta);

  console.log("\n=== 学业时间字段 ===");
  const schoolMeta = getTopicFieldMeta("小学", "入学时间（必填）");
  check("小学入学时间=yearMonth", schoolMeta?.fieldType === "yearMonth", schoolMeta);

  console.log("\n=== 年月规范化 ===");
  check("1992年3月", normalizeYearMonthInRange("1992年3月") === "1992-03");
  check("1992-03", normalizeYearMonthInRange("1992-03") === "1992-03");
  check("非法月", normalizeYearMonthInRange("1992年13月") === "");

  console.log("\n=== 答案校验 ===");
  const genderOk = normalizeFieldAnswer(genderMeta, "男");
  check("性别选男", genderOk.ok && genderOk.value === "男", genderOk);
  const genderBad = normalizeFieldAnswer(genderMeta, "未知");
  check("性别非法拒绝", !genderBad.ok, genderBad);
  const ymOk = normalizeFieldAnswer(birthMeta, "1990年5月");
  check("出生年月规范化", ymOk.ok && ymOk.value === "1990-05", ymOk);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
