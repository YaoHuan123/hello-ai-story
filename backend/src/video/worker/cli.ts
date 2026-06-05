/**
 * 成片 worker CLI（无 HTTP）。
 * 用法：
 *   npm run worker:video          # 持续轮询
 *   npm run worker:video -- --once  # 处理一条后退出
 */
import { config as loadEnv } from "dotenv";
import { runVideoWorkerLoop } from "./videoTaskWorker.js";

loadEnv();

const once = process.argv.includes("--once");

console.log(`[video-worker] starting${once ? " (once)" : ""}…`);

runVideoWorkerLoop({ once }).catch((err) => {
  console.error("[video-worker] fatal", err);
  process.exit(1);
});
