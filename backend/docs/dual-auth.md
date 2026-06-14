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
APPLE_BUNDLE_ID=com.hellostory.app
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

## iOS 原生：Sign in with Apple

工程已包含 capability 与 Capacitor 插件，Mac 上首次打开前执行：

```bash
cd frontend
npm run build:ios          # 或 build:ios + .env.ios.local
npx cap sync ios
cd ios/App && pod install
open App.xcworkspace       # 勿开 .xcodeproj
```

### 仓库内配置

| 文件 | 作用 |
|------|------|
| `frontend/ios/App/App/App.entitlements` | `com.apple.developer.applesignin` |
| `frontend/ios/App/App.xcodeproj` | `CODE_SIGN_ENTITLEMENTS` + Sign in with Apple capability |
| `frontend/ios/App/Podfile` | `CapacitorCommunityAppleSignIn`（`cap sync ios` 维护） |
| `frontend/src/lib/appleSignIn.ts` | 原生授权，`clientId` = `VITE_APPLE_BUNDLE_ID` 或 `com.hellostory.app` |

### Apple Developer（必做，否则真机签名失败）

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources) → **Identifiers** → App ID `com.hellostory.app`
2. 勾选 **Sign In with Apple** → Save
3. Xcode → Target **App** → **Signing & Capabilities**：Team 选对，确认出现 **Sign In with Apple**（与 entitlements 一致）
4. 生产构建：`APPLE_AUTH_DEV_MOCK=0`，后端 `APPLE_BUNDLE_ID=com.hellostory.app` 与 App ID 一致

### 常见问题

- **`AuthorizationError 1000`**：App ID 未开 Sign in with Apple，或 provisioning profile 未刷新（Xcode → Download Manual Profiles / 删 Derived Data 重签）
- **模拟器**：iOS 13+ 模拟器需登录 iCloud；或暂用 `APPLE_AUTH_DEV_MOCK=1` + `dev-apple-mock-token` 联调后端
- **插件未链入**：`npx cap sync ios` 后 `pod install`，Clean Build Folder
