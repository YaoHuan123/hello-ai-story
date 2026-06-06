import { useCallback, useEffect, useState } from "react";
import { getProductionReadiness } from "../api/production";
import { createInterview, deleteInterview, listInterviews } from "../api/interviews";
import type { InterviewMeta } from "../types/interview";
import type { ProductionReadiness } from "../types/production";
import { StoryCard } from "./StoryCard";
import "./StoryWall.css";

type Props = {
  onOpenCreate: (interviewId: string) => void;
  onNeedLogin: () => void;
  /** 子页返回故事墙时可触发刷新 */
  refreshKey?: number;
};

function readinessMetrics(r: ProductionReadiness | null | undefined) {
  if (!r) {
    return { label: "加载中…", pct: 0, pill: "—" };
  }
  const pct =
    r.sectionCount > 0 ? Math.min(100, Math.round((r.usableSectionCount / r.sectionCount) * 100)) : 0;
  const label = r.ready
    ? "可进入生产"
    : r.sectionCount > 0
      ? `${r.usableSectionCount}/${r.sectionCount} 小节`
      : "尚未开始";
  const pill = r.ready ? "可生产" : r.usableSectionCount > 0 ? "进行中" : "未开始";
  return { label, pct, pill, videoLine: r.message };
}

export function StoryWall({ onOpenCreate, onNeedLogin, refreshKey = 0 }: Props) {
  const [interviews, setInterviews] = useState<InterviewMeta[]>([]);
  const [readinessMap, setReadinessMap] = useState<Record<string, ProductionReadiness | null>>({});
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

      const entries = await Promise.all(
        res.interviews.map(async (item) => {
          try {
            const r = await getProductionReadiness(item.id);
            return [item.id, r] as const;
          } catch {
            return [item.id, null] as const;
          }
        }),
      );
      setReadinessMap(Object.fromEntries(entries));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载失败";
      if (msg.includes("未登录") || msg.includes("Unauthorized")) {
        onNeedLogin();
      }
      setError(msg);
      setInterviews([]);
      setReadinessMap({});
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
    <div>
      {error && <p className="story-wall-msg story-wall-msg--err">{error}</p>}
      {loading && <p className="story-wall-msg">加载中…</p>}

      <ul className="story-wall-list" aria-label="故事列表">
        {interviews.map((item) => {
          const metrics = readinessMetrics(readinessMap[item.id]);
          return (
            <li key={item.id} className="story-wall-list__item">
              <StoryCard
                title={item.title || "未命名故事"}
                textProgressLabel={metrics.label}
                textProgressPct={metrics.pct}
                statePill={metrics.pill}
                videoStatusLine={metrics.videoLine}
                onOpenCreate={() => onOpenCreate(item.id)}
                onDelete={() => void handleDelete(item)}
              />
            </li>
          );
        })}

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
                +
              </span>
              <span className="story-wall-card-newlabel">新故事</span>
              <span className="story-wall-card-newhint">点击开始创作</span>
            </button>
          )}
        </li>
      </ul>

      {!loading && interviews.length === 0 && !error && (
        <p className="story-wall-msg">还没有故事。点「+ 新故事」开始。</p>
      )}
    </div>
  );
}
