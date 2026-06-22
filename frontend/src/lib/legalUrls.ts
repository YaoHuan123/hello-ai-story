/** hellotita.top 上本项目 path；法律页由本仓库 backend/public/legal 提供。 */
export const PROJECT_SLUG = "hello-story";

const DEFAULT_SITE_ORIGIN = "https://hellotita.top";

function siteOrigin(): string {
  const raw = (import.meta.env.VITE_LEGAL_SITE_ORIGIN ?? DEFAULT_SITE_ORIGIN).trim().replace(/\/$/, "");
  return raw || DEFAULT_SITE_ORIGIN;
}

export type LegalUrls = {
  privacy: string;
  terms: string;
  support: string;
};

export function getLegalUrls(): LegalUrls {
  const base = `${siteOrigin()}/${PROJECT_SLUG}`;
  return {
    privacy: `${base}/privacy`,
    terms: `${base}/terms`,
    support: `${base}/support`,
  };
}

/** 生产 API（Nginx 反代 /hello-story/api）。构建时可覆盖 VITE_API_BASE_URL。 */
export const PRODUCTION_API_BASE_URL = `${siteOrigin()}/${PROJECT_SLUG}/api`;
