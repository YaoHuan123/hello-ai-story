import type { HealthResponse } from "../api/health";
import { IconSpark, IconStory } from "../components/icons";

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
      <div className="login-hero">
        <div className="login-hero__mark" aria-hidden>
          <IconStory size={28} />
        </div>
        <h1 className="login-shell-title">Hello Story</h1>
        <p className="login-hero__tagline">把访谈变成属于你的故事视频</p>
        <p className="login-hero__steps">
          <IconSpark size={14} /> 聊天采集 · 整理成文 · 一键成片
        </p>
      </div>

      <div className="login-card">
        <h2 className="login-card__heading">手机号登录</h2>
        {health?.sms && (
          <p className="login-card__hint">
            短信模式：{health.sms.mode === "real" ? "真实发送" : "开发 mock（验证码 123456）"}
          </p>
        )}
        <label className="login-field">
          <span className="login-field__label">手机号</span>
          <input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="例如 13800138000"
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
        <label className="login-field">
          <span className="login-field__label">验证码</span>
          <input
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="6 位数字"
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </label>
        <div className="login-actions">
          <button
            type="button"
            className="hs-btn hs-btn--secondary"
            onClick={onSendSms}
            disabled={loading || !phone}
          >
            发送验证码
          </button>
          <button
            type="button"
            className="hs-btn hs-btn--primary login-actions__main"
            onClick={onLogin}
            disabled={loading || !phone || !code}
          >
            进入故事
          </button>
        </div>
        {loading && <p className="login-msg">处理中…</p>}
        {error && <p className="login-msg login-msg--err">{error}</p>}
        {message && <p className="login-msg login-msg--ok">{message}</p>}
      </div>
    </div>
  );
}
