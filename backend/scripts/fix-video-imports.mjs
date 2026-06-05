/**
 * 【已归档】shared/biography 目录拆分后批量修正 import 的一次性脚本。
 * 工程债清理后旧路径 `video/llm`、`video/render`、`video/orchestrator` 等已删除。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "video");

const REPLACEMENTS = [
  // shared/input
  ["from \"../../services/", "from \"../../../services/"],
  ["from \"../../topic/", "from \"../../../topic/"],
  // biography orchestrator -> shared
  ["from \"../constants/pipelineFilenames.js\"", "from \"../../shared/constants/prepFilenames.js\""],
  ["from \"../constants/stepIds.js\"", "from \"../constants/stepIds.js\""],
  ["from \"./pipelineDisk.js\"", "from \"../../shared/orchestrator/pipelineDisk.js\""],
  ["from \"./videoTaskWorkspace.js\"", "from \"../../shared/orchestrator/videoTaskWorkspace.js\""],
  // biography llm steps
  ["from \"../client.js\"", "from \"../../../shared/llm/client.js\""],
  ["from \"../loadPrompt.js\"", "from \"../../../shared/llm/loadPrompt.js\""],
  ["from \"../envSegmentSceneText.js\"", "from \"../../../shared/llm/envSegmentSceneText.js\""],
  ["from \"../pipelineChunkedChat.js\"", "from \"../../../shared/llm/pipelineChunkedChat.js\""],
  // biography render
  ["from \"../constants/pipelineFilenames.js\"", "from \"../constants/pipelineFilenames.js\""],
  ["from \"../llm/steps/", "from \"../llm/steps/"],
  ["from \"../llm/client.js\"", "from \"../../shared/llm/client.js\""],
  ["from \"../orchestrator/pipelineDisk.js\"", "from \"../../shared/orchestrator/pipelineDisk.js\""],
  ["from \"../orchestrator/videoTaskWorkspace.js\"", "from \"../../shared/orchestrator/videoTaskWorkspace.js\""],
  // shared llm steps - services path
  ["from \"../../services/", "from \"../../../services/"],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

for (const sub of ["shared", "biography"]) {
  const base = path.join(root, sub);
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base)) {
    let text = fs.readFileSync(file, "utf8");
    const orig = text;
    if (sub === "shared") {
      if (file.includes("shared\\input") || file.includes("shared/input")) {
        text = text.replace(/from "\.\.\/\.\.\/services\//g, 'from "../../../services/');
        text = text.replace(/from "\.\.\/\.\.\/topic\//g, 'from "../../../topic/');
      }
      if (file.includes("shared\\llm\\client") || file.includes("shared/llm/client")) {
        text = text.replace(/from "\.\.\/\.\.\/services\//g, 'from "../../../services/');
      }
    }
    if (sub === "biography") {
      if (file.includes("biography\\llm\\steps") || file.includes("biography/llm/steps")) {
        text = text.replace(/from "\.\.\/client\.js"/g, 'from "../../../shared/llm/client.js"');
        text = text.replace(/from "\.\.\/loadPrompt\.js"/g, 'from "../../../shared/llm/loadPrompt.js"');
        text = text.replace(/from "\.\.\/envSegmentSceneText\.js"/g, 'from "../../../shared/llm/envSegmentSceneText.js"');
        text = text.replace(/from "\.\.\/pipelineChunkedChat\.js"/g, 'from "../../../shared/llm/pipelineChunkedChat.js"');
        text = text.replace(/from "\.\.\/\.\.\/constants\/pipelineFilenames\.js"/g, 'from "../../constants/pipelineFilenames.js"');
      }
      if (file.includes("biography\\render") || file.includes("biography/render")) {
        text = text.replace(/from "\.\.\/llm\/client\.js"/g, 'from "../../shared/llm/client.js"');
        text = text.replace(/from "\.\.\/llm\/steps\//g, 'from "../llm/steps/');
        text = text.replace(/from "\.\.\/constants\/pipelineFilenames\.js"/g, 'from "../constants/pipelineFilenames.js"');
        text = text.replace(/from "\.\.\/orchestrator\/pipelineDisk\.js"/g, 'from "../../shared/orchestrator/pipelineDisk.js"');
        text = text.replace(/from "\.\.\/orchestrator\/videoTaskWorkspace\.js"/g, 'from "../../shared/orchestrator/videoTaskWorkspace.js"');
      }
      if (file.includes("biography\\orchestrator") || file.includes("biography/orchestrator")) {
        text = text.replace(/from "\.\.\/constants\/pipelineFilenames\.js"/g, 'from "../constants/pipelineFilenames.js"');
        text = text.replace(/from "\.\.\/constants\/stepIds\.js"/g, 'from "../constants/stepIds.js"');
        text = text.replace(/from "\.\.\/llm\/steps\//g, 'from "../llm/steps/');
        text = text.replace(/from "\.\.\/render\//g, 'from "../render/');
        text = text.replace(/from "\.\/pipelineDisk\.js"/g, 'from "../../shared/orchestrator/pipelineDisk.js"');
        text = text.replace(/from "\.\/videoTaskWorkspace\.js"/g, 'from "../../shared/orchestrator/videoTaskWorkspace.js"');
        text = text.replace(/from "\.\.\/input\//g, 'from "../../shared/input/');
      }
      if (file.includes("biography\\constants") || file.includes("biography/constants")) {
        text = text.replace(
          /from "\.\/stepIds\.js"/g,
          'from "./stepIds.js"',
        );
        // pipelineFilenames imports stepIds from same dir - add re-export of prep from shared
      }
    }
    if (text !== orig) {
      fs.writeFileSync(file, text);
      console.log("fixed:", path.relative(root, file));
    }
  }
}

console.log("done");
