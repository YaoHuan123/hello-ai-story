import { config as loadEnv } from "dotenv";

loadEnv();

/** `.env` 中配置了 HTTP(S)_PROXY 时，让 Node fetch 走系统代理（需 Node 22+ 实验特性）。 */
export function applyNetworkEnvDefaults(): void {
  const proxy = (process.env.HTTP_PROXY ?? process.env.HTTPS_PROXY ?? "").trim();
  if (!proxy) return;
  const flag = (process.env.NODE_USE_ENV_PROXY ?? "1").trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") return;
  process.env.NODE_USE_ENV_PROXY = "1";
}

applyNetworkEnvDefaults();
