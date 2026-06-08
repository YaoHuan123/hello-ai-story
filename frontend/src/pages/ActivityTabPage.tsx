import { useCallback, useEffect, useState } from "react";
import { listMyCampaignPlans } from "../api/campaign";
import { videoTaskCoverUrl } from "../api/production";
import { IconChevronRight, IconSpark } from "../components/icons";
import { displayError, isUnauthorizedError, t } from "../i18n";
import type { CampaignPlan } from "../types/campaign";
import "./ActivityTabPage.css";

type Props = {
  refreshKey: number;
  isActive: boolean;
  notice?: string | null;
  onOpenCreatePlan: () => void;
  onNeedLogin: () => void;
};

function formatPoints(n: number): string {
  return n.toLocaleString();
}

export function ActivityTabPage({
  refreshKey,
  isActive,
  notice,
  onOpenCreatePlan,
  onNeedLogin,
}: Props) {
  const [plans, setPlans] = useState<CampaignPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlans = useCallback(() => {
    setLoading(true);
    setError(null);
    void listMyCampaignPlans()
      .then((res) => setPlans(Array.isArray(res.plans) ? res.plans : []))
      .catch((err) => {
        if (isUnauthorizedError(err)) {
          onNeedLogin();
          return;
        }
        setError(displayError(err));
        setPlans([]);
      })
      .finally(() => setLoading(false));
  }, [onNeedLogin]);

  useEffect(() => {
    if (!isActive) return;
    loadPlans();
  }, [isActive, refreshKey, loadPlans]);

  return (
    <div className="activity-tab-page">
      <header className="activity-tab-page__header">
        <h1 className="activity-tab-page__title">{t("tab.activity")}</h1>
        <p className="activity-tab-page__desc">{t("activity.intro")}</p>
      </header>

      {notice ? (
        <p className="activity-tab-page__notice" role="status">
          {notice}
        </p>
      ) : null}

      <p className="activity-tab-page__section-label">{t("activity.publishedList")}</p>
      {loading && <p className="activity-tab-page__msg">{t("common.loading")}</p>}
      {error && <p className="activity-tab-page__msg activity-tab-page__msg--err">{error}</p>}
      {!loading && !error && plans.length === 0 ? (
        <p className="activity-tab-page__empty">{t("activity.noPublished")}</p>
      ) : null}
      <ul className="activity-tab-page__plan-list">
        {plans.map((plan) => (
          <li key={plan.planId} className="activity-tab-page__plan-item">
            {plan.publishedVideo ? (
              <div className="activity-tab-page__plan-cover">
                {(() => {
                  const cover = videoTaskCoverUrl(
                    plan.publishedVideo.interviewId,
                    plan.publishedVideo.taskId,
                  );
                  return cover ? (
                    <img src={cover} alt="" className="activity-tab-page__plan-cover-img" />
                  ) : (
                    <span className="activity-tab-page__plan-cover-fallback">{t("activity.videoNoCover")}</span>
                  );
                })()}
              </div>
            ) : null}
            <div className="activity-tab-page__plan-body">
              <div className="activity-tab-page__plan-main">
                <span className="activity-tab-page__plan-year">{t("activity.planUntil", { year: String(plan.endYear) })}</span>
                <span className="activity-tab-page__plan-status">{t(`activity.planStatus.${plan.status}`)}</span>
              </div>
              <div className="activity-tab-page__plan-meta">
                {plan.publishedVideo ? (
                  <>
                    <span>{t("activity.planVideo", { title: plan.publishedVideo.title })}</span>
                    <span>
                      {t("activity.planQuestionCount", {
                        count: String(plan.publishedVideo.quizQuestionCount),
                      })}
                    </span>
                  </>
                ) : null}
              <span>{t("activity.planBudgetYearly", { points: formatPoints(plan.pointsPerYear) })}</span>
              <span>{t("activity.planPortion", { points: formatPoints(plan.pointsPerPortion) })}</span>
              <span>{t("activity.planRewardPool", { points: formatPoints(plan.rewardPoolBalance) })}</span>
              <span>{t("activity.planRewarded", { points: formatPoints(plan.rewardedTotal) })}</span>
              {(plan.distributedTotal ?? 0) > 0 || (plan.completedTotal ?? 0) > 0 ? (
                <>
                  <span>{t("activity.planDistributed", { points: formatPoints(plan.distributedTotal ?? 0) })}</span>
                  <span>{t("activity.planCompleted", { points: formatPoints(plan.completedTotal ?? 0) })}</span>
                </>
              ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="activity-tab-page__section-label">{t("activity.createNew")}</p>

      <button type="button" className="activity-tab-page__card activity-tab-page__card--action" onClick={onOpenCreatePlan}>
        <span className="activity-tab-page__card-icon">
          <IconSpark size={22} />
        </span>
        <span className="activity-tab-page__card-body">
          <span className="activity-tab-page__card-title">{t("activity.planCardTitle")}</span>
          <span className="activity-tab-page__card-desc">{t("activity.planCardDesc")}</span>
        </span>
        <IconChevronRight size={20} className="activity-tab-page__card-chevron" />
      </button>
    </div>
  );
}
