import assert from "node:assert/strict";
import {
  questionTraceEnabled,
  recordQuestionLlmCall,
  traceQuestionStep,
  writeQuestionLlmInput,
} from "../../../src/question/questionTrace";

async function main(): Promise<void> {
  const prev = process.env.QUESTION_LLM_TRACE;

  process.env.QUESTION_LLM_TRACE = "0";
  assert.equal(questionTraceEnabled(), false);

  process.env.QUESTION_LLM_TRACE = "on";
  assert.equal(questionTraceEnabled(), true);

  const out = await traceQuestionStep("noop", async () => "x");
  assert.equal(out, "x");

  const outsideTraceInput = writeQuestionLlmInput({
    label: "unit",
    request: { model: "test", messages: [] },
  });
  assert.equal(outsideTraceInput, undefined);

  recordQuestionLlmCall({
    label: "unit",
    durationMs: 1,
    ok: true,
    inputFile: "llm-0001-unit-input.json",
  });

  process.env.QUESTION_LLM_TRACE = prev;
  console.log("[ok] question-trace.unit");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
