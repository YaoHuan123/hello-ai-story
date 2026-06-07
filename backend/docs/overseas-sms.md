# 海外短信（Twilio Verify）

全球登录、换绑、注销均使用 **手机号 + 短信验证码**。国内号码走 **阿里云 Dypnsapi**（`+86` / 11 位本地号），其他国家的号码走 **Twilio Verify**。

路由逻辑见 `backend/src/services/auth/routingSms.service.ts`：`861xxxxxxxxx` → 阿里云，其余 → Twilio。

## 环境变量

```env
# Twilio Console → Account Info
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx

# Verify → Services → 新建 Service → Service SID（以 VA 开头）
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxx

# 本地开发 mock，验证码固定 123456（与阿里云 mock 一致）
TWILIO_VERIFY_DEV_MOCK=1
```

生产环境须配齐上述三项，且**不要**设 `TWILIO_VERIFY_DEV_MOCK=1`。

## Twilio 控制台配置

1. 注册 [Twilio](https://www.twilio.com/) 并完成账号验证。
2. **Verify → Services → Create Service**（例如 `Hello Story OTP`）。
3. 复制 **Service SID** → `TWILIO_VERIFY_SERVICE_SID`。
4. 在 **Account → API keys & tokens** 取 Account SID 与 Auth Token。
5. 美国等市场需购买或试用 **SMS-capable** 号码（Verify 会自动选发送方；部分国家需额外合规登记）。

## 手机号格式（API / 前端）

用户可输入：

| 示例 | 规范化结果 |
|------|------------|
| `13800138000` | `8613800138000` |
| `+14155552671` | `14155552671` |
| `4155552671`（美国 10 位） | `14155552671` |

库内 `users.phone` 统一存 **E.164 数字（无 +）**。旧数据 11 位中国号仍可登录，成功后会迁移为 `86` 前缀。

## 自检

```bash
GET /api/health
```

响应 `sms` 字段示例：

```json
{
  "mode": "mock",
  "china": { "provider": "aliyun", "mode": "mock", ... },
  "overseas": { "provider": "twilio_verify", "mode": "mock", ... }
}
```

## 费用参考

Twilio Verify 按次计费，美国约 **$0.05/次**（以控制台为准）。

## 相关文档

- 国内短信：`backend/docs/aliyun-sms.md`
- 鉴权验收：`npm run test:auth:p1`
