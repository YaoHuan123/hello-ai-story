# Admin 用量统计（Web）

只读管理页：**仅计数**，不展示故事标题、问答正文或视频内容。

## 访问

Web 部署后：

```
https://hellotita.top/hello-story/admin
```

本地开发（先起 backend + `npm run dev:web`）：

```
http://localhost:5173/hello-story/admin
```

iOS App **无** admin 入口。

## 授权

1. 在 SQLite 将目标用户设为 admin（`userId` 为 16 位短码，见登录后 `/api/auth/me` 或磁盘目录名）：

```bash
cd backend
sqlite3 ./data/app.db "UPDATE users SET role = 'admin' WHERE id = 'YOUR_USER_ID';"
```

2. 用该账号在 admin 页登录（与主站相同 SMS / Apple 登录流程；Web 一般为 SMS）。

非 admin 账号会收到 403。

## API

```
GET /api/admin/usage
Authorization: Bearer <token>
```

响应含全站汇总与各用户的 story / answer / video 计数；用户与 story 仅暴露 `userIdShort` / `interviewIdShort`（默认前 8 字符），完整 id 在 `title` 属性中便于复制。

## 计数规则

| 指标 | 来源 |
|------|------|
| 故事数 | `采访/{interviewId}/meta.json` 目录数 |
| 对话数 | `已答/sections.json` 中有效 qa 条数（不读文本内容） |
| 视频数 | `成片/{taskId}/meta.json`，按 `status` 分组 |

## 测试

```bash
cd backend
npm run build && npm run test:admin:usage
```
