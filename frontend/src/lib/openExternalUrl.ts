/** 在系统浏览器打开 HTTPS 法律/Support 页（Web 与 Capacitor 通用）。 */
export function openExternalUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
