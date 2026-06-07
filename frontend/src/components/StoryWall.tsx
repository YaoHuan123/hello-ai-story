import { useCallback, useEffect, useState } from "react";
import { listVideoTasks } from "../api/production";
import { createInterview, deleteInterview, listInterviews } from "../api/interviews";
import { displayError, isUnauthorizedError, t } from "../i18n";
import type { InterviewMeta } from "../types/interview";
import { StoryCard } from "./StoryCard";
import { IconPlus, IconStory } from "./icons";
import "./StoryWall.css";

type Props = {
  onOpenCreate: (interviewId: string) => void;
  onNeedLogin: () => void;
  /** 子页返回故事墙时可触发刷新 */
  refreshKey?: number;
};

export function StoryWall({ onOpenCreate, onNeedLogin, refreshKey = 0 }: Props) {
  const [interviews, setInterviews] = useState<InterviewMeta[]>([]);
  const [coverTaskMap, setCoverTaskMap] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listInterviews();
      setInterviews(res.interviews);
      setCoverTaskMap({});

      void Promise.all(
        res.interviews.map(async (item) => {
          try {
            const { tasks } = await listVideoTasks(item.id);
            const latest = tasks
              .filter((task) => task.status === "success")
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
            return [item.id, latest?.taskId ?? null] as const;
          } catch {
            return [item.id, null] as const;
          }
        }),
      ).then((entries) => {
        setCoverTaskMap(Object.fromEntries(entries));
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        onNeedLogin();
      }
      setError(displayError(err) || t("storyWall.loadFailed"));
      setInterviews([]);
      setCoverTaskMap({});
    } finally {
      setLoading(false);
    }
  }, [onNeedLogin]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const meta = await createInterview(newTitle.trim() || undefined);
      setNewTitle("");
      setShowNewForm(false);
      await refresh();
      onOpenCreate(meta.id);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        onNeedLogin();
      }
      setError(displayError(err) || t("storyWall.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (item: InterviewMeta) => {
    const label = item.title || item.id.slice(0, 8);
    if (!window.confirm(t("storyWall.deleteConfirm", { label }))) {
      return;
    }
    setError(null);
    try {
      await deleteInterview(item.id);
      await refresh();
    } catch (err) {
      setError(displayError(err) || t("storyWall.deleteFailed"));
    }
  };

  return (
    <div className="story-wall">
      {error && <p className="story-wall-msg story-wall-msg--err">{error}</p>}
      {loading && <p className="story-wall-msg">{t("common.loading")}</p>}

      {!loading && interviews.length === 0 && !error ? (
        <div className="hs-empty story-wall-empty">
          <div className="hs-empty__icon">
            <IconStory size={28} />
          </div>
          <h2 className="hs-empty__title">{t("storyWall.emptyTitle")}</h2>
          <p className="hs-empty__desc">{t("storyWall.emptyDesc")}</p>
        </div>
      ) : null}

      <ul className="story-wall-list" aria-label={t("storyWall.listAria")}>
        {interviews.map((item) => (
          <li key={item.id} className="story-wall-list__item">
            <StoryCard
              title={item.title || t("storyWall.untitled")}
              interviewId={item.id}
              coverTaskId={coverTaskMap[item.id] ?? null}
              onOpenCreate={() => onOpenCreate(item.id)}
              onDelete={() => void handleDelete(item)}
            />
          </li>
        ))}

        <li className="story-wall-list__item">
          {showNewForm || creating ? (
            <div className="story-wall-card--new" style={{ cursor: "default" }}>
              <span className="story-wall-card-newlabel">{t("storyWall.newStory")}</span>
              <div className="story-wall-new-form">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t("storyWall.titleOptional")}
                  disabled={creating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreate();
                  }}
                />
                <button
                  type="button"
                  className="story-wall-new-submit"
                  onClick={() => void handleCreate()}
                  disabled={creating}
                >
                  {creating ? t("storyWall.creating") : t("storyWall.createAndStart")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="story-wall-card--new"
              onClick={() => setShowNewForm(true)}
              aria-label={t("storyWall.newStoryAria")}
            >
              <span className="story-wall-card-plus" aria-hidden>
                <IconPlus size={22} />
              </span>
              <span className="story-wall-card-newlabel">{t("storyWall.newStory")}</span>
              <span className="story-wall-card-newhint">{t("storyWall.tapToCreate")}</span>
            </button>
          )}
        </li>
      </ul>
    </div>
  );
}
