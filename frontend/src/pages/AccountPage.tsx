import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { changePhone, deleteAccount, getMe, sendSms } from "../api/auth";
import { getWalletBalance, listWalletTransactions, mockRechargeWallet } from "../api/wallet";
import { authTokenStore } from "../lib/authToken";
import { signInWithAppleNative } from "../lib/appleSignIn";
import { isQuizRewardsEnabled } from "../lib/features";
import type { HealthResponse } from "../api/health";
import type { MeResponse } from "../types/auth";
import type { WalletTransaction } from "../types/wallet";
import { displayError, t } from "../i18n";
import { LegalLinks } from "../components/LegalLinks";
import {
  IconChevronLeft,
  IconChevronRight,
  IconInfo,
  IconLogOut,
  IconPhone,
  IconRefresh,
  IconShield,
  IconTrash,
  IconWallet,
} from "../components/icons";
import { getLegalUrls } from "../lib/legalUrls";
import { openExternalUrl } from "../lib/openExternalUrl";
import "./AccountPage.css";

type Props = {
  me: MeResponse | null;
  onMeChange: (profile: MeResponse | null) => void;
  onLoggedOut: () => void;
  health?: HealthResponse | null;
};

type MeScreen = "home" | "phone" | "delete" | "about" | "wallet" | "wallet-recharge" | "wallet-history";

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

function formatPoints(n: number): string {
  return n.toLocaleString();
}

function txTypeLabel(type: WalletTransaction["type"]): string {
  return t(`wallet.txType.${type}`);
}

