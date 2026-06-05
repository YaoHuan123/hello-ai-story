/**
 * video LLM trace 落盘 smoke。
 * 用法：npm run build && npm run test:video:trace
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runWithVideoLlmTrace,
  writeVideoLlmTraceInput,
  writeVideoLlmTraceOutput,
} from "../../../dist/video/shared/llm/videoLlmTrace.js";

async function main(): Promise<void> {
  const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-llm-trace-"));
  process.env.VIDEO_LLM_TRACE = "on";

  await runWithVideoLlmTrace(traceDir, async () => {
    const call = writeVideoLlmTraceInput({
      debugStepId: "test_step",
      depth: 0,
      attempt: 0,
      request: { url: "http://example", body: { messages: [{ role: "user", content: "hi" }] } },
    });
    assert.ok(call);
    writeVideoLlmTraceOutput({
      ...call!,
      debugStepId: "test_step",
      ok: true,
      output: { raw: '{"ok":true}' },
    });
  });

  assert.ok(fs.existsSync(path.join(traceDir, "00001-test_step-input.json")));
  assert.ok(fs.existsSync(path.join(traceDir, "00001-test_step-output.json")));
  assert.ok(fs.existsSync(path.join(traceDir, "manifest.jsonl")));

  fs.rmSync(traceDir, { recursive: true, force: true });
  console.log("test:video:trace OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
