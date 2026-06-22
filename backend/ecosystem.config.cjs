/**
 * PM2 生产进程：API + 成片 worker（各 1 实例）。
 *
 * 服务器部署路径：/home/admin/apps/hello-story/backend
 * 公开 API：https://hellotita.top/hello-story/api
 * 说明：backend/deploy/README.md
 *
 * 用法（在 backend 目录）：
 *   npm run build
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs
 *   pm2 stop ecosystem.config.cjs
 *
 * 注意：当前为磁盘 JSON 队列，video-worker 必须且只能跑 1 个实例；
 * 串行执行（一次一条 pipeline）是设计如此，见 backend/docs/video-worker.md
 */
const backendRoot = __dirname;

module.exports = {
  apps: [
    {
      name: "hello-story-api",
      cwd: backendRoot,
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "hello-story-video-worker",
      cwd: backendRoot,
      script: "dist/video/worker/cli.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "2G",
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
