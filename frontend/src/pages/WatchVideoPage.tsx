import { useEffect, useState } from "react";
import { getWatchVideo, fetchWatchVideoBlob } from "../api/watch";
import { SubpageHeader } from "../components/SubpageHeader";
import { displayError, isUnauthorizedError, t } from "../i18n";
import type { WatchVideoDetail } from "../types/watch";
import "./WatchVideoPage.css";

type Props = {
  publishId: string;
  onBack: () => void;
  onStartQuiz: () => void;
  onNeedLogin: () => void;
};

export function WatchVideoPage({ publishId, onBack, onStartQuiz, onNeedLogin }: Props) {
  const [detail, setDetail] = useState<WatchVideoDetail | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setDetail(null);
    setVideoUrl(null);

    void getWatchVideo(publishId)
      .then(async (d) => {
        if (cancelled) return;
        setDetail(d);
        const blob = await fetchWatchVideoBlob(publishId);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setVideoUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isUnauthorizedError(err)) {
          onNeedLogin();
          return;
        }
        setError(displayError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [publishId, onNeedLogin]);

  return (
    <div className="watch-video-page">
      <SubpageHeader title={detail?.title ?? t("tab.watch")} onBack={onBack} />
      {loading && <p className="watch-video-page__msg">{t("common.loading")}</p>}
      {error && <p className="watch-video-page__msg watch-video-page__msg--err">{error}</p>}
      {videoUrl ? (
        <video className="watch-video-page__player" src={videoUrl} controls playsInline preload="metadata" />
      ) : null}
      {detail ? (
        <div className="watch-video-page__meta">
          <p className="watch-video-page__reward">
            {t("watch.rewardBadge", {
              points: String(detail.rewardPoints),
              count: String(detail.quizQuestionCount),
            })}
          </p>
          <button type="button" className="hs-btn hs-btn--primary watch-video-page__quiz-btn" onClick={onStartQuiz}>
            {t("watch.interactStart")}
          </button>
          <p className="watch-video-page__quiz-hint">{t("watch.interactHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
