import fs from "node:fs";
import path from "node:path";
import type { MergedNarrativeSegmentItem } from "../llm/steps/step150MergeEnvAndEra.js";
import { getVideoLlmEnv } from "../../shared/llm/client.js";
import { applyText2imgSensitiveReplacements } from "./text2imgSensitiveReplacements.js";

const DEFAULT_MODEL = "doubao-seedream-5-0-260128";

/** 火山/Ark 文生图在输入全文本上做内容安全，命中时返回 400 且带此 code。 */
const ARK_INPUT_TEXT_SENSITIVE_CODE = "InputTextSensitiveContentDetected";

function text2imgForceFullEnabled(): boolean {
  const v = (process.env.TEXT2IMG_230_FORCE_FULL ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** 步骤 230 内多张 PNG 并行请求的并发上限；见 `.env.example` 中 `TEXT2IMG_230_CONCURRENCY`。 */
function text2imgConcurrency(): number {
  const raw = Number.parseInt(process.env.TEXT2IMG_230_CONCURRENCY ?? "4", 10);
  if (!Number.isFinite(raw)) return 4;
  return Math.min(64, Math.max(1, Math.floor(raw)));
}

async function parallelLimitFailFast<T>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const n = Math.min(items.length, Math.max(1, Math.floor(limit)));
  let next = 0;
  let error: unknown;

  async function worker(): Promise<void> {
    for (;;) {
      if (error) return;
      const idx = next++;
      if (idx >= items.length) return;
      const item = items[idx];
      try {
        await mapper(item!);
      } catch (e) {
        error = e;
      }
    }
  }

  await Promise.all(Array.from({ length: n }, () => worker()));
  if (error) throw error;
}

/** 落盘 manifest 与 PNG：并行 completion 时串行写入同一 JSON，避免交错损坏；单次失败后仍可接上后续条目。 */
function createManifestWriteQueue(): {
  enqueue: (fn: () => void) => Promise<void>;
} {
  let chain = Promise.resolve();
  return {
    enqueue(fn: () => void): Promise<void> {
      const done = chain.then(() => {
        fn();
      });
      chain = done.catch(() => undefined);
      return done;
    },
  };
}

/** 为 true 时把本次文生图实际上送的 JSON 写到 PNG 同目录的 `*.text2img-request.json`（无密钥）。默认开。 */
function text2imgSaveRequestJsonEnabled(): boolean {
  const v = (process.env.TEXT2IMG_SAVE_REQUEST_JSON ?? "on").trim().toLowerCase();
  return v !== "0" && v !== "off" && v !== "false" && v !== "no";
}

function writeText2imgRequestLog(
  fileAbs: string,
  p: { endpoint: string; body: Record<string, unknown>; inputPrompt: string },
): void {
  try {
    const sentBody: Record<string, unknown> = { ...p.body };
    const im = sentBody.image;
    if (typeof im === "string" && im.length > 200) {
      sentBody.image = `（已省略，约 ${im.length} 字符；图生图时为 data: URL 或长 URL，防文件过大）`;
    }
    const payload = {
      savedAt: new Date().toISOString(),
      method: "POST" as const,
      endpoint: p.endpoint,
      note: "与 fetch body 等义，不含 Authorization。文生图不附加 openai 全局「传记前插」正文。",
      inputPrompt: p.inputPrompt,
      body: sentBody,
    };
    fs.mkdirSync(path.dirname(fileAbs), { recursive: true });
    fs.writeFileSync(fileAbs, JSON.stringify(payload, null, 2), "utf-8");
  } catch {
    /* 不影响主流程 */
  }
}

/**
 * 230 输出 `visual-230_包含图片位置的场景包.json` 是否已跑完：全部 imageIndexes 的 `done` 为 true/缺省，且非 text2imgInProgress。
 * 用于判断 230 步骤内 manifest 是否已全部完成（与任务级断点续跑分离）。
 */
export function isText2imgOutputComplete(raw: Record<string, unknown>): boolean {
  if (raw.text2imgInProgress === true) {
    return false;
  }
  const arr = raw.imageIndexes;
  if (!Array.isArray(arr)) {
    return false;
  }
  for (const item of arr) {
    if (item && typeof item === "object" && !Array.isArray(item) && (item as { done?: boolean }).done === false) {
      return false;
    }
  }
  return true;
}

function readJsonObjectFile(p: string): Record<string, unknown> {
  if (!fs.existsSync(p)) {
    return {};
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

type PlannedSceneRow = {
  segmentIndex: number;
  sceneIndex: number;
  relativePath: string;
  /** 与入 API 的 buildDirectPrompt 全文一致，用于断点续跑时还原 prompt 字段 */
  displayPrompt: string;
  /** 即 `buildDirectPrompt(…)` 全文，直接作为文生图 API 的 prompt（不再附加全局前插） */
  primaryForApi: string;
  sceneDescription: string;
};

function sceneSignageKey(segmentIndex: number, sceneIndex: number): string {
  return `${segmentIndex}:${sceneIndex}`;
}

function appendGeoSignageToPrompt(basePrompt: string, signageBlock: string | undefined): string {
  const extra = (signageBlock ?? "").trim();
  if (!extra) {
    return basePrompt;
  }
  return `${basePrompt}\n\n【实景文字参考（仅用于画面可读标识，勿引入叙事外事实）】\n${extra}`;
}

function buildPlannedSceneRows(
  merged: MergedNarrativeSegmentItem[],
  workspaceRoot: string,
  imageRelativeDir: string,
  signageByScene?: Map<string, string>,
): PlannedSceneRow[] {
  const out: PlannedSceneRow[] = [];
  for (const seg of merged) {
    if (!Array.isArray(seg.visualScenes) || seg.visualScenes.length === 0) {
      continue;
    }
    const folderName = `segment-${String(seg.segmentIndex).padStart(4, "0")}`;
    const folderPath = path.join(workspaceRoot, imageRelativeDir, folderName);
    fs.mkdirSync(folderPath, { recursive: true });

    for (let slot = 0; slot < seg.visualScenes.length; slot++) {
      const scene = seg.visualScenes[slot];
      if (!scene || typeof scene !== "object" || typeof (scene as { sceneDescription?: unknown }).sceneDescription !== "string") {
        continue;
      }
      const desc = (scene as { sceneDescription: string }).sceneDescription;
      const semanticSceneIndex = (scene as { sceneIndex?: number }).sceneIndex;
      const slotIndex = slot + 1;
      const signageKey =
        typeof semanticSceneIndex === "number" && Number.isFinite(semanticSceneIndex)
          ? sceneSignageKey(seg.segmentIndex, semanticSceneIndex)
          : null;
      const signage = signageKey ? signageByScene?.get(signageKey) : undefined;
      const primaryForApi = appendGeoSignageToPrompt(buildDirectPrompt(desc), signage);
      const fileName = `scene-${String(slotIndex).padStart(4, "0")}.png`;
      const relativePath = `${imageRelativeDir}/${folderName}/${fileName}`;
      out.push({
        segmentIndex: seg.segmentIndex,
        sceneIndex: slotIndex,
        relativePath,
        displayPrompt: primaryForApi,
        primaryForApi,
        sceneDescription: desc,
      });
    }
  }
  return out;
}

function canMergeProgressFromFile(newPlan: { relativePath: string }[], prev: Record<string, unknown>): boolean {
  if (text2imgForceFullEnabled()) {
    return false;
  }
  const old = prev.imageIndexes;
  if (!Array.isArray(old) || old.length !== newPlan.length) {
    return false;
  }
  for (let i = 0; i < newPlan.length; i++) {
    const a = (old[i] as { relativePath?: unknown })?.relativePath;
    if (typeof a !== "string" || a !== newPlan[i]!.relativePath) {
      return false;
    }
  }
  return true;
}

function mergeManifestItems(
  plan: PlannedSceneRow[],
  prev: Record<string, unknown>,
  canMerge: boolean,
): Text2imgManifestItem[] {
  if (!canMerge) {
    return plan.map((p) => ({
      segmentIndex: p.segmentIndex,
      sceneIndex: p.sceneIndex,
      relativePath: p.relativePath,
      prompt: p.displayPrompt,
      done: false,
    }));
  }
  const old = prev.imageIndexes;
  if (!Array.isArray(old) || old.length !== plan.length) {
    return plan.map((p) => ({
      segmentIndex: p.segmentIndex,
      sceneIndex: p.sceneIndex,
      relativePath: p.relativePath,
      prompt: p.displayPrompt,
      done: false,
    }));
  }
  return plan.map((p, i) => {
    const o = old[i] as {
      done?: boolean;
      prompt?: unknown;
      relativePath?: unknown;
    };
    if (
      o?.done === true &&
      typeof o.prompt === "string" &&
      typeof o.relativePath === "string" &&
      o.relativePath === p.relativePath &&
      o.prompt === p.displayPrompt
    ) {
      return {
        segmentIndex: p.segmentIndex,
        sceneIndex: p.sceneIndex,
        relativePath: p.relativePath,
        prompt: o.prompt,
        done: true,
      };
    }
    return {
      segmentIndex: p.segmentIndex,
      sceneIndex: p.sceneIndex,
      relativePath: p.relativePath,
      prompt: p.displayPrompt,
      done: false,
    };
  });
}

export type Text2imgManifestItem = {
  segmentIndex: number;
  sceneIndex: number;
  relativePath: string;
  /** 最终写入 index 的提示 */
  prompt: string;
  done: boolean;
};

export function writeText2imgManifest(
  outPath: string,
  p: {
    savedAt: string;
    inputFile: string;
    model: string;
    imageDir: string;
    imageCount: number;
    skippedModel: boolean;
    text2imgInProgress: boolean;
    imageIndexes: Text2imgManifestItem[];
  },
): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(p, null, 2), "utf-8");
}

export type SceneImageIndexItem = {
  segmentIndex: number;
  relativePath: string;
  prompt: string;
};

export type SceneImageIndexItemV2 = {
  segmentIndex: number;
  sceneIndex: number;
  relativePath: string;
  prompt: string;
};

type ImagesResponse = {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
};

function text2imgApiKey(): string {
  return (process.env.TEXT2IMG_API_KEY ?? "").trim() || (process.env.OPENAI_API_KEY ?? "").trim();
}

function text2imgModel(): string {
  return (process.env.TEXT2IMG_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function text2imgSize(): string {
  const raw = (process.env.TEXT2IMG_SIZE ?? "2848x1600").trim() || "2848x1600";
  // 火山 images/generations 要求 size 为 `WIDTHxHEIGHT`（小写 x）或 `2k` / `3k`；星号 * 会报 InvalidParameter
  return raw.replace(/\*/g, "x");
}

function text2imgEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  if (/\/api\/v\d+$/.test(base)) {
    return `${base}/images/generations`;
  }
  try {
    const origin = new URL(base).origin.replace(/\/$/, "");
    return `${origin}/api/v3/images/generations`;
  } catch {
    return "https://ark.cn-beijing.volces.com/api/v3/images/generations";
  }
}

function text2imgReferenceImage(): string | undefined {
  const v = process.env.TEXT2IMG_REFERENCE_IMAGE_URL?.trim();
  return v ? v : undefined;
}

function text2imgRegionTextMode(): "on" | "off" {
  const raw = (process.env.TEXT2IMG_REGION_TEXT_MODE ?? "on").trim().toLowerCase();
  return raw === "off" ? "off" : "on";
}

function buildDirectPrompt(narrative: string): string {
  const n = applyText2imgSensitiveReplacements(narrative);
  const regionTextMode = text2imgRegionTextMode();
  const regionTextGuide =
    regionTextMode === "off"
      ? "地域文字标识：可选，不强制生成可读地名文本。"
      : [
          "地域文字标识：尽量在画面中加入可读中文文字来体现地域信息（如路牌、站牌、店招、门牌、地名指示牌）。",
          "文字要求：字形清晰、无乱码、字数适中，与场景地域线索一致，不得加入与叙事冲突的地名。",
          "若地域线索不足，使用中性但可读的通用标识（如“XX路”“XX站”），避免编造具体事实。",
        ].join(" ");
  return [
    "单帧电影感画面，纪实传记风格，真实自然光影，高细节，画面干净。",
    "严格依据以下场景描述，不增加未给出的事实、人物关系或道具：",
    n,
    "要求：构图清晰，主体明确，动作可见，避免抽象化表达。",
    regionTextGuide,
    "负向约束：无logo、无水印、无畸形肢体、无模糊低清。",
  ].join("\n");
}

async function generateImagePng(prompt: string, saveRequestTo?: string): Promise<Buffer> {
  const imageRef = text2imgReferenceImage();
  return generateImagePngWithOptionalReference({ prompt, imageRef, saveRequestTo });
}

async function generateImagePngWithOptionalReference(params: {
  prompt: string;
  imageRef?: string;
  /** 若提供，在请求前将实际上送的 endpoint + body 写入此路径（json，无密钥；图生图时省略大段 image） */
  saveRequestTo?: string;
}): Promise<Buffer> {
  const key = text2imgApiKey();
  if (!key) {
    throw new Error("TEXT2IMG_API_KEY 未配置（可在 backend/.env 设置，或回退 OPENAI_API_KEY）");
  }
  const env = getVideoLlmEnv();
  const model = text2imgModel();
  const requestSize = text2imgSize();
  const url = text2imgEndpoint(env.baseUrl);
  const basePrompt = (params.prompt ?? "").trim() || "。";
  const body: Record<string, unknown> = {
    model,
    prompt: basePrompt,
    size: requestSize,
    watermark: false,
  };
  const imageRef = params.imageRef?.trim();
  if (imageRef) {
    // 传入参考图时走图生图；否则为纯文生图
    body.image = imageRef;
  }
  if (params.saveRequestTo) {
    writeText2imgRequestLog(params.saveRequestTo, { endpoint: url, body, inputPrompt: basePrompt });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`文生图请求失败 ${url} HTTP ${res.status}: ${raw.slice(0, 500)}`);
  }
  let parsed: ImagesResponse;
  try {
    parsed = JSON.parse(raw) as ImagesResponse;
  } catch {
    throw new Error(`文生图响应非 JSON：${raw.slice(0, 200)}`);
  }

  const first = Array.isArray(parsed.data) ? parsed.data[0] : undefined;
  if (!first) {
    throw new Error("文生图响应缺少 data[0]");
  }
  if (typeof first.b64_json === "string" && first.b64_json.trim()) {
    return Buffer.from(first.b64_json, "base64");
  }
  if (typeof first.url === "string" && first.url.trim()) {
    const imgRes = await fetch(first.url);
    if (!imgRes.ok) {
      throw new Error(`下载图片失败 HTTP ${imgRes.status}`);
    }
    return Buffer.from(await imgRes.arrayBuffer());
  }
  throw new Error("文生图响应既无 b64_json 也无 url");
}

export async function restyleImagePngFromBuffer(params: {
  prompt: string;
  sourceBuffer: Buffer;
  mimeType: string;
}): Promise<Buffer> {
  const mime = (params.mimeType || "").trim().toLowerCase();
  if (!mime.startsWith("image/")) {
    throw new Error("TEXT2IMG_240_INVALID: 非法图片类型");
  }
  const imageRef = `data:${mime};base64,${params.sourceBuffer.toString("base64")}`;
  const safePrompt = applyText2imgSensitiveReplacements(params.prompt);
  return generateImagePngWithOptionalReference({
    prompt: safePrompt,
    imageRef,
  });
}

function manifestToSceneImageIndex(items: Text2imgManifestItem[]): SceneImageIndexItemV2[] {
  return items.map(({ segmentIndex, sceneIndex, relativePath, prompt }) => ({ segmentIndex, sceneIndex, relativePath, prompt }));
}

export async function generateSceneImagesFromMergedNarrative(params: {
  mergedNarrativeSegments: MergedNarrativeSegmentItem[];
  imageRelativeDir: string;
  workspaceRoot: string;
  outPath: string;
  savedAt: string;
  inputFile: string;
  model: string;
  imageDir: string;
  /** 步骤 230 实景参考：`segmentIndex:sceneIndex` -> 并入文生图 prompt 的文本块 */
  signageByScene?: Map<string, string>;
}): Promise<{ images: SceneImageIndexItemV2[]; skippedModel: boolean; savedAt: string }> {
  const {
    mergedNarrativeSegments,
    imageRelativeDir,
    workspaceRoot,
    outPath,
    savedAt,
    inputFile,
    model,
    imageDir,
    signageByScene,
  } = params;

  const plan = buildPlannedSceneRows(mergedNarrativeSegments, workspaceRoot, imageRelativeDir, signageByScene);

  if (plan.length === 0) {
    writeText2imgManifest(outPath, {
      savedAt,
      inputFile,
      model,
      imageDir,
      imageCount: 0,
      skippedModel: true,
      text2imgInProgress: false,
      imageIndexes: [],
    });
    return { images: [], skippedModel: true, savedAt };
  }

  const prev = readJsonObjectFile(outPath);
  const canMerge = canMergeProgressFromFile(plan, prev);
  let items = mergeManifestItems(plan, prev, canMerge);

  for (let i = 0; i < items.length; i++) {
    if (!items[i]!.done) {
      continue;
    }
    const absPath = path.join(workspaceRoot, items[i]!.relativePath);
    if (!fs.existsSync(absPath)) {
      const p = plan[i]!;
      items[i] = {
        segmentIndex: p.segmentIndex,
        sceneIndex: p.sceneIndex,
        relativePath: p.relativePath,
        prompt: p.displayPrompt,
        done: false,
      };
    }
  }

  const allDone = items.every((x) => x.done);
  writeText2imgManifest(outPath, {
    savedAt,
    inputFile,
    model,
    imageDir,
    imageCount: items.length,
    skippedModel: false,
    text2imgInProgress: !allDone,
    imageIndexes: items,
  });

  const pendingPlanIndexes = plan.map((_, i) => i).filter((i) => !items[i]!.done);
  const mq = createManifestWriteQueue();

  await parallelLimitFailFast(pendingPlanIndexes, text2imgConcurrency(), async (planIndex) => {
    const p = plan[planIndex]!;
    const logDir = path.join(workspaceRoot, path.dirname(p.relativePath));
    const logBase = path.basename(p.relativePath, path.extname(p.relativePath));
    const text2imgRequestPath =
      text2imgSaveRequestJsonEnabled() && p.relativePath.trim() ? path.join(logDir, `${logBase}.text2img-request.json`) : undefined;

    let png: Buffer;
    try {
      png = await generateImagePng(p.primaryForApi, text2imgRequestPath);
    } catch (e1) {
      const msg1 = e1 instanceof Error ? e1.message : String(e1);
      if (msg1.includes(ARK_INPUT_TEXT_SENSITIVE_CODE)) {
        throw new Error(
          `TEXT2IMG_240_INVALID: segmentIndex=${p.segmentIndex} sceneIndex=${p.sceneIndex} 文生图因内容安全未通过（${ARK_INPUT_TEXT_SENSITIVE_CODE}）。${msg1.slice(0, 500)}` +
            ` 请修改 pipeline/展开场景包 中该场景的 visualScenes[sceneIndex].sceneDescription、或文生图敏感词库后重跑 230；本步不做自动换参重试。`,
        );
      }
      throw new Error(`TEXT2IMG_240_INVALID: segmentIndex=${p.segmentIndex} sceneIndex=${p.sceneIndex} 生成图片失败。${msg1}`);
    }

    await mq.enqueue(() => {
      const absPath = path.join(workspaceRoot, p.relativePath);
      fs.writeFileSync(absPath, png);
      const finalPrompt = p.primaryForApi;
      items[planIndex] = {
        segmentIndex: p.segmentIndex,
        sceneIndex: p.sceneIndex,
        relativePath: p.relativePath,
        prompt: finalPrompt,
        done: true,
      };
      const stillInProgress = items.some((x) => !x.done);
      writeText2imgManifest(outPath, {
        savedAt,
        inputFile,
        model,
        imageDir,
        imageCount: items.length,
        skippedModel: false,
        text2imgInProgress: stillInProgress,
        imageIndexes: items,
      });
    });
  });

  writeText2imgManifest(outPath, {
    savedAt,
    inputFile,
    model,
    imageDir,
    imageCount: items.length,
    skippedModel: false,
    text2imgInProgress: false,
    imageIndexes: items,
  });

  return { images: manifestToSceneImageIndex(items), skippedModel: false, savedAt };
}
