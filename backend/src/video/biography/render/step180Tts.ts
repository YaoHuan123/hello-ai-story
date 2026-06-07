import { randomUUID } from "crypto";
import type { MergedNarrativeSegmentItem } from "../llm/steps/step150MergeEnvAndEra.js";
import { postOutbound, ttsBodyTimeoutMs, ttsConnectTimeoutMs } from "../../shared/http/outboundFetch.js";
import { getVideoLlmEnv } from "../../shared/llm/client.js";

const ERR = "TOTAL_PACK_AUDIO_RELATION_180_INVALID";

function normalizeOptionalVoiceId(v: string | undefined): string | undefined {
  const t = String(v ?? "").trim();
  return t || undefined;
}

/** 网关/上游错误 JSON（HTTP 失败体解析等）。 */
type TtsErrorJsonBody = {
  code?: number;
  message?: string;
  data?: string | null;
};

/** 302 等网关上 /doubao/tts_hd 的 JSON 响应。 */
type TtsProxyTtsHdJson = {
  code?: number;
  message?: string;
  data?: string;
};

/** 302 网关：部分实现成功时 code=0，部分为 3000 且 message=Success。 */
function isTts302BusinessSuccess(code: number | undefined): boolean {
  if (code === undefined) {
    return true;
  }
  return code === 0 || code === 3000;
}

/** sceneIndex 仅在有 visualScenes 分文件时存在，与文生图 scene-XXXX 命名一致 */
export type SceneAudioRelationItem = {
  segmentIndex: number;
  relativePath: string;
  sceneIndex?: number;
};

