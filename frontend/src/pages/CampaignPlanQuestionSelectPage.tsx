import { useMemo, useState } from "react";
import { generateQuizQuestions } from "../api/campaign";
import { SubpageHeader } from "../components/SubpageHeader";
import { displayError, t } from "../i18n";
import type { PublishableVideo, QuizQuestionDraft, SelectedQuizQuestion } from "../types/campaign";
import { QUIZ_POINTS_PER_QUESTION } from "../types/campaign";
import "./CampaignPlanQuestionSelectPage.css";

type Props = {
  video: PublishableVideo;
  selectedQuestions: SelectedQuizQuestion[];
  onBack: (questions: SelectedQuizQuestion[]) => void;
};

function questionKey(q: Pick<SelectedQuizQuestion, "question">): string {
  return q.question.trim().replace(/\s+/g, " ").toLowerCase();
}

export function CampaignPlanQuestionSelectPage({ video, selectedQuestions: initialSelected, onBack }: Props) {
  const [batchQuestions, setBatchQuestions] = useState<QuizQuestionDraft[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<SelectedQuizQuestion[]>(initialSelected);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedKeySet = useMemo(() => new Set(selectedQuestions.map(questionKey)), [selectedQuestions]);

  const toggleQuestion = (draft: QuizQuestionDraft) => {
    const key = questionKey(draft);
    if (selectedKeySet.has(key)) {
      setSelectedQuestions((prev) => prev.filter((q) => questionKey(q) !== key));
      return;
    }
    setSelectedQuestions((prev) => [
      ...prev,
      { question: draft.question, referenceAnswer: draft.referenceAnswer },
    ]);
  };

  const handleGenerate = () => {
    setGenerating(true);
    setError(null);
    void generateQuizQuestions({
      interviewId: video.interviewId,
      taskId: video.taskId,
      excludeQuestions: selectedQuestions.map((q) => q.question),
    })
      .then((res) => setBatchQuestions(res.questions))
      .catch((err) => setError(displayError(err)))
      .finally(() => setGenerating(false));
  };

  return (
    <div className="campaign-question-page">
      <SubpageHeader
        title={t("activity.questionsPageTitle")}
        onBack={() => onBack(selectedQuestions)}
      />
      <p className="campaign-question-page__video-name">{video.title}</p>
      <p className="campaign-question-page__hint">
        {t("activity.generateQuestionsHint", { count: "5", points: String(QUIZ_POINTS_PER_QUESTION) })}
      </p>

      {generating && <p className="campaign-question-page__msg">{t("common.processing")}</p>}
      {error && <p className="campaign-question-page__msg campaign-question-page__msg--err">{error}</p>}

      <div className="campaign-question-page__toolbar">
        <p className="campaign-question-page__selected-count">
          {t("activity.selectedQuestionsCount", { count: String(selectedQuestions.length) })}
        </p>
        <button
          type="button"
          className="hs-btn hs-btn--secondary campaign-question-page__generate-btn"
          onClick={handleGenerate}
          disabled={generating}
        >
          {t("activity.generateQuestions")}
        </button>
      </div>

      {selectedQuestions.length > 0 ? (
        <ul className="campaign-question-page__selected-list">
          {selectedQuestions.map((q) => (
            <li key={questionKey(q)} className="campaign-question-page__selected-item">
              <span className="campaign-question-page__question-text">{q.question}</span>
              <span className="campaign-question-page__question-points">
                {t("activity.pointsPerQuestion", { points: String(QUIZ_POINTS_PER_QUESTION) })}
              </span>
              <button
                type="button"
                className="campaign-question-page__remove-btn"
                onClick={() => toggleQuestion({ draftId: "", question: q.question, referenceAnswer: q.referenceAnswer })}
                disabled={generating}
              >
                {t("activity.removeQuestion")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {batchQuestions.length > 0 ? (
        <>
          <p className="campaign-question-page__batch-label">{t("activity.latestBatchLabel")}</p>
          <ul className="campaign-question-page__batch-list">
            {batchQuestions.map((draft) => {
              const picked = selectedKeySet.has(questionKey(draft));
              return (
                <li key={draft.draftId}>
                  <button
                    type="button"
                    className={
                      picked
                        ? "campaign-question-page__batch-item campaign-question-page__batch-item--picked"
                        : "campaign-question-page__batch-item"
                    }
                    onClick={() => toggleQuestion(draft)}
                    disabled={generating}
                  >
                    <span className="campaign-question-page__question-text">{draft.question}</span>
                    <span className="campaign-question-page__question-points">
                      {picked ? t("activity.questionSelected") : t("activity.questionTapToSelect")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="campaign-question-page__empty">{t("activity.questionsPageEmpty")}</p>
      )}

      <button
        type="button"
        className="hs-btn hs-btn--primary campaign-question-page__done"
        onClick={() => onBack(selectedQuestions)}
        disabled={generating}
      >
        {t("activity.confirmQuestions")}
      </button>
    </div>
  );
}
