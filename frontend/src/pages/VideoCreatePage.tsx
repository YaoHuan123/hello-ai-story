import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteVideoTask,
  fetchVideoPrimaryBlob,
  getProductionReadiness,
  getVideoTaskArtifacts,
  getVideoTaskProgress,
  listVideoStyles,
  listVideoTasks,
  retryVideoTask,
  scheduleBiographyVideo,
  scheduleStudioVideo,
} from "../api/production";
import { AppPageShell } from "../components/AppPageShell";
import { VideoPreviewModal } from "../components/VideoPreviewModal";
import { VideoTaskCover } from "../components/VideoTaskCover";
import { SubpageHeader } from "../components/SubpageHeader";
import { PipelineProgress } from "../components/production/PipelineProgress";
import { ProductionFailureNotice } from "../components/production/ProductionFailureNotice";
import { VideoStylePicker } from "../components/production/VideoStylePicker";
import type {
  ProductionReadiness,
  VideoStylesCatalog,
  VideoTaskListItem,
  VideoTaskProgress,
} from "../types/production";
import {
  DEFAULT_BIOGRAPHY_TTS_VOICE,
  DEFAULT_STUDIO_GUEST_VOICE,
  DEFAULT_STUDIO_HOST_VOICE,
} from "../constants/ttsVoices";
import "./production/ProductionSubpage.css";
import "./production/production-components.css";
import { defaultPolishMode, videoTaskStatusLabel } from "./production/productCopy";
import { useProductionRunner } from "./production/useProductionRunner";
import { formatDateTime, isVideoActive } from "./production/utils";

type Props = {
  interviewId: string;
  interviewTitle?: string | null;
  onBack: () => void;
  onNeedLogin: () => void;
};

function modeLabel(mode: VideoTaskListItem["productionMode"]): string {
  return mode === "interview_studio" ? "对话访谈片" : "传记纪录片";
}

function coverBadgeClass(status: VideoTaskListItem["status"]): string {
  const base = "prod-video-cover__badge";
  if (status === "success") return `${base} prod-video-cover__badge--success`;
  if (status === "failed") return `${base} prod-video-cover__badge--failed`;
  if (status === "running" || status === "queued" || status === "pending") {
    return `${base} prod-video-cover__badge--running`;
  }
  return base;
}

