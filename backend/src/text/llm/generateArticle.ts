import type { AnsweredSection } from "../../topic/types";
import { chatJson, getVideoLlmEnv, stringifyForAi } from "../../video/shared/llm/client.js";
import { sectionsForTextArticleLlm } from "../input/sectionsTextInput.js";
import { loadTextPromptParts } from "./loadTextPrompt.js";

const PROMPT_FILE = "step-10_formal-article.md";
const ERR = "TEXT_ARTICLE_INVALID";

export type TextArticleMode = "llm" | "stub";

function assertArticleShape(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${ERR}: 模型输出须为 JSON 对象`);
  }
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length !== 1 || !Object.prototype.hasOwnProperty.call(root, "article")) {
    throw new Error(`${ERR}: 顶层须仅含 article，当前键: ${keys.join(",")}`);
  }
  const article = root.article;
  if (typeof article !== "string" || !article.trim()) {
    throw new Error(`${ERR}: article 须为非空字符串`);
  }
  return article.trim();
}

function stubArticle(sections: AnsweredSection[]): string {
  const { sections: slim } = sectionsForTextArticleLlm(sections);
  const parts: string[] = [];
  for (const sec of slim) {
    const bits = sec.qa.map(({ a }) => a.trim()).filter(Boolean);
    if (bits.length) {
      parts.push(`${sec.name}：${bits.join("；")}`);
    }
  }
  return parts.join("\n\n");
}

async function callFormalArticleLlm(pipelineStr: string, debugStepId: string): Promise<unknown> {
  const { systemText, userSuffix } = loadTextPromptParts(PROMPT_FILE);
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);
  return chatJson<unknown>(
    [
      { role: "system", content: systemText },
      { role: "user", content: userContent },
    ],
    { debugStepId, temperature: debugStepId.includes("repair") ? 0.15 : 0.35, useJsonObject: true },
  );
}

export async function generateFormalArticleFromSections(
  sections: AnsweredSection[],
  opts?: { mode?: TextArticleMode },
): Promise<{ article: string; skippedModel: boolean }> {
  const { sections: slim } = sectionsForTextArticleLlm(sections);
  if (slim.length === 0) {
    throw new Error(`${ERR}: sections 为空，无法生成文章`);
  }

  const mode = opts?.mode ?? (process.env.TEXT_ARTICLE_STUB === "1" ? "stub" : "llm");
  if (mode === "stub") {
    return { article: stubArticle(sections), skippedModel: true };
  }

  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const pipelineStr = stringifyForAi({ sections: slim });

  try {
    const parsed = await callFormalArticleLlm(pipelineStr, "tx_article");
    return { article: assertArticleShape(parsed), skippedModel: false };
  } catch (firstErr) {
    if (!(firstErr instanceof Error) || !firstErr.message.startsWith(`${ERR}:`)) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`${ERR}: 模型调用或 JSON 解析失败。${msg}`);
    }
    const guidance = `【服务端校验未通过，请修正后重新输出】\n${firstErr.message}\n\n硬性约束：顶层仅含 article（非空字符串，一篇完整第一人称传记正文）；不要分节 JSON、不要 Markdown 围栏。`;
    const { systemText, userSuffix } = loadTextPromptParts(PROMPT_FILE);
    const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);
    const parsed2 = await chatJson<unknown>(
      [
        { role: "system", content: systemText },
        { role: "user", content: userContent },
        { role: "user", content: guidance },
      ],
      { debugStepId: "tx_article_repair", temperature: 0.15, useJsonObject: true },
    );
    return { article: assertArticleShape(parsed2), skippedModel: false };
  }
}