function parsePositiveInt(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parsePositiveFloat(v: string | undefined, fallback: number): number {
  const n = Number.parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** `fetch` 在收到 HTTP 响应前失败时（Node 常见 `TypeError: fetch failed`），补充主机与 cause 便于排障。 */
function formatTtsNetworkFetchFailure(e: unknown, requestUrl: string): Error {
  const base = e instanceof Error ? e : new Error(String(e));
  let host = "";
  try {
    host = new URL(requestUrl).hostname;
  } catch {
    /* ignore */
  }
  const c = (base as Error & { cause?: unknown }).cause;
  const causeTail =
    c !== undefined && c !== null
      ? ` 底层：${c instanceof Error ? `${c.name}: ${c.message}` : String(c)}`
      : "";
  return new Error(
    `TTS 网络请求失败（${host || "URL 无效"}）：${base.name}: ${base.message}。${causeTail}请检查 backend/.env 中 TTS_API_URL，以及访问 302 时是否已配置 HTTP_PROXY/HTTPS_PROXY（TTS 请求会经代理出站）；连接超时可增大 TTS_FETCH_CONNECT_TIMEOUT_MS（当前 ${ttsConnectTimeoutMs()}ms）。`,
  );
}

function isTtsNetworkOrRetriable(err: Error): boolean {
  const status = (err as Error & { httpStatus?: number }).httpStatus;
  if (status !== undefined && isTtsHttpRetriable(status)) {
    return true;
  }
  return /fetch failed|Connect Timeout|UND_ERR_CONNECT|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket hang up|TTS 请求超时/i.test(
    err.message,
  );
}

/**
 * 火山/豆包控制台复制时可能带 `Bearer ` 或引号，作 Bearer 头时应为裸 Key（按网关要求）。
 */
function normalizeVolcApiKeyForHeader(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^["']|["']$/g, "");
  if (/^bearer\s+/i.test(s)) {
    s = s.replace(/^bearer\s+/i, "").trim();
  }
  return s;
}

function ttsApiKey(): string {
  const fromTts = (process.env.TTS_API_KEY ?? "").trim();
  if (fromTts) {
    return normalizeVolcApiKeyForHeader(fromTts);
  }
  return normalizeVolcApiKeyForHeader(getVideoLlmEnv().apiKey);
}

/**
 * 302 网关 tts：默认 `https://api.302.ai/doubao/tts_hd`；可设 TTS_API_URL 为完整地址覆盖。
 * 若 chat 的 OPENAI_BASE_URL 本身指向 302，则同源的 origin 优先，便于同 Key。
 */
function resolveTts302TtsHdUrl(): string {
  const override = (process.env.TTS_API_URL ?? "").trim();
  if (override) {
    return override.replace(/\/$/, "");
  }
  const base = getVideoLlmEnv().baseUrl;
  let origin = "https://api.302.ai";
  try {
    const o = new URL(base).origin;
    if (/(^|\.)302\.ai$/i.test(new URL(o).hostname)) {
      origin = o;
    }
  } catch {
    /* 保持默认 */
  }
  return `${origin.replace(/\/$/, "")}/doubao/tts_hd`;
}

function openspeechInvalidKeyHint(c: number | undefined, message: string): string {
  const m = (message ?? "").toLowerCase();
  if (c === 45_000_010 || /invalid x-api-key|invalid.*api.*key/.test(m)) {
    return (
      "排错：上游未接受该 API Key。请确认 302/网关侧 Key 与语音权限；" +
      "若大模型与语音使用不同子密钥，请在 backend/.env 单独设 TTS_API_KEY=值（勿加「Bearer 」、勿加引号）。"
    );
  }
  return "";
}

function parseTtsErrorJson(raw: string): TtsErrorJsonBody | null {
  try {
    return JSON.parse(raw) as TtsErrorJsonBody;
  } catch {
    return null;
  }
}

function ttsFailureMessage(httpStatus: number, rawText: string): string {
  const j = parseTtsErrorJson(rawText);
  const code = j?.code;
  const msg = j?.message ?? "";
  const base = `TTS 请求失败 HTTP ${httpStatus}${code !== undefined ? `，业务 code=${code}` : ""}${msg ? `：${msg}` : ""}`;
  if (code === 45_000_010 || /invalid x-api-key/i.test(msg)) {
    return `${base}\n${openspeechInvalidKeyHint(code, msg).trim()}`;
  }
  if (
    code === 3001 ||
    /resource not granted|requested resource not granted|permission denied|access denied/i.test(msg) ||
    /volc\.seedtts|speaker permission denied/i.test(msg)
  ) {
    return `${base}\n提示：请确认网关/控制台为当前 Key 开通了 TTS，且 TTS_MODEL/TTS_VOICE 在权限范围内。`;
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return `${base}\n提示：请检查 TTS_API_KEY 或 OPENAI_API_KEY 是否对该 TTS 端点有效。`;
  }
  if (httpStatus === 500 || httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
    const snippet =
      rawText.trim().length > 0
        ? `\n服务返回片段（便于排查）：\n${rawText.trim().slice(0, 600)}${rawText.length > 600 ? "…" : ""}`
        : "";
    return `${base}${snippet}\n提示：多为上游 TTS 临时异常，可重试；可调高 TTS_HTTP_MAX_RETRIES、TTS_REQUEST_DELAY_MS 或降低 TTS_CONCURRENCY。`;
  }
  if (httpStatus === 429) {
    return `${base}\n提示：可能触发并发/额度限制，可增大 TTS_REQUEST_DELAY_MS、降低 TTS_CONCURRENCY 后重试。`;
  }
  if (!j && rawText.trim()) {
    return `${base}\n原始响应：${rawText.slice(0, 500)}`;
  }
  return base;
}

function isTtsHttpRetriable(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus === 500 || httpStatus === 502 || httpStatus === 503 || httpStatus === 504;
}

/** 302 网关 /doubao/tts_hd：单次 JSON，data 为整段 base64。 */
async function synthesizeSpeechMp3Once(input: string, requestedVoice: string): Promise<Buffer> {
  const key = ttsApiKey();
  if (!key) {
    throw new Error("请配置 TTS_API_KEY 或 OPENAI_API_KEY（步骤 3 旁白转音频）");
  }
  const url = resolveTts302TtsHdUrl();
  const speedRatio = Math.max(0.25, Math.min(4, parsePositiveFloat(process.env.TTS_SPEED_RATIO, 1)));
  const voice = normalizeOptionalVoiceId(requestedVoice);
  if (!voice) {
    throw new Error(
      `${ERR}: 未指定 TTS 音色：须传入非空 requestedVoice（禁止 TTS_VOICE 环境变量与内置默认兜底）。`,
    );
  }
  const model = (process.env.TTS_MODEL ?? "doubao_tts_hd").trim() || "doubao_tts_hd";
  const encoding = (process.env.TTS_ENCODING ?? "mp3").trim() || "mp3";
  const body = {
    model,
    audio: {
      voice_type: voice,
      encoding,
      speed_ratio: Number.isInteger(speedRatio) ? speedRatio : Math.round(speedRatio * 10) / 10,
    },
    request: {
      reqid: randomUUID(),
      text: input,
      operation: "query" as const,
    },
  };

  const connectTimeoutMs = ttsConnectTimeoutMs();
  const bodyTimeoutMs = ttsBodyTimeoutMs();
  let res: Response;
  try {
    res = await postOutbound(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      connectTimeoutMs,
      bodyTimeoutMs,
    });
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name) : "";
    if (name === "AbortError") {
      const err = new Error(
        `TTS 请求超时（响应等待 ${bodyTimeoutMs}ms），请增大 TTS_FETCH_BODY_TIMEOUT_MS 或 TTS_FETCH_CONNECT_TIMEOUT_MS（当前连接 ${connectTimeoutMs}ms）`,
      );
      (err as Error & { httpStatus?: number }).httpStatus = 0;
      throw err;
    }
    throw formatTtsNetworkFetchFailure(e, url);
  }

  const rawText = await res.text();
  if (!res.ok) {
    const err = new Error(ttsFailureMessage(res.status, rawText));
    (err as Error & { httpStatus: number }).httpStatus = res.status;
    throw err;
  }

  let parsed: TtsProxyTtsHdJson;
  try {
    parsed = JSON.parse(rawText) as TtsProxyTtsHdJson;
  } catch {
    throw new Error(`TTS(302) 响应非 JSON：${rawText.slice(0, 500)}`);
  }
  if (typeof parsed?.code === "number" && !isTts302BusinessSuccess(parsed.code)) {
    const err = new Error(
      `TTS(302) 业务错误 code=${parsed.code}${parsed.message ? `：${parsed.message}` : ""}（可检查 302 配额、TTS_API_KEY 与 TTS_MODEL/TTS_VOICE）`,
    );
    (err as Error & { httpStatus: number }).httpStatus = 200;
    throw err;
  }
  const dataField = parsed.data;
  if (typeof dataField !== "string" || !dataField.trim()) {
    const err = new Error(
      `TTS(302) 响应无有效 data 字段：${rawText.length > 400 ? `${rawText.slice(0, 400)}…` : rawText}`,
    );
    (err as Error & { httpStatus: number }).httpStatus = 200;
    throw err;
  }
  try {
    const buf = Buffer.from(dataField, "base64");
    if (!buf.length) {
      throw new Error("TTS(302) 解码后音频长度为 0");
    }
    return buf;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("TTS(302)")) {
      throw e;
    }
    throw new Error("TTS(302) 响应 data 无法按 base64 解析");
  }
}

