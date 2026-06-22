import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { appleLogin, getMe, sendSms, smsLogin } from "./api/auth";
import { getHealth, type HealthResponse } from "./api/health";
import { listInterviews } from "./api/interviews";
import { AppPageShell } from "./components/AppPageShell";
import { MainTabShell, type MainTab } from "./layout/MainTabShell";
import "./layout/MainTabShell.css";
import { displayError, t } from "./i18n";
import { signInWithAppleNative } from "./lib/appleSignIn";
import { authTokenStore } from "./lib/authToken";
import { isQuizRewardsEnabled } from "./lib/features";
import { isIosNative } from "./lib/platform";
import { AppleLoginPage } from "./pages/AppleLoginPage";
import { CreateHomePage } from "./pages/CreateHomePage";
import { InterviewPage } from "./pages/InterviewPage";
import { LoginPage } from "./pages/LoginPage";
import { CampaignPlanCreatePage } from "./pages/CampaignPlanCreatePage";
import { CampaignPlanQuestionSelectPage } from "./pages/CampaignPlanQuestionSelectPage";
import { TextCreatePage } from "./pages/TextCreatePage";
import { VideoCreatePage } from "./pages/VideoCreatePage";
import { WatchVideoPage } from "./pages/WatchVideoPage";
import { WatchQuizPage } from "./pages/WatchQuizPage";
import type { AuthResult, MeResponse } from "./types/auth";

import type { CampaignPlanDraft } from "./types/campaign";

type Screen =
  | { kind: "shell"; tab: MainTab }
  | { kind: "create-home"; interviewId: string }
  | { kind: "interview"; interviewId: string }
  | { kind: "text-create"; interviewId: string }
  | { kind: "video-create"; interviewId: string }
  | { kind: "campaign-plan-create" }
  | { kind: "campaign-plan-questions" }
  | { kind: "watch-video"; publishId: string }
  | { kind: "watch-quiz"; publishId: string; videoTitle?: string | null };

