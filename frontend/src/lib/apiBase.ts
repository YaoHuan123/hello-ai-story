/** 原生 App 无 Vite 代理，须配置完整 API 根地址（如 http://10.0.2.2:3001）。Web 开发留空即可走相对路径 + proxy。 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export function resolveApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with /: ${path}`);
  }
  return API_BASE ? `${API_BASE}${path}` : path;
}
