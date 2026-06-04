import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
  opts?: { title?: string },
): InterviewMeta {
  ensureInterviewsDir(userId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const meta: InterviewMeta = {
    id,
    createdAt: now,
    updatedAt: now,
    ...(opts?.title?.trim() ? { title: opts.title.trim() } : {}),
  };
  const root = path.join(interviewsDir(userId), id);
  fs.mkdirSync(root, { recursive: true });
  writeJsonAtomic(path.join(root, META_FILE), meta);
  return meta;
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
