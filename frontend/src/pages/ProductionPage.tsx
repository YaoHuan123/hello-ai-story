import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTextTask,
  fetchVideoArtifactBlob,
  fetchVideoPrimaryBlob,
  getTextArticle,
  getVideoTaskArtifacts,
  getVideoTaskProgress,
  listTextTasks,
  listVideoTasks,
  retryVideoTask,
  scheduleBiographyVideo,
  scheduleStudioVideo,
} from "../api/production";
import type {
  PolishMode,
  TextTaskListItem,
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

export function ProductionPage({ interviewId, onNeedLogin }: Props) {
  const [textTasks, setTextTasks] = useState<TextTaskListItem[]>([]);
  const [videoTasks, setVideoTasks] = useState<VideoTaskListItem[]>([]);
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
  const [polishMode, setPolishMode] = useState<PolishMode>("stub");
  const [videoKind, setVideoKind] = useState<"biography" | "studio">("biography");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "请求失败";
        if (msg.includes("未登录") || msg.includes("Unauthorized")) {
          onNeedLogin();
        }
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [onNeedLogin],
  );

  const refreshLists = useCallback(async () => {
    if (!interviewId) return;
    const [textRes, videoRes] = await Promise.all([
      listTextTasks(interviewId),
      listVideoTasks(interviewId),
    ]);
    setTextTasks(textRes.tasks);
    setVideoTasks(videoRes.tasks);
  }, [interviewId]);

  useEffect(() => {
    if (!interviewId) {
      setTextTasks([]);
      setVideoTasks([]);
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

  useEffect(() => {
    if (!interviewId || !hasActiveVideo) return;
    const timer = window.setInterval(() => {
      void refreshLists().catch(() => {
        /* polling errors surfaced on manual actions */
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [interviewId, hasActiveVideo, refreshLists]);

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
          const msg = err instanceof Error ? err.message : "加载详情失败";
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
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "加载产物失败";
          if (msg.includes("未登录") || msg.includes("Unauthorized")) onNeedLogin();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [interviewId, selectedVideoTaskId, onNeedLogin]);

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
    if (!interviewId) return;
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
    if (!interviewId) return;
    void run(async () => {
      const scheduled =
        videoKind === "biography"
          ? await scheduleBiographyVideo(interviewId, { ttsVoice, polishMode })
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
      <div style={{ border: "1px solid var(--border, #ddd)", borderRadius: 10, padding: 16 }}>
        <h2 style={{ margin: 0 }}>生产</h2>
        <p style={{ margin: "12px 0 0", color: "#666" }}>
          请先在「访谈」页选择或新建一场采访，再进入生产。
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={{ border: "1px solid var(--border, #ddd)", borderRadius: 10, padding: 16 }}>
        <h2 style={{ margin: 0 }}>生产</h2>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#666" }}>
          当前采访：<code>{interviewId}</code>
          {hasActiveVideo && <span style={{ marginLeft: 12 }}>· 成片任务自动刷新中</span>}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
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

      <section style={{ border: "1px solid var(--border, #ddd)", borderRadius: 10, padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>文本 · 正式文章</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#666" }}>
          同步生成，基于已答 sections 合成一篇传记文章。
        </p>
        <button type="button" onClick={handleCreateText} disabled={loading}>
          生成文章
        </button>
        {textTasks.length > 0 && (
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {textTasks.map((task) => (
              <li
                key={task.taskId}
                style={{
                  border:
                    task.taskId === selectedTextTaskId ? "1px solid #2563eb" : "1px solid #eee",
                  borderRadius: 8,
                  padding: 10,
                  background: task.taskId === selectedTextTaskId ? "#eff6ff" : "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong>{task.status === "success" ? "已完成" : task.status}</strong>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      <code>{task.taskId.slice(0, 8)}…</code>
                      <span style={{ marginLeft: 8 }}>{formatTime(task.createdAt)}</span>
                      {task.status === "success" && <span style={{ marginLeft: 8 }}>可阅读</span>}
                    </div>
                    {task.lastError && (
                      <div style={{ fontSize: 12, color: "crimson", marginTop: 4 }}>{task.lastError}</div>
                    )}
                  </div>
                  {task.status === "success" && (
                    <button
                      type="button"
                      onClick={() => handleLoadArticle(task.taskId)}
                      disabled={loading}
                    >
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
            <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
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

      <section style={{ border: "1px solid var(--border, #ddd)", borderRadius: 10, padding: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>成片 · 视频</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#666" }}>
          异步入队，需后台运行 <code>npm run worker:video</code> 消费任务。
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setVideoKind("biography")}
            disabled={loading || videoKind === "biography"}
          >
            传记 narrated
          </button>
          <button
            type="button"
            onClick={() => setVideoKind("studio")}
            disabled={loading || videoKind === "studio"}
          >
            演播室对话
          </button>
        </div>

        {videoKind === "biography" ? (
          <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
            TTS 音色（voice_type）
            <select
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              style={{ display: "block", marginTop: 6, width: "100%", maxWidth: 360, padding: 8 }}
              disabled={loading}
            >
              {TTS_VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.id}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 12, maxWidth: 360 }}>
            <label style={{ display: "block", fontSize: 14 }}>
              主持人音色
              <select
                value={hostVoice}
                onChange={(e) => setHostVoice(e.target.value)}
                style={{ display: "block", marginTop: 6, width: "100%", padding: 8 }}
                disabled={loading}
              >
                {TTS_VOICE_OPTIONS.map((v) => (
                  <option key={`host-${v.id}`} value={v.id}>
                    {v.name} — {v.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block", fontSize: 14 }}>
              嘉宾音色
              <select
                value={guestVoice}
                onChange={(e) => setGuestVoice(e.target.value)}
                style={{ display: "block", marginTop: 6, width: "100%", padding: 8 }}
                disabled={loading}
              >
                {TTS_VOICE_OPTIONS.map((v) => (
                  <option key={`guest-${v.id}`} value={v.id}>
                    {v.name} — {v.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <button type="button" onClick={handleScheduleVideo} disabled={loading}>
          创建成片任务
        </button>

        {videoTasks.length > 0 && (
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {videoTasks.map((task) => (
              <li
                key={task.taskId}
                style={{
                  border:
                    task.taskId === selectedVideoTaskId ? "1px solid #2563eb" : "1px solid #eee",
                  borderRadius: 8,
                  padding: 10,
                  background: task.taskId === selectedVideoTaskId ? "#eff6ff" : "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong>
                      {task.productionMode === "interview_studio" ? "演播室" : "传记"} ·{" "}
                      {VIDEO_STATUS_LABEL[task.status]}
                    </strong>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      <code>{task.taskId.slice(0, 8)}…</code>
                      <span style={{ marginLeft: 8 }}>{formatTime(task.createdAt)}</span>
                    </div>
                    {task.completedSteps.length > 0 && (
                      <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>
                        已完成步骤：{task.completedSteps.join(", ")}
                      </div>
                    )}
                    {task.lastError && (
                      <div style={{ fontSize: 12, color: "crimson", marginTop: 4 }}>{task.lastError}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedVideoTaskId(task.taskId)}
                      disabled={loading}
                    >
                      详情
                    </button>
                    {task.status === "failed" && (
                      <button type="button" onClick={() => handleRetryVideo(task.taskId)} disabled={loading}>
                        重试
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {videoDetail && selectedVideoTaskId === videoDetail.taskId && (
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {videoPreviewUrl && (
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 13, color: "#666" }}>完整视频预览</p>
                <video
                  controls
                  src={videoPreviewUrl}
                  style={{ width: "100%", maxWidth: 640, borderRadius: 8, background: "#000" }}
                />
              </div>
            )}
            {videoArtifacts && (
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 13, color: "#666" }}>
                  产物（{videoArtifacts.items.length} 个文件 · 视频 {videoArtifacts.counts.video} ·
                  音频 {videoArtifacts.counts.audio} · 图片 {videoArtifacts.counts.image}）
                </p>
                {videoArtifacts.items.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "#888" }}>尚无媒体产物（需跑至 step 180+ 或 260）</p>
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
                          <span style={{ marginLeft: 8, color: "#666" }}>
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
            <details>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "#666" }}>任务进度 JSON</summary>
              <pre
                style={{
                  margin: "8px 0 0",
                  background: "var(--code-bg, #f7f7f7)",
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                  overflow: "auto",
                }}
              >
                {JSON.stringify(videoDetail, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {loading && <p style={{ margin: 0 }}>处理中…</p>}
      {message && <p style={{ margin: 0, color: "green" }}>{message}</p>}
      {error && <p style={{ margin: 0, color: "crimson" }}>{error}</p>}
    </div>
  );
}
