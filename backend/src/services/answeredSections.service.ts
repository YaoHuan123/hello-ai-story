import fs from "node:fs";
import path from "node:path";
import type { AnsweredSection } from "../topic/types";
import { getUserRootDir } from "./workspace.service";

const ANSWERED_DIR = "已答";
const SECTIONS_FILE = "sections.json";

function sectionsPath(userId: string): string {
  return path.join(getUserRootDir(userId), ANSWERED_DIR, SECTIONS_FILE);
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function readSectionsFile(userId: string): AnsweredSection[] {
  const p = sectionsPath(userId);
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as AnsweredSection[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 读取全书已答小节（`已答/sections.json`）。 */
export function getSections(userId: string): AnsweredSection[] {
  return readSectionsFile(userId);
}

/**
 * 将一节问答写入 `sections.json`（同名节覆盖）。
 * 由调度层在本节结束时根据出题器状态组装 `AnsweredSection` 后调用。
 */
export function commitSection(userId: string, section: AnsweredSection): void {
  const name = section.name.trim();
  if (!name) {
    throw new Error("ANSWERED_SECTIONS_MISSING_INPUT: section.name 为空");
  }
  const qa = (section.qa ?? []).filter(
    (pair) => String(pair.q ?? "").trim() && String(pair.a ?? "").trim(),
  );
  if (qa.length === 0) {
    throw new Error(`ANSWERED_SECTIONS_EMPTY: 主题「${name}」无有效 qa`);
  }

  const committed = readSectionsFile(userId);
  const normalized: AnsweredSection = { name, qa };
  const idx = committed.findIndex((s) => s.name.trim() === name);
  if (idx >= 0) {
    committed[idx] = normalized;
  } else {
    committed.push(normalized);
  }
  writeJsonAtomic(sectionsPath(userId), committed);
}

/** 用已有 sections 初始化（测试或迁移）。 */
export function seedCommittedSections(userId: string, sections: AnsweredSection[]): void {
  writeJsonAtomic(sectionsPath(userId), sections);
}
