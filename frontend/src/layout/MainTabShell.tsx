import { AppPageShell } from "../components/AppPageShell";
import { AccountPage } from "../pages/AccountPage";
import { ActivityTabPage } from "../pages/ActivityTabPage";
import { StoryWall } from "../components/StoryWall";
import { WatchTabPage } from "../pages/WatchTabPage";
import { IconFilm, IconSpark, IconStory, IconUser } from "../components/icons";
import { t } from "../i18n";
import type { MeResponse } from "../types/auth";
import type { HealthResponse } from "../api/health";
import "./MainTabShell.css";

export type MainTab = "story" | "activity" | "watch" | "me";

type Props = {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  me: MeResponse | null;
  onMeChange: (profile: MeResponse | null) => void;
  onLoggedOut: () => void;
  onOpenCreate: (interviewId: string) => void;
  onOpenCreatePlan: () => void;
  onOpenWatchVideo: (publishId: string) => void;
  onNeedLogin: () => void;
  storyRefreshKey: number;
  activityRefreshKey: number;
  activityNotice?: string | null;
  watchRefreshKey: number;
  health: HealthResponse | null;
};

export function MainTabShell({
  activeTab,
  onTabChange,
  me,
  onMeChange,
  onLoggedOut,
  onOpenCreate,
  onOpenCreatePlan,
  onOpenWatchVideo,
  onNeedLogin,
  storyRefreshKey,
  activityRefreshKey,
  activityNotice,
  watchRefreshKey,
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
        ) : activeTab === "activity" ? (
          <div className="story-tab-shell">
            <div className="story-tab-scroll">
              <ActivityTabPage
                refreshKey={activityRefreshKey}
                isActive={activeTab === "activity"}
                notice={activityNotice}
                onOpenCreatePlan={onOpenCreatePlan}
                onNeedLogin={onNeedLogin}
              />
            </div>
          </div>
        ) : activeTab === "watch" ? (
          <div className="story-tab-shell">
            <div className="story-tab-scroll">
              <WatchTabPage
                refreshKey={watchRefreshKey}
                onOpenVideo={onOpenWatchVideo}
                onNeedLogin={onNeedLogin}
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
                <p className="story-wall-msg">{t("tab.loginRequired")}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="app-shell-tabbar-outer">
        <nav className="app-shell-tabbar" role="tablist" aria-label={t("tab.mainAria")}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "story"}
            className={activeTab === "story" ? "app-shell-tab active" : "app-shell-tab"}
            onClick={() => onTabChange("story")}
          >
            <IconStory size={22} className="app-shell-tab__icon" />
            <span>{t("tab.story")}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "activity"}
            className={activeTab === "activity" ? "app-shell-tab active" : "app-shell-tab"}
            onClick={() => onTabChange("activity")}
          >
            <IconSpark size={22} className="app-shell-tab__icon" />
            <span>{t("tab.activity")}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "watch"}
            className={activeTab === "watch" ? "app-shell-tab active" : "app-shell-tab"}
            onClick={() => onTabChange("watch")}
          >
            <IconFilm size={22} className="app-shell-tab__icon" />
            <span>{t("tab.watch")}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "me"}
            className={activeTab === "me" ? "app-shell-tab active" : "app-shell-tab"}
            onClick={() => onTabChange("me")}
          >
            <IconUser size={22} className="app-shell-tab__icon" />
            <span>{t("tab.me")}</span>
          </button>
        </nav>
      </div>
    </AppPageShell>
  );
}
