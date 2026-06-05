/**
 * 【已归档】一次性脚本：从老项目移植渲染步骤。
 * 目标目录现为 `backend/src/video/biography/render/`。
 * 勿再运行；保留仅供查阅迁移历史。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const srcDir = path.join("E:", "hello story", "backend", "src", "services", "createVideoPipeline");
const outDir = path.join(repoRoot, "backend", "src", "video", "render");

const FILES = [
  "totalPackAudioRelation3.service.ts",
  "visualExpand200.service.ts",
  "addStylePrefix220.service.ts",
  "textToImage230.service.ts",
  "videoClips240.service.ts",
  "mergeVideoClips250.service.ts",
];

function transform(content) {
  let s = content;
  s = s.replace(/import fs from "fs";?\n/g, 'import fs from "node:fs";\n');
  s = s.replace(/import path from "path";?\n/g, 'import path from "node:path";\n');
  s = s.replace(/import \{ spawn/g, 'import { spawn');
  s = s.replace(
    /import \{ getOpenAiCompatEnv \} from "\.\.\/openaiCompat";?\n/g,
    'import { getVideoLlmEnv } from "../llm/client.js";\n',
  );
  s = s.replace(/getOpenAiCompatEnv\(\)/g, "getVideoLlmEnv()");
  s = s.replace(
    /import \{ applyText2imgSensitiveReplacements \} from "\.\.\/text2imgSensitiveReplacements\.service";?\n/g,
    'import { applyText2imgSensitiveReplacements } from "./text2imgSensitiveReplacements.js";\n',
  );
  s = s.replace(
    /import \{ logInfo, logWarn \} from "\.\.\/\.\.\/logger";?\n/g,
    "",
  );
  s = s.replace(/\blogInfo\([^)]*\);?\n/g, "");
  s = s.replace(/\blogWarn\([^)]*\);?\n/g, "");
  s = s.replace(/from "\.\/([^"]+)\.service"/g, 'from "./$1.js"');
  s = s.replace(/from "\.\/mergeEnvAndEra160\.service"/g, 'from "../llm/steps/mergeEnvAndEra160.js"');
  s = s.replace(/from "\.\/totalPackVoiceover110\.service"/g, 'from "../llm/steps/totalPackVoiceover110.js"');
  s = s.replace(/from "\.\/visualCreate190\.service"/g, 'from "../llm/steps/visualCreate190.js"');
  s = s.replace(/from "\.\/videoStyles\.service"/g, 'from "../llm/steps/videoStyles.js"');
  return s;
}

function outFileName(srcName) {
  return srcName.replace(/\.service\.ts$/, ".ts");
}

fs.mkdirSync(outDir, { recursive: true });
for (const f of FILES) {
  const src = path.join(srcDir, f);
  const out = path.join(outDir, outFileName(f));
  const raw = fs.readFileSync(src, "utf-8");
  fs.writeFileSync(out, transform(raw), "utf-8");
  console.log(`ported ${f} -> ${path.relative(repoRoot, out)}`);
}
