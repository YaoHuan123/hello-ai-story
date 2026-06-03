import { useMemo, useState } from "react";
import "./App.css";
import { getMe, sendSms, smsLogin } from "./api/auth";
import { authTokenStore } from "./lib/authToken";
import type { AuthResult, MeResponse } from "./types/auth";

function App() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasToken = useMemo(() => Boolean(authTokenStore.get()), [authResult]);

  const runAction = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleSendSms = () => {
    void runAction(async () => {
      await sendSms(phone, "login");
      setMessage("验证码已发送（若在 mock 模式，固定验证码是 123456）");
    });
  };

  const handleLogin = () => {
    void runAction(async () => {
      const result = await smsLogin(phone, code);
      setAuthResult(result);
      setMessage("登录成功，token 已写入 localStorage");
    });
  };

  const handleGetMe = () => {
    void runAction(async () => {
      const profile = await getMe();
      setMe(profile);
      setMessage("获取用户信息成功");
    });
  };

  const handleLogout = () => {
    authTokenStore.clear();
    setAuthResult(null);
    setMe(null);
    setMessage("已清除本地 token");
  };

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <h1>用户登录联调页</h1>
      <p>流程：发送验证码 - 登录 - 获取 /api/auth/me</p>

      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, display: "grid", gap: 12 }}>
        <label>
          手机号：
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="例如 13800138000"
            style={{ marginLeft: 8, width: 240 }}
          />
        </label>
        <label>
          验证码：
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="例如 123456"
            style={{ marginLeft: 8, width: 240 }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={handleSendSms} disabled={loading || !phone}>
            1) 发送验证码
          </button>
          <button type="button" onClick={handleLogin} disabled={loading || !phone || !code}>
            2) 验证码登录
          </button>
          <button type="button" onClick={handleGetMe} disabled={loading || !hasToken}>
            3) 获取我的信息
          </button>
          <button type="button" onClick={handleLogout} disabled={loading || !hasToken}>
            清除 token
          </button>
        </div>

        {loading && <p>处理中...</p>}
        {error && <p style={{ color: "red", margin: 0 }}>错误：{error}</p>}
        {message && <p style={{ color: "green", margin: 0 }}>{message}</p>}

        {authResult && (
          <div style={{ background: "#f7f7f7", borderRadius: 8, padding: 12 }}>
            <strong>登录返回：</strong>
            <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{JSON.stringify(authResult, null, 2)}</pre>
          </div>
        )}

        {me && (
          <div style={{ background: "#f7f7f7", borderRadius: 8, padding: 12 }}>
            <strong>/api/auth/me：</strong>
            <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{JSON.stringify(me, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