function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "shell", tab: "story" });
  const [interviewTitles, setInterviewTitles] = useState<Record<string, string>>({});
  const [storyRefreshKey, setStoryRefreshKey] = useState(0);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [activityNotice, setActivityNotice] = useState<string | null>(null);
  const [watchRefreshKey, setWatchRefreshKey] = useState(0);
  const [campaignPlanDraft, setCampaignPlanDraft] = useState<CampaignPlanDraft>(() => ({
    endYear: String(new Date().getFullYear()),
    budget: "20000",
    selectedVideo: null,
    selectedQuestions: [],
  }));
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasToken = useMemo(() => Boolean(authTokenStore.get()), [authResult, me, screen]);
  const useAppleLogin = isIosNative();
  const quizRewards = isQuizRewardsEnabled();

  useEffect(() => {
    if (!quizRewards && screen.kind === "shell" && (screen.tab === "activity" || screen.tab === "watch")) {
      setScreen({ kind: "shell", tab: "story" });
    }
  }, [quizRewards, screen]);

  useEffect(() => {
    if (
      !quizRewards &&
      (screen.kind === "campaign-plan-create" ||
        screen.kind === "campaign-plan-questions" ||
        screen.kind === "watch-video" ||
        screen.kind === "watch-quiz")
    ) {
      setScreen({ kind: "shell", tab: "story" });
    }
  }, [quizRewards, screen]);

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
      setError(displayError(err));
    } finally {
      setLoading(false);
    }
  };

  const finishLogin = async (result: AuthResult) => {
    setAuthResult(result);
    const profile = await getMe();
    setMe(profile);
    setMessage(t("login.success"));
    setScreen({ kind: "shell", tab: "story" });
    setStoryRefreshKey((k) => k + 1);
  };

  const handleSendSms = () => {
    void runAuthAction(async () => {
      await sendSms(phone, "login");
      setMessage(health?.sms?.mode === "real" ? t("login.codeSentReal") : t("login.codeSentMock"));
    });
  };

  const handleSmsLogin = () => {
    void runAuthAction(async () => {
      const result = await smsLogin(phone, code);
      await finishLogin(result);
    });
  };

  const handleAppleLogin = () => {
    void runAuthAction(async () => {
      const { identityToken } = await signInWithAppleNative();
      const result = await appleLogin(identityToken);
      await finishLogin(result);
    });
  };

  const handleLoggedOut = () => {
    authTokenStore.clear();
    setAuthResult(null);
    setMe(null);
    setScreen({ kind: "shell", tab: "story" });
    setMessage(t("login.loggedOut"));
  };

  const goShell = (tab: MainTab = "story") => {
    setScreen({ kind: "shell", tab });
    setStoryRefreshKey((k) => k + 1);
  };

  const goCreateHome = (interviewId: string) => {
    setScreen({ kind: "create-home", interviewId });
  };

  const goCreateCampaignPlan = () => {
    setCampaignPlanDraft({
      endYear: String(new Date().getFullYear()),
      budget: "20000",
      selectedVideo: null,
      selectedQuestions: [],
    });
    setScreen({ kind: "campaign-plan-create" });
  };

  const patchCampaignPlanDraft = (patch: Partial<CampaignPlanDraft>) => {
    setCampaignPlanDraft((prev) => ({ ...prev, ...patch }));
  };

  if (!hasToken) {
    return (
      <AppPageShell>
        {useAppleLogin ? (
          <AppleLoginPage
            loading={loading}
            error={error}
            message={message}
            onSignIn={handleAppleLogin}
          />
        ) : (
          <LoginPage
            phone={phone}
            code={code}
            loading={loading}
            error={error}
            message={message}
            onPhoneChange={setPhone}
            onCodeChange={setCode}
            onSendSms={handleSendSms}
            onLogin={handleSmsLogin}
          />
        )}
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

  if (quizRewards && screen.kind === "watch-video") {
    return (
      <AppPageShell>
        <WatchVideoPage
          publishId={screen.publishId}
          onBack={() => setScreen({ kind: "shell", tab: "watch" })}
          onStartQuiz={() =>
            setScreen({
              kind: "watch-quiz",
              publishId: screen.publishId,
            })
          }
          onNeedLogin={handleLoggedOut}
        />
      </AppPageShell>
    );
  }

  if (quizRewards && screen.kind === "watch-quiz") {
    return (
      <AppPageShell>
        <WatchQuizPage
          publishId={screen.publishId}
          videoTitle={screen.videoTitle}
          onBack={() => setScreen({ kind: "watch-video", publishId: screen.publishId })}
          onNeedLogin={handleLoggedOut}
        />
      </AppPageShell>
    );
  }

  if (quizRewards && screen.kind === "campaign-plan-questions" && campaignPlanDraft.selectedVideo) {
    return (
      <AppPageShell>
        <CampaignPlanQuestionSelectPage
          video={campaignPlanDraft.selectedVideo}
          selectedQuestions={campaignPlanDraft.selectedQuestions}
          onBack={(questions) => {
            patchCampaignPlanDraft({ selectedQuestions: questions });
            setScreen({ kind: "campaign-plan-create" });
          }}
        />
      </AppPageShell>
    );
  }

  if (
    quizRewards &&
    (screen.kind === "campaign-plan-create" || screen.kind === "campaign-plan-questions")
  ) {
    return (
      <AppPageShell>
        <CampaignPlanCreatePage
          draft={campaignPlanDraft}
          onDraftChange={patchCampaignPlanDraft}
          onBack={() => setScreen({ kind: "shell", tab: "activity" })}
          onOpenQuestionSelect={() => setScreen({ kind: "campaign-plan-questions" })}
          onCreated={() => {
            setActivityRefreshKey((k) => k + 1);
            setWatchRefreshKey((k) => k + 1);
            setActivityNotice(t("activity.createSuccess"));
            setCampaignPlanDraft({
              endYear: String(new Date().getFullYear()),
              budget: "20000",
              selectedVideo: null,
              selectedQuestions: [],
            });
            setScreen({ kind: "shell", tab: "activity" });
          }}
        />
      </AppPageShell>
    );
  }

  return (
    <MainTabShell
      activeTab={screen.kind === "shell" ? screen.tab : "story"}
      onTabChange={(tab) => {
        setScreen({ kind: "shell", tab });
        if (tab === "activity") {
          setActivityRefreshKey((k) => k + 1);
        }
      }}
      me={me}
      onMeChange={setMe}
      onLoggedOut={handleLoggedOut}
      onOpenCreate={goCreateHome}
      onOpenCreatePlan={goCreateCampaignPlan}
      onOpenWatchVideo={(publishId) => setScreen({ kind: "watch-video", publishId })}
      onNeedLogin={handleLoggedOut}
      storyRefreshKey={storyRefreshKey}
      activityRefreshKey={activityRefreshKey}
      activityNotice={activityNotice}
      watchRefreshKey={watchRefreshKey}
      health={health}
    />
  );
}

export default App;
