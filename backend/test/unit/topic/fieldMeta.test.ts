/**
 * 字段元数据与答案规范化单元测试。
 * 运行：`npm run test:field-meta`
 */
import {
  getTopicFieldKeys,
  getTopicFieldMeta,
  isSchoolLastYearField,
  parseSchoolLastYearQuestionEn,
  schoolLastYearQuestionEn,
  schoolLastYearQuestionZh,
} from "../../../src/topic/catalog";
import { normalizeFieldAnswer, filterSuggestionsForFieldType } from "../../../src/topic/fieldAnswer";
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
  check("legacy 基本档案+姓名字段可解析", nameMeta?.fieldType === "text", nameMeta);
  const nameMetaEn = getTopicFieldMeta("Basic profile", "Full name (required)");
  check("姓名=text", nameMetaEn?.fieldType === "text", nameMetaEn);

  const genderMeta = getTopicFieldMeta("Basic profile", "Gender");
  check("性别=select", genderMeta?.fieldType === "select", genderMeta);
  check("性别选项含 Male/Female", genderMeta?.fieldChoices?.includes("Male") && genderMeta?.fieldChoices?.includes("Female"));

  const birthMeta = getTopicFieldMeta("Basic profile", "Date of birth");
  check("出生年月=yearMonth", birthMeta?.fieldType === "yearMonth", birthMeta);

  const eduMeta = getTopicFieldMeta("Basic profile", "Education");
  check("学历=select", eduMeta?.fieldType === "select" && (eduMeta.fieldChoices?.length ?? 0) > 0, eduMeta);

  console.log("\n=== 学业时间字段 ===");
  const schoolMeta = getTopicFieldMeta("Elementary school", "Enrollment date (required)");
  check("小学入学时间=yearMonth", schoolMeta?.fieldType === "yearMonth", schoolMeta);

  console.log("\n=== K12 上到哪一年 ===");
  const elemKeys = getTopicFieldKeys("Elementary school");
  check("小学含 Last year 字段", elemKeys.includes("Last year attended at this school (optional)"));
  check("小学不含 Graduation date", !elemKeys.includes("Graduation date (optional)"));
  check(
    "高中 Last year 字段识别",
    isSchoolLastYearField("High school", "Last year attended at this school (optional)"),
  );
  check("大学仍用 Graduation date", getTopicFieldKeys("College").includes("Graduation date (optional)"));
  const enQ = schoolLastYearQuestionEn("城关第一小学");
  check("英文问句含校名", enQ === "What year did you attend 城关第一小学 until?");
  check("中文问句", schoolLastYearQuestionZh("城关第一小学") === "你在城关第一小学上到哪一年？");
  check("英文问句解析", parseSchoolLastYearQuestionEn(enQ) === "城关第一小学");

  console.log("\n=== 年月规范化 ===");
  check("1992年3月", normalizeYearMonthInRange("1992年3月") === "1992-03");
  check("1992-03", normalizeYearMonthInRange("1992-03") === "1992-03");
  check("非法月", normalizeYearMonthInRange("1992年13月") === "");

  console.log("\n=== 答案校验 ===");
  const genderOk = normalizeFieldAnswer(genderMeta, "男", {
    displayLocale: "zh",
    topicName: "Basic profile",
    fieldKey: "Gender",
  });
  check("性别选男→Male", genderOk.ok && genderOk.value === "Male", genderOk);
  const genderBad = normalizeFieldAnswer(genderMeta, "未知");
  check("性别非法拒绝", !genderBad.ok, genderBad);
  const ymOk = normalizeFieldAnswer(birthMeta, "1990年5月");
  check("出生年月规范化", ymOk.ok && ymOk.value === "1990-05", ymOk);

  console.log("\n=== 年月 chip 过滤 ===");
  check(
    "保留 YYYY-MM",
    filterSuggestionsForFieldType(["2019-03", "2012-09"], "yearMonth").join(",") === "2019-03,2012-09",
  );
  check(
    "丢弃叙事短语",
    filterSuggestionsForFieldType(["大学的时候", "2019-03"], "yearMonth").join(",") === "2019-03",
  );
  check(
    "1992年3月→YYYY-MM",
    filterSuggestionsForFieldType(["1992年3月"], "yearMonth").join(",") === "1992-03",
  );
  check(
    "text 不过滤",
    filterSuggestionsForFieldType(["寄宿", "走读"], "text").join(",") === "寄宿,走读",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
