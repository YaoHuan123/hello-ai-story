/** 原生 App 无 Vite 代理，须配置完整 API 根地址（如 http://10.0.2.2:3001）。Web 开发留空即可走相对路径 + proxy。 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export function resolveApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with /: ${path}`);
  }
  if (!API_BASE) return path;
  // 生产 Nginx 常配 …/hello-story/api；前端 path 已含 /api/…，避免拼成 /api/api/…
  if (API_BASE.endsWith("/api") && path.startsWith("/api")) {
    return `${API_BASE}${path.slice(4)}`;
  }
  return `${API_BASE}${path}`;
}
