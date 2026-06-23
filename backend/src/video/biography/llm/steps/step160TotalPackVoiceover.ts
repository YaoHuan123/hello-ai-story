import { chatJson, getVideoLlmEnv } from "../../../shared/llm/client.js";
import type { DisplayLocale } from "../../../../content/displayLocale.js";
import {
  clampVoiceoverLine,
  voiceoverLineLimitDescription,
  voiceoverLineTooLong,
  voiceoverLineTooLongMessage,
} from "../../../shared/constants/voiceoverLimits.js";
import { buildVideoLlmMessages, buildVideoLlmUserContent, stringifyVideoPipeline } from "../../../shared/llm/localeLlm.js";
import type { MergedNarrativeSegmentItem } from "./step150MergeEnvAndEra.js";
import { rowHasRenderableEnvScene } from "../../../shared/llm/envSegmentSceneText.js";

const PROMPT_FILE = "step-160_env-voiceover.md";
const ERR = "TOTAL_PACK_VOICEOVER_160_INVALID";
const ALIGN_ERR = "TOTAL_PACK_VOICEOVER_160_ALIGNMENT_INVALID";
const ALIGN_PROMPT_FILE = "step-160_voiceover-post-alignment.md";
const ALIGN_SCENE_DESC_MAX_CODE_POINTS = 480;

function parseSegIdx(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v.trim(), 10);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

function truncateForAlignmentText(s: string, maxCodePoints: number): string {
  const t = String(s ?? "").trim();
  const chars = [...t];
  if (chars.length <= maxCodePoints) {
    return t;
  }
  return `${chars.slice(0, maxCodePoints).join("")}…`;
}

export type EraBackdropVoiceoverSegment = { narrative: string[]; timeLabel?: string };

/**
 * 步骤 160 的内心情感信号——来自前端 AI 追问页用户对每条内心问题的最终是非判断。
 * 仅作用于主线（env）旁白；时代（era）旁白不消费此字段。详见 prompts/create-video/step-160_env-voiceover.md 第 8 条硬性规则。
 */
export type EmotionalInnerSignalItem = {
  segmentIndex: number;
  question: string;
  answer: "是" | "否";
};
type VoiceoverSegmentSource = "env" | "era";
type AdjacencyHintItem = {
  source: VoiceoverSegmentSource;
  refIndex: number;
  segmentIndex?: number;
  eraIndex?: number;
  prevSource: VoiceoverSegmentSource | "start";
  nextSource: VoiceoverSegmentSource | "end";
  switchFromPrev: boolean;
  switchToNext: boolean;
  timeLabel?: string;
};

function timeLabelForEraRow(row: MergedNarrativeSegmentItem): string | undefined {
  const tl = (row as { timeLabel?: unknown }).timeLabel;
  if (typeof tl === "string" && tl.trim()) {
    return tl.trim();
  }
  return undefined;
}

/**
 * 从步骤 150 合并落盘对象解析 `mergedNarrativeSegments`（校验叙事非空）。
 */
