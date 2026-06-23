import { useCallback, useEffect, useState } from "react";
import { fetchAdminUsage, type AdminUsageResponse, type AdminUserUsage } from "../api/admin";
import { getMe } from "../api/auth";
import { sendSms, smsLogin } from "../api/auth";
import { getHealth } from "../api/health";
import { LoginPage } from "./LoginPage";
import { displayError, t } from "../i18n";
import { authTokenStore } from "../lib/authToken";
import type { MeResponse } from "../types/auth";
import "../styles/admin-usage.css";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function videoSummary(v: AdminUsageResponse["summary"]["videos"]): string {
  const parts = [`${v.total} total`];
  if (v.success) parts.push(`${v.success} ok`);
  if (v.failed) parts.push(`${v.failed} failed`);
  if (v.running) parts.push(`${v.running} running`);
  if (v.queued + v.pending) parts.push(`${v.queued + v.pending} queued`);
  return parts.join(" · ");
}

function UserRow({ user }: { user: AdminUserUsage }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-user">
      <button type="button" className="admin-user__head" onClick={() => setOpen((v) => !v)}>
        <span className="admin-user__id" title={user.userId}>
          {user.userIdShort}
        </span>
        <span className="admin-user__meta">{formatTime(user.createdAt)}</span>
        <span className="admin-user__counts">
          {user.interviewCount} stories · {user.answerCount} answers · {user.videos.total} videos
        </span>
        <span className="admin-user__toggle">{open ? "−" : "+"}</span>
      </button>
      {open && user.interviews.length > 0 ? (
        <table className="admin-table admin-table--nested">
          <thead>
            <tr>
              <th>Story</th>
              <th>Created</th>
              <th>Status</th>
              <th>Answers</th>
              <th>Videos</th>
            </tr>
          </thead>
          <tbody>
            {user.interviews.map((row) => (
              <tr key={row.interviewId}>
                <td title={row.interviewId}>{row.interviewIdShort}</td>
                <td>{formatTime(row.createdAt)}</td>
                <td>{row.interviewStatus ?? "—"}</td>
                <td>{row.answerCount}</td>
                <td>{videoSummary(row.videos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {open && user.interviews.length === 0 ? (
        <p className="admin-empty">No stories yet.</p>
      ) : null}
    </div>
  );
}

export function AdminUsagePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [usage, setUsage] = useState<AdminUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loginMsg, setLoginMsg] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsage(await fetchAdminUsage());
    } catch (err) {
      setError(displayError(err));
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authTokenStore.get()) return;
    void getMe()
      .then(setMe)
      .catch(() => {
        authTokenStore.clear();
        setMe(null);
      });
  }, []);

  useEffect(() => {
    if (me?.role !== "admin") return;
    void loadUsage();
  }, [me, loadUsage]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setLoginMsg(null);
    try {
      await smsLogin(phone, code);
      const profile = await getMe();
      setMe(profile);
      if (profile.role !== "admin") {
        setError("This account is not an admin.");
        authTokenStore.clear();
        setMe(null);
        return;
      }
      setLoginMsg("Signed in.");
    } catch (err) {
      setError(displayError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendSms = async () => {
    setLoading(true);
    setError(null);
    try {
      const health = await getHealth();
      await sendSms(phone, "login");
      setLoginMsg(health?.sms?.mode === "real" ? t("login.codeSentReal") : t("login.codeSentMock"));
    } catch (err) {
      setError(displayError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    authTokenStore.clear();
    setMe(null);
    setUsage(null);
  };

  if (!me) {
    return (
      <div className="admin-shell">
        <header className="admin-header">
          <h1>Hello Story Admin</h1>
          <p className="admin-sub">Usage statistics (counts only)</p>
        </header>
        <LoginPage
          phone={phone}
          code={code}
          loading={loading}
          error={error}
          message={loginMsg}
          onPhoneChange={setPhone}
          onCodeChange={setCode}
          onSendSms={() => void handleSendSms()}
          onLogin={() => void handleLogin()}
        />
      </div>
    );
  }

  if (me.role !== "admin") {
    return (
      <div className="admin-shell admin-shell--center">
        <p>Admin access required.</p>
        <button type="button" className="admin-btn" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header admin-header--row">
        <div>
          <h1>Hello Story Admin</h1>
          <p className="admin-sub">
            Signed in as <code>{me.userId.slice(0, 8)}</code>
            {usage ? ` · updated ${formatTime(usage.generatedAt)}` : ""}
          </p>
        </div>
        <div className="admin-header__actions">
          <button type="button" className="admin-btn" onClick={() => void loadUsage()} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="admin-btn" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {error ? <div className="admin-error">{error}</div> : null}
      {loading && !usage ? <p className="admin-loading">Loading…</p> : null}

      {usage ? (
        <>
          <section className="admin-cards">
            <article className="admin-card">
              <h2>Users</h2>
              <p className="admin-card__num">{usage.summary.userCount}</p>
            </article>
            <article className="admin-card">
              <h2>Stories</h2>
              <p className="admin-card__num">{usage.summary.interviewCount}</p>
            </article>
            <article className="admin-card">
              <h2>Answers</h2>
              <p className="admin-card__num">{usage.summary.answerCount}</p>
            </article>
            <article className="admin-card">
              <h2>Videos</h2>
              <p className="admin-card__num">{usage.summary.videos.total}</p>
              <p className="admin-card__sub">{videoSummary(usage.summary.videos)}</p>
            </article>
          </section>

          <section className="admin-users">
            <h2 className="admin-section-title">Users</h2>
            {usage.users.map((user) => (
              <UserRow key={user.userId} user={user} />
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
