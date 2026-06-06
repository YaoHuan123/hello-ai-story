/**
 * 成片 worker CLI（无 HTTP）。
 *
 * 开发：
 *   npm run worker:video
 *   npm run worker:video -- --once
 *
 * 生产（先 npm run build）：
 *   npm run start:worker
 *   npm run start:worker:once
 *   pm2 start ecosystem.config.cjs
 */
import "../../bootstrapEnv.js";
import { runVideoWorkerLoop } from "./videoTaskWorker.js";

const once = process.argv.includes("--once");

console.log(`[video-worker] starting${once ? " (once)" : ""}…`);

runVideoWorkerLoop({ once }).catch((err) => {
  console.error("[video-worker] fatal", err);
  process.exit(1);
});
