# systemd 部署

## 前置

1. 将仓库部署到服务器，例如 `/opt/hello-story2`
2. 配置 `backend/.env`（与开发相同键，生产用真实密钥）
3. 编译：

```bash
cd /opt/hello-story2/backend
npm ci
npm run build
```

4. 确认 `ffmpeg` 在 PATH，且 `DATA_USERS_ROOT` 目录可写

## 安装 unit

编辑两个 `.service` 文件中的 `User`、`WorkingDirectory`、`EnvironmentFile` 路径，然后：

```bash
sudo cp hello-story-api.service /etc/systemd/system/
sudo cp hello-story-video-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hello-story-api hello-story-video-worker
sudo systemctl start hello-story-api hello-story-video-worker
```

## 常用命令

```bash
sudo systemctl status hello-story-api hello-story-video-worker
sudo journalctl -u hello-story-video-worker -f
sudo systemctl restart hello-story-video-worker
```

## 注意

- **video-worker 只能 1 个实例**（文件队列无分布式锁；多实例可能重复认领）
- **一次只跑一条成片 pipeline** 是预期行为：其余任务在 `queued` 排队，无需为此多开 worker
- 说明全文：[backend/docs/video-worker.md](../../docs/video-worker.md)
- API 与 worker 必须看到**同一份** `DATA_USERS_ROOT`
