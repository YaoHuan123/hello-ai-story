import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { APP_LOCALE } from "../config";
import { INTERVIEW_SCHEMA_VERSION } from "../content/canonicalSections";
import type { ContentLocale } from "../content/locale";
import { normalizeContentLocale } from "../content/locale";
import { getUserRootDir } from "./workspace.service";

const INTERVIEWS_DIR = "采访";
const META_FILE = "meta.json";

export type InterviewScope = {
  userId: string;
  interviewId: string;
};

export type InterviewMeta = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  /** 用户界面展示语言（聊天/选题）；创建时写入，默认 zh */
  locale?: ContentLocale;
  /** 落盘格式版本；2 = canonical 英文节名 + 字段 key */
  schemaVersion?: number;
};

function interviewsDir(userId: string): string {
  return path.join(getUserRootDir(userId), INTERVIEWS_DIR);
}

/** `{userRoot}/采访/{interviewId}/` */
export function getInterviewRootDir(scope: InterviewScope): string {
  return path.join(interviewsDir(scope.userId), scope.interviewId.trim());
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

/** 确保 `采访/` 目录存在（幂等）。 */
export function ensureInterviewsDir(userId: string): void {
  fs.mkdirSync(interviewsDir(userId), { recursive: true });
}

/**
 * 创建一场新采访：`<user>/采访/{id}/meta.json`。
 * @returns 采访元数据（含 id）
 */
export function createInterview(
  userId: string,
  opts?: { title?: string; locale?: ContentLocale },
): InterviewMeta {
  ensureInterviewsDir(userId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const locale = normalizeContentLocale(opts?.locale ?? APP_LOCALE);
  const meta: InterviewMeta = {
    id,
    createdAt: now,
    updatedAt: now,
    locale,
    schemaVersion: INTERVIEW_SCHEMA_VERSION,
    ...(opts?.title?.trim() ? { title: opts.title.trim() } : {}),
  };
  const root = path.join(interviewsDir(userId), id);
  fs.mkdirSync(root, { recursive: true });
  writeJsonAtomic(path.join(root, META_FILE), meta);
  return meta;
}

/** 读取采访 meta（不存在或损坏返回 null）。 */
export function readInterviewMeta(scope: InterviewScope): InterviewMeta | null {
  return readMeta(scope.userId, scope.interviewId);
}

function readMeta(userId: string, interviewId: string): InterviewMeta | null {
  const p = path.join(interviewsDir(userId), interviewId.trim(), META_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as InterviewMeta;
    if (parsed?.id && parsed.createdAt) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** 列出用户下所有采访（按 createdAt 降序）。 */
export function listInterviews(userId: string): InterviewMeta[] {
  const dir = interviewsDir(userId);
  if (!fs.existsSync(dir)) return [];
  const out: InterviewMeta[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const meta = readMeta(userId, ent.name);
    if (meta) out.push(meta);
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

/** 采访目录存在且可读 meta；否则抛 `INTERVIEW_NOT_FOUND`。 */
export function assertInterviewExists(scope: InterviewScope): void {
  const root = getInterviewRootDir(scope);
  if (!fs.existsSync(root) || !readMeta(scope.userId, scope.interviewId)) {
    throw new Error(`INTERVIEW_NOT_FOUND: 采访「${scope.interviewId}」不存在`);
  }
}

/** sections 懒迁移后标记 schemaVersion（幂等）。 */
export function markInterviewSchemaMigrated(scope: InterviewScope): void {
  const meta = readInterviewMeta(scope);
  if (!meta) return;
  if ((meta.schemaVersion ?? 1) >= INTERVIEW_SCHEMA_VERSION) return;
  const updated: InterviewMeta = {
    ...meta,
    schemaVersion: INTERVIEW_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomic(path.join(getInterviewRootDir(scope), META_FILE), updated);
}

/** 删除一场采访及其素材/生产产物目录。 */
export function deleteInterview(userId: string, interviewId: string): void {
  const id = interviewId.trim();
  const base = path.resolve(interviewsDir(userId));
  const target = path.resolve(base, id);
  if (!target.startsWith(`${base}${path.sep}`)) {
    throw new Error("INTERVIEW_INVALID: 采访 id 无效");
  }
  const scope = { userId, interviewId: id };
  assertInterviewExists(scope);
  fs.rmSync(target, { recursive: true, force: true });
}
