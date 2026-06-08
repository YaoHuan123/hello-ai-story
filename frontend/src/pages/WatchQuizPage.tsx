import { useCallback, useEffect, useRef, useState } from "react";
import { startWatchQuiz, submitWatchQuizAnswer } from "../api/watch";
import { SubpageHeader } from "../components/SubpageHeader";
import { displayError, isUnauthorizedError, t } from "../i18n";
import type { WatchQuizMessage } from "../types/watch";
import "./InterviewPage.css";

type Props = {
  publishId: string;
  videoTitle?: string | null;
  onBack: () => void;
  onNeedLogin: () => void;
};

export function WatchQuizPage({ publishId, videoTitle, onBack, onNeedLogin }: Props) {
  const [messages, setMessages] = useState<WatchQuizMessage[]>([]);
  const [sessionStatus, setSessionStatus] = useState<"in_progress" | "completed">("in_progress");
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<{ index: number; text: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const applySession = useCallback(
    (body: {
      sessionStatus: "in_progress" | "completed";
      earnedPoints: number;
      totalQuestions: number;
      currentQuestion: { index: number; text: string } | null;
      messages: WatchQuizMessage[];
    }) => {
      setSessionStatus(body.sessionStatus);
      setEarnedPoints(body.earnedPoints);
      setTotalQuestions(body.totalQuestions);
      setCurrentQuestion(body.currentQuestion);
      setMessages(body.messages);
    },
    [],
  );

  const loadSession = useCallback(async () => {
    const body = await startWatchQuiz(publishId);
    applySession(body);
  }, [applySession, publishId]);

  useEffect(() => {
    setAnswer("");
    setError(null);
    setLoading(true);
    void loadSession()
      .catch((err) => {
        if (isUnauthorizedError(err)) {
          onNeedLogin();
          return;
        }
        setError(displayError(err));
      })
      .finally(() => setLoading(false));
  }, [loadSession, onNeedLogin, publishId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, error]);

  const handleSubmit = () => {
    const trimmed = answer.trim();
    if (!trimmed) {
      setError(t("watch.quizEnterAnswer"));
      return;
    }
    if (submittingRef.current || sessionStatus === "completed") return;
    void (async () => {
      submittingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await submitWatchQuizAnswer(publishId, trimmed);
        applySession({
          sessionStatus: result.sessionStatus,
          earnedPoints: result.earnedPointsTotal,
          totalQuestions,
          currentQuestion: result.currentQuestion,
          messages: result.messages,
        });
        setAnswer("");
      } catch (err) {
        if (isUnauthorizedError(err)) {
          onNeedLogin();
        } else {
          setError(displayError(err));
        }
      } finally {
        submittingRef.current = false;
        setLoading(false);
      }
    })();
  };

  const isComplete = sessionStatus === "completed";
  const showComposer = !loading && !isComplete && !!currentQuestion;

  return (
    <div className="iv-layout">
      <SubpageHeader
        title={t("watch.quizTitle")}
        subtitle={videoTitle ?? undefined}
        onBack={onBack}
      />
      <div className="iv-main">
        <section className="iv-messages" aria-live="polite">
          {earnedPoints > 0 ? (
            <p className="iv-hint" style={{ marginBottom: 12 }}>
              {t("watch.quizEarnedPending", { points: String(earnedPoints) })}
            </p>
          ) : null}
          {messages.map((m) => {
            const feedbackClass =
              m.feedback === "correct"
                ? "iv-msg--feedback-correct"
                : m.feedback === "incorrect"
                  ? "iv-msg--feedback-incorrect"
                  : "";
            return (
              <div key={m.id} className={`iv-msg iv-msg--${m.role} ${feedbackClass}`.trim()}>
                <div className="iv-card">
                  {m.role === "ai" && m.meta ? <div className="iv-meta">{m.meta}</div> : null}
                  {m.feedback ? (
                    <div className="iv-quiz-feedback">
                      <span className="iv-quiz-feedback__badge" aria-hidden>
                        {m.feedback === "correct" ? "✓" : "✗"}
                      </span>
                      <span className="iv-quiz-feedback__reason">{m.text}</span>
                      {m.feedback === "correct" && m.pointsAwarded != null && m.pointsAwarded > 0 ? (
                        <span className="iv-quiz-feedback__points">
                          {t("watch.quizPointsPending", { points: String(m.pointsAwarded) })}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div>{m.text}</div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && messages.length === 0 ? (
            <p className="iv-loading">{t("watch.quizLoading")}</p>
          ) : null}
          {isComplete && !loading ? (
            <div className="iv-complete-card" role="status">
              <p className="iv-complete-card__hint">
                {t("watch.quizComplete", {
                  earned: String(earnedPoints),
                  total: String(totalQuestions),
                })}
              </p>
              <button type="button" className="iv-complete-card__back" onClick={onBack}>
                {t("watch.quizBack")}
              </button>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </section>

        <footer className="iv-composer">
          {loading && currentQuestion ? <p className="iv-hint">{t("common.processing")}</p> : null}
          {error ? <p className="iv-hint iv-hint--err">{error}</p> : null}
          {showComposer ? (
            <>
              <textarea
                className="iv-input"
                rows={2}
                value={answer}
                placeholder={t("watch.quizPlaceholder")}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <button
                type="button"
                className="hs-btn hs-btn--primary iv-send"
                disabled={loading || !answer.trim()}
                onClick={handleSubmit}
              >
                {t("watch.quizSubmit")}
              </button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