export function parseMergedNarrativeSegmentsFromMergeRaw(
  raw: Record<string, unknown>,
  errPrefix = ERR,
): MergedNarrativeSegmentItem[] {
  const arr = raw.mergedNarrativeSegments;
  if (!Array.isArray(arr)) {
    const hint =
      "「创建视频 / 一步成片」在服务端从**步骤 160（为合并场景包生成旁白）**开始，会读取**步骤 150 合并**的 JSON 里的 `mergedNarrativeSegments` 数组。" +
      "「AI 生成时代背景事件」等属于更早的流水线，不会在这一步再跑。若你尚未跑通前序步骤（含步骤 160：合并时代与个人场景包），该文件可能未生成、为空或键名/类型不对。请在 Pipeline 调试中按序执行到步骤 160 并确认 pipeline/merge-150_合并时代背景事件场景包和个人事件场景包.json 有效后再试。";
    throw new Error(`${errPrefix}: mergedNarrativeSegments 须为数组。${hint}`);
  }
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${errPrefix}: 第 ${i + 1} 条须为对象`);
    }
    const o = item as Record<string, unknown>;
    const si = parseSegIdx(o.segmentIndex);
    if (si === null) {
      throw new Error(`${errPrefix}: 第 ${i + 1} 条 segmentIndex 无效`);
    }
    if (!Array.isArray(o.narrative) || o.narrative.length === 0) {
      throw new Error(`${errPrefix}: 第 ${i + 1} 条 narrative 须为非空数组`);
    }
    if (o.timeLabel !== undefined && typeof o.timeLabel !== "string") {
      throw new Error(`${errPrefix}: 第 ${i + 1} 条 timeLabel 须为字符串`);
    }
    if (o.step20EraBackdropIndex !== undefined && parseSegIdx(o.step20EraBackdropIndex) === null) {
      throw new Error(`${errPrefix}: 第 ${i + 1} 条 step20EraBackdropIndex 无效`);
    }
    if (o.insertBefore !== undefined && o.insertBefore !== null && parseSegIdx(o.insertBefore) === null) {
      throw new Error(`${errPrefix}: 第 ${i + 1} 条 insertBefore 无效`);
    }
    if (
      o.insertAfterTimelineSegmentIndex !== undefined &&
      o.insertAfterTimelineSegmentIndex !== null &&
      parseSegIdx(o.insertAfterTimelineSegmentIndex) === null
    ) {
      throw new Error(`${errPrefix}: 第 ${i + 1} 条 insertAfterTimelineSegmentIndex 无效`);
    }
  }
  return arr as unknown as MergedNarrativeSegmentItem[];
}

function visualSceneCount(row: MergedNarrativeSegmentItem): number {
  return Array.isArray(row.visualScenes) ? row.visualScenes.length : 0;
}

function splitMergedForVoiceoverPipelineJson(merged: MergedNarrativeSegmentItem[]): {
  polishedEventSummariesEnv: string[][];
  step20EraBackdropSegments: EraBackdropVoiceoverSegment[];
  timelineOrder: MergedNarrativeSegmentItem[];
  eraOrder: MergedNarrativeSegmentItem[];
  envVisualSceneCounts: number[];
  eraVisualSceneCounts: number[];
  adjacencyHints: {
    env: AdjacencyHintItem[];
    era: AdjacencyHintItem[];
  };
} {
  const timelineOrder: MergedNarrativeSegmentItem[] = [];
  const eraOrder: MergedNarrativeSegmentItem[] = [];
  const envAdjacencyHints: AdjacencyHintItem[] = [];
  const eraAdjacencyHints: AdjacencyHintItem[] = [];

  let envIdx = 0;
  let eraIdx = 0;
  for (let i = 0; i < merged.length; i++) {
    const row = merged[i];
    const source: VoiceoverSegmentSource = row.step20EraBackdropIndex === undefined ? "env" : "era";
    const prevSource: VoiceoverSegmentSource | "start" =
      i === 0 ? "start" : merged[i - 1].step20EraBackdropIndex === undefined ? "env" : "era";
    const nextSource: VoiceoverSegmentSource | "end" =
      i === merged.length - 1 ? "end" : merged[i + 1].step20EraBackdropIndex === undefined ? "env" : "era";
    if (source === "env") {
      envAdjacencyHints.push({
        source,
        refIndex: envIdx,
        segmentIndex: row.segmentIndex,
        prevSource,
        nextSource,
        switchFromPrev: prevSource !== "start" && prevSource !== source,
        switchToNext: nextSource !== "end" && nextSource !== source,
        timeLabel: timeLabelForEraRow(row),
      });
      envIdx++;
    } else {
      eraAdjacencyHints.push({
        source,
        refIndex: eraIdx,
        eraIndex: row.step20EraBackdropIndex,
        prevSource,
        nextSource,
        switchFromPrev: prevSource !== "start" && prevSource !== source,
        switchToNext: nextSource !== "end" && nextSource !== source,
        timeLabel: timeLabelForEraRow(row),
      });
      eraIdx++;
    }
  }

  for (const row of merged) {
    if (row.step20EraBackdropIndex === undefined) {
      // 主线个人事件
      timelineOrder.push(row);
    } else {
      // 时代背景事件
      eraOrder.push(row);
    }
  }
  const polishedEventSummariesEnv = timelineOrder.map((r) => (Array.isArray(r.narrative) ? r.narrative : []));
  const step20EraBackdropSegments: EraBackdropVoiceoverSegment[] = eraOrder.map((r) => {
    const tl = timeLabelForEraRow(r);
    const narrativeArr = Array.isArray(r.narrative) ? r.narrative : [];
    return tl ? { narrative: narrativeArr, timeLabel: tl } : { narrative: narrativeArr };
  });
  const envVisualSceneCounts = timelineOrder.map(visualSceneCount);
  const eraVisualSceneCounts = eraOrder.map(visualSceneCount);
  return {
    polishedEventSummariesEnv,
    step20EraBackdropSegments,
    timelineOrder,
    eraOrder,
    envVisualSceneCounts,
    eraVisualSceneCounts,
    adjacencyHints: {
      env: envAdjacencyHints,
      era: eraAdjacencyHints,
    },
  };
}

type EnvVoiceoverRow = { segmentIndex: number; voiceover: string[] };
type EraVoiceoverRow = { eraIndex: number; voiceover: string[] };

function buildVoiceoverAlignmentPayload(
  timelineOrder: MergedNarrativeSegmentItem[],
  eraOrder: MergedNarrativeSegmentItem[],
  envVoiceovers: EnvVoiceoverRow[],
  eraVoiceovers: EraVoiceoverRow[],
): { env: unknown[]; era: unknown[] } {
  if (envVoiceovers.length !== timelineOrder.length) {
    throw new Error(`${ALIGN_ERR}: env 旁白条数与主线条数不一致（内部错误）`);
  }
  if (eraVoiceovers.length !== eraOrder.length) {
    throw new Error(`${ALIGN_ERR}: era 旁白条数与时代条数不一致（内部错误）`);
  }
  const env = timelineOrder.map((row, i) => {
    const vo = envVoiceovers[i]!.voiceover;
    const scenes = Array.isArray(row.visualScenes) ? row.visualScenes : [];
    const sceneDescriptions = scenes.map((sc) =>
      truncateForAlignmentText(String((sc as { sceneDescription?: unknown }).sceneDescription ?? ""), ALIGN_SCENE_DESC_MAX_CODE_POINTS),
    );
    const narrative = Array.isArray(row.narrative) ? row.narrative.map((x) => String(x ?? "")) : [];
    return {
      segmentIndex: row.segmentIndex,
      narrative,
      sceneDescriptions,
      voiceover: vo.map((x) => String(x ?? "")),
    };
  });
  const era = eraOrder.map((row, j) => {
    const vo = eraVoiceovers[j]!.voiceover;
    const scenes = Array.isArray(row.visualScenes) ? row.visualScenes : [];
    const sceneDescriptions = scenes.map((sc) =>
      truncateForAlignmentText(String((sc as { sceneDescription?: unknown }).sceneDescription ?? ""), ALIGN_SCENE_DESC_MAX_CODE_POINTS),
    );
    const narrative = Array.isArray(row.narrative) ? row.narrative.map((x) => String(x ?? "")) : [];
    return {
      eraIndex: j,
      narrative,
      sceneDescriptions,
      voiceover: vo.map((x) => String(x ?? "")),
    };
  });
  return { env, era };
}

function assertVoiceoverAlignmentResult(parsed: unknown): void {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${ALIGN_ERR}: 对齐模型输出须为对象`);
  }
  const o = parsed as Record<string, unknown>;
  if (o.ok === true) {
    const viol = o.violations;
    if (Array.isArray(viol) && viol.length > 0) {
      throw new Error(`${ALIGN_ERR}: 模型返回 ok=true 但仍有 violations，输出不可靠`);
    }
    return;
  }
  if (o.ok !== false) {
    throw new Error(`${ALIGN_ERR}: 对齐模型输出须含布尔字段 ok`);
  }
  const violations = o.violations;
  if (!Array.isArray(violations) || violations.length === 0) {
    throw new Error(`${ALIGN_ERR}: ok=false 时 violations 须为非空数组`);
  }
  throw new Error(`${ALIGN_ERR}: ${JSON.stringify(violations)}`);
}

