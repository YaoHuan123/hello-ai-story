import { useCallback, useEffect, useState } from "react";
import {
  createTextTask,
  deleteTextTask,
  getProductionReadiness,
  getTextArticle,
  listTextTasks,
} from "../api/production";
import { AppPageShell } from "../components/AppPageShell";
import { SubpageHeader } from "../components/SubpageHeader";
import { ProductionFailureNotice } from "../components/production/ProductionFailureNotice";
import type { ProductionReadiness, TextTaskListItem } from "../types/production";
import "./production/ProductionSubpage.css";
import "./production/production-components.css";
import { defaultPolishMode } from "./production/productCopy";
import { useProductionRunner } from "./production/useProductionRunner";
import { formatDateTime, summarizeText } from "./production/utils";

type Props = {
  interviewId: string;
  interviewTitle?: string | null;
  onBack: () => void;
  onNeedLogin: () => void;
};

type ArticleDetail = {
  taskId: string;
  savedAt: string;
  article: string;
  sectionCount?: number;
};

export function TextCreatePage({ interviewId, interviewTitle, onBack, onNeedLogin }: Props) {
  const { loading, error, run } = useProductionRunner(onNeedLogin);
  const [textTasks, setTextTasks] = useState<TextTaskListItem[]>([]);
  const [readiness, setReadiness] = useState<ProductionReadiness | null>(null);
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const canProduce = readiness?.ready === true;
  const polishMode = defaultPolishMode();

  const refresh = useCallback(async () => {
    const [textRes, readinessRes] = await Promise.all([
      listTextTasks(interviewId),
      getProductionReadiness(interviewId),
    ]);
    setTextTasks(textRes.tasks);
    setReadiness(readinessRes);

    const successTasks = textRes.tasks.filter((t) => t.status === "success");
    const entries = await Promise.all(
      successTasks.map(async (task) => {
        try {
          const res = await getTextArticle(interviewId, task.taskId);
          return [task.taskId, summarizeText(res.article)] as const;
        } catch {
          return [task.taskId, ""] as const;
        }
      }),
    );
    setPreviews(Object.fromEntries(entries));
  }, [interviewId]);

  useEffect(() => {
    void run(refresh);
  }, [interviewId, run, refresh]);

  const handleCreateText = () => {
    if (!canProduce) return;
    void run(async () => {
      const result = await createTextTask(interviewId, { mode: polishMode });
      await refresh();
      const articleRes = await getTextArticle(interviewId, result.taskId);
      setDetail({
        taskId: result.taskId,
        savedAt: articleRes.savedAt ?? new Date().toISOString(),
        article: articleRes.article,
        sectionCount: articleRes.sectionCount,
      });
    });
  };

  const openDetail = (taskId: string) => {
    void run(async () => {
      const articleRes = await getTextArticle(interviewId, taskId);
      setDetail({
        taskId,
        savedAt: articleRes.savedAt ?? taskId,
        article: articleRes.article,
        sectionCount: articleRes.sectionCount,
      });
    });
  };

  const listedTasks = textTasks.filter((t) => t.status === "success" || t.status === "failed");
  const latestFailed = textTasks.find((t) => t.status === "failed");

  const handleDeleteText = (taskId: string, createdAt: string) => {
    if (!window.confirm(`确定删除 ${formatDateTime(createdAt)} 的故事文本吗？删除后无法恢复。`)) {
      return;
    }
    void run(async () => {
      await deleteTextTask(interviewId, taskId);
      if (detail?.taskId === taskId) setDetail(null);
      await refresh();
    });
  };

  return (
    <AppPageShell className="prod-subpage">
      <SubpageHeader title="创作文本" subtitle={interviewTitle} onBack={onBack} />

      <main className="prod-subpage-scroll">

        <div className="production-page">
          <section className="prod-card prod-card--cta" aria-label="生成故事文本">
            <button
              type="button"
              className="prod-action-bar__cta prod-action-bar__cta--block"
              onClick={handleCreateText}
              disabled={loading || !canProduce}
            >
              {loading ? "生成中…" : "生成故事文本"}
            </button>
          </section>

          {error ? <p className="prod-banner-err">{error}</p> : null}
          {latestFailed && !loading ? (
            <ProductionFailureNotice lastError={latestFailed.lastError} />
          ) : null}

          <section aria-label="故事文本列表">
            <h3 className="prod-section-heading">故事文本</h3>
            <ul className="prod-list">
              {listedTasks.map((task) => (
                <li key={task.taskId} className="prod-text-card-wrap">
                  <button
                    type="button"
                    className="prod-text-card"
                    onClick={() => (task.status === "success" ? openDetail(task.taskId) : undefined)}
                    disabled={task.status !== "success"}
                  >
                    <span className="prod-text-card__title">故事文本</span>
                    <span className="prod-text-card__meta">{formatDateTime(task.createdAt)}</span>
                    <span className="prod-text-card__summary">
                      {task.status === "failed"
                        ? "生成失败"
                        : previews[task.taskId] || "点击查看全文"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="prod-chip-btn prod-chip-btn--danger"
                    onClick={() => handleDeleteText(task.taskId, task.createdAt)}
                    disabled={loading}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>

          </section>
        </div>
      </main>

      {detail ? (
        <div
          className="prod-detail-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="text-detail-title"
          onClick={() => setDetail(null)}
        >
          <div className="prod-detail-sheet__panel" onClick={(e) => e.stopPropagation()}>
            <header className="prod-detail-sheet__header">
              <h4 id="text-detail-title" className="prod-detail-sheet__title">
                故事文本
              </h4>
              <div className="prod-detail-sheet__actions">
                <button
                  type="button"
                  className="prod-chip-btn prod-chip-btn--danger"
                  onClick={() => handleDeleteText(detail.taskId, detail.savedAt)}
                  disabled={loading}
                >
                  删除
                </button>
                <button type="button" className="prod-detail-sheet__close" onClick={() => setDetail(null)}>
                  关闭
                </button>
              </div>
            </header>
            <p className="prod-detail-sheet__meta">
              {formatDateTime(detail.savedAt)}
              {detail.sectionCount != null ? ` · ${detail.sectionCount} 个篇章` : ""}
              {` · ${detail.article.length} 字`}
            </p>
            <div className="prod-detail-sheet__body">{detail.article}</div>
          </div>
        </div>
      ) : null}
    </AppPageShell>
  );
}
