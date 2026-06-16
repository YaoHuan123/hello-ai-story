import fs from "node:fs";
import path from "path";
import { buildVideoLlmMessages, buildVideoLlmUserContent, stringifyVideoPipeline } from "../../../shared/llm/localeLlm.js";
import { chatJson, getVideoLlmEnv } from "../../../shared/llm/client.js";
import type { MergedNarrativeSegmentItem } from "./step150MergeEnvAndEra.js";
import { PIPELINE_GEO_SIGNAGE_REFERENCE_FILE } from "../../constants/pipelineFilenames.js";
const PROMPT_FILE = "step-230_geo-signage-reference.md";

export type GeoSignageSceneRow = {
  segmentIndex: number;
  sceneIndex: number;
  primaryLocation: string;
  roadNames: string[];
  landmarks: string[];
  workplaceOrCampus: string[];
  signageLines: string[];
  uncertaintyNote?: string;
};

export type GeoSignageFilePayload = {
  savedAt: string;
  inputFile: string;
  model: string;
  sceneCount: number;
  skippedModel: boolean;
  scenes: GeoSignageSceneRow[];
};

function step230GeoSignageModel(): string | undefined {
  const v = process.env.GEO_SIGNAGE_230_MODEL?.trim();
  return v || undefined;
}

export type GeoSignageInputScene = {
  segmentIndex: number;
  sceneIndex: number;
  sceneDescription: string;
};

export function collectGeoSignageInputScenes(merged: MergedNarrativeSegmentItem[]): GeoSignageInputScene[] {
  const out: GeoSignageInputScene[] = [];
  for (const seg of merged) {
    if (!Array.isArray(seg.visualScenes) || seg.visualScenes.length === 0) {
      continue;
    }
    for (const scene of seg.visualScenes) {
      if (!scene || typeof scene !== "object") continue;
      const sceneIndex = (scene as { sceneIndex?: unknown }).sceneIndex;
      const sceneDescription = (scene as { sceneDescription?: unknown }).sceneDescription;
      if (typeof sceneIndex !== "number" || !Number.isFinite(sceneIndex)) continue;
      if (typeof sceneDescription !== "string" || !sceneDescription.trim()) continue;
      out.push({
        segmentIndex: seg.segmentIndex,
        sceneIndex,
        sceneDescription: sceneDescription.trim(),
      });
    }
  }
  return out;
}

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim()))
    .filter((s) => s.length > 0);
}

function parseSegScene(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

type GeoDetailsOnly = Omit<GeoSignageSceneRow, "segmentIndex" | "sceneIndex">;

function assertGeoDetailsShape(parsed: unknown, inputLen: number): GeoDetailsOnly[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("GEO_SIGNAGE_230_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  const arr = root.geoDetails;
  if (!Array.isArray(arr)) {
    throw new Error("GEO_SIGNAGE_230_INVALID: 缺少 geoDetails 数组");
  }
  if (arr.length !== inputLen) {
    throw new Error(
      `GEO_SIGNAGE_230_INVALID: geoDetails 长度 ${arr.length} 与输入 ${inputLen} 不一致`,
    );
  }
  const out: GeoDetailsOnly[] = [];
  for (let i = 0; i < arr.length; i++) {
    const row = arr[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`GEO_SIGNAGE_230_INVALID: geoDetails[${i}] 非对象`);
    }
    const o = row as Record<string, unknown>;
    const primaryLocation = typeof o.primaryLocation === "string" ? o.primaryLocation.trim() : "";
    const uncertaintyNote =
      typeof o.uncertaintyNote === "string" && o.uncertaintyNote.trim() ? o.uncertaintyNote.trim() : undefined;
    out.push({
      primaryLocation,
      roadNames: coerceStringArray(o.roadNames),
      landmarks: coerceStringArray(o.landmarks),
      workplaceOrCampus: coerceStringArray(o.workplaceOrCampus),
      signageLines: coerceStringArray(o.signageLines),
      uncertaintyNote,
    });
  }
  return out;
}

function mergeGeoDetailsIntoScenes(inputScenes: GeoSignageInputScene[], details: GeoDetailsOnly[]): GeoSignageSceneRow[] {
  return inputScenes.map((exp, i) => ({
    segmentIndex: exp.segmentIndex,
    sceneIndex: exp.sceneIndex,
    ...details[i]!,
  }));
}

function sceneKey(segmentIndex: number, sceneIndex: number): string {
  return `${segmentIndex}:${sceneIndex}`;
}

/** 将 230 产物中的可展示文字压成一段，供并入文生图 prompt；无可用内容返回空串。 */
export function formatSignageBlockForText2img(row: GeoSignageSceneRow): string {
  const parts: string[] = [];
  if (row.primaryLocation.trim()) {
    parts.push(`地点概括：${row.primaryLocation.trim()}`);
  }
  if (row.roadNames.length) {
    parts.push(`道路：${row.roadNames.join("、")}`);
  }
  if (row.landmarks.length) {
    parts.push(`地标：${row.landmarks.join("、")}`);
  }
  if (row.workplaceOrCampus.length) {
    parts.push(`园区/职场：${row.workplaceOrCampus.join("、")}`);
  }
  if (row.signageLines.length) {
    parts.push(`路牌短句：${row.signageLines.join("；")}`);
  }
  if (row.uncertaintyNote?.trim()) {
    parts.push(`备注：${row.uncertaintyNote.trim()}`);
  }
  return parts.join("\n");
}

export function buildSignageReferenceMapFromRows(scenes: GeoSignageSceneRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of scenes) {
    const block = formatSignageBlockForText2img(row).trim();
    if (block) {
      m.set(sceneKey(row.segmentIndex, row.sceneIndex), block);
    }
  }
  return m;
}

