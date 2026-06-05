import { useCallback, useEffect, useRef, useState } from "react";
import {
  createInterview,
  deleteInterview,
  getCurrentQuestion,
  listInterviews,
  submitAnswer,
} from "../api/interviews";
import { ApiRequestError } from "../api/client";
import { YearMonthInput } from "../components/YearMonthInput";
import type { InterviewMeta, InterviewQuestion } from "../types/interview";
import { normalizeYearMonthInRange } from "../utils/yearMonth";

type Props = {
  interviewId: string | null;
  onInterviewIdChange: (id: string | null) => void;
  onNeedLogin: () => void;
};

export function InterviewPage({ interviewId, onInterviewIdChange, onNeedLogin }: Props) {
  const [interviews, setInterviews] = useState<InterviewMeta[]>([]);
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [submittedCounts, setSubmittedCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const isStaleProgressError = (err: unknown): boolean => {
    if (err instanceof ApiRequestError) {
      if (err.status === 409) return true;
      const code = err.code ?? "";
      return (
        code === "QUESTION_ENGINE_DUPLICATE" ||
        code === "QUESTION_ENGINE_COMPLETE" ||
        code === "QUESTION_ENGINE_NO_SESSION" ||
        code === "INTERVIEW_TOPIC_IN_PROGRESS"
      );
    }
    const msg = err instanceof Error ? err.message : "";
    return msg.includes("提交与当前进度不一致");
  };

  const run = useCallback(async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
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
  }, [onNeedLogin]);

  const refreshList = useCallback(async () => {
    const res = await listInterviews();
    setInterviews(res.interviews);
  }, []);

  const loadQuestion = useCallback(
    async (id: string) => {
      const q = await getCurrentQuestion(id);
      setQuestion(q);
      setAnswer("");
    },
    [],
  );

  useEffect(() => {
    void run(refreshList);
  }, [run, refreshList]);

  useEffect(() => {
    if (!interviewId) {
      setQuestion(null);
      setAnswer("");
      return;
    }
    void run(async () => {
      await loadQuestion(interviewId);
    });
  }, [interviewId, run, loadQuestion]);

  const handleNewInterview = () => {
    void run(async () => {
      const meta = await createInterview();
      onInterviewIdChange(meta.id);
      await refreshList();
      await loadQuestion(meta.id);
    });
  };

  const handleContinue = (id: string) => {
    void run(async () => {
      onInterviewIdChange(id);
      await loadQuestion(id);
    });
  };

  const handleDeleteInterview = (id: string) => {
    const item = interviews.find((x) => x.id === id);
    const label = item?.title || id.slice(0, 8);
    if (!window.confirm(`确定删除「${label}」吗？删除后素材、答题记录和生产产物都无法恢复。`)) {
      return;
    }
    void run(async () => {
      await deleteInterview(id);
      if (id === interviewId) {
        onInterviewIdChange(null);
        setQuestion(null);
        setAnswer("");
      }
      setSubmittedCounts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await refreshList();
    });
  };

  const resolveSubmitValue = (q: InterviewQuestion, raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (q.type === "topic") return trimmed;
    if (q.fieldType === "yearMonth") {
      const ym = normalizeYearMonthInRange(trimmed);
      return ym || null;
    }
    if (q.fieldType === "select" && q.fieldChoices?.length) {
      return q.fieldChoices.includes(trimmed) ? trimmed : null;
    }
    return trimmed;
  };

  const handleSubmit = () => {
    if (!interviewId || !question) return;
    if (submittingRef.current) return;
    const value = resolveSubmitValue(question, answer);
    if (!value) {
      if (question.fieldType === "yearMonth") {
        setError("请输入合法的年月，如 1992年3月");
      } else if (question.fieldType === "select" && question.fieldChoices?.length) {
        setError("请从给定选项中选择");
      } else {
        setError("请输入或选择内容");
      }
      return;
    }
    void run(async () => {
      submittingRef.current = true;
      try {
        await submitAnswer(interviewId, {
          key: question.key,
          text: question.text,
          value,
        });
        setSubmittedCounts((prev) => ({
          ...prev,
          [interviewId]: (prev[interviewId] ?? 0) + 1,
        }));
        await loadQuestion(interviewId);
      } catch (err) {
        if (isStaleProgressError(err)) {
          await loadQuestion(interviewId);
          setError("当前题目已过期（可能已答过或本节已结束），已为你刷新，请继续作答。");
          return;
        }
        const msg = err instanceof Error ? err.message : "请求失败";
        if (msg.includes("未登录") || msg.includes("Unauthorized")) {
          onNeedLogin();
        }
        setError(msg);
      } finally {
        submittingRef.current = false;
      }
    });
  };

  const pickOption = (opt: string) => {
    setAnswer(opt);
  };

  const currentInterview = interviews.find((item) => item.id === interviewId) ?? null;
  const currentSubmittedCount = interviewId ? submittedCounts[interviewId] ?? 0 : 0;
  const isTopicQuestion = question?.type === "topic";
  const fieldType = question?.fieldType ?? "text";
  const choiceChips =
    !isTopicQuestion && fieldType === "select" && question?.fieldChoices?.length
      ? question.fieldChoices
      : [];
  const suggestionChips =
    !isTopicQuestion && fieldType !== "select" && (question?.options.length ?? 0) > 0
      ? question!.options
      : [];
  const topicLabel = question?.type === "topic" ? "选主题" : question?.title ?? "未加载";
  const progressText = interviewId
    ? `本次已提交 ${currentSubmittedCount} 轮`
    : "请选择或新建采访";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>采访</h2>
            <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
              新建一场采访，或从列表继续未完成的采访。
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <button type="button" onClick={handleNewInterview} disabled={loading}>
              新建采访
            </button>
            <button
              type="button"
              onClick={() => void run(refreshList)}
              disabled={loading}
            >
              刷新列表
            </button>
          </div>
        </div>
        {interviews.length === 0 && !loading && (
          <p style={{ margin: "12px 0 0", color: "#666" }}>还没有采访，点击“新建采访”开始。</p>
        )}
        {interviews.length > 0 && (
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {interviews.map((item) => (
              <li
                key={item.id}
                style={{
                  border: item.id === interviewId ? "1px solid #2563eb" : "1px solid #eee",
                  borderRadius: 8,
                  padding: 10,
                  background: item.id === interviewId ? "#eff6ff" : "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{item.title || "未命名采访"}</strong>
                      {item.id === interviewId && (
                        <span style={{ color: "#2563eb", fontSize: 12 }}>当前</span>
                      )}
                    </div>
                    <div style={{ color: "#666", marginTop: 4, fontSize: 12 }}>
                      <code>{item.id.slice(0, 8)}…</code>
                      <span style={{ marginLeft: 8 }}>创建：{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => handleContinue(item.id)}
                      disabled={loading || item.id === interviewId}
                    >
                      {item.id === interviewId ? "已打开" : "继续"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteInterview(item.id)}
                      disabled={loading}
                      style={{
                        borderColor: "#fecaca",
                        color: "#b91c1c",
                        background: "#fff",
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {interviewId && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#444" }}>
            当前采访：<code>{interviewId}</code>
            {currentInterview?.title ? ` · ${currentInterview.title}` : ""}
          </p>
        )}
      </section>

      {question && (
        <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "#666" }}>
              {question.type === "topic" ? "选主题" : `答题 · ${question.title ?? ""}`}
            </p>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "#666" }}>
              当前主题：{topicLabel} · {progressText}
            </p>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 18, lineHeight: 1.5 }}>{question.text}</p>

          {isTopicQuestion && question.options.length > 0 && (
            <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
              {question.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => pickOption(opt)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: answer === opt ? "2px solid #2563eb" : "1px solid #ddd",
                    background: answer === opt ? "#eff6ff" : "#fff",
                    cursor: loading ? "default" : "pointer",
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 4 }}>{opt}</strong>
                  <span style={{ color: "#666", fontSize: 13 }}>
                    选择后提交，进入这个主题的追问。
                  </span>
                </button>
              ))}
            </div>
          )}

          {!isTopicQuestion && choiceChips.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {choiceChips.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => pickOption(opt)}
                  disabled={loading}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: answer === opt ? "2px solid #2563eb" : "1px solid #ccc",
                    background: answer === opt ? "#eff6ff" : "#fff",
                    cursor: loading ? "default" : "pointer",
                  }}
                >
                  {answer === opt ? "已选 · " : ""}
                  {opt}
                </button>
              ))}
            </div>
          )}

          {!isTopicQuestion && suggestionChips.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {suggestionChips.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => pickOption(opt)}
                  disabled={loading}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: answer === opt ? "2px solid #2563eb" : "1px solid #ccc",
                    background: answer === opt ? "#eff6ff" : "#fff",
                    cursor: loading ? "default" : "pointer",
                  }}
                >
                  {answer === opt ? "已选 · " : ""}
                  {opt}
                </button>
              ))}
            </div>
          )}

          {!isTopicQuestion && fieldType === "yearMonth" && (
            <label style={{ display: "block", marginBottom: 12 }}>
              年月：
              <div style={{ marginTop: 6 }}>
                <YearMonthInput value={answer} onChange={setAnswer} disabled={loading} />
              </div>
            </label>
          )}

          {!isTopicQuestion && fieldType !== "yearMonth" && fieldType !== "select" && (
            <label style={{ display: "block", marginBottom: 12 }}>
              答案：
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                style={{ display: "block", marginTop: 6, width: "100%", maxWidth: 480, padding: 8 }}
                disabled={loading}
              />
            </label>
          )}

          {isTopicQuestion && (
            <label style={{ display: "block", marginBottom: 12 }}>
              或输入主题标题：
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                style={{ display: "block", marginTop: 6, width: "100%", maxWidth: 480, padding: 8 }}
                disabled={loading}
              />
            </label>
          )}

          <button type="button" onClick={handleSubmit} disabled={loading}>
            提交
          </button>
        </section>
      )}

      {!question && interviewId && !loading && (
        <p style={{ color: "#666" }}>加载题目中…</p>
      )}

      {loading && <p style={{ margin: 0 }}>处理中…</p>}
      {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
    </div>
  );
}