async function synthesizeSpeechMp3(input: string, requestedVoice: string): Promise<Buffer> {
  const maxAttempts = Math.max(1, parsePositiveInt(process.env.TTS_HTTP_MAX_RETRIES, 3));
  const baseDelayMs = Math.max(0, parsePositiveInt(process.env.TTS_HTTP_RETRY_BASE_MS, 2000));
  let lastErr: Error = new Error("TTS 未知错误");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await synthesizeSpeechMp3Once(input, requestedVoice);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const retriable = isTtsNetworkOrRetriable(err) && attempt < maxAttempts - 1;
      lastErr = err;
      if (retriable) {
        const d = baseDelayMs * (attempt + 1);
        await sleep(d);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type TtsWorkItem = {
  segmentIndex: number;
  sceneIndex?: number;
  text: string;
  relativePath: string;
};

async function runTtsPool(
  items: TtsWorkItem[],
  requestedVoice: string,
  onAudio: (index: number, item: TtsWorkItem, buf: Buffer) => void,
  onError: (item: TtsWorkItem, e: unknown) => never,
): Promise<void> {
  const n = items.length;
  if (n === 0) {
    return;
  }
  const concurrency = Math.max(1, Math.min(32, parsePositiveInt(process.env.TTS_CONCURRENCY, 6)));
  const runDelay = async (): Promise<void> => {
    const delayMs = parsePositiveInt(process.env.TTS_REQUEST_DELAY_MS, 0);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  };
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, n) }, async () => {
    for (;;) {
      const j = next++;
      if (j >= n) {
        break;
      }
      const item = items[j]!;
      let audio: Buffer;
      try {
        audio = await synthesizeSpeechMp3(item.text, requestedVoice);
      } catch (e) {
        return onError(item, e);
      }
      onAudio(j, item, audio);
      await runDelay();
    }
  });
  await Promise.all(workers);
}

