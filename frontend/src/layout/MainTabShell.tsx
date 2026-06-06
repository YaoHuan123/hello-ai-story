import { AppPageShell } from "../components/AppPageShell";
import { AccountPage } from "../pages/AccountPage";
import { StoryWall } from "../components/StoryWall";
import type { MeResponse } from "../types/auth";
import type { HealthResponse } from "../api/health";
import "./MainTabShell.css";

export type MainTab = "story" | "me";

type Props = {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  me: MeResponse | null;
  onMeChange: (profile: MeResponse | null) => void;
  onLoggedOut: () => void;
  onOpenCreate: (interviewId: string) => void;
  onNeedLogin: () => void;
  storyRefreshKey: number;
  health: HealthResponse | null;
};

export function MainTabShell({
  activeTab,
  onTabChange,
  me,
  onMeChange,
  onLoggedOut,
  onOpenCreate,
  onNeedLogin,
  storyRefreshKey,
  health,
}: Props) {
  return (
    <AppPageShell>
      <div className="app-shell-body">
        {activeTab === "story" ? (
          <div className="story-tab-shell">
            <header className="story-tab-head">
              <h1 className="story-tab-title">故事</h1>
            </header>
            <div className="story-tab-scroll">
              <StoryWall
                onOpenCreate={onOpenCreate}
                onNeedLogin={onNeedLogin}
                refreshKey={storyRefreshKey}
              />
              <footer className="app-shell-footer">
                {health?.ok ? (
                  <span>
                    后端在线 · {new Date(health.timestamp).toLocaleString()}
                    {health.sms && <> · 短信 {health.sms.mode === "real" ? "真实" : "mock"}</>}
                  </span>
                ) : (
                  <span>后端状态未知</span>
                )}
              </footer>
            </div>
          </div>
        ) : (
          <div className="story-tab-shell">
            <header className="story-tab-head">
              <h1 className="story-tab-title">我的</h1>
            </header>
            <div className="me-tab-scroll">
              {me ? (
                <AccountPage me={me} onMeChange={onMeChange} onLoggedOut={onLoggedOut} />
              ) : (
                <p className="story-wall-msg">请先登录</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="app-shell-tabbar-outer">
        <nav className="app-shell-tabbar" role="tablist" aria-label="主栏目">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "story"}
            className={activeTab === "story" ? "app-shell-tab active" : "app-shell-tab"}
            onClick={() => onTabChange("story")}
          >
            故事
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "me"}
            className={activeTab === "me" ? "app-shell-tab active" : "app-shell-tab"}
            onClick={() => onTabChange("me")}
          >
            我的
          </button>
        </nav>
      </div>
    </AppPageShell>
  );
}
