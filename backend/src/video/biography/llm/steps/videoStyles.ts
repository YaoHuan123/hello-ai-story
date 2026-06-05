import fs from "fs";
import path from "path";

export type VideoStyleRow = {
  id: string;
  name: string;
  order?: number;
  badge?: string;
  positioning: string;
  colorTone: string | null;
  camera: string | null;
  transitions: string | null;
  atmosphere: string;
  suitableFor: string;
  detailedDesc: string;
  artStyle: string;
  technical: string;
};

export type VideoStylesFile = {
  meta?: { usage?: string };
  selectedStyleId: string;
  styles: VideoStyleRow[];
};

export function loadVideoStyles(configPath: string): VideoStylesFile {
  if (!fs.existsSync(configPath)) {
    throw new Error(`缺少视频风格配置：${configPath}`);
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as VideoStylesFile;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.styles)) {
    throw new Error(`视频风格配置格式错误：${configPath}`);
  }
  return parsed;
}

export function resolveSelectedStyle(config: VideoStylesFile): VideoStyleRow {
  const found = config.styles.find((s) => s.id === config.selectedStyleId);
  if (found) return found;
  throw new Error(
    `video-styles.json 中未找到所选风格 id="${config.selectedStyleId}"（请修正 selectedStyleId 或 styles 列表）`,
  );
}

export function styleToPromptPrefix(s: VideoStyleRow): string {
  const parts: string[] = [];
  const name = s.name?.trim();
  const badge = s.badge?.trim();
  const artStyle = s.artStyle?.trim();
  const detailedDesc = s.detailedDesc?.trim();
  const technical = s.technical?.trim();
  const positioning = s.positioning?.trim();
  const colorTone = s.colorTone?.trim();
  const camera = s.camera?.trim();
  const transitions = s.transitions?.trim();
  const atmosphere = s.atmosphere?.trim();

  if (name) parts.push(`【${name}${badge ? `｜${badge}` : ""}】`);
  if (artStyle) parts.push(artStyle);
  if (detailedDesc) parts.push(detailedDesc);
  if (technical) parts.push(technical);
  if (positioning) parts.push(`定位：${positioning}`);
  if (colorTone) parts.push(`色调：${colorTone}`);
  if (camera) parts.push(`镜头：${camera}`);
  if (transitions) parts.push(`转场：${transitions}`);
  if (atmosphere) parts.push(`氛围：${atmosphere}`);

  return parts.length > 0 ? `${parts.join("，")}。` : "";
}

export function styleToImageRestylePrompt(s: VideoStyleRow): string {
  const base = styleToPromptPrefix(s);
  return [
    "你将收到一张用户上传的真实照片，请做图生图风格统一。",
    "要求：保留原始场景主体、构图、地点特征和主要建筑，不要改变事件语义。",
    "只在画风、色调、镜头质感、氛围上向目标风格靠拢，整体与传记视频风格保持统一。",
    "禁止新增人物、禁止新增文字、禁止logo与水印、禁止夸张变形。",
    "输出单帧高质量图片。",
    base || "风格要求：纪实传记风格，真实自然光影，高细节。",
  ].join("\n");
}

export function defaultVideoStylesConfigPath(): string {
  return path.resolve(process.cwd(), "config", "video-styles.json");
}

/** 面向前端的视频风格元数据，不包含 imagePrompt 等生图/提示词字段。 */
export type PublicVideoStyle = {
  id: string;
  order: number;
  name: string;
  badge: string;
  positioning: string;
  atmosphere: string;
  suitableFor: string;
  detailedDesc: string;
  coverUrl: string | null;
};

const COVER_FILENAMES = ["cover.jpg", "cover.png", "cover.webp"] as const;

function detectCoverFile(styleDir: string): string | null {
  for (const name of COVER_FILENAMES) {
    const p = path.join(styleDir, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return name;
    }
  }
  return null;
}

/**
 * 从 `config` 根目录读 `video-styles.json`，并探测 `config/video-styles/<id>/cover.(jpg|png|webp)`。
 * `configDir` 为 backend 的 `config` 目录绝对或相对 `process.cwd()` 的路径。
 * `coverUrl` 为以 `/` 开头的前端可用路径，需与 `app.use("/static/video-styles", static(...))` 配合。
 */
export function listPublicStyles(configDir: string): { selectedStyleId: string; styles: PublicVideoStyle[] } {
  const configPath = path.join(configDir, "video-styles.json");
  const file = loadVideoStyles(configPath);
  const stylesBase = path.join(configDir, "video-styles");

  const withOrder = file.styles
    .map((s, i) => {
      const ord = typeof s.order === "number" && !Number.isNaN(s.order) ? s.order : i + 1;
      return { s, ord, i };
    })
    .sort((a, b) => a.ord - b.ord || a.i - b.i);

  const styles: PublicVideoStyle[] = withOrder.map(({ s, ord }) => {
    const dir = path.join(stylesBase, s.id);
    const coverFile = fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? detectCoverFile(dir) : null;
    const coverUrl = coverFile != null ? `/static/video-styles/${s.id}/${coverFile}` : null;

    return {
      id: s.id,
      order: ord,
      name: s.name,
      badge: s.badge?.trim() ?? "",
      positioning: s.positioning,
      atmosphere: s.atmosphere,
      suitableFor: s.suitableFor,
      detailedDesc: s.detailedDesc,
      coverUrl,
    };
  });

  return { selectedStyleId: file.selectedStyleId, styles };
}

