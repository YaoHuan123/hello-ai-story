import { en } from "./locales/en";
import { zh } from "./locales/zh";
import type { Locale, MessageTree } from "./types";

export const NOT_LOGGED_IN = "NOT_LOGGED_IN";

const catalogs: Record<Locale, MessageTree> = { zh, en };

let locale: Locale = resolveLocale();

function getNested(tree: MessageTree, path: string): string | undefined {
  const parts = path.split(".");
  let cur: string | MessageTree = tree;
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null || !(part in cur)) return undefined;
    cur = cur[part] as string | MessageTree;
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? `{${key}}`);
}

export function resolveLocale(): Locale {
  const forced = (import.meta.env.VITE_LOCALE ?? "").trim().toLowerCase();
  if (forced === "zh" || forced === "en") return forced;
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) {
    return "zh";
  }
  return "en";
}

function applyDocumentLang(next: Locale): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  }
}

/** 启动时设定语言；Web 由 main 传入 health.locale，原生用构建/系统语言。 */
export function initI18n(forced?: Locale): Locale {
  locale = forced ?? resolveLocale();
  applyDocumentLang(locale);
  return locale;
}

/** Web：health 返回的 locale 优先于 VITE_LOCALE / 浏览器。 */
export function resolveWebLocale(serverLocale?: string): Locale {
  if (serverLocale === "zh" || serverLocale === "en") return serverLocale;
  return resolveLocale();
}

export function getLocale(): Locale {
  return locale;
}

/** 点分路径取文案，如 t('login.heading')；缺省回退英文再回退 key。 */
export function t(key: string, params?: Record<string, string>): string {
  const primary = getNested(catalogs[locale], key);
  const fallback = getNested(catalogs.en, key);
  const raw = primary ?? fallback ?? key;
  return interpolate(raw, params);
}

export function formatLocaleDate(iso: string): string {
  try {
    const tag = locale === "zh" ? "zh-CN" : "en-US";
    return new Date(iso).toLocaleDateString(tag, {
      year: "numeric",
      month: locale === "zh" ? "long" : "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function isUnauthorizedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { code?: string; status?: number };
  return (
    e.message === NOT_LOGGED_IN ||
    e.code === "UNAUTHORIZED" ||
    e.status === 401 ||
    err.message.includes("未登录") ||
    err.message.toLowerCase().includes("unauthorized")
  );
}

export function displayError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code?: string }).code === "string") {
    const code = (err as { code: string }).code;
    const mapped = t(`api.${code}`);
    if (mapped !== `api.${code}`) return mapped;
  }
  if (err instanceof Error) {
    if (err.message === NOT_LOGGED_IN) return t("api.NOT_LOGGED_IN");
    const code = (err as Error & { code?: string }).code;
    if (code) {
      const mapped = t(`api.${code}`);
      if (mapped !== `api.${code}`) return mapped;
    }
    return err.message || t("common.requestFailed");
  }
  return t("common.requestFailed");
}
