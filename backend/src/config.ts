import "./bootstrapEnv.js";

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`MISSING_ENV:${name}`);
  }
  return value;
};

const parsePort = (raw: string): number => {
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`INVALID_ENV:PORT(${raw})`);
  }
  return port;
};

export const PORT = parsePort(requireEnv("PORT"));
export const JWT_SECRET = requireEnv("JWT_SECRET");
export const JWT_EXPIRES_IN = requireEnv("JWT_EXPIRES_IN");

export const DATA_ROOT = requireEnv("DATA_ROOT");
export const DATA_DB_FILE = requireEnv("DATA_DB_FILE");
export const DATA_USERS_ROOT = requireEnv("DATA_USERS_ROOT");

export const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
export const OPENAI_BASE_URL = requireEnv("OPENAI_BASE_URL").replace(/\/$/, "");
export const OPENAI_MODEL = requireEnv("OPENAI_MODEL");

/** Web 壳层语言开关：zh（默认）| en。详见 docs/i18n.md */
export type AppLocale = "zh" | "en";

function parseAppLocale(raw: string | undefined): AppLocale {
  const v = (raw ?? "zh").trim().toLowerCase();
  return v === "en" ? "en" : "zh";
}

export const APP_LOCALE = parseAppLocale(process.env.APP_LOCALE);
