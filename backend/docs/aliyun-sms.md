# 阿里云短信（号码认证 / Dypnsapi）

> 实现：`backend/src/services/auth/aliyunSms.service.ts`（`SendSmsVerifyCode` + `CheckSmsVerifyCode`）  
> 本地默认 **mock**（固定验证码 `123456`）；配齐密钥且关闭 mock 后走**真实短信**。

## 模式判定

| 条件 | 结果 |
|------|------|
| `ALIYUN_DYPNSAPI_DEV_MOCK=1`（或 `ALIYUN_SMS_DEV_MOCK=1`） | **强制 mock**，忽略已填密钥 |
| 未强制 mock，且下列环境变量**全部非空** | **real** |
| 未强制 mock，但有缺失，且 `NODE_ENV` ≠ `production` | **mock**（开发兜底） |
| 未强制 mock，但有缺失，且 `NODE_ENV=production` | **real**（发送时 `MISSING_ENV:*` 报错） |

自检：`GET /api/health` → `sms.mode` 为 `real` | `mock`。

## 环境变量

复制 `backend/.env.example`，填写：

```env
ALIYUN_ACCESS_KEY_ID=你的AccessKeyId
ALIYUN_ACCESS_KEY_SECRET=你的AccessKeySecret
ALIYUN_SMS_SIGN_NAME=已审核短信签名
ALIYUN_SMS_TEMPLATE_CODE_LOGIN=登录模板CODE
ALIYUN_SMS_TEMPLATE_CODE_CHANGE_PHONE_OLD=换绑-旧号模板CODE
ALIYUN_SMS_TEMPLATE_CODE_CHANGE_PHONE_NEW=换绑-新号模板CODE
ALIYUN_SMS_TEMPLATE_CODE_DELETE_ACCOUNT=删号模板CODE

# 真实短信：删除或设为 0
# ALIYUN_DYPNSAPI_DEV_MOCK=1
```

别名（与上表二选一即可）：`ALIYUN_DYPNSAPI_SIGN_NAME`、`ALIYUN_DYPNSAPI_TEMPLATE_CODE_*`。

可选：

- `ALIYUN_DYPNSAPI_SCHEME_NAME` — 号码认证方案名（控制台已创建时填写）

## 阿里云控制台准备

1. 开通 **[号码认证服务](https://help.aliyun.com/zh/pnvs/)**（Dypnsapi），地域接口为 `cn-qingdao`（代码已写死）。
2. RAM 用户创建 **AccessKey**，授予短信/号码认证相关权限（勿用主账号密钥上生产）。
3. **短信签名**审核通过 → 填入 `ALIYUN_SMS_SIGN_NAME`。
4. 申请 **4 个验证码模板**（与代码 `scene` 一一对应）：
   - `login` — 登录
   - `change_phone_old` — 换绑验证旧手机
   - `change_phone_new` — 换绑验证新手机
   - `delete_account` — 删除账号

模板变量需兼容本服务下发参数（`templateParam`）：

```json
{ "code": "##code##", "min": "5" }
```

- `##code##` 为阿里云占位符，由平台填入 6 位验证码（勿改成固定数字）。
- `min` 为有效分钟数（代码按 300 秒 ≈ 5 分钟下发）。

5. （可选）创建 **方案**（Scheme），将 `ALIYUN_DYPNSAPI_SCHEME_NAME` 设为方案名称。

## 启用真实短信（开发机）

```bash
# backend/.env
# 1. 填齐上述 ALIYUN_* 
# 2. 关闭 mock
ALIYUN_DYPNSAPI_DEV_MOCK=0

cd backend && npm run dev:backend
curl http://localhost:3001/api/health
# 期望 sms.mode === "real"
```

前端登录页在 `sms.mode=real` 时不再提示 `123456`。

## 生产部署

```env
NODE_ENV=production
# 全部 ALIYUN_* 必填
# 切勿设置 ALIYUN_DYPNSAPI_DEV_MOCK=1
```

缺配置时发送验证码返回 `AUTH_PROVIDER_NOT_CONFIGURED`（HTTP 500）。

## 限流与错误

- 同号/同 IP 频率：`smsRateLimit.service.ts`（超限 `SMS_RATE_LIMITED` 429）。
- 验证码错误：`SMS_VERIFY_FAILED` 400。
- 阿里云业务失败：`AUTH_PROVIDER_ERROR` 502。

集成测试 `npm run test:auth:p1` **固定** `ALIYUN_DYPNSAPI_DEV_MOCK=1`，不消耗短信额度。

## 相关

- Auth 路由：`backend/src/routes/auth.routes.ts`
- P1 验收：`backend/test/integration/auth/auth-p1.integration.ts`
- 根目录 [`README.md`](../../README.md)
