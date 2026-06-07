import fs from "fs";
import path from "path";
import {
  getDisplayVideoStyleFields,
  type VideoStyleDisplayFields,
} from "../../../../content/displayCatalog.js";
import type { DisplayLocale } from "../../../../content/displayLocale.js";

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

type VideoStyleOverridesFile = {
  styles: Record<string, Partial<VideoStyleRow>>;
};

function overridesPathFor(configPath: string): string {
  const dir = path.dirname(configPath);
  const base = path.basename(configPath, ".json");
  return path.join(dir, `${base}.en.overrides.json`);
}

function mergeVideoStyleOverrides(file: VideoStylesFile, configPath: string): VideoStylesFile {
  const overridesPath = overridesPathFor(configPath);
  if (!fs.existsSync(overridesPath)) return file;
  const raw = fs.readFileSync(overridesPath, "utf-8");
  const overrides = JSON.parse(raw) as VideoStyleOverridesFile;
  if (!overrides?.styles || typeof overrides.styles !== "object") return file;
  const styles = file.styles.map((row) => {
    const patch = overrides.styles[row.id];
    return patch ? { ...row, ...patch } : row;
  });
  return { ...file, styles };
}

function loadVideoStylesBase(configPath: string): VideoStylesFile {
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

/** 管线用 canonical 英文（`video-styles.json` + `video-styles.en.overrides.json`）。 */
export function loadVideoStyles(configPath: string): VideoStylesFile {
  return mergeVideoStyleOverrides(loadVideoStylesBase(configPath), configPath);
}

/** 读取配置并按任务所选 `styleId` 覆盖 `selectedStyleId`（默认读 config/video-styles.json）。 */
export function resolveStyleConfig(configPath: string, styleId?: string): VideoStylesFile {
  const config = loadVideoStyles(configPath);
  const id = styleId?.trim();
  if (!id) return config;
  if (!config.styles.some((s) => s.id === id)) {
    throw new Error(`VIDEO_STYLE_NOT_FOUND: 未找到视频风格「${id}」`);
  }
  return { ...config, selectedStyleId: id };
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

  if (name) parts.push(`[${name}${badge ? ` | ${badge}` : ""}]`);
  if (artStyle) parts.push(artStyle);
  if (detailedDesc) parts.push(detailedDesc);
  if (technical) parts.push(technical);
  if (positioning) parts.push(`Positioning: ${positioning}`);
  if (colorTone) parts.push(`Color: ${colorTone}`);
  if (camera) parts.push(`Camera: ${camera}`);
  if (transitions) parts.push(`Transitions: ${transitions}`);
  if (atmosphere) parts.push(`Mood: ${atmosphere}`);

  return parts.length > 0 ? `${parts.join(", ")}.` : "";
}

export function styleToImageRestylePrompt(s: VideoStyleRow): string {
  const base = styleToPromptPrefix(s);
  return [
    "You will receive a real photo uploaded by the user. Restyle it for visual consistency.",
    "Keep the original subject, composition, location cues, and main buildings; do not change event meaning.",
    "Adjust only art direction, color, camera feel, and mood toward the target style; stay consistent with the biography video look.",
    "Do not add people, text, logos, watermarks, or exaggerated distortion.",
    "Output a single high-quality frame.",
    base || "Style: documentary biography, natural light, high detail.",
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
function overlayVideoStyleDisplay(
  row: PublicVideoStyle,
  locale: DisplayLocale,
): PublicVideoStyle {
  const zh = getDisplayVideoStyleFields(row.id, locale);
  if (!zh) return row;
  const apply = (key: keyof VideoStyleDisplayFields, fallback: string): string => {
    const v = zh[key];
    return typeof v === "string" && v.trim() ? v.trim() : fallback;
  };
  return {
    ...row,
    name: apply("name", row.name),
    badge: apply("badge", row.badge),
    positioning: apply("positioning", row.positioning),
    atmosphere: apply("atmosphere", row.atmosphere),
    suitableFor: apply("suitableFor", row.suitableFor),
    detailedDesc: apply("detailedDesc", row.detailedDesc),
  };
}

/** 公开 API：canonical 英文 + `catalog.zh.json` 展示覆盖（`locale=zh` 时）。 */
export function listPublicStyles(
  configDir: string,
  locale: DisplayLocale = "en",
): { selectedStyleId: string; styles: PublicVideoStyle[] } {
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

    const canonical: PublicVideoStyle = {
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
    return overlayVideoStyleDisplay(canonical, locale);
  });

  return { selectedStyleId: file.selectedStyleId, styles };
}

