import { useMemo, useState } from "react";
import "./App.css";
import { getMe, sendSms, smsLogin } from "./api/auth";
import { authTokenStore } from "./lib/authToken";
import { InterviewPage } from "./pages/InterviewPage";
import type { AuthResult, MeResponse } from "./types/auth";

type Tab = "auth" | "interview";

function App() {
  const [tab, setTab] = useState<Tab>("auth");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasToken = useMemo(() => Boolean(authTokenStore.get()), [authResult, tab]);

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
      setMessage("登录成功");
      setTab("interview");
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
    setTab("auth");
    setMessage("已清除本地 token");
  };

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <h1>Hello Story2</h1>
      <nav style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button type="button" onClick={() => setTab("auth")} disabled={tab === "auth"}>
          登录
        </button>
        <button
          type="button"
          onClick={() => setTab("interview")}
          disabled={!hasToken || tab === "interview"}
        >
          访谈
        </button>
      </nav>

      {tab === "auth" && (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>发送验证码 → 登录 → 可选查看 /api/auth/me</p>
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
              发送验证码
            </button>
            <button type="button" onClick={handleLogin} disabled={loading || !phone || !code}>
              登录
            </button>
            <button type="button" onClick={handleGetMe} disabled={loading || !hasToken}>
              获取我的信息
            </button>
            <button type="button" onClick={handleLogout} disabled={loading || !hasToken}>
              退出
            </button>
          </div>
          {authResult && (
            <pre style={{ margin: 0, background: "#f7f7f7", padding: 12, borderRadius: 8, fontSize: 12 }}>
              {JSON.stringify(authResult, null, 2)}
            </pre>
          )}
          {me && (
            <pre style={{ margin: 0, background: "#f7f7f7", padding: 12, borderRadius: 8, fontSize: 12 }}>
              {JSON.stringify(me, null, 2)}
            </pre>
          )}
        </div>
      )}

      {tab === "interview" && hasToken && (
        <InterviewPage onNeedLogin={() => setTab("auth")} />
      )}

      {tab === "interview" && !hasToken && (
        <p>请先登录后再进入访谈。</p>
      )}

      {loading && tab === "auth" && <p>处理中...</p>}
      {error && tab === "auth" && <p style={{ color: "red" }}>错误：{error}</p>}
      {message && tab === "auth" && <p style={{ color: "green" }}>{message}</p>}
    </div>
  );
}

export default App;
