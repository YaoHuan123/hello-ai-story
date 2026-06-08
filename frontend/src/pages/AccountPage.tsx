import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { changePhone, deleteAccount, getMe, sendSms } from "../api/auth";
import { authTokenStore } from "../lib/authToken";
import { signInWithAppleNative } from "../lib/appleSignIn";
import type { HealthResponse } from "../api/health";
import type { MeResponse } from "../types/auth";
import { displayError, t } from "../i18n";
import {
  IconChevronLeft,
  IconChevronRight,
  IconInfo,
  IconLogOut,
  IconPhone,
  IconRefresh,
  IconShield,
  IconTrash,
} from "../components/icons";
import "./AccountPage.css";

type Props = {
  me: MeResponse | null;
  onMeChange: (profile: MeResponse | null) => void;
  onLoggedOut: () => void;
  health?: HealthResponse | null;
};

type MeScreen = "home" | "phone" | "delete" | "about";

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function accountLabel(me: MeResponse): string {
  if (me.loginMethod === "apple") {
    return me.appleEmail || t("account.appleId");
  }
  return me.phone ? maskPhone(me.phone) : t("common.emDash");
}

function MeListRow({
  icon,
  iconTone = "brand",
  label,
  hint,
  value,
  onClick,
  disabled,
  showChevron = true,
}: {
  icon: ReactNode;
  iconTone?: "brand" | "muted" | "danger";
  label: string;
  hint?: string;
  value?: string;
  onClick?: () => void;
  disabled?: boolean;
  showChevron?: boolean;
}) {
  return (
    <button type="button" className="me-row" onClick={onClick} disabled={disabled}>
      <span className={`me-row__icon-wrap me-row__icon-wrap--${iconTone}`}>{icon}</span>
      <span className="me-row__body">
        <span className="me-row__label">{label}</span>
        {hint ? <span className="me-row__hint">{hint}</span> : null}
      </span>
      {value ? <span className="me-row__value">{value}</span> : null}
      {showChevron ? <IconChevronRight size={18} className="me-row__chevron" /> : null}
    </button>
  );
}

function Feedback({ loading, error, message }: { loading: boolean; error: string | null; message: string | null }) {
  if (loading) {
    return <p className="me-banner me-banner--ok">{t("common.processing")}</p>;
  }
  if (error) {
    return <p className="me-banner me-banner--err">{error}</p>;
  }
  if (message) {
    return <p className="me-banner me-banner--ok">{message}</p>;
  }
  return null;
}