function formatTxAmount(amount: number): string {
  const prefix = amount > 0 ? "+" : "";
  return `${prefix}${formatPoints(amount)}`;
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

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletUpdatedAt, setWalletUpdatedAt] = useState<string | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState("100");
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txNextCursor, setTxNextCursor] = useState<string | undefined>();

  const isPhoneUser = me?.loginMethod === "phone";
  const quizRewards = isQuizRewardsEnabled();

  useEffect(() => {
    if (
      !quizRewards &&
      (screen === "wallet" || screen === "wallet-recharge" || screen === "wallet-history")
    ) {
      setScreen("home");
    }
  }, [quizRewards, screen]);

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

  const refreshWalletBalance = useCallback(async () => {
    const bal = await getWalletBalance();
    setWalletBalance(bal.balance);
    setWalletUpdatedAt(bal.updatedAt);
  }, []);

  const loadTransactions = useCallback(async (append = false, cursor?: string) => {
    const page = await listWalletTransactions({
      limit: 30,
      cursor: append ? cursor : undefined,
    });
    setTransactions((prev) => (append ? [...prev, ...page.items] : page.items));
    setTxNextCursor(page.nextCursor);
  }, []);

  useEffect(() => {
    if (!quizRewards) return;
    if (screen !== "wallet" && screen !== "wallet-recharge" && screen !== "wallet-history") return;
    void refreshWalletBalance().catch(() => {
      setWalletBalance(null);
    });
  }, [screen, refreshWalletBalance, quizRewards]);

  useEffect(() => {
    if (!quizRewards) return;
    if (screen !== "wallet-history") return;
    void loadTransactions(false).catch(() => setTransactions([]));
  }, [screen, loadTransactions, quizRewards]);

  const handleMockRecharge = () => {
    const amount = Number.parseInt(rechargeAmount.trim(), 10);
    if (!Number.isInteger(amount) || amount <= 0) return;
    void run(async () => {
      const result = await mockRechargeWallet(amount);
      setWalletBalance(result.balance);
      setWalletUpdatedAt(result.updatedAt);
      setMessage(t("wallet.rechargeSuccess", { amount: formatPoints(amount) }));
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

  if (quizRewards && screen === "wallet") {
    return (
      <div className="me-page me-subpage">
        <button type="button" className="me-subpage__back" onClick={() => goScreen("home")}>
          <IconChevronLeft size={18} />
          {t("tab.me")}
        </button>
        <h2 className="me-subpage__title">{t("wallet.title")}</h2>
        <Feedback loading={loading} error={error} message={message} />
        <div className="me-form-card me-wallet-balance-card">
          <p className="me-wallet-balance-label">{t("wallet.balanceLabel")}</p>
          <p className="me-wallet-balance-value">{walletBalance !== null ? formatPoints(walletBalance) : t("common.emDash")}</p>
          {walletUpdatedAt ? (
            <p className="me-wallet-balance-hint">{t("wallet.updatedAt", { time: new Date(walletUpdatedAt).toLocaleString() })}</p>
          ) : null}
        </div>
        <div className="me-group">
          <MeListRow
            icon={<IconWallet size={18} />}
            label={t("wallet.recharge")}
            hint={t("wallet.rechargeHint")}
            onClick={() => goScreen("wallet-recharge")}
            disabled={loading}
          />
          <MeListRow
            icon={<IconRefresh size={18} />}
            iconTone="muted"
            label={t("wallet.history")}
            hint={t("wallet.historyHint")}
            onClick={() => goScreen("wallet-history")}
            disabled={loading}
          />
        </div>
      </div>
    );
  }

  if (quizRewards && screen === "wallet-recharge") {
    return (
      <div className="me-page me-subpage">
        <button type="button" className="me-subpage__back" onClick={() => goScreen("wallet")}>
          <IconChevronLeft size={18} />
          {t("wallet.title")}
        </button>
        <h2 className="me-subpage__title">{t("wallet.recharge")}</h2>
        <p className="me-subpage__desc">{t("wallet.rechargeDesc")}</p>
        <Feedback loading={loading} error={error} message={message} />
        <div className="me-form-card">
          <label className="me-field">
            <span className="me-field__label">{t("wallet.rechargeAmount")}</span>
            <input
              value={rechargeAmount}
              onChange={(e) => setRechargeAmount(e.target.value)}
              placeholder="100"
              inputMode="numeric"
              disabled={loading}
            />
          </label>
          <button
            type="button"
            className="hs-btn hs-btn--primary"
            style={{ width: "100%" }}
            onClick={handleMockRecharge}
            disabled={loading || !rechargeAmount.trim()}
          >
            {t("wallet.confirmRecharge")}
          </button>
        </div>
      </div>
    );
  }

  if (quizRewards && screen === "wallet-history") {
    return (
      <div className="me-page me-subpage">
        <button type="button" className="me-subpage__back" onClick={() => goScreen("wallet")}>
          <IconChevronLeft size={18} />
          {t("wallet.title")}
        </button>
        <h2 className="me-subpage__title">{t("wallet.history")}</h2>
        <Feedback loading={loading} error={error} message={message} />
        {transactions.length === 0 && !loading ? (
          <p className="me-empty">{t("wallet.historyEmpty")}</p>
        ) : (
          <ul className="me-wallet-tx-list">
            {transactions.map((tx) => (
              <li key={tx.id} className="me-wallet-tx-item">
                <div className="me-wallet-tx-item__main">
                  <span className="me-wallet-tx-item__type">{txTypeLabel(tx.type)}</span>
                  <span className={`me-wallet-tx-item__amount${tx.amount >= 0 ? " me-wallet-tx-item__amount--in" : ""}`}>
                    {formatTxAmount(tx.amount)}
                  </span>
                </div>
                <div className="me-wallet-tx-item__meta">
                  <span>{new Date(tx.createdAt).toLocaleString()}</span>
                  <span>{t("wallet.balanceAfter", { balance: formatPoints(tx.balanceAfter) })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {txNextCursor ? (
          <button
            type="button"
            className="hs-btn hs-btn--secondary"
            style={{ width: "100%", marginTop: 12 }}
            disabled={loading}
            onClick={() => void run(async () => loadTransactions(true, txNextCursor))}
          >
            {t("wallet.loadMore")}
          </button>
        ) : null}
      </div>
    );
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
        <p className="me-footer-note me-footer-note--legal">{t("legal.aiDisclaimer")}</p>
        <LegalLinks variant="block" />
      </div>
    );
  }

  return (
    <div className="me-page">
      <Feedback loading={loading} error={error} message={message} />

      <p className="me-group-label">{t("account.sectionAccount")}</p>
      <div className="me-group">
        {quizRewards ? (
          <MeListRow
            icon={<IconWallet size={18} />}
            label={t("wallet.title")}
            hint={t("wallet.entryHint")}
            onClick={() => goScreen("wallet")}
            disabled={loading}
          />
        ) : null}
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

      <p className="me-group-label">{t("legal.section")}</p>
      <div className="me-group">
        <MeListRow
          icon={<IconShield size={18} />}
          iconTone="muted"
          label={t("legal.privacy")}
          onClick={() => openExternalUrl(getLegalUrls().privacy)}
          disabled={loading}
        />
        <MeListRow
          icon={<IconShield size={18} />}
          iconTone="muted"
          label={t("legal.terms")}
          onClick={() => openExternalUrl(getLegalUrls().terms)}
          disabled={loading}
        />
        <MeListRow
          icon={<IconInfo size={18} />}
          iconTone="muted"
          label={t("legal.support")}
          onClick={() => openExternalUrl(getLegalUrls().support)}
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
