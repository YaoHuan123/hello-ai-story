import { useCallback, useEffect, useState } from "react";
import { listVideoTasks } from "../api/production";
import { createInterview, deleteInterview, listInterviews } from "../api/interviews";
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
              .filter((t) => t.status === "success")
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
      const msg = err instanceof Error ? err.message : "加载失败";
      if (msg.includes("未登录") || msg.includes("Unauthorized")) {
        onNeedLogin();
      }
      setError(msg);
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
      const msg = err instanceof Error ? err.message : "创建失败";
      if (msg.includes("未登录") || msg.includes("Unauthorized")) {
        onNeedLogin();
      }
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (item: InterviewMeta) => {
    const label = item.title || item.id.slice(0, 8);
    if (!window.confirm(`确定删除「${label}」吗？删除后答题记录和生产产物都无法恢复。`)) {
      return;
    }
    setError(null);
    try {
      await deleteInterview(item.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <div className="story-wall">
      {error && <p className="story-wall-msg story-wall-msg--err">{error}</p>}
      {loading && <p className="story-wall-msg">加载中…</p>}

      {!loading && interviews.length === 0 && !error ? (
        <div className="hs-empty story-wall-empty">
          <div className="hs-empty__icon">
            <IconStory size={28} />
          </div>
          <h2 className="hs-empty__title">写下第一个故事</h2>
          <p className="hs-empty__desc">从一次轻松访谈开始，我们会帮你整理成故事文本，再生成传记视频。</p>
        </div>
      ) : null}

      <ul className="story-wall-list" aria-label="故事列表">
        {interviews.map((item) => (
          <li key={item.id} className="story-wall-list__item">
            <StoryCard
              title={item.title || "未命名故事"}
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
              <span className="story-wall-card-newlabel">新故事</span>
              <div className="story-wall-new-form">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="标题（可选）"
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
                  {creating ? "创建中…" : "创建并开始访谈"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="story-wall-card--new"
              onClick={() => setShowNewForm(true)}
              aria-label="新建故事"
            >
              <span className="story-wall-card-plus" aria-hidden>
                <IconPlus size={22} />
              </span>
              <span className="story-wall-card-newlabel">新故事</span>
              <span className="story-wall-card-newhint">点击开始创作</span>
            </button>
          )}
        </li>
      </ul>
    </div>
  );
}
