import { useCallback, useState } from "react";
import { changePhone, deleteAccount, getMe, sendSms } from "../api/auth";
import { authTokenStore } from "../lib/authToken";
import type { MeResponse } from "../types/auth";

type Props = {
  me: MeResponse | null;
  onMeChange: (profile: MeResponse | null) => void;
  onLoggedOut: () => void;
};

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function AccountPage({ me, onMeChange, onLoggedOut }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [newPhone, setNewPhone] = useState("");
  const [oldCode, setOldCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [deleteCode, setDeleteCode] = useState("");

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
      setMessage("资料已刷新");
    });
  };

  const handleSendOldCode = () => {
    if (!me?.phone) return;
    void run(async () => {
      await sendSms(me.phone, "change_phone_old");
      setMessage("旧手机验证码已发送");
    });
  };

  const handleSendNewCode = () => {
    if (!newPhone.trim()) return;
    void run(async () => {
      await sendSms(newPhone.trim(), "change_phone_new");
      setMessage("新手机验证码已发送");
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
      setMessage(`换绑成功：${maskPhone(result.phone)}。旧 token 已失效，请用新手机号重新登录。`);
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
      setMessage("删号验证码已发送");
    });
  };

  const handleDeleteAccount = () => {
    if (!window.confirm("确定删除账号吗？本地采访与生产数据将无法通过本账号恢复。")) {
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
    return (
      <div className="me-section">
        <p>请先登录后查看账户信息。</p>
      </div>
    );
  }

  return (
    <div className="me-page">
      <section className="me-section">
        <div className="me-section-head">
          <h2>账户</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="me-btn" onClick={refreshMe} disabled={loading}>
              刷新资料
            </button>
            <button type="button" className="me-btn" onClick={handleLogout} disabled={loading}>
              退出登录
            </button>
          </div>
        </div>
        <dl className="me-dl">
          <div>
            <dt>手机号</dt>
            <dd>{maskPhone(me.phone)}</dd>
          </div>
          <div>
            <dt>角色</dt>
            <dd>{me.role}</dd>
          </div>
          <div>
            <dt>注册时间</dt>
            <dd>{new Date(me.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>用户 ID</dt>
            <dd>
              <code>{me.userId}</code>
            </dd>
          </div>
        </dl>
      </section>

      <section className="me-section">
        <h3>换绑手机号</h3>
        <p>需分别验证旧号与新号。成功后当前登录会失效，请用新手机号重新登录。</p>
        <div className="me-form">
          <label>
            新手机号
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="13800138000"
              disabled={loading}
            />
          </label>
          <label>
            旧手机验证码
            <div className="me-form-row">
              <input value={oldCode} onChange={(e) => setOldCode(e.target.value)} disabled={loading} />
              <button type="button" className="me-btn" onClick={handleSendOldCode} disabled={loading}>
                发到旧号
              </button>
            </div>
          </label>
          <label>
            新手机验证码
            <div className="me-form-row">
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} disabled={loading} />
              <button
                type="button"
                className="me-btn"
                onClick={handleSendNewCode}
                disabled={loading || !newPhone.trim()}
              >
                发到新号
              </button>
            </div>
          </label>
          <button
            type="button"
            className="me-btn me-btn--primary"
            onClick={handleChangePhone}
            disabled={loading || !newPhone.trim() || !oldCode.trim() || !newCode.trim()}
          >
            确认换绑
          </button>
        </div>
      </section>

      <section className="me-section me-section--danger">
        <h3>删除账号</h3>
        <p>删除后无法通过本账号登录，工作区数据保留在服务器磁盘上但与本账号解绑。</p>
        <div className="me-form">
          <div className="me-form-row">
            <input
              value={deleteCode}
              onChange={(e) => setDeleteCode(e.target.value)}
              placeholder="验证码"
              disabled={loading}
            />
            <button type="button" className="me-btn" onClick={handleSendDeleteCode} disabled={loading}>
              发送验证码
            </button>
          </div>
          <button
            type="button"
            className="me-btn me-btn--danger"
            onClick={handleDeleteAccount}
            disabled={loading || !deleteCode.trim()}
          >
            删除账号
          </button>
        </div>
      </section>

      {loading && <p className="me-msg">处理中…</p>}
      {error && <p className="me-msg me-msg--err">{error}</p>}
      {message && <p className="me-msg me-msg--ok">{message}</p>}
    </div>
  );
}
