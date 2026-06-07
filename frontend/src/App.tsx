import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { getMe, sendSms, smsLogin } from "./api/auth";
import { getHealth, type HealthResponse } from "./api/health";
import { listInterviews } from "./api/interviews";
import { AppPageShell } from "./components/AppPageShell";
import { MainTabShell, type MainTab } from "./layout/MainTabShell";
import "./layout/MainTabShell.css";
import { authTokenStore } from "./lib/authToken";
import { CreateHomePage } from "./pages/CreateHomePage";
import { InterviewPage } from "./pages/InterviewPage";
import { LoginPage } from "./pages/LoginPage";
import { TextCreatePage } from "./pages/TextCreatePage";
import { VideoCreatePage } from "./pages/VideoCreatePage";
import type { AuthResult, MeResponse } from "./types/auth";

type Screen =
  | { kind: "shell"; tab: MainTab }
  | { kind: "create-home"; interviewId: string }
  | { kind: "interview"; interviewId: string }
  | { kind: "text-create"; interviewId: string }
  | { kind: "video-create"; interviewId: string };

function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "shell", tab: "story" });
  const [interviewTitles, setInterviewTitles] = useState<Record<string, string>>({});
  const [storyRefreshKey, setStoryRefreshKey] = useState(0);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasToken = useMemo(() => Boolean(authTokenStore.get()), [authResult, me, screen]);

  useEffect(() => {
    void getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (!authTokenStore.get()) return;
    void getMe()
      .then((profile) => setMe(profile))
      .catch(() => {
        authTokenStore.clear();
        setMe(null);
        setAuthResult(null);
      });
  }, []);

  const refreshInterviewTitles = async () => {
    try {
      const res = await listInterviews();
      const map: Record<string, string> = {};
      for (const item of res.interviews) {
        if (item.title?.trim()) map[item.id] = item.title.trim();
      }
      setInterviewTitles(map);
    } catch {
      /* 标题仅用于展示 */
    }
  };

  useEffect(() => {
    if (!hasToken) return;
    void refreshInterviewTitles();
  }, [hasToken, storyRefreshKey]);

  const runAuthAction = async (action: () => Promise<void>) => {
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
    void runAuthAction(async () => {
      await sendSms(phone, "login");
      setMessage(
        health?.sms?.mode === "real"
          ? "验证码已发送，请查收短信"
          : "验证码已发送（当前为 mock 模式，固定验证码 123456）",
      );
    });
  };

  const handleLogin = () => {
    void runAuthAction(async () => {
      const result = await smsLogin(phone, code);
      setAuthResult(result);
      const profile = await getMe();
      setMe(profile);
      setMessage("登录成功");
      setScreen({ kind: "shell", tab: "story" });
      setStoryRefreshKey((k) => k + 1);
    });
  };

  const handleLoggedOut = () => {
    setAuthResult(null);
    setMe(null);
    setScreen({ kind: "shell", tab: "me" });
    setMessage("已退出登录");
  };

  const goShell = (tab: MainTab = "story") => {
    setScreen({ kind: "shell", tab });
    setStoryRefreshKey((k) => k + 1);
  };

  const goCreateHome = (interviewId: string) => {
    setScreen({ kind: "create-home", interviewId });
  };

  const loginBlock = !hasToken ? (
    <LoginPage
      phone={phone}
      code={code}
      loading={loading}
      error={error}
      message={message}
      health={health}
      onPhoneChange={setPhone}
      onCodeChange={setCode}
      onSendSms={handleSendSms}
      onLogin={handleLogin}
    />
  ) : null;

  if (!hasToken) {
    return (
      <AppPageShell>
        {loginBlock}
      </AppPageShell>
    );
  }

  if (screen.kind === "create-home") {
    const title = interviewTitles[screen.interviewId];
    return (
      <CreateHomePage
        interviewTitle={title}
        onBack={() => goShell("story")}
        onInterviewChat={() => setScreen({ kind: "interview", interviewId: screen.interviewId })}
        onTextCreate={() =>
          setScreen({ kind: "text-create", interviewId: screen.interviewId })
        }
        onVideoCreate={() =>
          setScreen({ kind: "video-create", interviewId: screen.interviewId })
        }
      />
    );
  }

  if (screen.kind === "interview") {
    const title = interviewTitles[screen.interviewId];
    return (
      <AppPageShell className="iv-subpage-shell">
        <InterviewPage
          interviewId={screen.interviewId}
          interviewTitle={title}
          onBack={() => goCreateHome(screen.interviewId)}
          onNeedLogin={handleLoggedOut}
        />
      </AppPageShell>
    );
  }

  if (screen.kind === "text-create") {
    const title = interviewTitles[screen.interviewId];
    return (
      <TextCreatePage
        interviewId={screen.interviewId}
        interviewTitle={title}
        onBack={() => goCreateHome(screen.interviewId)}
        onNeedLogin={handleLoggedOut}
      />
    );
  }

  if (screen.kind === "video-create") {
    const title = interviewTitles[screen.interviewId];
    return (
      <VideoCreatePage
        interviewId={screen.interviewId}
        interviewTitle={title}
        onBack={() => goCreateHome(screen.interviewId)}
        onNeedLogin={handleLoggedOut}
      />
    );
  }

  return (
    <MainTabShell
      activeTab={screen.tab}
      onTabChange={(tab) => setScreen({ kind: "shell", tab })}
      me={me}
      onMeChange={setMe}
      onLoggedOut={handleLoggedOut}
      onOpenCreate={goCreateHome}
      onNeedLogin={handleLoggedOut}
      storyRefreshKey={storyRefreshKey}
      health={health}
    />
  );
}

export default App;
