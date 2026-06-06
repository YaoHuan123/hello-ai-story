import { chatJson, getVideoLlmEnv, stringifyForAi } from "../../shared/llm/client.js";
import type { InterviewSpeaker } from "./studioScript.js";
import { loadInterviewStudioPromptParts } from "./loadStudioPrompt.js";

const PROMPT_FILE = "studio-20_interview-studio-turn-rewrite-to-target-duration.md";
const ERR = "INTERVIEW_STUDIO_DURATION_ALIGN_INVALID";

export const IV_DURATION_ALIGN_MAX_ITERATIONS = 6;

function assertTurnRewriteShape(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${ERR}: 模型输出须为 JSON 对象`);
  }
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length !== 1 || !Object.prototype.hasOwnProperty.call(root, "text")) {
    throw new Error(`${ERR}: 顶层须仅含 text，当前键: ${keys.join(",")}`);
  }
  const t = root.text;
  if (typeof t !== "string" || !t.trim()) {
    throw new Error(`${ERR}: text 须为非空字符串`);
  }
  return t.trim();
}

export async function rewriteSingleTurnToTargetDuration(params: {
  speaker: InterviewSpeaker;
  currentText: string;
  currentDurationSec: number;
  targetTotalVideoSec: number;
  targetCharsEstimate: number;
  deltaChars: number;
}): Promise<string> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }
  const payload = {
    speaker: params.speaker,
    currentText: params.currentText,
    currentDurationSec: params.currentDurationSec,
    targetTotalVideoSec: params.targetTotalVideoSec,
    targetCharsEstimate: params.targetCharsEstimate,
    deltaChars: params.deltaChars,
  };
  const payloadStr = stringifyForAi(payload);
  const { systemText, userSuffix } = loadInterviewStudioPromptParts(PROMPT_FILE, "{{TURN_PAYLOAD_JSON}}");
  const userContent = userSuffix.replace("{{TURN_PAYLOAD_JSON}}", payloadStr);

  try {
    const parsed = await chatJson<unknown>(
      [
        { role: "system", content: systemText },
        { role: "user", content: userContent },
      ],
      { debugStepId: "iv_duration_align", temperature: 0.2, useJsonObject: true },
    );
    return assertTurnRewriteShape(parsed);
  } catch (firstErr) {
    if (!(firstErr instanceof Error) || !firstErr.message.startsWith(`${ERR}:`)) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`${ERR}: 模型调用或 JSON 解析失败。${msg}`);
    }
    const guidance = `【服务端校验未通过，请修正后重新输出】\n${firstErr.message}\n\n硬性约束：顶层仅含 text（非空字符串）；不要 speaker 或其它键；不要角色前缀。`;
    const parsed2 = await chatJson<unknown>(
      [
        { role: "system", content: systemText },
        { role: "user", content: userContent },
        { role: "user", content: guidance },
      ],
      { debugStepId: "iv_duration_align_repair", temperature: 0.15, useJsonObject: true },
    );
    return assertTurnRewriteShape(parsed2);
  }
}