export function AccountPage({ me, onMeChange, onLoggedOut, health }: Props) {
  const [screen, setScreen] = useState<MeScreen>("home");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [newPhone, setNewPhone] = useState("");
  const [oldCode, setOldCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [deleteCode, setDeleteCode] = useState("");

  const isPhoneUser = me?.loginMethod === "phone";

  const clearFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const goScreen = (next: MeScreen) => {
    clearFeedback();
    setScreen(next);
  };

  const run = useCallback(async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(displayError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMe = () => {
    void run(async () => {
      const profile = await getMe();
      onMeChange(profile);
      setMessage(t("account.profileUpdated"));
    });
  };

  const handleSendOldCode = () => {
    if (!me?.phone) return;
    void run(async () => {
      await sendSms(me.phone!, "change_phone_old");
      setMessage(t("account.codeSentCurrent"));
    });
  };

  const handleSendNewCode = () => {
    if (!newPhone.trim()) return;
    void run(async () => {
      await sendSms(newPhone.trim(), "change_phone_new");
      setMessage(t("account.codeSentNew"));
    });
  };

  const handleChangePhone = () => {
    void run(async () => {
      const result = await changePhone({
        newPhone: newPhone.trim(),
        newCode: newCode.trim(),
        oldCode: oldCode.trim(),
      });
      authTokenStore.clear();
      onMeChange(null);
      setMessage(t("account.changeSuccess", { phone: maskPhone(result.phone) }));
      setNewPhone("");
      setOldCode("");
      setNewCode("");
      onLoggedOut();
    });
  };

  const handleSendDeleteCode = () => {
    if (!me?.phone) return;
    void run(async () => {
      await sendSms(me.phone!, "delete_account");
      setMessage(t("account.codeSent"));
    });
  };

  const handleDeleteAccount = () => {
    if (!window.confirm(t("account.deleteConfirm"))) {
      return;
    }
    void run(async () => {
      if (me?.loginMethod === "apple") {
        const { identityToken } = await signInWithAppleNative();
        await deleteAccount({ identityToken });
      } else {
        await deleteAccount({ code: deleteCode.trim() });
      }
      authTokenStore.clear();
      onMeChange(null);
      setDeleteCode("");
      onLoggedOut();
    });
  };

  const handleLogout = () => {
    authTokenStore.clear();
    onMeChange(null);
    onLoggedOut();
  };

  if (!me) {
    return <p className="me-empty">{t("account.loginRequired")}</p>;
  }

  if (screen === "phone" && isPhoneUser) {
    return (
      <div className="me-page me-subpage">
        <button type="button" className="me-subpage__back" onClick={() => goScreen("home")}>
          <IconChevronLeft size={18} />
          {t("tab.me")}
        </button>
        <h2 className="me-subpage__title">{t("account.changePhoneTitle")}</h2>
        <p className="me-subpage__desc">{t("account.changePhoneDesc")}</p>
        <Feedback loading={loading} error={error} message={message} />
        <div className="me-form-card">
          <label className="me-field">
            <span className="me-field__label">{t("account.newPhone")}</span>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder={t("login.phonePlaceholder")}
              inputMode="tel"
              autoComplete="tel"
              disabled={loading}
            />
          </label>
          <label className="me-field">
            <span className="me-field__label">{t("account.oldCode")}</span>
            <div className="me-field-row">
              <input
                value={oldCode}
                onChange={(e) => setOldCode(e.target.value)}
                placeholder={t("account.codePlaceholder6")}
                inputMode="numeric"
                disabled={loading}
              />
              <button type="button" className="hs-btn hs-btn--secondary" onClick={handleSendOldCode} disabled={loading}>
                {t("common.getCode")}
              </button>
            </div>
          </label>
          <label className="me-field">
            <span className="me-field__label">{t("account.newCode")}</span>
            <div className="me-field-row">
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder={t("account.codePlaceholder6")}
                inputMode="numeric"
                disabled={loading}
              />
              <button
                type="button"
                className="hs-btn hs-btn--secondary"
                onClick={handleSendNewCode}
                disabled={loading || !newPhone.trim()}
              >
                {t("common.getCode")}
              </button>
            </div>
          </label>
          <button
            type="button"
            className="hs-btn hs-btn--primary"
            style={{ width: "100%" }}
            onClick={handleChangePhone}
            disabled={loading || !newPhone.trim() || !oldCode.trim() || !newCode.trim()}
          >
            {t("account.confirmChangePhone")}
          </button>
        </div>
      </div>
    );
  }

  if (screen === "delete") {
    return (
      <div className="me-page me-subpage">
        <button type="button" className="me-subpage__back" onClick={() => goScreen("home")}>
          <IconChevronLeft size={18} />
          {t("tab.me")}
        </button>
        <h2 className="me-subpage__title">{t("account.deleteTitle")}</h2>
        <p className="me-subpage__desc">
          {isPhoneUser ? t("account.deleteDesc") : t("account.deleteDescApple")}
        </p>
        <Feedback loading={loading} error={error} message={message} />
        <div className="me-form-card me-form-card--danger">
          {isPhoneUser ? (
            <label className="me-field">
              <span className="me-field__label">{t("account.smsCode")}</span>
              <div className="me-field-row">
                <input
                  value={deleteCode}
                  onChange={(e) => setDeleteCode(e.target.value)}
                  placeholder={t("account.codePlaceholder")}
                  inputMode="numeric"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="hs-btn hs-btn--secondary"
                  onClick={handleSendDeleteCode}
                  disabled={loading}
                >
                  {t("common.getCode")}
                </button>
              </div>
            </label>
          ) : null}
          <button
            type="button"
            className="hs-btn hs-btn--primary"
            style={{ width: "100%", background: "var(--shell-danger)", boxShadow: "none" }}
            onClick={handleDeleteAccount}
            disabled={loading || (isPhoneUser && !deleteCode.trim())}
          >
            {isPhoneUser ? t("account.confirmDelete") : t("account.confirmDeleteApple")}
          </button>
        </div>
      </div>
    );
  }

  if (screen === "about") {
    const smsMode =
      health?.sms?.mode === "real"
        ? t("account.smsReal")
        : health?.sms
          ? t("account.smsDevMock")
          : t("common.emDash");
    return (
      <div className="me-page me-subpage">
        <button type="button" className="me-subpage__back" onClick={() => goScreen("home")}>
          <IconChevronLeft size={18} />
          {t("tab.me")}
        </button>
        <h2 className="me-subpage__title">{t("account.aboutTitle")}</h2>
        <div className="me-form-card">
          <ul className="me-about-list">
            <li>
              <span>{t("account.aboutApp")}</span>
              <span>{t("common.appName")}</span>
            </li>
            <li>
              <span>{t("account.aboutStatus")}</span>
              <span>{health?.ok ? t("common.online") : t("common.unknown")}</span>
            </li>
            <li>
              <span>{t("account.aboutSms")}</span>
              <span>{smsMode}</span>
            </li>
            {health?.ok ? (
              <li>
                <span>{t("account.aboutChecked")}</span>
                <span>{new Date(health.timestamp).toLocaleString()}</span>
              </li>
            ) : null}
          </ul>
        </div>
        <p className="me-footer-note">{t("account.aboutFooter")}</p>
      </div>
    );
  }

  return (
    <div className="me-page">
      <Feedback loading={loading} error={error} message={message} />

      <p className="me-group-label">{t("account.sectionAccount")}</p>
      <div className="me-group">
        <MeListRow
          icon={<IconPhone size={18} />}
          label={isPhoneUser ? t("account.phone") : t("account.appleId")}
          value={accountLabel(me)}
          showChevron={false}
          disabled
        />
        {isPhoneUser ? (
          <MeListRow
            icon={<IconShield size={18} />}
            label={t("account.changePhone")}
            hint={t("account.changePhoneHint")}
            onClick={() => goScreen("phone")}
            disabled={loading}
          />
        ) : null}
        <MeListRow
          icon={<IconRefresh size={18} />}
          iconTone="muted"
          label={t("account.refreshProfile")}
          onClick={refreshMe}
          disabled={loading}
          showChevron={false}
        />
      </div>

      <p className="me-group-label">{t("account.sectionOther")}</p>
      <div className="me-group">
        <MeListRow
          icon={<IconInfo size={18} />}
          iconTone="muted"
          label={t("account.about")}
          hint={t("account.aboutHint")}
          onClick={() => goScreen("about")}
          disabled={loading}
        />
      </div>

      <p className="me-group-label">{t("account.sectionSecurity")}</p>
      <div className="me-group me-group--danger">
        <MeListRow
          icon={<IconTrash size={18} />}
          iconTone="danger"
          label={t("account.deleteAccount")}
          hint={t("account.deleteAccountHint")}
          onClick={() => goScreen("delete")}
          disabled={loading}
        />
      </div>

      <div className="me-group">
        <button type="button" className="me-row me-row--logout" onClick={handleLogout} disabled={loading}>
          <span className="me-row--logout__inner">
            <IconLogOut size={18} />
            {t("account.logout")}
          </span>
        </button>
      </div>
    </div>
  );
}
