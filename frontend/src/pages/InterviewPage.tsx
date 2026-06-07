import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentQuestion, getInterviewMessages, submitAnswer } from "../api/interviews";
import { ApiRequestError } from "../api/client";
import { SubpageHeader } from "../components/SubpageHeader";
import { YearMonthInput } from "../components/YearMonthInput";
import { displayError, isUnauthorizedError, t } from "../i18n";
import type { InterviewChatMessage, InterviewQuestion } from "../types/interview";
import { INTERVIEW_SKIP_LABEL } from "../types/interview";
import { normalizeYearMonthInRange } from "../utils/yearMonth";
import "./InterviewPage.css";

type ChatMessage = InterviewChatMessage;

type Props = {
  interviewId: string;
  interviewTitle?: string | null;
  onBack: () => void;
  onNeedLogin: () => void;
};

function formatChatText(text: string): string {
  if (text === INTERVIEW_SKIP_LABEL) return t("interview.skipped");
  return text;
}

export function InterviewPage({
  interviewId,
  interviewTitle,
  onBack,
  onNeedLogin,
}: Props) {
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    return false;
  };

  const run = useCallback(async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        onNeedLogin();
      }
      setError(displayError(err));
    } finally {
      setLoading(false);
    }
  }, [onNeedLogin]);

  const loadSession = useCallback(async (id: string) => {
    const [q, historyRes] = await Promise.all([
      getCurrentQuestion(id),
      getInterviewMessages(id).catch(() => ({ messages: [] as ChatMessage[] })),
    ]);
    setQuestion(q);
    setMessages(historyRes.messages);
    setAnswer("");
  }, []);

  useEffect(() => {
    setAnswer("");
    setError(null);
    void run(async () => {
      await loadSession(interviewId);
    });
  }, [interviewId, run, loadSession]);

  useEffect(() => {
    if (!question) return;
    const meta = question.type === "topic" ? t("interview.pickTopic") : question.title ?? undefined;
    const id = `q-${question.key}`;
    setMessages((prev) => {
      if (prev.some((m) => m.id === id)) return prev;
      return [...prev, { id, role: "ai", text: question.text, meta }];
    });
  }, [question?.key, question?.text, question?.type, question?.title]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, error]);

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

  const afterAnswer = async () => {
    await loadSession(interviewId);
  };

  const handleSubmitError = async (err: unknown) => {
    if (isStaleProgressError(err)) {
      await loadSession(interviewId);
      setError(t("interview.staleQuestion"));
      return;
    }
    if (isUnauthorizedError(err)) {
      onNeedLogin();
    }
    setError(displayError(err));
  };

  const handleSubmit = () => {
    if (!question) return;
    if (submittingRef.current) return;
    const value = resolveSubmitValue(question, answer);
    if (!value) {
      if (question.fieldType === "yearMonth") {
        setError(t("interview.invalidYearMonth"));
      } else if (question.fieldType === "select" && question.fieldChoices?.length) {
        setError(t("interview.pickFromChoices"));
      } else {
        setError(t("interview.enterOrPick"));
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
        await afterAnswer();
      } catch (err) {
        await handleSubmitError(err);
      } finally {
        submittingRef.current = false;
      }
    });
  };

  const handleSkip = () => {
    if (!question?.skippable) return;
    if (submittingRef.current) return;
    void run(async () => {
      submittingRef.current = true;
      try {
        await submitAnswer(interviewId, {
          key: question.key,
          text: question.text,
          skip: true,
        });
        setAnswer("");
        await afterAnswer();
      } catch (err) {
        await handleSubmitError(err);
      } finally {
        submittingRef.current = false;
      }
    });
  };

  const pickOption = (opt: string) => {
    setAnswer(opt);
    setError(null);
  };

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
  const showComposer = !!question && !loading;

  return (
    <div className="iv-layout">
      <SubpageHeader title={t("interview.title")} subtitle={interviewTitle} onBack={onBack} />
      <div className="iv-main">
        <section className="iv-messages" aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={`iv-msg iv-msg--${m.role}`}>
              <div className="iv-card">
                {m.role === "ai" && m.meta ? <div className="iv-meta">{m.meta}</div> : null}
                <div>{formatChatText(m.text)}</div>
              </div>
            </div>
          ))}
          {!question && loading && <p className="iv-loading">{t("interview.loadingQuestion")}</p>}
          <div ref={messagesEndRef} />
        </section>

        <footer className="iv-composer">
          {loading && question && <p className="iv-hint">{t("common.processing")}</p>}
          {error && <p className="iv-hint iv-hint--err">{error}</p>}

          {showComposer && isTopicQuestion && question.options.length > 0 && (
            <div className="iv-topic-list" role="list">
              {question.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`iv-topic-opt${answer === opt ? " iv-topic-opt--on" : ""}`}
                  onClick={() => pickOption(opt)}
                  disabled={loading}
                >
                  <strong>{opt}</strong>
                  <span>{t("interview.topicHint")}</span>
                </button>
              ))}
            </div>
          )}

          {showComposer && choiceChips.length > 0 && (
            <div className="iv-chips" role="group" aria-label={t("interview.optionsAria")}>
              {choiceChips.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`iv-chip${answer === opt ? " iv-chip--on" : ""}`}
                  onClick={() => pickOption(opt)}
                  disabled={loading}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {showComposer && suggestionChips.length > 0 && (
            <div className="iv-chips" role="group" aria-label={t("interview.suggestionsAria")}>
              {suggestionChips.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`iv-chip${answer === opt ? " iv-chip--on" : ""}`}
                  onClick={() => pickOption(opt)}
                  disabled={loading}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {showComposer && question.skippable && (
            <div className="iv-chips" role="group" aria-label={t("interview.optionalActionsAria")}>
              <button
                type="button"
                className="iv-chip iv-chip--skip"
                onClick={handleSkip}
                disabled={loading}
              >
                {t("interview.skipQuestion")}
              </button>
            </div>
          )}

          {showComposer && (
            <div className="iv-composer-row">
              <div className="iv-panel">
                {!isTopicQuestion && fieldType === "yearMonth" && (
                  <div className="iv-ym-wrap">
                    <YearMonthInput value={answer} onChange={setAnswer} disabled={loading} />
                  </div>
                )}

                {!isTopicQuestion && fieldType !== "yearMonth" && fieldType !== "select" && (
                  <input
                    className="iv-input"
                    value={answer}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      setError(null);
                    }}
                    placeholder={t("interview.answerPlaceholder")}
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                  />
                )}

                {isTopicQuestion && (
                  <input
                    className="iv-input"
                    value={answer}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      setError(null);
                    }}
                    placeholder={t("interview.topicPlaceholder")}
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                  />
                )}

                {fieldType === "select" && choiceChips.length > 0 && !answer && (
                  <p className="iv-hint">{t("interview.pickAbove")}</p>
                )}
              </div>

              <button
                type="button"
                className="iv-send"
                onClick={handleSubmit}
                disabled={loading || !answer.trim()}
                aria-label={t("interview.send")}
                title={t("interview.send")}
              >
                ↑
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
