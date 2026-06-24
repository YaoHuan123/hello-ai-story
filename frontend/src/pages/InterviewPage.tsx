import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentQuestion, getInterviewMessages, submitAnswer } from "../api/interviews";
import { ApiRequestError } from "../api/client";
import { IconMic } from "../components/icons";
import { SubpageHeader } from "../components/SubpageHeader";
import { YearMonthInput } from "../components/YearMonthInput";
import { displayError, isUnauthorizedError, t } from "../i18n";
import {
  isInterviewSpeechListening,
  isInterviewSpeechSupported,
  setInterviewSpeechStopHandler,
  startInterviewSpeech,
  stopInterviewSpeech,
  type InterviewSpeechError,
} from "../lib/interviewSpeech";
import { isIosNative } from "../lib/platform";
import type { InterviewChatMessage, InterviewQuestion } from "../types/interview";
import { INTERVIEW_SKIP_LABEL, INTERVIEW_SKIP_LABEL_EN } from "../types/interview";
import { normalizeYearMonthInRange } from "../utils/yearMonth";
import "./InterviewPage.css";

type ChatMessage = InterviewChatMessage;
type InputMode = "keyboard" | "voice";
type SpeechUiState = "idle" | "busy" | "listening";

function speechErrorMessage(code: InterviewSpeechError): string {
  switch (code) {
    case "unavailable":
      return t("interview.speechUnavailable");
    case "permission_denied":
      return t("interview.speechPermissionDenied");
    case "timeout":
      return t("interview.speechTimeout");
    default:
      return t("interview.speechFailed");
  }
}

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
  const [inputMode, setInputMode] = useState<InputMode>("keyboard");
  const [speechState, setSpeechState] = useState<SpeechUiState>("idle");
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const voiceStartLockRef = useRef(false);
  const inputModeRef = useRef(inputMode);
  const loadingRef = useRef(loading);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  inputModeRef.current = inputMode;
  loadingRef.current = loading;

  const resizeAnswerField = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const focusAnswerField = () => {
    if (inputModeRef.current === "voice") return;
    window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
      answerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 320);
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

  const isInterviewCompleteEarly = question?.type === "complete";
  const isTopicQuestionEarly = question?.type === "topic";
  const fieldTypeEarly = question?.fieldType ?? "text";
  const showTextComposer =
    !isTopicQuestionEarly &&
    fieldTypeEarly !== "yearMonth" &&
    fieldTypeEarly !== "select";
  const showInputModeToggle =
    isIosNative() &&
    isInterviewSpeechSupported() &&
    !!question &&
    !isInterviewCompleteEarly &&
    showTextComposer;

  const showSpeechMicRef = useRef(showInputModeToggle);
  showSpeechMicRef.current = showInputModeToggle;

  const beginVoiceListening = useCallback(async (clearAnswer: boolean) => {
    if (!showSpeechMicRef.current || inputModeRef.current !== "voice") return;
    if (loadingRef.current || voiceStartLockRef.current) return;
    if (isInterviewSpeechListening()) {
      setSpeechState("listening");
      return;
    }

    voiceStartLockRef.current = true;
    try {
      if (clearAnswer) setAnswer("");
      setError(null);
      answerRef.current?.blur();
      void import("@capacitor/keyboard")
        .then(({ Keyboard }) => Keyboard.hide())
        .catch(() => undefined);
      setSpeechState("busy");

      const err = await startInterviewSpeech((text) => {
        if (!mountedRef.current) return;
        setAnswer(text);
        setError(null);
        if (answerRef.current) {
          resizeAnswerField(answerRef.current);
        }
      });

      if (!mountedRef.current) return;
      if (err) {
        setSpeechState("idle");
        setError(speechErrorMessage(err));
        if (err === "permission_denied" || err === "unavailable" || err === "timeout") {
          setInputMode("keyboard");
        }
        return;
      }
      setSpeechState("listening");
    } finally {
      voiceStartLockRef.current = false;
    }
  }, []);

  useEffect(() => {
    setAnswer("");
    setError(null);
    setInputMode("keyboard");
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

  useEffect(() => {
    if (!showInputModeToggle) {
      void stopInterviewSpeech();
      setSpeechState("idle");
      setInputMode("keyboard");
      return;
    }
    return () => {
      void stopInterviewSpeech();
      setSpeechState("idle");
    };
  }, [showInputModeToggle, question?.key]);

  useEffect(() => {
    if (inputMode !== "voice" || !showInputModeToggle || loading) return;
    void beginVoiceListening(true);
  }, [inputMode, showInputModeToggle, question?.key, loading, beginVoiceListening]);

  useEffect(() => {
    if (inputMode !== "keyboard") return;
    void stopInterviewSpeech();
    setSpeechState("idle");
  }, [inputMode]);

  useEffect(() => {
    mountedRef.current = true;
    setInterviewSpeechStopHandler(() => {
      if (!mountedRef.current) return;
      setSpeechState("idle");
      if (
        inputModeRef.current === "voice" &&
        showSpeechMicRef.current &&
        !loadingRef.current
      ) {
        window.setTimeout(() => {
          void beginVoiceListening(false);
        }, 400);
      }
    });
    return () => {
      mountedRef.current = false;
      setInterviewSpeechStopHandler(null);
      void stopInterviewSpeech();
    };
  }, [beginVoiceListening]);

  const selectInputMode = (mode: InputMode) => {
    if (loading || mode === inputMode) return;
    if (mode === "keyboard") {
      void stopInterviewSpeech();
      setSpeechState("idle");
    }
    setInputMode(mode);
    setError(null);
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
        if (isInterviewSpeechListening()) {
          await stopInterviewSpeech();
          setSpeechState("idle");
        }
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
        if (isInterviewSpeechListening()) {
          await stopInterviewSpeech();
          setSpeechState("idle");
        }
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
  const voiceModeActive = inputMode === "voice" && showInputModeToggle;

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
          {showInputModeToggle && showComposer && (
            <div className="iv-input-mode-float">
              <div className="iv-input-mode" role="group" aria-label={t("interview.inputModeAria")}>
                <button
                  type="button"
                  className={`iv-input-mode__btn${inputMode === "keyboard" ? " iv-input-mode__btn--on" : ""}`}
                  onClick={() => selectInputMode("keyboard")}
                  disabled={loading}
                >
                  {t("interview.inputModeKeyboard")}
                </button>
                <button
                  type="button"
                  className={`iv-input-mode__btn iv-input-mode__btn--voice${inputMode === "voice" ? " iv-input-mode__btn--on" : ""}${speechState === "listening" ? " iv-input-mode__btn--live" : ""}`}
                  onClick={() => selectInputMode("voice")}
                  disabled={loading}
                >
                  <IconMic size={16} />
                  {t("interview.inputModeVoice")}
                </button>
              </div>
            </div>
          )}

          {loading && question && <p className="iv-hint">{t("common.processing")}</p>}
          {voiceModeActive && speechState === "listening" && (
            <p className="iv-hint iv-hint--voice">{t("interview.speechModeHint")}</p>
          )}
          {voiceModeActive && speechState === "busy" && (
            <p className="iv-hint">{t("interview.speechStarting")}</p>
          )}
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
                      className={`iv-input iv-textarea${voiceModeActive ? " iv-textarea--voice" : ""}`}
                      rows={1}
                      value={answer}
                      onChange={(e) => {
                        setAnswer(e.target.value);
                        setError(null);
                        resizeAnswerField(e.target);
                      }}
                      placeholder={
                        voiceModeActive
                          ? t("interview.speechModePlaceholder")
                          : t("interview.answerPlaceholder")
                      }
                      disabled={loading || speechState === "busy"}
                      readOnly={voiceModeActive}
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
