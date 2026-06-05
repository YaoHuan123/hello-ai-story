import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTextTask,
  fetchVideoArtifactBlob,
  fetchVideoPrimaryBlob,
  getProductionReadiness,
  getTextArticle,
  getVideoTaskArtifacts,
  getVideoTaskProgress,
  listTextTasks,
  listVideoStyles,
  listVideoTasks,
  retryVideoTask,
  scheduleBiographyVideo,
  scheduleStudioVideo,
} from "../api/production";
import { PipelineProgress } from "../components/production/PipelineProgress";
import { ProductionFailureNotice } from "../components/production/ProductionFailureNotice";
import { VideoStylePicker } from "../components/production/VideoStylePicker";
import type {
  PolishMode,
  ProductionReadiness,
  TextTaskListItem,
  VideoStylesCatalog,
  VideoTaskArtifacts,
  VideoTaskListItem,
  VideoTaskProgress,
  VideoTaskStatus,
} from "../types/production";
import {
  DEFAULT_BIOGRAPHY_TTS_VOICE,
  DEFAULT_STUDIO_GUEST_VOICE,
  DEFAULT_STUDIO_HOST_VOICE,
  TTS_VOICE_OPTIONS,
} from "../constants/ttsVoices";
import { formatProductionError } from "../lib/formatProductionError";
import "./ProductionPage.css";

type Props = {
  interviewId: string | null;
  onNeedLogin: () => void;
};

