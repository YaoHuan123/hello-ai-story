/**
 * 人物子类问句主体：Father 等须问「父亲」而非叙事者本人。
 *
 * 运行：`npm run test:question:person-topic`
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { QuestionSet } from "../../../src/topic/types";

loadEnv();

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  [ok] ${label}`);
  } else {
    failed += 1;
    const extra = detail !== undefined ? ` | ${JSON.stringify(detail)}` : "";
    console.error(`  [FAIL] ${label}${extra}`);
  }
}

const PROMPTS_DIR = path.join(__dirname, "..", "..", "..", "..", "prompts", "interview");

function readPrompt(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), "utf-8");
}

/** 口语化问句是否在问叙事者本人（错误）。 */
function asksNarratorSelf(text: string): boolean {
  const t = text.toLowerCase();
  if (/your current (job|occupation|profession|work)/i.test(t)) return true;
  if (/what (is|was) your (full )?name/i.test(t) && !/father|mother|partner|sibling|grandparent|child|relative|spouse|wife|husband|dad|mom/i.test(t)) {
    return true;
  }
  if (/when were you born/i.test(t)) return true;
  if (/what do you do for a living/i.test(t)) return true;
  return false;
}

/** 问句是否指向父亲（英/中）。 */
function mentionsFather(text: string): boolean {
  return /father|dad|your father|his occupation|his name|he was born|父亲|爸爸|爹/.test(text);
}