async function runVoiceoverAlignmentModelCheck(payload: { env: unknown[]; era: unknown[] }): Promise<void> {
  const { messages } = buildVideoLlmMessages(ALIGN_PROMPT_FILE, payload);
  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(messages,
      {
        debugStepId: "total_pack_voiceover_160_alignment",
        temperature: 0,
        useJsonObject: true,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${ALIGN_ERR}: 对齐模型调用或 JSON 解析失败。${msg}`);
  }
  assertVoiceoverAlignmentResult(parsed);
}

function parseVoiceoverLines(
  item: unknown,
  label: string,
  locale: DisplayLocale,
  clampOverlong: boolean,
): string[] {
  const raw = Array.isArray(item)
    ? item
    : item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>).voiceover
      : undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${ERR}: ${label} 须为非空 voiceover 字符串数组，或含 voiceover 数组的对象`);
  }
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !v.trim()) {
      throw new Error(`${ERR}: ${label} voiceover 数组中每项须为非空字符串`);
    }
    const trimmed = v.trim();
    if (voiceoverLineTooLong(trimmed, locale)) {
      if (clampOverlong) {
        const clamped = clampVoiceoverLine(trimmed, locale);
        console.warn(`[step160] ${label} voiceover 超长，已截断：${clamped.slice(0, 48)}…`);
        out.push(clamped);
        continue;
      }
      throw new Error(`${ERR}: ${voiceoverLineTooLongMessage(label, trimmed, locale)}`);
    }
    out.push(trimmed);
  }
  return out;
}

