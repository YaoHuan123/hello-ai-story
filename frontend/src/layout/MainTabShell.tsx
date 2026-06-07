import { AppPageShell } from "../components/AppPageShell";
import { AccountPage } from "../pages/AccountPage";
import { StoryWall } from "../components/StoryWall";
import { IconStory, IconUser } from "../components/icons";
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
            <div className="story-tab-scroll">
              <StoryWall
                onOpenCreate={onOpenCreate}
                onNeedLogin={onNeedLogin}
                refreshKey={storyRefreshKey}
              />
            </div>
          </div>
        ) : (
          <div className="story-tab-shell">
            <div className="me-tab-scroll me-tab-scroll--profile">
              {me ? (
                <AccountPage
                  me={me}
                  onMeChange={onMeChange}
                  onLoggedOut={onLoggedOut}
                  health={health}
                />
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
            <IconStory size={22} className="app-shell-tab__icon" />
            <span>故事</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "me"}
            className={activeTab === "me" ? "app-shell-tab active" : "app-shell-tab"}
            onClick={() => onTabChange("me")}
          >
            <IconUser size={22} className="app-shell-tab__icon" />
            <span>我的</span>
          </button>
        </nav>
      </div>
    </AppPageShell>
  );
}