async function main(): Promise<void> {
  const {
    isPersonCentricCatalogTopic,
    catalogTopicSubjectLabel,
    getTopicFieldKeys,
  } = await import("../../../src/topic/catalog");
  const { personCentricPromptFields } = await import("../../../src/question/personCentricPrompt");
  const { stubSections } = await import("../../fixtures/sections.stub");
  const sectionsBasicOnly = stubSections();

  console.log("\n=== catalog 人物子类判定（无 LLM）===");
  check("Father 是人物子类", isPersonCentricCatalogTopic("Father") === true);
  check("父亲 是人物子类", isPersonCentricCatalogTopic("父亲") === true);
  check("Mother 是人物子类", isPersonCentricCatalogTopic("Mother") === true);
  check("Elementary school 非人物子类", isPersonCentricCatalogTopic("Elementary school") === false);
  check("Basic profile 非人物子类", isPersonCentricCatalogTopic("Basic profile") === false);

  const fatherSubject = catalogTopicSubjectLabel("Father", "en");
  check("Father topicSubject 含 father", /father/i.test(fatherSubject), fatherSubject);
  check("父亲 zh label", catalogTopicSubjectLabel("父亲", "zh") === "父亲");

  const fatherExtras = personCentricPromptFields("Father");
  check("prompt 注入 topicSubject", fatherExtras?.topicSubject === fatherSubject, fatherExtras);
  check("prompt 注入 dedupeScopeSection", fatherExtras?.dedupeScopeSection === "Father", fatherExtras);
  check("非人物子类无注入", personCentricPromptFields("Elementary school") === undefined);

  const { filterPersonCentricDedupeDecisions } = await import("../../../src/question/personCentricPrompt");
  const filtered = filterPersonCentricDedupeDecisions(
    "Father",
    sectionsBasicOnly,
    [
      { question: "Full name (required)", skip: true },
      { question: "Occupation (required)", skip: false },
    ],
  );
  check("无父亲节时强制不 skip", filtered.every((d) => !d.skip), filtered);

  console.log("\n=== 提示词含人物主体规则（无 LLM）===");
  const dedupeMd = readPrompt("dedupe-template-questions.md");
  const colloqMd = readPrompt("colloquialize-template-questions.md");
  const refineMd = readPrompt("refine-current-question.md");
  check("dedupe 含 topicSubject / dedupeScopeSection", /topicSubject|dedupeScopeSection/i.test(dedupeMd));
  check("dedupe 含 Basic profile 反例", /Basic profile/i.test(dedupeMd));
  check("colloquialize 含 topicSubject 规则", /topicSubject/i.test(colloqMd));
  check("colloquialize 含 Occupation 父亲示例", /father.*occupation|Occupation.*father/i.test(colloqMd));
  check("refine 含 topicSubject 规则", /topicSubject/i.test(refineMd));

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过 Father LLM 抽样。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const { dedupeQuestions } = await import("../../../src/question/dedupe");
  const { colloquializeQuestions } = await import("../../../src/question/colloquialize");
  const { runTemplatePrep } = await import("../../../src/question/runTemplatePrep");

  const fatherKeys = getTopicFieldKeys("Father");
  const fullNameKey = "Full name (required)";
  const fatherSet: QuestionSet = {
    title: "Father",
    tier: 1,
    kind: "catalog",
    questions: fatherKeys,
  };

  console.log("\n=== Father dedupe：基本档案不应覆盖父亲姓名 ===");
  const dedupe = await dedupeQuestions({ sections: sectionsBasicOnly, questionSet: fatherSet });
  check(
    "Full name 未被 skip",
    !dedupe.skippedQuestions.includes(fullNameKey),
    { skipped: dedupe.skippedQuestions },
  );

  console.log("\n=== Father colloquialize：问父亲而非叙事者 ===");
  const askAfterDedupe = dedupe.askQuestions.length > 0 ? dedupe.askQuestions : fatherKeys;
  const colloq = await colloquializeQuestions({
    sections: sectionsBasicOnly,
    questionSet: fatherSet,
    askQuestions: askAfterDedupe,
  });
  const firstKey = askAfterDedupe[0];
  const firstText = colloq.questionTexts[firstKey] ?? "";
  check("首题口语化非空", firstText.trim().length > 0, firstText);
  check("首题不问叙事者本人", !asksNarratorSelf(firstText), firstText);
  check("首题或全批问句含父亲语义", mentionsFather(firstText) || askAfterDedupe.some((k) => mentionsFather(colloq.questionTexts[k] ?? "")), {
    firstText,
    all: colloq.questionTexts,
  });

  for (const q of askAfterDedupe) {
    const text = colloq.questionTexts[q] ?? "";
    if (/occupation/i.test(q) || /occupation|job|work|职业/.test(text)) {
      check(`职业题 ${q} 不问「你的职业」`, !asksNarratorSelf(text) && (mentionsFather(text) || /occupation|job|work|职业/.test(text)), text);
    }
  }

  console.log("\n=== Father sections 已有父亲姓名：可 skip 姓名，职业仍指父亲 ===");
  const sectionsWithFather: typeof sectionsBasicOnly = [
    ...sectionsBasicOnly,
    {
      name: "父亲",
      qa: [{ q: "你父亲叫什么名字？", a: "张老根" }],
    },
  ];
  const dedupe2 = await dedupeQuestions({ sections: sectionsWithFather, questionSet: fatherSet });
  check(
    "已有父亲节时 Full name 可 skip",
    dedupe2.skippedQuestions.includes(fullNameKey) || dedupe2.askQuestions.includes(fullNameKey),
    { skipped: dedupe2.skippedQuestions, ask: dedupe2.askQuestions },
  );

  const occKey = "Occupation (required)";
  if (dedupe2.askQuestions.includes(occKey)) {
    const occColloq = await colloquializeQuestions({
      sections: sectionsWithFather,
      questionSet: fatherSet,
      askQuestions: [occKey],
    });
    const occText = occColloq.questionTexts[occKey] ?? "";
    check("职业题指父亲", !asksNarratorSelf(occText) && mentionsFather(occText), occText);
  }

  console.log("\n=== runTemplatePrep Father 首题 ===");
  const prep = await runTemplatePrep({ sections: sectionsBasicOnly, questionSet: fatherSet });
  const prepFirst = prep.askQuestions[0];
  const prepFirstText = prepFirst ? prep.questionTexts[prepFirst] ?? "" : "";
  check("prep 首题不问叙事者职业", !asksNarratorSelf(prepFirstText), prepFirstText);
  check("prep 首题非「your current occupation」类", !/your current occupation/i.test(prepFirstText), prepFirstText);

  console.log("\n=== Elementary school 对照：不受影响 ===");
  const schoolKeys = getTopicFieldKeys("Elementary school").slice(0, 3);
  const schoolSet: QuestionSet = {
    title: "Elementary school",
    tier: 1,
    kind: "catalog",
    questions: schoolKeys,
  };
  const schoolColloq = await colloquializeQuestions({
    sections: sectionsBasicOnly,
    questionSet: schoolSet,
    askQuestions: schoolKeys,
  });
  const schoolFirst = schoolColloq.questionTexts[schoolKeys[0]] ?? "";
  check("学校首题含 you / school / 小学 语境", /you|school|elementary|小学|入学/.test(schoolFirst), schoolFirst);
  check("学校题无 father 误注入", !mentionsFather(schoolFirst), schoolFirst);

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
