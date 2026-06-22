import { LegalLinks } from "../components/LegalLinks";
import { t } from "../i18n";

type Props = {
  loading: boolean;
  error: string | null;
  message: string | null;
  onSignIn: () => void;
};

export function AppleLoginPage({ loading, error, message, onSignIn }: Props) {
  return (
    <div className="login-shell">
      <div className="login-hero">
        <h1 className="login-shell-title">{t("common.appName")}</h1>
      </div>

      <div className="login-card">
        <h2 className="login-card__heading">{t("login.appleHeading")}</h2>
        <p className="login-card__hint">{t("login.appleHint")}</p>
        <div className="login-actions">
          <button
            type="button"
            className="hs-btn hs-btn--primary login-actions__main"
            onClick={onSignIn}
            disabled={loading}
          >
            {t("login.appleSubmit")}
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
