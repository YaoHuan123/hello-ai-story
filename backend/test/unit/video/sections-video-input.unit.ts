/**
 * step-10 输入适配 smoke：sections → stub polish → downstream pipeline JSON。
 * 用法：npm run build && npm run test:video:input
 */
import assert from "node:assert/strict";
import type { AnsweredSection } from "../../../src/topic/types";
import {
  buildDownstreamPipelineJson,
  buildMaterialPolishLlmInput,
  buildStubPolishedFromSections,
  classifyPipelineForLlm,
  filterSectionsForVideo,
  joinSectionQaSource,
} from "../../../src/video/shared/input/sectionsFilter";

const FIXTURE: AnsweredSection[] = [
  {
    name: "基本档案",
    qa: [
      { q: "您怎么称呼？", a: "张三" },
      { q: "哪年出生？", a: "1955年" },
    ],
  },
  {
    name: "小学",
    qa: [{ q: "小学在哪上的？", a: "北京东城某小学" }],
  },
  { name: "空节", qa: [] },
  { name: "", qa: [{ q: "x", a: "y" }] },
];

function testFilter() {
  const filtered = filterSectionsForVideo(FIXTURE);
  assert.equal(filtered.length, 2);
  assert.deepEqual(filtered.map((s) => s.name), ["基本档案", "小学"]);
}

function testJoinSource() {
  const source = joinSectionQaSource(FIXTURE[0]!);
  assert.ok(source.includes("您怎么称呼？：张三"));
  assert.ok(source.includes("哪年出生？：1955年"));
  assert.ok(source.includes("\n"));
}

function testMaterialPolishLlmInput() {
  const input = buildMaterialPolishLlmInput(FIXTURE);
  assert.equal(input.sections.length, 2);
  assert.equal(input.sections[0]!.name, "基本档案");
  assert.ok(input.sections[0]!.source.includes("张三"));
  assert.equal(Object.keys(input).length, 1);
  assert.ok(!("turnReasonAnswers" in input));
  assert.ok(!("answeredSections" in input));
}

function testStubPolish() {
  const polished = buildStubPolishedFromSections(FIXTURE);
  assert.equal(Object.keys(polished).length, 2);
  assert.ok(polished["基本档案"]?.includes("张三"));
  assert.ok(polished["小学"]?.includes("北京东城"));
}

function testDownstreamJsonEmptyTurn() {
  const downstream = buildDownstreamPipelineJson({
    polishedTemplateInstanceSummaries: { 基本档案: "test" },
  });
  assert.equal(downstream.polishedTemplateInstanceSummaries["基本档案"], "test");
  assert.equal(downstream.turnReasonAnswers, undefined);
  assert.deepEqual(classifyPipelineForLlm(downstream), {
    polishedTemplateInstanceSummaries: { 基本档案: "test" },
  });
}

function testDownstreamJsonWithTurn() {
  const downstream = buildDownstreamPipelineJson({
    polishedTemplateInstanceSummaries: { 基本档案: "test" },
    turnReasonAnswers: [{ order: 1, question: "q", answer: "a", savedAt: "2020" }],
  });
  assert.equal(downstream.turnReasonAnswers?.items.length, 1);
  assert.deepEqual(classifyPipelineForLlm(downstream), {
    polishedTemplateInstanceSummaries: { 基本档案: "test" },
    turnReasonAnswers: { items: [{ question: "q", answer: "a" }] },
  });
}

async function testPipelineStub() {
  const { polishSectionsForVideoPipeline } = await import("../../../dist/video/shared/input/sectionsVideoInput.js");
  const result = await polishSectionsForVideoPipeline(FIXTURE, { mode: "stub" });
  assert.equal(result.sectionCount, 2);
  assert.equal(Object.keys(result.polishedTemplateInstanceSummaries).length, 2);
  assert.equal(result.downstreamPipeline.turnReasonAnswers, undefined);
  assert.equal(
    result.downstreamPipeline.polishedTemplateInstanceSummaries["基本档案"],
    result.polishedTemplateInstanceSummaries["基本档案"],
  );
}

async function main() {
  testFilter();
  testJoinSource();
  testMaterialPolishLlmInput();
  testStubPolish();
  testDownstreamJsonEmptyTurn();
  testDownstreamJsonWithTurn();
  await testPipelineStub();
  console.log("test:video:input OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