function assertVoiceoverShape(
  parsed: unknown,
  timelineLen: number,
  eraLen: number,
  timelineOrder: MergedNarrativeSegmentItem[],
  envVisualSceneCounts: number[],
  eraVisualSceneCounts: number[],
  locale: DisplayLocale,
  clampOverlong: boolean,
): { envVoiceovers: EnvVoiceoverRow[]; eraVoiceovers: EraVoiceoverRow[] } {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${ERR}: 模型输出须为对象`);
  }
  const root = parsed as Record<string, unknown>;
  const keySet = new Set(Object.keys(root));
  if (keySet.size !== 2 || !keySet.has("envVoiceovers") || !keySet.has("eraVoiceovers")) {
    throw new Error(`${ERR}: 顶层须仅含 envVoiceovers、eraVoiceovers，当前键: ${Object.keys(root).join(",")}`);
  }
  const envArr = root.envVoiceovers;
  const eraArr = root.eraVoiceovers;
  if (!Array.isArray(envArr) || !Array.isArray(eraArr)) {
    throw new Error(`${ERR}: envVoiceovers / eraVoiceovers 须为数组`);
  }
  if (envArr.length !== timelineLen) {
    throw new Error(`${ERR}: envVoiceovers 条数须为 ${timelineLen}，实际 ${envArr.length}`);
  }
  if (eraArr.length !== eraLen) {
    throw new Error(`${ERR}: eraVoiceovers 条数须为 ${eraLen}，实际 ${eraArr.length}`);
  }

  const envOut: EnvVoiceoverRow[] = [];
  for (let i = 0; i < envArr.length; i++) {
    const voiceover = parseVoiceoverLines(envArr[i], `envVoiceovers 第 ${i + 1} 项`, locale, clampOverlong);
    const sceneCount = envVisualSceneCounts[i] ?? 0;
    if (sceneCount > 0 && voiceover.length !== sceneCount) {
      throw new Error(
        `${ERR}: envVoiceovers 第 ${i + 1} 项（segmentIndex=${timelineOrder[i].segmentIndex}）有 ${sceneCount} 个画面，voiceover 须恰好 ${sceneCount} 条，实际 ${voiceover.length}（请重试步骤 160，确保一条旁白对应一个画面）`,
      );
    }
    envOut.push({ segmentIndex: timelineOrder[i].segmentIndex, voiceover });
  }

  const eraOut: EraVoiceoverRow[] = [];
  for (let j = 0; j < eraArr.length; j++) {
    const voiceover = parseVoiceoverLines(eraArr[j], `eraVoiceovers 第 ${j + 1} 项`, locale, clampOverlong);
    const eraSceneCount = eraVisualSceneCounts[j] ?? 0;
    if (eraSceneCount > 0 && voiceover.length !== eraSceneCount) {
      throw new Error(
        `${ERR}: eraVoiceovers 第 ${j + 1} 项（eraIndex=${j}）有 ${eraSceneCount} 个画面，voiceover 须恰好 ${eraSceneCount} 条，实际 ${voiceover.length}（请重试步骤 160，确保一条旁白对应一个画面）`,
      );
    }
    eraOut.push({ eraIndex: j, voiceover });
  }

  return { envVoiceovers: envOut, eraVoiceovers: eraOut };
}

function mergeVoiceoversIntoMerged(
  merged: MergedNarrativeSegmentItem[],
  envVoiceovers: EnvVoiceoverRow[],
  eraVoiceovers: EraVoiceoverRow[],
): MergedNarrativeSegmentItem[] {
  const envBySeg = new Map<number, string[]>();
  for (const v of envVoiceovers) {
    envBySeg.set(v.segmentIndex, v.voiceover);
  }
  const eraByIdx = new Map<number, string[]>();
  for (const v of eraVoiceovers) {
    eraByIdx.set(v.eraIndex, v.voiceover);
  }

  const mergedWithVo = merged.map((row) => {
    // 检查是否有 step20EraBackdropIndex 来判断是否为时代背景
    if (row.step20EraBackdropIndex === undefined) {
      // 主线个人事件
      const vo = envBySeg.get(row.segmentIndex);
      if (!vo) {
        throw new Error(`${ERR}: 未找到 segmentIndex=${row.segmentIndex} 的主线旁白`);
      }
      return { ...row, voiceover: vo };
    } else {
      // 时代背景事件
      const ej = row.step20EraBackdropIndex;
      if (ej === null || !Number.isFinite(ej)) {
        throw new Error(`${ERR}: 时代条缺少 step20EraBackdropIndex，无法合并旁白`);
      }
      const vo = eraByIdx.get(ej);
      if (!vo) {
        throw new Error(`${ERR}: 未找到 eraIndex=${ej} 的时代旁白`);
      }
      return { ...row, voiceover: vo };
    }
  });

  for (const row of mergedWithVo) {
    const n = row.visualScenes?.length ?? 0;
    if (n === 0) {
      continue;
    }
    const vo = row.voiceover;
    if (!Array.isArray(vo) || vo.length !== n) {
      throw new Error(
        `${ERR}: segmentIndex=${row.segmentIndex} 含 ${n} 个 visualScenes，合并后 voiceover 须为 ${n} 条，实际 ${Array.isArray(vo) ? vo.length : 0}`,
      );
    }
  }

  return mergedWithVo;
}

/**
 * 把内心情感信号规整成稳定输入：
 * 1) 仅保留 answer 为 "是"/"否"、且对应 segmentIndex 在主线 timeline 中存在的项；
 * 2) 同 segment 同问题去重（保留首条），避免重复噪声；
 * 3) 按 segmentIndex 升序、同 segment 内按 question 字典序——保证模型每次看到的输入顺序稳定。
 */
function buildSanitizedInnerSignalsForPrompt(
  raw: EmotionalInnerSignalItem[] | undefined,
  timelineOrder: MergedNarrativeSegmentItem[],
): EmotionalInnerSignalItem[] {
  if (!raw || raw.length === 0) {
    return [];
  }
  const validSegs = new Set<number>(timelineOrder.map((r) => r.segmentIndex));
  const seen = new Set<string>();
  const out: EmotionalInnerSignalItem[] = [];
  for (const it of raw) {
    if (!it || (it.answer !== "是" && it.answer !== "否")) continue;
    const q = typeof it.question === "string" ? it.question.trim() : "";
    if (!q) continue;
    if (!validSegs.has(it.segmentIndex)) continue;
    const key = `${it.segmentIndex}\u0001${q}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ segmentIndex: it.segmentIndex, question: q, answer: it.answer });
  }
  out.sort((a, b) => a.segmentIndex - b.segmentIndex || a.question.localeCompare(b.question));
  return out;
}

