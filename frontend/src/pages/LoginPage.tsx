import { LegalLinks } from "../components/LegalLinks";
import { t } from "../i18n";

type Props = {
  phone: string;
  code: string;
  loading: boolean;
  error: string | null;
  message: string | null;
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
  onPhoneChange,
  onCodeChange,
  onSendSms,
  onLogin,
}: Props) {
  return (
    <div className="login-shell">
      <div className="login-hero">
        <h1 className="login-shell-title">{t("common.appName")}</h1>
      </div>

      <div className="login-card">
        <h2 className="login-card__heading">{t("login.heading")}</h2>
        <label className="login-field">
          <span className="login-field__label">{t("login.phoneLabel")}</span>
          <input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder={t("login.phonePlaceholder")}
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
        <label className="login-field">
          <span className="login-field__label">{t("login.codeLabel")}</span>
          <input
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder={t("login.codePlaceholder")}
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
            {t("login.sendCode")}
          </button>
          <button
            type="button"
            className="hs-btn hs-btn--primary login-actions__main"
            onClick={onLogin}
            disabled={loading || !phone || !code}
          >
            {t("login.submit")}
          </button>
        </div>
        {loading && <p className="login-msg">{t("common.processing")}</p>}
        {error && <p className="login-msg login-msg--err">{error}</p>}
        {message && <p className="login-msg login-msg--ok">{message}</p>}
        <p className="login-legal-notice">{t("login.legalNotice")}</p>
        <LegalLinks />
      </div>
    </div>
  );
}