export function VideoCreatePage({ interviewId, interviewTitle, onBack, onNeedLogin }: Props) {
  const { loading, error, run } = useProductionRunner(onNeedLogin);
  const [videoTasks, setVideoTasks] = useState<VideoTaskListItem[]>([]);
  const [readiness, setReadiness] = useState<ProductionReadiness | null>(null);
  const [styleCatalog, setStyleCatalog] = useState<VideoStylesCatalog | null>(null);

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [videoDetail, setVideoDetail] = useState<VideoTaskProgress | null>(null);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [styleId, setStyleId] = useState("");
  const [textTaskId, setTextTaskId] = useState("");
  const polishMode = defaultPolishMode();
  const [videoKind, setVideoKind] = useState<"biography" | "studio">("biography");

  const storyOptions = readiness?.storyTextTasks ?? [];
  const canProduce =
    readiness?.ready === true &&
    storyOptions.length > 0 &&
    storyOptions.some((t) => t.taskId === textTaskId);

  const refreshLists = useCallback(async () => {
    const [videoRes, readinessRes] = await Promise.all([
      listVideoTasks(interviewId),
      getProductionReadiness(interviewId),
    ]);
    setVideoTasks(videoRes.tasks);
    setReadiness(readinessRes);
  }, [interviewId]);

  useEffect(() => {
    void listVideoStyles()
      .then((catalog) => {
        setStyleCatalog(catalog);
        setStyleId((prev) => prev || catalog.selectedStyleId || catalog.styles[0]?.id || "");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void run(refreshLists);
  }, [interviewId, run, refreshLists]);

  useEffect(() => {
    const tasks = readiness?.storyTextTasks ?? [];
    if (tasks.length === 0) {
      setTextTaskId("");
      return;
    }
    setTextTaskId((prev) => {
      if (prev && tasks.some((t) => t.taskId === prev)) return prev;
      return readiness?.latestStoryTextTaskId ?? tasks[0]!.taskId;
    });
  }, [readiness?.storyTextTasks, readiness?.latestStoryTextTaskId]);

  const hasActiveVideo = useMemo(
    () => videoTasks.some((t) => isVideoActive(t.status)),
    [videoTasks],
  );

  useEffect(() => {
    if (!hasActiveVideo) return;
    const timer = window.setInterval(() => {
      void refreshLists().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveVideo, refreshLists]);

  useEffect(() => {
    if (!expandedTaskId) {
      setVideoDetail(null);
      return;
    }
    let cancelled = false;
    void getVideoTaskProgress(interviewId, expandedTaskId)
      .then((detail) => {
        if (!cancelled) setVideoDetail(detail);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [interviewId, expandedTaskId]);

  useEffect(() => {
    if (!previewTaskId) {
      setPreviewLoading(false);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setPreviewLoading(true);
    void getVideoTaskArtifacts(interviewId, previewTaskId)
      .then((artifacts) => {
        if (cancelled || !artifacts.primaryVideo.available) return null;
        return fetchVideoPrimaryBlob(interviewId, previewTaskId);
      })
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          return;
        }
        createdUrl = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [interviewId, previewTaskId]);

  const openPreview = (taskId: string) => {
    setPreviewTaskId(taskId);
  };

  const closePreview = () => {
    setPreviewTaskId(null);
  };

  const handleScheduleVideo = () => {
    if (!canProduce) return;
    void run(async () => {
      const scheduled =
        videoKind === "biography"
          ? await scheduleBiographyVideo(interviewId, {
              ttsVoice: DEFAULT_BIOGRAPHY_TTS_VOICE,
              styleId: styleId || undefined,
              textTaskId,
              polishMode,
            })
          : await scheduleStudioVideo(interviewId, {
              hostVoice: DEFAULT_STUDIO_HOST_VOICE,
              guestVoice: DEFAULT_STUDIO_GUEST_VOICE,
              textTaskId,
              polishMode,
              qaGranularity: "hybrid",
            });
      setExpandedTaskId(scheduled.taskId);
      await refreshLists();
    });
  };

  const handleRetryVideo = (taskId: string) => {
    void run(async () => {
      await retryVideoTask(interviewId, taskId);
      setExpandedTaskId(taskId);
      await refreshLists();
    });
  };

  const handleDeleteVideo = (task: VideoTaskListItem) => {
    if (isVideoActive(task.status)) return;
    if (!window.confirm(`确定删除 ${formatDateTime(task.createdAt)} 的视频吗？删除后无法恢复。`)) {
      return;
    }
    void run(async () => {
      await deleteVideoTask(interviewId, task.taskId);
      if (expandedTaskId === task.taskId) setExpandedTaskId(null);
      await refreshLists();
    });
  };

  const toggleExpanded = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  };

  return (
    <AppPageShell className="prod-subpage">
      <SubpageHeader title="创作视频" subtitle={interviewTitle} onBack={onBack} />

      <main className="prod-subpage-scroll">

        <div className="production-page">
          <section className="prod-card" aria-label="生成视频">
            <h2 className="prod-card__title">生成视频</h2>
            <div className="prod-form-card">
              <div className="prod-segment" role="tablist" aria-label="视频类型">
                <button
                  type="button"
                  role="tab"
                  aria-selected={videoKind === "biography"}
                  className={`prod-segment__btn ${videoKind === "biography" ? "prod-segment__btn--active" : ""}`}
                  onClick={() => setVideoKind("biography")}
                  disabled={loading}
                >
                  传记纪录片
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={videoKind === "studio"}
                  className={`prod-segment__btn ${videoKind === "studio" ? "prod-segment__btn--active" : ""}`}
                  onClick={() => setVideoKind("studio")}
                  disabled={loading}
                >
                  对话访谈片
                </button>
              </div>

              <div className="prod-form-grid">
                {storyOptions.length > 0 ? (
                  <label className="production-field">
                    故事文本
                    <select
                      className="production-select"
                      value={textTaskId}
                      onChange={(e) => setTextTaskId(e.target.value)}
                      disabled={loading}
                    >
                      {storyOptions.map((task) => (
                        <option key={task.taskId} value={task.taskId}>
                          {formatDateTime(task.createdAt)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {videoKind === "biography" && styleCatalog && styleCatalog.styles.length > 0 ? (
                  <VideoStylePicker
                    styles={styleCatalog.styles}
                    selectedStyleId={styleId || styleCatalog.selectedStyleId}
                    onChange={setStyleId}
                    disabled={loading}
                  />
                ) : null}
              </div>

              <button
                type="button"
                className="prod-action-bar__cta"
                style={{ width: "100%" }}
                onClick={handleScheduleVideo}
                disabled={loading || !canProduce}
              >
                {loading ? "提交中…" : "开始生成视频"}
              </button>
            </div>
          </section>

          {error ? <p className="prod-banner-err">{error}</p> : null}

          <section aria-label="视频列表">
            <h3 className="prod-section-heading">我的视频</h3>
            <div className="prod-feed">
              {videoTasks.map((task) => {
                const isExpanded = task.taskId === expandedTaskId;
                const detail = isExpanded && videoDetail?.taskId === task.taskId ? videoDetail : null;
                return (
                  <article
                    key={task.taskId}
                    className={`prod-video-card ${isExpanded ? "prod-video-card--selected" : ""}`}
                  >
                    <div
                      className={`prod-video-cover ${
                        task.productionMode === "interview_studio" ? "prod-video-cover--studio" : ""
                      }`}
                    >
                      {task.status === "success" ? (
                        <VideoTaskCover
                          interviewId={interviewId}
                          taskId={task.taskId}
                          className="prod-video-cover__img"
                        />
                      ) : null}
                      {task.status === "success" ? (
                        <button
                          type="button"
                          className="prod-video-cover__play"
                          aria-label="播放成片"
                          onClick={() => openPreview(task.taskId)}
                        >
                          ▶
                        </button>
                      ) : null}
                      <span className={coverBadgeClass(task.status)}>
                        {videoTaskStatusLabel(task.status)}
                      </span>
                    </div>
                    <div className="prod-video-card__body">
                      <div className="prod-video-card__row">
                        <div>
                          <h4 className="prod-video-card__title">{modeLabel(task.productionMode)}</h4>
                          <p className="prod-video-card__meta">{formatDateTime(task.createdAt)}</p>
                          <PipelineProgress
                            productionMode={task.productionMode}
                            status={task.status}
                            completedSteps={task.completedSteps}
                            compact
                          />
                          {!isExpanded && task.status === "failed" ? (
                            <ProductionFailureNotice lastError={task.lastError} />
                          ) : null}
                        </div>
                        <div className="prod-video-card__actions">
                          {task.status === "success" ? (
                            <button
                              type="button"
                              className="prod-chip-btn"
                              onClick={() => openPreview(task.taskId)}
                              disabled={loading}
                            >
                              播放
                            </button>
                          ) : null}
                          {(task.status === "failed" || isExpanded) && task.status !== "success" ? (
                            <button
                              type="button"
                              className="prod-chip-btn"
                              onClick={() => toggleExpanded(task.taskId)}
                              disabled={loading}
                            >
                              {isExpanded ? "收起" : "查看"}
                            </button>
                          ) : null}
                          {task.status === "failed" ? (
                            <button
                              type="button"
                              className="prod-chip-btn prod-chip-btn--primary"
                              onClick={() => handleRetryVideo(task.taskId)}
                              disabled={loading}
                            >
                              重试
                            </button>
                          ) : null}
                          {!isVideoActive(task.status) ? (
                            <button
                              type="button"
                              className="prod-chip-btn prod-chip-btn--danger"
                              onClick={() => handleDeleteVideo(task)}
                              disabled={loading}
                            >
                              删除
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {isExpanded && detail ? (
                        <div className="prod-video-detail">
                          {detail.status === "failed" ? (
                            <ProductionFailureNotice
                              lastError={detail.lastError}
                              queueError={detail.queue?.error}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      <VideoPreviewModal
        open={previewTaskId !== null}
        src={previewUrl}
        loading={previewLoading}
        onClose={closePreview}
      />
    </AppPageShell>
  );
}
