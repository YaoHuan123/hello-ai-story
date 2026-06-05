#!/usr/bin/env node
/**
 * 从一次成功的演播室成片任务导出 through iv_script 的 pipeline seed，供 test:video:studio:tts 续跑。
 *
 * 用法：node scripts/export-video-studio-seed.mjs <taskRoot>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_ROOT = path.join(ROOT, "test/fixtures/video-studio-through-iv-script");
const PIPELINE_SUBDIR = "pipeline";

const PIPELINE_FILES = [
  "step-60_AI分离后的上下文和个人事件.json",
  "step-70_AI根据上下文扩写后的个人事件.json",
  "step-80_AI分割与去重后的个人事件.json",
  "interview-studio/iv-script_访谈演播室脚本.json",
];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const taskRoot = process.argv[2]?.trim();
if (!taskRoot) {
  console.error("用法: node scripts/export-video-studio-seed.mjs <taskRoot>");
  process.exit(1);
}

const absTask = path.resolve(process.cwd(), taskRoot);
const srcPipeline = path.join(absTask, PIPELINE_SUBDIR);
if (!fs.existsSync(srcPipeline)) {
  console.error(`未找到 pipeline 目录: ${srcPipeline}`);
  process.exit(1);
}

const destPipeline = path.join(SEED_ROOT, PIPELINE_SUBDIR);
fs.mkdirSync(destPipeline, { recursive: true });

let copied = 0;
for (const file of PIPELINE_FILES) {
  const src = path.join(srcPipeline, file);
  if (fs.existsSync(src)) {
    const dest = path.join(destPipeline, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copied += 1;
  } else {
    console.warn(`[skip] 缺失 ${file}`);
  }
}

const srcInput = path.join(absTask, "输入");
const destInput = path.join(SEED_ROOT, "输入");
if (fs.existsSync(srcInput)) {
  copyDir(srcInput, destInput);
  console.log(`已复制 输入/ → ${destInput}`);
}

console.log(`\n导出完成：${copied} 个 pipeline 文件 → ${destPipeline}`);
console.log("续跑测试：npm run test:video:studio:tts（默认从 iv_tts 开始；VIDEO_STUDIO_FULL=1 跑全程至 iv_script）");
