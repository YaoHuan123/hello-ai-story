# Backend 测试

与 `src/` 功能代码分离：

| 目录 | 内容 |
|------|------|
| `fixtures/` | 测试桩数据（`stubSections`、`luxunSections`） |
| `integration/topic/` | 选题模块集成测试（真实 LLM，`npm run test:topic:*`） |

运行前在 `backend/` 目录执行，需配置 `backend/.env` 中的 OpenAI 变量。
