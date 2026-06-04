import { useCallback, useEffect, useState } from "react";
import {
  createInterview,
  getCurrentQuestion,
  listInterviews,
  submitAnswer,
} from "../api/interviews";
import type { InterviewMeta, InterviewQuestion } from "../types/interview";

type Props = {
  onNeedLogin: () => void;
};

export function InterviewPage({ onNeedLogin }: Props) {
  const [interviews, setInterviews] = useState<InterviewMeta[]>([]);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [submittedCounts, setSubmittedCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    void run(async () => {
      await refreshList();
    });
  }, [run, refreshList]);

  const handleNewInterview = () => {
    void run(async () => {
      const meta = await createInterview();
      setInterviewId(meta.id);
      await refreshList();
      await loadQuestion(meta.id);
    });
  };

  const handleContinue = (id: string) => {
    void run(async () => {
      setInterviewId(id);
      await loadQuestion(id);
    });
  };

  const handleSubmit = () => {
    if (!interviewId || !question) return;
    const value = answer.trim();
    if (!value) {
      setError("请输入或选择内容");
      return;
    }
    void run(async () => {
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
    });
  };

  const pickOption = (opt: string) => {
    setAnswer(opt);
  };

  const currentInterview = interviews.find((item) => item.id === interviewId) ?? null;
  const currentSubmittedCount = interviewId ? submittedCounts[interviewId] ?? 0 : 0;
  const isTopicQuestion = question?.type === "topic";
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
                  <button
                    type="button"
                    onClick={() => handleContinue(item.id)}
                    disabled={loading || item.id === interviewId}
                  >
                    {item.id === interviewId ? "已打开" : "继续"}
                  </button>
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

          {!isTopicQuestion && question.options.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {question.options.map((opt) => (
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

          <label style={{ display: "block", marginBottom: 12 }}>
            {question.type === "topic" ? "或输入主题标题：" : "答案："}
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              style={{ display: "block", marginTop: 6, width: "100%", maxWidth: 480, padding: 8 }}
              disabled={loading}
            />
          </label>

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