/**
 * 对合并后的 `mergedNarrativeSegments` 调用步骤 160 旁白模型，返回处理后的新数组。
 * `merged` 为空时返回空数组（调用方应跳过模型并标记 skippedModel）。
 *
 * `emotionalInnerSignals` 可选——仅作用于主线 env 旁白：
 * - "是" → 可在对应 segmentIndex 旁白中自然带出（仍受现有所有硬性约束）
 * - "否" → 该 segmentIndex 旁白禁止暗示该情绪/想法
 */
export async function runTotalPackVoiceoverFromMergedSegments(
  merged: MergedNarrativeSegmentItem[],
  emotionalInnerSignals?: EmotionalInnerSignalItem[],
): Promise<MergedNarrativeSegmentItem[]> {
  if (merged.length === 0) {
    return [];
  }

  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const {
    polishedEventSummariesEnv,
    step20EraBackdropSegments,
    timelineOrder,
    eraOrder,
    envVisualSceneCounts,
    eraVisualSceneCounts,
    adjacencyHints,
  } = splitMergedForVoiceoverPipelineJson(merged);

  const innerItems = buildSanitizedInnerSignalsForPrompt(emotionalInnerSignals, timelineOrder);
  const pipelinePayload: Record<string, unknown> = {
    polishedEventSummariesEnv,
    step20EraBackdropSegments,
    envVisualSceneCounts,
    eraVisualSceneCounts,
    adjacencyHints,
  };
  if (innerItems.length > 0) {
    pipelinePayload.emotionalInnerSignals = { items: innerItems };
  }
  const { messages: baseMessages, locale } = buildVideoLlmMessages(PROMPT_FILE, pipelinePayload);

  // 单次「校验失败带错误重试」：旁白长度/条数等约束模型偶发违例，反馈具体错误后重试一次；仍超长则截断兜底。
  const callAndAssert = async (
    debugStepId: string,
    extraGuidance?: string,
    clampOverlong = false,
  ): Promise<{ envVoiceovers: EnvVoiceoverRow[]; eraVoiceovers: EraVoiceoverRow[] }> => {
    const messages = [...baseMessages];
    if (extraGuidance) {
      messages.push({ role: "user" as const, content: extraGuidance });
    }
    let parsed: unknown;
    try {
      parsed = await chatJson<unknown>(messages, {
        debugStepId,
        temperature: extraGuidance ? 0.1 : 0.25,
        useJsonObject: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`${ERR}: 模型调用或 JSON 解析失败。${msg}`);
    }
    return assertVoiceoverShape(
      parsed,
      timelineOrder.length,
      eraOrder.length,
      timelineOrder,
      envVisualSceneCounts,
      eraVisualSceneCounts,
      locale,
      clampOverlong,
    );
  };

  let envVoiceovers: EnvVoiceoverRow[];
  let eraVoiceovers: EraVoiceoverRow[];
  try {
    ({ envVoiceovers, eraVoiceovers } = await callAndAssert("total_pack_voiceover_160"));
  } catch (firstErr) {
    if (!(firstErr instanceof Error) || !firstErr.message.startsWith(`${ERR}:`)) {
      throw firstErr;
    }
    const limitDesc = voiceoverLineLimitDescription(locale);
    const guidance = `【服务端校验未通过，请修正后重新输出完整 JSON】\n${firstErr.message}\n\n硬性约束：envVoiceovers/eraVoiceovers 为字符串数组的数组（与输入下标一一对应）；${limitDesc}；每项条数须与对应画面数一致；不要 segmentIndex/eraIndex。`;
    try {
      ({ envVoiceovers, eraVoiceovers } = await callAndAssert("total_pack_voiceover_160_repair", guidance));
    } catch (repairErr) {
      if (!(repairErr instanceof Error) || !repairErr.message.startsWith(`${ERR}:`)) {
        throw repairErr;
      }
      console.warn(`[step160] repair 仍未通过校验，启用截断兜底：${repairErr.message.slice(0, 120)}…`);
      ({ envVoiceovers, eraVoiceovers } = await callAndAssert("total_pack_voiceover_160_clamp", guidance, true));
    }
  }

  const alignmentPayload = buildVoiceoverAlignmentPayload(
    timelineOrder,
    eraOrder,
    envVoiceovers,
    eraVoiceovers,
  );
  await runVoiceoverAlignmentModelCheck(alignmentPayload);

  return mergeVoiceoversIntoMerged(merged, envVoiceovers, eraVoiceovers);
}
