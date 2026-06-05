import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertInterviewExists,
  getInterviewRootDir,
  type InterviewScope,
} from "./interviewWorkspace.service";

export const INTERVIEW_ASSETS_DIR = "素材";
export const PLACE_IMAGES_SUBDIR = "places";
export const PLACE_IMAGES_INDEX_FILE = "place-images-index.json";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

export type InterviewPlaceImageItem = {
  id: string;
  placeKey: string;
  /** 相对 `素材/places/` 的文件名 */
  relativePath: string;
  mimeType: string;
  savedAt: string;
  originalName?: string;
};

export type InterviewPlaceImagesIndex = {
  updatedAt: string;
  items: InterviewPlaceImageItem[];
};

function placesDir(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), INTERVIEW_ASSETS_DIR, PLACE_IMAGES_SUBDIR);
}

function indexPath(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), INTERVIEW_ASSETS_DIR, PLACE_IMAGES_INDEX_FILE);
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function readIndex(scope: InterviewScope): InterviewPlaceImagesIndex {
  const p = indexPath(scope);
  if (!fs.existsSync(p)) {
    return { updatedAt: new Date().toISOString(), items: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as InterviewPlaceImagesIndex;
    const items = Array.isArray(raw.items) ? raw.items : [];
    return {
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
      items: items.filter(
        (x) =>
          x &&
          typeof x.id === "string" &&
          typeof x.placeKey === "string" &&
          typeof x.relativePath === "string",
      ) as InterviewPlaceImageItem[],
    };
  } catch {
    return { updatedAt: new Date().toISOString(), items: [] };
  }
}

function extFromMime(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

function normalizePlaceKey(placeKey: string): string {
  const t = placeKey.trim();
  if (!t || t.length > 120) {
    throw new Error("PLACE_IMAGE_INVALID: placeKey 须为 1–120 字符");
  }
  return t;
}

export function listInterviewPlaceImages(scope: InterviewScope): InterviewPlaceImagesIndex {
  assertInterviewExists(scope);
  return readIndex(scope);
}

export function resolveInterviewPlaceImageAbs(scope: InterviewScope, item: InterviewPlaceImageItem): string {
  const base = path.resolve(placesDir(scope));
  const abs = path.resolve(base, item.relativePath);
  if (!abs.startsWith(`${base}${path.sep}`)) {
    throw new Error("PLACE_IMAGE_PATH_INVALID: 非法图片路径");
  }
  return abs;
}

export function addInterviewPlaceImage(
  scope: InterviewScope,
  params: {
    placeKey: string;
    mimeType: string;
    dataBase64: string;
    originalName?: string;
  },
): InterviewPlaceImageItem {
  assertInterviewExists(scope);
  const placeKey = normalizePlaceKey(params.placeKey);
  const mimeType = params.mimeType.trim().toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error("PLACE_IMAGE_INVALID: 仅支持 jpeg / png / webp");
  }
  const b64 = params.dataBase64.trim();
  if (!b64) throw new Error("PLACE_IMAGE_INVALID: 缺少图片数据");
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new Error("PLACE_IMAGE_INVALID: dataBase64 无法解码");
  }
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    throw new Error(`PLACE_IMAGE_INVALID: 图片须在 1–${MAX_BYTES} 字节内`);
  }

  const id = crypto.randomUUID();
  const relativePath = `${id}${extFromMime(mimeType)}`;
  const dir = placesDir(scope);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, relativePath), buf);

  const savedAt = new Date().toISOString();
  const item: InterviewPlaceImageItem = {
    id,
    placeKey,
    relativePath,
    mimeType,
    savedAt,
    ...(params.originalName?.trim() ? { originalName: params.originalName.trim().slice(0, 200) } : {}),
  };

  const index = readIndex(scope);
  const next: InterviewPlaceImagesIndex = {
    updatedAt: savedAt,
    items: [...index.items, item],
  };
  writeJsonAtomic(indexPath(scope), next);
  return item;
}

export function deleteInterviewPlaceImage(scope: InterviewScope, imageId: string): void {
  assertInterviewExists(scope);
  const id = imageId.trim();
  if (!id) throw new Error("PLACE_IMAGE_INVALID: 缺少 imageId");

  const index = readIndex(scope);
  const found = index.items.find((x) => x.id === id);
  if (!found) throw new Error("PLACE_IMAGE_NOT_FOUND: 图片不存在");

  try {
    const abs = resolveInterviewPlaceImageAbs(scope, found);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* 索引与文件不一致时仍移除索引项 */
  }

  const savedAt = new Date().toISOString();
  writeJsonAtomic(indexPath(scope), {
    updatedAt: savedAt,
    items: index.items.filter((x) => x.id !== id),
  });
}
