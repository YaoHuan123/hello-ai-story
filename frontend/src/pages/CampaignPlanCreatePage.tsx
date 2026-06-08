import { useEffect, useRef, useState } from "react";
import { createCampaignPlan, listPublishableVideos } from "../api/campaign";
import { videoTaskCoverUrl } from "../api/production";
import { getWalletBalance } from "../api/wallet";
import { SubpageHeader } from "../components/SubpageHeader";
import { IconChevronRight } from "../components/icons";
import { displayError, t } from "../i18n";
import type { CampaignPlanDraft, PublishableVideo } from "../types/campaign";
import { QUIZ_POINTS_PER_QUESTION } from "../types/campaign";
import "./CampaignPlanCreatePage.css";

type Props = {
  draft: CampaignPlanDraft;
  onDraftChange: (patch: Partial<CampaignPlanDraft>) => void;
  onBack: () => void;
  onOpenQuestionSelect: () => void;
  onCreated: () => void;
};

type VideoKey = `${string}:${string}`;

function videoKey(v: Pick<PublishableVideo, "interviewId" | "taskId">): VideoKey {
  return `${v.interviewId}:${v.taskId}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CampaignPlanCreatePage({
  draft,
  onDraftChange,
  onBack,
  onOpenQuestionSelect,
  onCreated,
}: Props) {
  const { endYear, budget, selectedVideo, selectedQuestions } = draft;
  const [balance, setBalance] = useState<number | null>(null);
  const [videos, setVideos] = useState<PublishableVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedKey = selectedVideo ? videoKey(selectedVideo) : null;
  const selectedVideoRef = useRef(selectedVideo);
  selectedVideoRef.current = selectedVideo;

  useEffect(() => {
    void getWalletBalance()
      .then((b) => setBalance(b.balance))
      .catch(() => setBalance(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setVideosLoading(true);
    void listPublishableVideos()
      .then((res) => {
        if (cancelled) return;
        setVideos(res.videos);
        if (res.videos.length === 1 && !selectedVideoRef.current) {
          onDraftChange({ selectedVideo: res.videos[0]! });
        }
      })
      .catch(() => {
        if (!cancelled) setVideos([]);
      })
      .finally(() => {
        if (!cancelled) setVideosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onDraftChange]);

  const selectVideo = (video: PublishableVideo) => {
    const nextKey = videoKey(video);
    const prevKey = selectedVideo ? videoKey(selectedVideo) : null;
    if (nextKey === prevKey) return;
    onDraftChange({ selectedVideo: video, selectedQuestions: [] });
  };

  const handleOpenQuestions = () => {
    if (!selectedVideo) {
      setError(t("activity.videoRequired"));
      return;
    }
    setError(null);
    onOpenQuestionSelect();
  };

  const handleSubmit = () => {
    const year = Number.parseInt(endYear.trim(), 10);
    const points = Number.parseInt(budget.trim(), 10);
    if (!selectedVideo) {
      setError(t("activity.videoRequired"));
      return;
    }
    if (selectedQuestions.length === 0) {
      setError(t("activity.questionsRequired"));
      return;
    }
    if (!Number.isInteger(year) || !Number.isInteger(points) || points <= 0) {
      setError(t("activity.createInvalid"));
      return;
    }
    setLoading(true);
    setError(null);
    void createCampaignPlan({
      endYear: year,
      totalPointsBudget: points,
      interviewId: selectedVideo.interviewId,
      taskId: selectedVideo.taskId,
      questions: selectedQuestions,
    })
      .then(() => onCreated())
      .catch((err) => setError(displayError(err)))
      .finally(() => setLoading(false));
  };

  return (
    <div className="campaign-plan-page">
      <SubpageHeader title={t("activity.createPlanTitle")} onBack={onBack} />
      <p className="campaign-plan-page__desc">{t("activity.createPlanDesc")}</p>
      {balance !== null ? (
        <p className="campaign-plan-page__balance">{t("activity.availableBalance", { points: balance.toLocaleString() })}</p>
      ) : null}
      {loading && <p className="campaign-plan-page__msg">{t("common.processing")}</p>}
      {error && <p className="campaign-plan-page__msg campaign-plan-page__msg--err">{error}</p>}

      <p className="campaign-plan-page__section-label">{t("activity.selectVideoLabel")}</p>
      {videosLoading && <p className="campaign-plan-page__msg">{t("common.loading")}</p>}
      {!videosLoading && videos.length === 0 ? (
        <p className="campaign-plan-page__empty">{t("activity.noPublishableVideos")}</p>
      ) : null}
      <ul className="campaign-plan-page__video-list">
        {videos.map((video) => {
          const key = videoKey(video);
          const cover = videoTaskCoverUrl(video.interviewId, video.taskId);
          const selected = selectedKey === key;
          return (
            <li key={key}>
              <button
                type="button"
                className={selected ? "campaign-plan-page__video-item campaign-plan-page__video-item--selected" : "campaign-plan-page__video-item"}
                onClick={() => selectVideo(video)}
                disabled={loading}
              >
                <span className="campaign-plan-page__video-cover">
                  {cover ? (
                    <img src={cover} alt="" />
                  ) : (
                    <span className="campaign-plan-page__video-cover-fallback">{t("activity.videoNoCover")}</span>
                  )}
                </span>
                <span className="campaign-plan-page__video-body">
                  <span className="campaign-plan-page__video-title">{video.title}</span>
                  <span className="campaign-plan-page__video-meta">{formatDateTime(video.createdAt)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="campaign-plan-page__section-label">{t("activity.selectQuestionsLabel")}</p>
      <button
        type="button"
        className="campaign-plan-page__questions-entry"
        onClick={handleOpenQuestions}
        disabled={loading || !selectedVideo}
      >
        <span className="campaign-plan-page__questions-entry-body">
          <span className="campaign-plan-page__questions-entry-title">{t("activity.selectQuestionsEntry")}</span>
          <span className="campaign-plan-page__questions-entry-desc">
            {selectedQuestions.length > 0
              ? t("activity.selectQuestionsEntrySelected", {
                  count: String(selectedQuestions.length),
                  points: String(QUIZ_POINTS_PER_QUESTION),
                })
              : t("activity.selectQuestionsEntryEmpty")}
          </span>
        </span>
        <IconChevronRight size={20} className="campaign-plan-page__questions-entry-chevron" />
      </button>

      <div className="campaign-plan-page__form">
        <label className="campaign-plan-page__field">
          <span className="campaign-plan-page__label">{t("activity.endYearLabel")}</span>
          <input
            value={endYear}
            onChange={(e) => onDraftChange({ endYear: e.target.value })}
            inputMode="numeric"
            disabled={loading}
          />
        </label>
        <label className="campaign-plan-page__field">
          <span className="campaign-plan-page__label">{t("activity.budgetLabel")}</span>
          <input
            value={budget}
            onChange={(e) => onDraftChange({ budget: e.target.value })}
            inputMode="numeric"
            disabled={loading}
          />
          <span className="campaign-plan-page__field-hint">{t("activity.budgetHint")}</span>
        </label>
        <button
          type="button"
          className="hs-btn hs-btn--primary campaign-plan-page__submit"
          onClick={handleSubmit}
          disabled={loading || videosLoading || videos.length === 0 || !selectedVideo}
        >
          {t("activity.createPlanSubmit")}
        </button>
      </div>
    </div>
  );
}
