# 双通道登录

正式客户端：**Android**（国内 +86 短信）、**iOS**（Sign in with Apple，国内+海外）。**Web** 仅开发测试，同样走 +86 短信 mock。

## 登录入口

| 端 | API | 说明 |
|----|-----|------|
| Android / Web | `POST /api/auth/sms/send`、`POST /api/auth/sms/login` | 仅中国大陆 +86 |
| iOS | `POST /api/auth/apple/login` | body: `{ "identityToken": "..." }` |

登录成功后统一返回 JWT，业务 API 只认 `userId` + `token_version`。

## 账户操作

| 操作 | phone 用户 | apple 用户 |
|------|------------|------------|
| `GET /api/auth/me` | 返回 `loginMethod`, `phone` | 返回 `loginMethod`, `appleEmail?` |
| `PATCH /api/auth/phone` | 支持 | **403** |
| `DELETE /api/auth/me` | `{ "code": "123456" }` | `{ "identityToken": "..." }` |

## 环境变量

```env
# 短信（Android + Web 测试）— 详见 aliyun-sms.md
ALIYUN_ACCESS_KEY_ID=...
ALIYUN_DYPNSAPI_DEV_MOCK=1   # 本地 mock，验证码 123456

# iOS Apple
APPLE_BUNDLE_ID=io.github.com.YaoHuan123.hello-ai-story
APPLE_AUTH_DEV_MOCK=1        # 本地 mock token: dev-apple-mock-token
```

## 开发 mock

| 场景 | 值 |
|------|-----|
| 短信验证码 | `123456` |
| Apple identityToken | `dev-apple-mock-token` |

## 数据模型

`users` 表：`phone`（可空）、`apple_sub`（可空）、`login_method`（`phone` \| `apple`）、`apple_email`（可选）。

首版不做手机号与 Apple 账号合并。
