import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { changePhone, deleteAccount, getMe, sendSms } from "../api/auth";
import { authTokenStore } from "../lib/authToken";
import type { HealthResponse } from "../api/health";
import type { MeResponse } from "../types/auth";
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

function formatMemberSince(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function avatarInitial(phone: string): string {
  const tail = phone.replace(/\D/g, "").slice(-2);
  return tail || "我";
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
    return <p className="me-banner me-banner--ok">处理中…</p>;
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
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMe = () => {
    void run(async () => {
      const profile = await getMe();
      onMeChange(profile);
      setMessage("资料已更新");
    });
  };

  const handleSendOldCode = () => {
    if (!me?.phone) return;
    void run(async () => {
      await sendSms(me.phone, "change_phone_old");
      setMessage("验证码已发送至当前手机号");
    });
  };

  const handleSendNewCode = () => {
    if (!newPhone.trim()) return;
    void run(async () => {
      await sendSms(newPhone.trim(), "change_phone_new");
      setMessage("验证码已发送至新手机号");
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
      setMessage(`换绑成功：${maskPhone(result.phone)}，请用新手机号重新登录`);
      setNewPhone("");
      setOldCode("");
      setNewCode("");
      onLoggedOut();
    });
  };

  const handleSendDeleteCode = () => {
    if (!me?.phone) return;
    void run(async () => {
      await sendSms(me.phone, "delete_account");
      setMessage("验证码已发送");
    });
  };

  const handleDeleteAccount = () => {
    if (!window.confirm("确定注销账号吗？注销后无法再用本手机号登录，本地故事数据将无法找回。")) {
      return;
    }
    void run(async () => {
      await deleteAccount(deleteCode.trim());
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
    return <p className="me-empty">请先登录后查看账户信息</p>;
  }

  if (screen === "phone") {
    return (
      <div className="me-page me-subpage">
        <button type="button" className="me-subpage__back" onClick={() => goScreen("home")}>
          <IconChevronLeft size={18} />
          我的
        </button>
        <h2 className="me-subpage__title">换绑手机号</h2>
        <p className="me-subpage__desc">需验证当前手机号与新手机号。换绑成功后需重新登录。</p>
        <Feedback loading={loading} error={error} message={message} />
        <div className="me-form-card">
          <label className="me-field">
            <span className="me-field__label">新手机号</span>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="请输入新手机号"
              inputMode="tel"
              autoComplete="tel"
              disabled={loading}
            />
          </label>
          <label className="me-field">
            <span className="me-field__label">当前手机号验证码</span>
            <div className="me-field-row">
              <input
                value={oldCode}
                onChange={(e) => setOldCode(e.target.value)}
                placeholder="6 位验证码"
                inputMode="numeric"
                disabled={loading}
              />
              <button type="button" className="hs-btn hs-btn--secondary" onClick={handleSendOldCode} disabled={loading}>
                获取
              </button>
            </div>
          </label>
          <label className="me-field">
            <span className="me-field__label">新手机号验证码</span>
            <div className="me-field-row">
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="6 位验证码"
                inputMode="numeric"
                disabled={loading}
              />
              <button
                type="button"
                className="hs-btn hs-btn--secondary"
                onClick={handleSendNewCode}
                disabled={loading || !newPhone.trim()}
              >
                获取
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
            确认换绑
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
          我的
        </button>
        <h2 className="me-subpage__title">注销账号</h2>
        <p className="me-subpage__desc">
          注销后无法使用本手机号登录。服务器上的故事与成片文件可能仍保留在磁盘，但与本账号解绑且无法通过应用访问。
        </p>
        <Feedback loading={loading} error={error} message={message} />
        <div className="me-form-card me-form-card--danger">
          <label className="me-field">
            <span className="me-field__label">短信验证码</span>
            <div className="me-field-row">
              <input
                value={deleteCode}
                onChange={(e) => setDeleteCode(e.target.value)}
                placeholder="请输入验证码"
                inputMode="numeric"
                disabled={loading}
              />
              <button type="button" className="hs-btn hs-btn--secondary" onClick={handleSendDeleteCode} disabled={loading}>
                获取
              </button>
            </div>
          </label>
          <button
            type="button"
            className="hs-btn hs-btn--primary"
            style={{ width: "100%", background: "var(--shell-danger)", boxShadow: "none" }}
            onClick={handleDeleteAccount}
            disabled={loading || !deleteCode.trim()}
          >
            确认注销
          </button>
        </div>
      </div>
    );
  }

  if (screen === "about") {
    const smsMode = health?.sms?.mode === "real" ? "真实短信" : health?.sms ? "开发 mock" : "—";
    return (
      <div className="me-page me-subpage">
        <button type="button" className="me-subpage__back" onClick={() => goScreen("home")}>
          <IconChevronLeft size={18} />
          我的
        </button>
        <h2 className="me-subpage__title">关于</h2>
        <div className="me-form-card">
          <ul className="me-about-list">
            <li>
              <span>应用</span>
              <span>Hello Story</span>
            </li>
            <li>
              <span>服务状态</span>
              <span>{health?.ok ? "在线" : "未知"}</span>
            </li>
            <li>
              <span>短信通道</span>
              <span>{smsMode}</span>
            </li>
            {health?.ok ? (
              <li>
                <span>最近检查</span>
                <span>{new Date(health.timestamp).toLocaleString()}</span>
              </li>
            ) : null}
          </ul>
        </div>
        <p className="me-footer-note">把访谈整理成故事，再生成属于你的传记视频。</p>
      </div>
    );
  }

  return (
    <div className="me-page">
      <header className="me-profile">
        <div className="me-profile__avatar" aria-hidden>
          {avatarInitial(me.phone)}
        </div>
        <div className="me-profile__info">
          <p className="me-profile__phone">{maskPhone(me.phone)}</p>
          <p className="me-profile__meta">加入于 {formatMemberSince(me.createdAt)}</p>
        </div>
      </header>

      <Feedback loading={loading} error={error} message={message} />

      <p className="me-group-label">账号</p>
      <div className="me-group">
        <MeListRow
          icon={<IconPhone size={18} />}
          label="手机号"
          value={maskPhone(me.phone)}
          showChevron={false}
          disabled
        />
        <MeListRow
          icon={<IconShield size={18} />}
          label="换绑手机号"
          hint="更换登录手机号"
          onClick={() => goScreen("phone")}
          disabled={loading}
        />
        <MeListRow
          icon={<IconRefresh size={18} />}
          iconTone="muted"
          label="刷新资料"
          onClick={refreshMe}
          disabled={loading}
          showChevron={false}
        />
      </div>

      <p className="me-group-label">其他</p>
      <div className="me-group">
        <MeListRow
          icon={<IconInfo size={18} />}
          iconTone="muted"
          label="关于 Hello Story"
          hint="服务状态与版本信息"
          onClick={() => goScreen("about")}
          disabled={loading}
        />
      </div>

      <p className="me-group-label">账号安全</p>
      <div className="me-group me-group--danger">
        <MeListRow
          icon={<IconTrash size={18} />}
          iconTone="danger"
          label="注销账号"
          hint="不可恢复，请谨慎操作"
          onClick={() => goScreen("delete")}
          disabled={loading}
        />
      </div>

      <div className="me-group">
        <button type="button" className="me-row me-row--logout" onClick={handleLogout} disabled={loading}>
          <span className="me-row--logout__inner">
            <IconLogOut size={18} />
            退出登录
          </span>
        </button>
      </div>

      <p className="me-footer-note">Hello Story · 传记创作</p>
    </div>
  );
}
