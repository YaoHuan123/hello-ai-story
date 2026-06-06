import type { HealthResponse } from "../api/health";

type Props = {
  phone: string;
  code: string;
  loading: boolean;
  error: string | null;
  message: string | null;
  health: HealthResponse | null;
  onPhoneChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  onSendSms: () => void;
  onLogin: () => void;
};

export function LoginPage({
  phone,
  code,
  loading,
  error,
  message,
  health,
  onPhoneChange,
  onCodeChange,
  onSendSms,
  onLogin,
}: Props) {
  return (
    <div className="login-shell">
      <h1 className="login-shell-title">Hello Story</h1>
      <div className="login-card">
        <p style={{ margin: 0, fontSize: 14, color: "var(--shell-label-2)" }}>
          发送验证码 → 登录
          {health?.sms && (
            <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "var(--shell-label-3)" }}>
              短信模式：{health.sms.mode === "real" ? "真实阿里云" : "本地 mock（123456）"}
            </span>
          )}
        </p>
        <label>
          手机号
          <input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="例如 13800138000"
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
        <label>
          验证码
          <input
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="例如 123456"
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </label>
        <div className="login-actions">
          <button type="button" className="login-btn login-btn--secondary" onClick={onSendSms} disabled={loading || !phone}>
            发送验证码
          </button>
          <button type="button" className="login-btn" onClick={onLogin} disabled={loading || !phone || !code}>
            登录
          </button>
        </div>
        {loading && <p className="login-msg">处理中…</p>}
        {error && <p className="login-msg login-msg--err">{error}</p>}
        {message && <p className="login-msg login-msg--ok">{message}</p>}
      </div>
    </div>
  );
}
