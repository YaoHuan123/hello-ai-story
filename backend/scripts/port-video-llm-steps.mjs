/**
 * 【已归档】一次性脚本：从老项目移植 LLM 步骤。
 * 目标目录已迁移为 `backend/src/video/shared/llm/`（prep）与 `biography/llm/`（传记步）。
 * 勿再运行；保留仅供查阅迁移历史。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const srcDir = path.join(
  "E:",
  "hello story",
  "backend",
  "src",
  "services",
  "createVideoPipeline",
);
const outDir = path.join(repoRoot, "backend", "src", "video", "llm", "steps");

const FILES = [
  "eraBackdrop.service.ts",
  "eraSubsceneSplit105.service.ts",
  "eraEnvNarrativePack150.service.ts",
  "eraEnvSceneEmbellish153.service.ts",
  "classify77.service.ts",
  "contextExpand78.service.ts",
  "segmentRefine79.service.ts",
  "subsceneSplit80.service.ts",
  "livingContextRefine85.service.ts",
  "envNarrativePack140.service.ts",
  "sceneEmbellish143.service.ts",
  "nameUnify120.service.ts",
  "phaseReplace130.service.ts",
  "mergeEnvAndEra160.service.ts",
  "mergeEnvAndEra160Ai.service.ts",
  "totalPackVoiceover110.service.ts",
  "voiceoverCoherence112.service.ts",
  "visualCreate190.service.ts",
  "geoSignage225.service.ts",
  "videoStyles.service.ts",
];

function transform(content, outName) {
  let s = content;

  s = s.replace(/import fs from "fs";?\n/g, 'import fs from "node:fs";\n');
  s = s.replace(
    /import \{ chatJson, getOpenAiCompatEnv, stringifyForAi \} from "\.\.\/openaiCompat";?\n/g,
    'import { chatJson, getVideoLlmEnv, stringifyForAi } from "../client.js";\n',
  );
  s = s.replace(
    /import \{ resolveRepoPromptPath \} from "\.\.\/promptPath";?\n/g,
    'import { resolveVideoPromptPath } from "../loadPrompt.js";\n',
  );
  s = s.replace(/getOpenAiCompatEnv\(\)/g, "getVideoLlmEnv()");
  s = s.replace(/resolveRepoPromptPath/g, "resolveVideoPromptPath");

  s = s.replace(
    /from "\.\/materialPipelineFilenames\.constants"/g,
    'from "../../constants/pipelineFilenames.js"',
  );

  s = s.replace(/from "\.\.\/pipelineChunkedChat"/g, 'from "../pipelineChunkedChat.js"');
  s = s.replace(/from "\.\.\/envSegmentSceneText"/g, 'from "../envSegmentSceneText.js"');

  s = s.replace(/from "\.\/([^"]+)\.service"/g, 'from "./$1.js"');

  // PROMPT_FILE paths: create-video/foo.md -> foo.md
  s = s.replace(
    /const PROMPT_FILE = "create-video\/([^"]+)";/g,
    'const PROMPT_FILE = "$1";',
  );

  return s;
}

function outFileName(srcName) {
  return srcName.replace(/\.service\.ts$/, ".ts");
}

fs.mkdirSync(outDir, { recursive: true });

for (const file of FILES) {
  const srcPath = path.join(srcDir, file);
  if (!fs.existsSync(srcPath)) {
    console.error("missing", srcPath);
    process.exitCode = 1;
    continue;
  }
  const raw = fs.readFileSync(srcPath, "utf-8");
  const outName = outFileName(file);
  const outPath = path.join(outDir, outName);
  fs.writeFileSync(outPath, transform(raw, outName), "utf-8");
  console.log("wrote", outName);
}
