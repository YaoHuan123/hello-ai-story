import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentQuestion, getInterviewMessages, submitAnswer } from "../api/interviews";
import { ApiRequestError } from "../api/client";
import { SubpageHeader } from "../components/SubpageHeader";
import { YearMonthInput } from "../components/YearMonthInput";
import { displayError, isUnauthorizedError, t } from "../i18n";
import type { InterviewChatMessage, InterviewQuestion } from "../types/interview";
import { INTERVIEW_SKIP_LABEL, INTERVIEW_SKIP_LABEL_EN } from "../types/interview";
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
  if (text === INTERVIEW_SKIP_LABEL || text === INTERVIEW_SKIP_LABEL_EN) return t("interview.skipped");
  return text;
}

/** 把当前待答题补进时间线（历史接口只含已答记录，不含未答的当前题）。 */
function messagesWithCurrentQuestion(
  history: ChatMessage[],
  q: InterviewQuestion | null,
): ChatMessage[] {
  if (!q) return history;
  const id = `q-${q.key}`;
  if (history.some((m) => m.id === id)) return history;
  return [...history, { id, role: "ai", text: q.text }];
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
  const answerRef = useRef<HTMLTextAreaElement>(null);

  const resizeAnswerField = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const focusAnswerField = () => {
    window.setTimeout(() => {
      answerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }, 280);
  };

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
    setMessages(messagesWithCurrentQuestion(historyRes.messages, q));
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, error]);

  useEffect(() => {
    if (!answer && answerRef.current) {
      answerRef.current.style.height = "auto";
    }
  }, [answer]);

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
      } else if (question.type === "topic" || (question.fieldType === "select" && question.fieldChoices?.length)) {
        setError(t("interview.pickAbove"));
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

  const isInterviewComplete = question?.type === "complete";
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
  const showComposer = !!question && !loading && !isInterviewComplete;

  return (
    <div className="iv-layout">
      <SubpageHeader title={t("interview.title")} subtitle={interviewTitle} onBack={onBack} />
      <div className="iv-main">
        <section className="iv-messages" aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={`iv-msg iv-msg--${m.role}`}>
              <div className="iv-card">
                <div>{formatChatText(m.text)}</div>
              </div>
            </div>
          ))}
          {!question && loading && <p className="iv-loading">{t("interview.loadingQuestion")}</p>}
          {isInterviewComplete && !loading ? (
            <div className="iv-complete-card" role="status">
              <p className="iv-complete-card__hint">{t("interview.completeHint")}</p>
              <button type="button" className="iv-complete-card__back" onClick={onBack}>
                {t("interview.completeBack")}
              </button>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </section>

        <footer className="iv-composer">
          {loading && question && <p className="iv-hint">{t("common.processing")}</p>}
          {error && <p className="iv-hint iv-hint--err">{error}</p>}

          {showComposer && isTopicQuestion && question.options.length > 0 && (
            <div className="iv-topic-list" role="list">
              {question.options.map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  className={`iv-topic-opt${answer === opt ? " iv-topic-opt--on" : ""}`}
                  onClick={() => pickOption(opt)}
                  disabled={loading}
                >
                  <strong>{opt}</strong>
                  <span>
                    {question.optionReasons?.[i]?.trim() || t("interview.topicHint")}
                  </span>
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
              {!isTopicQuestion && (
                <div className="iv-panel">
                  {fieldType === "yearMonth" && (
                    <div className="iv-ym-wrap">
                      <YearMonthInput value={answer} onChange={setAnswer} disabled={loading} />
                    </div>
                  )}

                  {fieldType !== "yearMonth" && fieldType !== "select" && (
                    <textarea
                      ref={answerRef}
                      className="iv-input iv-textarea"
                      rows={1}
                      value={answer}
                      onChange={(e) => {
                        setAnswer(e.target.value);
                        setError(null);
                        resizeAnswerField(e.target);
                      }}
                      placeholder={t("interview.answerPlaceholder")}
                      disabled={loading}
                      enterKeyHint="send"
                      autoComplete="off"
                      onFocus={focusAnswerField}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
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
              )}

              {isTopicQuestion && !answer && (
                <p className="iv-hint">{t("interview.pickAbove")}</p>
              )}

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
