#!/usr/bin/env node
/**
 * 从一次成功的传记成片任务导出 step≤140 的 pipeline seed，供 test:video:biography:230 续跑。
 *
 * 用法：node scripts/export-video-bio-seed.mjs <taskRoot>
 * 示例：node scripts/export-video-bio-seed.mjs data/users/.../成片/<taskId>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_ROOT = path.join(ROOT, "test/fixtures/video-bio-through-140");
const PIPELINE_SUBDIR = "pipeline";

const PIPELINE_FILES = [
  "step-20_AI生成的时代背景事件.json",
  "step-30_AI拆分子场景后的时代背景事件.json",
  "step-40_AI制作的时代背景事件的场景包.json",
  "step-50_AI补充了时代地域特色的时代背景事件场景包.json",
  "step-60_AI分离后的上下文和个人事件.json",
  "step-70_AI根据上下文扩写后的个人事件.json",
  "step-80_AI分割与去重后的个人事件.json",
  "step-90_AI拆分子场景后的个人事件.json",
  "step-100_AI交叉验证优化后的个人事件.json",
  "step-110_AI制作的个人事件的场景包.json",
  "step-120_AI补充了时代地域特色的个人事件场景包.json",
  "step-130_AI为场景包的个人事件中的人物统一称呼.json",
  "step-140_AI为场景包中的个人事件中的人物划分年龄阶段.json",
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
  console.error("用法: node scripts/export-video-bio-seed.mjs <taskRoot>");
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
    fs.copyFileSync(src, path.join(destPipeline, file));
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
console.log("续跑测试：npm run test:video:biography:230（默认从 step 150 开始，需 VIDEO_BIO_FULL=1 才跑全程）");