export async function synthesizeAudioRelationsFromMergedSegments(
  mergedNarrativeSegments: MergedNarrativeSegmentItem[],
  audioRelativeDir: string,
  options: { ttsVoice: string },
): Promise<{ relations: SceneAudioRelationItem[]; audioFiles: Map<string, Buffer> }> {
  const requestedVoice = normalizeOptionalVoiceId(options.ttsVoice);
  if (!requestedVoice) {
    throw new Error(`${ERR}: options.ttsVoice 须为非空字符串`);
  }
  const work: TtsWorkItem[] = [];

  for (const row of mergedNarrativeSegments) {
    if (!Array.isArray(row.voiceover) || row.voiceover.length === 0) {
      throw new Error(`${ERR}: segmentIndex=${row.segmentIndex} 缺少非空 voiceover 数组`);
    }

    const scenes = Array.isArray(row.visualScenes) ? row.visualScenes : [];

    if (scenes.length > 0) {
      if (row.voiceover.length !== scenes.length) {
        throw new Error(
          `${ERR}: segmentIndex=${row.segmentIndex} 有 ${scenes.length} 个 visualScenes，voiceover 须为 ${scenes.length} 条，实际 ${row.voiceover.length}`,
        );
      }
      const segFolder = `segment-${String(row.segmentIndex).padStart(4, "0")}`;
      for (let k = 0; k < scenes.length; k++) {
        const scene = scenes[k];
        if (!scene || typeof scene !== "object") {
          throw new Error(`${ERR}: segmentIndex=${row.segmentIndex} 第 ${k + 1} 个 visualScene 无效`);
        }
        const slotIndex = k + 1;
        const text = String(row.voiceover[k] ?? "").trim();
        if (!text) {
          throw new Error(`${ERR}: segmentIndex=${row.segmentIndex} 第 ${slotIndex} 镜旁白为空`);
        }
        const fileName = `scene-${String(slotIndex).padStart(4, "0")}.mp3`;
        work.push({
          segmentIndex: row.segmentIndex,
          sceneIndex: slotIndex,
          text,
          relativePath: `${audioRelativeDir}/${segFolder}/${fileName}`,
        });
      }
    } else {
      const text = row.voiceover.join(" ").trim();
      if (!text) {
        throw new Error(`${ERR}: segmentIndex=${row.segmentIndex} voiceover 数组内容为空`);
      }
      const fileName = `segment-${String(row.segmentIndex).padStart(4, "0")}.mp3`;
      work.push({ segmentIndex: row.segmentIndex, text, relativePath: `${audioRelativeDir}/${fileName}` });
    }
  }

  const relations: SceneAudioRelationItem[] = new Array(work.length);
  const audioFiles = new Map<string, Buffer>();

  await runTtsPool(
    work,
    requestedVoice,
    (idx, w, buf) => {
      audioFiles.set(w.relativePath, buf);
      relations[idx] = {
        segmentIndex: w.segmentIndex,
        relativePath: w.relativePath,
        ...(w.sceneIndex !== undefined ? { sceneIndex: w.sceneIndex } : {}),
      };
    },
    (item, e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (item.sceneIndex !== undefined) {
        throw new Error(
          `${ERR}: segmentIndex=${item.segmentIndex} sceneIndex=${item.sceneIndex} 生成音频失败。${msg}\n旁白片段：${item.text.slice(0, 80)}`,
        );
      }
      throw new Error(`${ERR}: segmentIndex=${item.segmentIndex} 生成音频失败。${msg}\nvoiceover片段：${item.text.slice(0, 80)}`);
    },
  );

  return { relations, audioFiles };
}

/** 访谈等多音色场景：单条文本合成 MP3；`requestedVoice` 必填（无环境变量/默认兜底）。 */
export async function synthesizeSingleSpeechMp3(text: string, requestedVoice: string): Promise<Buffer> {
  return synthesizeSpeechMp3(text.trim(), requestedVoice);
}