const VIDEO_STATUS_LABEL: Record<VideoTaskStatus, string> = {
  pending: "待处理",
  queued: "排队中",
  running: "生成中",
  success: "已完成",
  failed: "失败",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function isVideoActive(status: VideoTaskStatus): boolean {
  return status === "queued" || status === "running" || status === "pending";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function parseApiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "请求失败";
}

export function ProductionPage({ interviewId, onNeedLogin }: Props) {
  const [textTasks, setTextTasks] = useState<TextTaskListItem[]>([]);
  const [videoTasks, setVideoTasks] = useState<VideoTaskListItem[]>([]);
  const [readiness, setReadiness] = useState<ProductionReadiness | null>(null);
  const [styleCatalog, setStyleCatalog] = useState<VideoStylesCatalog | null>(null);

  const [selectedTextTaskId, setSelectedTextTaskId] = useState<string | null>(null);
  const [article, setArticle] = useState<string | null>(null);
  const [articleMeta, setArticleMeta] = useState<{ sectionCount?: number; skippedModel?: boolean } | null>(
    null,
  );
  const [selectedVideoTaskId, setSelectedVideoTaskId] = useState<string | null>(null);
  const [videoDetail, setVideoDetail] = useState<VideoTaskProgress | null>(null);
  const [videoArtifacts, setVideoArtifacts] = useState<VideoTaskArtifacts | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  const [ttsVoice, setTtsVoice] = useState(DEFAULT_BIOGRAPHY_TTS_VOICE);
  const [hostVoice, setHostVoice] = useState(DEFAULT_STUDIO_HOST_VOICE);
  const [guestVoice, setGuestVoice] = useState(DEFAULT_STUDIO_GUEST_VOICE);
  const [styleId, setStyleId] = useState("");
  const [polishMode, setPolishMode] = useState<PolishMode>("stub");
  const [videoKind, setVideoKind] = useState<"biography" | "studio">("biography");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canProduce = readiness?.ready === true;

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        await fn();
      } catch (err) {
        const raw = parseApiErrorMessage(err);
        if (raw.includes("未登录") || raw.includes("Unauthorized")) {
          onNeedLogin();
        }
        const friendly = formatProductionError(raw);
        setError(friendly ? `${friendly.title}${friendly.hint ? ` — ${friendly.hint}` : ""}` : raw);
      } finally {
        setLoading(false);
      }
    },
    [onNeedLogin],
  );

  const refreshLists = useCallback(async () => {
    if (!interviewId) return;
    const [textRes, videoRes, readinessRes] = await Promise.all([
      listTextTasks(interviewId),
      listVideoTasks(interviewId),
      getProductionReadiness(interviewId),
    ]);
    setTextTasks(textRes.tasks);
    setVideoTasks(videoRes.tasks);
    setReadiness(readinessRes);
  }, [interviewId]);

  const refreshVideoDetail = useCallback(async () => {
    if (!interviewId || !selectedVideoTaskId) return;
    const detail = await getVideoTaskProgress(interviewId, selectedVideoTaskId);
    setVideoDetail(detail);
  }, [interviewId, selectedVideoTaskId]);

  useEffect(() => {
    void listVideoStyles()
      .then((catalog) => {
        setStyleCatalog(catalog);
        setStyleId((prev) => prev || catalog.selectedStyleId || catalog.styles[0]?.id || "");
      })
      .catch(() => {
        /* 风格列表非阻塞；传记仍可走服务端默认 */
      });
  }, []);

  useEffect(() => {
    if (!interviewId) {
      setTextTasks([]);
      setVideoTasks([]);
      setReadiness(null);
      setArticle(null);
      setVideoDetail(null);
      return;
    }
    void run(refreshLists);
  }, [interviewId, run, refreshLists]);

  const hasActiveVideo = useMemo(
    () => videoTasks.some((t) => isVideoActive(t.status)),
    [videoTasks],
  );

  const selectedTaskActive = useMemo(() => {
    const task = videoTasks.find((t) => t.taskId === selectedVideoTaskId);
    return task ? isVideoActive(task.status) : false;
  }, [videoTasks, selectedVideoTaskId]);

  useEffect(() => {
    if (!interviewId || (!hasActiveVideo && !selectedTaskActive)) return;
    const timer = window.setInterval(() => {
      void refreshLists().catch(() => undefined);
      if (selectedVideoTaskId) {
        void refreshVideoDetail().catch(() => undefined);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [interviewId, hasActiveVideo, selectedTaskActive, selectedVideoTaskId, refreshLists, refreshVideoDetail]);

  useEffect(() => {
    if (!interviewId || !selectedVideoTaskId) {
      setVideoDetail(null);
      return;
    }
    let cancelled = false;
    void getVideoTaskProgress(interviewId, selectedVideoTaskId)
      .then((detail) => {
        if (!cancelled) setVideoDetail(detail);
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = parseApiErrorMessage(err);
          if (msg.includes("未登录") || msg.includes("Unauthorized")) onNeedLogin();
          setError(msg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [interviewId, selectedVideoTaskId, onNeedLogin]);

  useEffect(() => {
    if (!interviewId || !selectedVideoTaskId) {
      setVideoArtifacts(null);
      return;
    }
    let cancelled = false;
    void getVideoTaskArtifacts(interviewId, selectedVideoTaskId)
      .then((artifacts) => {
        if (!cancelled) setVideoArtifacts(artifacts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [interviewId, selectedVideoTaskId]);

  useEffect(() => {
    if (!interviewId || !selectedVideoTaskId || !videoArtifacts?.primaryVideo.available) {
      setVideoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void fetchVideoPrimaryBlob(interviewId, selectedVideoTaskId)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setVideoPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setVideoPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [interviewId, selectedVideoTaskId, videoArtifacts?.primaryVideo.available]);

  const handleDownloadVideoArtifact = (relativePath: string) => {
    if (!interviewId || !selectedVideoTaskId) return;
    void run(async () => {
      const blob = await fetchVideoArtifactBlob(interviewId, selectedVideoTaskId, relativePath);
      const filename = relativePath.split("/").pop() ?? "download";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleCreateText = () => {
    if (!interviewId || !canProduce) return;
    void run(async () => {
      const result = await createTextTask(interviewId, { mode: polishMode });
      setMessage(`文本任务已创建：${result.taskId.slice(0, 8)}…`);
      setSelectedTextTaskId(result.taskId);
      await refreshLists();
      const articleRes = await getTextArticle(interviewId, result.taskId);
      setArticle(articleRes.article);
      setArticleMeta({
        sectionCount: articleRes.sectionCount,
        skippedModel: articleRes.skippedModel,
      });
    });
  };

  const handleLoadArticle = (taskId: string) => {
    if (!interviewId) return;
    setSelectedTextTaskId(taskId);
    void run(async () => {
      const articleRes = await getTextArticle(interviewId, taskId);
      setArticle(articleRes.article);
      setArticleMeta({
        sectionCount: articleRes.sectionCount,
        skippedModel: articleRes.skippedModel,
      });
    });
  };

  const handleScheduleVideo = () => {
    if (!interviewId || !canProduce) return;
    void run(async () => {
      const scheduled =
        videoKind === "biography"
          ? await scheduleBiographyVideo(interviewId, {
              ttsVoice,
              styleId: styleId || undefined,
              polishMode,
            })
          : await scheduleStudioVideo(interviewId, { hostVoice, guestVoice, polishMode });
      setMessage(`成片任务已入队：${scheduled.taskId.slice(0, 8)}…`);
      setSelectedVideoTaskId(scheduled.taskId);
      await refreshLists();
    });
  };

  const handleRetryVideo = (taskId: string) => {
    if (!interviewId) return;
    void run(async () => {
      await retryVideoTask(interviewId, taskId);
      setMessage("已重新入队");
      setSelectedVideoTaskId(taskId);
      await refreshLists();
    });
  };

  if (!interviewId) {
    return (
      <div className="production-section">
        <h2 style={{ margin: 0 }}>生产</h2>
        <p className="production-muted" style={{ marginTop: 12 }}>
          请先在「访谈」页选择或新建一场采访，再进入生产。
        </p>
      </div>
    );
  }

  return (
    <div className="production-page">
      <section className="production-section">
        <h2 style={{ margin: 0 }}>生产</h2>
        <p className="production-muted" style={{ marginTop: 8 }}>
          当前采访：<code>{interviewId}</code>
          {hasActiveVideo && <span style={{ marginLeft: 12 }}>· 成片任务自动刷新中</span>}
        </p>

        {readiness && (
          <div
            className={`production-readiness ${readiness.ready ? "production-readiness--ok" : "production-readiness--warn"}`}
          >
            {readiness.message}
            {readiness.ready && readiness.sectionNames.length > 0 && (
              <span style={{ display: "block", marginTop: 4, fontSize: 12, opacity: 0.85 }}>
                小节：{readiness.sectionNames.join("、")}
              </span>
            )}
          </div>
        )}

        <div className="production-toolbar">
          <button type="button" onClick={() => void run(refreshLists)} disabled={loading}>
            刷新任务列表
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            模式
            <select
              value={polishMode}
              onChange={(e) => setPolishMode(e.target.value as PolishMode)}
              disabled={loading}
            >
              <option value="stub">stub（本地测试）</option>
              <option value="llm">llm</option>
            </select>
          </label>
        </div>
      </section>

      <section className="production-section">
        <h3 style={{ margin: "0 0 8px" }}>文本 · 正式文章</h3>
        <p className="production-muted" style={{ margin: "0 0 12px" }}>
          同步生成，基于已答 sections 合成一篇传记文章。
        </p>
        <button type="button" onClick={handleCreateText} disabled={loading || !canProduce}>
          生成文章
        </button>
        {!canProduce && (
          <p className="production-muted" style={{ marginTop: 8 }}>
            需先完成访谈问答后再生成。
          </p>
        )}

        {textTasks.length > 0 && (
          <ul className="production-task-list">
            {textTasks.map((task) => (
              <li
                key={task.taskId}
                className={`production-task-item ${task.taskId === selectedTextTaskId ? "production-task-item--selected" : ""}`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <strong>{task.status === "success" ? "已完成" : task.status}</strong>
                    <div className="production-muted" style={{ marginTop: 4 }}>
                      <code>{task.taskId.slice(0, 8)}…</code>
                      <span style={{ marginLeft: 8 }}>{formatTime(task.createdAt)}</span>
                    </div>
                    <ProductionFailureNotice lastError={task.lastError} />
                  </div>
                  {task.status === "success" && (
                    <button type="button" onClick={() => handleLoadArticle(task.taskId)} disabled={loading}>
                      查看文章
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {article && (
          <div style={{ marginTop: 16 }}>
            <div className="production-muted" style={{ marginBottom: 8 }}>
              {articleMeta?.sectionCount != null && <span>{articleMeta.sectionCount} 个小节 · </span>}
              {articleMeta?.skippedModel && <span>stub 模式 · </span>}
              {article.length} 字
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "var(--code-bg, #f7f7f7)",
                padding: 12,
                borderRadius: 8,
                fontSize: 14,
                lineHeight: 1.6,
                maxHeight: 420,
                overflow: "auto",
              }}
            >
              {article}
            </pre>
          </div>
        )}
      </section>

      <section className="production-section">
        <h3 style={{ margin: "0 0 8px" }}>成片 · 视频</h3>
        <p className="production-muted" style={{ margin: "0 0 12px" }}>
          异步入队，需后台运行 <code>npm run dev:worker</code> 消费任务。
        </p>

        <div className="production-toolbar" style={{ marginTop: 0, marginBottom: 12 }}>
          <button type="button" onClick={() => setVideoKind("biography")} disabled={loading || videoKind === "biography"}>
            传记 narrated
          </button>
          <button type="button" onClick={() => setVideoKind("studio")} disabled={loading || videoKind === "studio"}>
            演播室对话
          </button>
        </div>

        {videoKind === "biography" ? (
          <>
            {styleCatalog && styleCatalog.styles.length > 0 && (
              <VideoStylePicker
                styles={styleCatalog.styles}
                selectedStyleId={styleId || styleCatalog.selectedStyleId}
                onChange={setStyleId}
                disabled={loading}
              />
            )}
            <label className="production-field">
              TTS 音色
              <select
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
                className="production-select"
                disabled={loading}
              >
                {TTS_VOICE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.note ? ` — ${v.note}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
            <label className="production-field">
              主持人音色
              <select
                value={hostVoice}
                onChange={(e) => setHostVoice(e.target.value)}
                className="production-select"
                disabled={loading}
              >
                {TTS_VOICE_OPTIONS.map((v) => (
                  <option key={`host-${v.id}`} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-field">
              嘉宾音色
              <select
                value={guestVoice}
                onChange={(e) => setGuestVoice(e.target.value)}
                className="production-select"
                disabled={loading}
              >
                {TTS_VOICE_OPTIONS.map((v) => (
                  <option key={`guest-${v.id}`} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <button type="button" onClick={handleScheduleVideo} disabled={loading || !canProduce}>
          创建成片任务
        </button>
        {!canProduce && (
          <p className="production-muted" style={{ marginTop: 8 }}>
            需先完成访谈问答后再创建成片。
          </p>
        )}

        {videoTasks.length > 0 && (
          <ul className="production-task-list">
            {videoTasks.map((task) => {
              const isSelected = task.taskId === selectedVideoTaskId;
              const detail = isSelected && videoDetail?.taskId === task.taskId ? videoDetail : null;
              return (
                <li
                  key={task.taskId}
                  className={`production-task-item ${isSelected ? "production-task-item--selected" : ""}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <strong>
                        {task.productionMode === "interview_studio" ? "演播室" : "传记"} ·{" "}
                        {VIDEO_STATUS_LABEL[task.status]}
                      </strong>
                      <div className="production-muted" style={{ marginTop: 4 }}>
                        <code>{task.taskId.slice(0, 8)}…</code>
                        <span style={{ marginLeft: 8 }}>{formatTime(task.createdAt)}</span>
                      </div>
                      <PipelineProgress
                        productionMode={task.productionMode}
                        status={task.status}
                        completedSteps={task.completedSteps}
                        compact={!isSelected}
                      />
                      {!isSelected && task.status === "failed" && (
                        <ProductionFailureNotice lastError={task.lastError} />
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignSelf: "flex-start" }}>
                      <button type="button" onClick={() => setSelectedVideoTaskId(task.taskId)} disabled={loading}>
                        {isSelected ? "已展开" : "详情"}
                      </button>
                      {task.status === "failed" && (
                        <button type="button" onClick={() => handleRetryVideo(task.taskId)} disabled={loading}>
                          重试
                        </button>
                      )}
                    </div>
                  </div>

                  {isSelected && detail && (
                    <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                      <PipelineProgress
                        productionMode={detail.productionMode}
                        status={detail.status}
                        completedSteps={detail.completedSteps}
                      />
                      {detail.status === "failed" && (
                        <ProductionFailureNotice
                          lastError={detail.lastError}
                          queueError={detail.queue?.error}
                        />
                      )}

                      {videoPreviewUrl && (
                        <div>
                          <p className="production-muted" style={{ margin: "0 0 8px" }}>
                            完整视频预览
                          </p>
                          <video
                            controls
                            src={videoPreviewUrl}
                            style={{ width: "100%", maxWidth: 640, borderRadius: 8, background: "#000" }}
                          />
                        </div>
                      )}

                      {videoArtifacts && (
                        <div>
                          <p className="production-muted" style={{ margin: "0 0 8px" }}>
                            产物（{videoArtifacts.items.length} 个文件 · 视频 {videoArtifacts.counts.video} · 音频{" "}
                            {videoArtifacts.counts.audio} · 图片 {videoArtifacts.counts.image}）
                          </p>
                          {videoArtifacts.items.length === 0 ? (
                            <p className="production-muted">尚无媒体产物（需跑至 step 180+ 或 260）</p>
                          ) : (
                            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                              {videoArtifacts.items.map((item) => (
                                <li
                                  key={item.relativePath}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 8,
                                    flexWrap: "wrap",
                                    fontSize: 13,
                                    border: "1px solid #eee",
                                    borderRadius: 6,
                                    padding: "6px 8px",
                                  }}
                                >
                                  <span>
                                    <code>{item.relativePath}</code>
                                    <span className="production-muted" style={{ marginLeft: 8 }}>
                                      {item.kind} · {formatBytes(item.sizeBytes)}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadVideoArtifact(item.relativePath)}
                                    disabled={loading}
                                  >
                                    下载
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {loading && <p style={{ margin: 0 }}>处理中…</p>}
      {message && <p className="production-message">{message}</p>}
      {error && <p className="production-error-banner">{error}</p>}
    </div>
  );
}