/** 从素材 pipeline 目录读取 230 产物；文件不存在或无效时返回空 Map。 */
export function loadSignageReferenceMap(pipelineDir: string): Map<string, string> {
  const p = path.join(pipelineDir, PIPELINE_GEO_SIGNAGE_REFERENCE_FILE);
  if (!fs.existsSync(p)) {
    return new Map();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Map();
    const scenes = (raw as { scenes?: unknown }).scenes;
    if (!Array.isArray(scenes)) return new Map();
    const rows: GeoSignageSceneRow[] = [];
    for (const item of scenes) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const si = parseSegScene(o.segmentIndex);
      const sci = parseSegScene(o.sceneIndex);
      if (si === null || sci === null) continue;
      rows.push({
        segmentIndex: si,
        sceneIndex: sci,
        primaryLocation: typeof o.primaryLocation === "string" ? o.primaryLocation.trim() : "",
        roadNames: coerceStringArray(o.roadNames),
        landmarks: coerceStringArray(o.landmarks),
        workplaceOrCampus: coerceStringArray(o.workplaceOrCampus),
        signageLines: coerceStringArray(o.signageLines),
        uncertaintyNote:
          typeof o.uncertaintyNote === "string" && o.uncertaintyNote.trim()
            ? o.uncertaintyNote.trim()
            : undefined,
      });
    }
    return buildSignageReferenceMapFromRows(rows);
  } catch {
    return new Map();
  }
}

export async function runGeoSignageGeneration(params: {
  inputScenes: GeoSignageInputScene[];
  savedAt: string;
  inputFile: string;
}): Promise<{ payload: GeoSignageFilePayload; model: string }> {
  const env = getVideoLlmEnv();
  if (!env.apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const model = step230GeoSignageModel() ?? env.model;

  if (params.inputScenes.length === 0) {
    const payload: GeoSignageFilePayload = {
      savedAt: params.savedAt,
      inputFile: params.inputFile,
      model,
      sceneCount: 0,
      skippedModel: true,
      scenes: [],
    };
    return { payload, model };
  }

  const pipelineJson = { inputScenes: params.inputScenes };
  const { messages: baseMessages } = buildVideoLlmMessages(PROMPT_FILE, pipelineJson);

  const callForGeo = async (debugStepId: string, extraGuidance?: string): Promise<GeoSignageSceneRow[]> => {
    const messages = [...baseMessages];
    if (extraGuidance) {
      messages.push({ role: "user" as const, content: extraGuidance });
    }
    const parsed = await chatJson<unknown>(messages, {
      debugStepId,
      model,
      temperature: extraGuidance ? 0.1 : 0.2,
      useJsonObject: true,
    });
    const details = assertGeoDetailsShape(parsed, params.inputScenes.length);
    return mergeGeoDetailsIntoScenes(params.inputScenes, details);
  };

  let scenes: GeoSignageSceneRow[];
  try {
    scenes = await callForGeo("geo_signage_230");
  } catch (firstErr) {
    if (!(firstErr instanceof Error) || !firstErr.message.startsWith("GEO_SIGNAGE_230_INVALID:")) {
      throw firstErr;
    }
    const guidance = `【服务端校验未通过，请修正后重新输出】\n${firstErr.message}\n\n硬性约束：顶层仅含 geoDetails（数组，长度=${params.inputScenes.length}，与 inputScenes 顺序一一对应）；每项含 primaryLocation/roadNames/landmarks/workplaceOrCampus/signageLines/uncertaintyNote；不要回吐 segmentIndex/sceneIndex。`;
    scenes = await callForGeo("geo_signage_230_repair", guidance);
  }
  const payload: GeoSignageFilePayload = {
    savedAt: params.savedAt,
    inputFile: params.inputFile,
    model,
    sceneCount: scenes.length,
    skippedModel: false,
    scenes,
  };
  return { payload, model };
}
