import { useCallback, useEffect, useState } from "react";
import { listMyCampaignPlans } from "../api/campaign";
import { listWatchFeed } from "../api/watch";
import { WatchFeedCard } from "../components/WatchFeedCard";
import { displayError, isUnauthorizedError, t } from "../i18n";
import type { WatchFeedItem } from "../types/watch";
import "./WatchTabPage.css";

type Props = {
  refreshKey?: number;
  onOpenVideo: (publishId: string) => void;
  onNeedLogin: () => void;
};

export function WatchTabPage({ refreshKey = 0, onOpenVideo, onNeedLogin }: Props) {
  const [items, setItems] = useState<WatchFeedItem[]>([]);
  const [myPublishedCount, setMyPublishedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feedRes, plansRes] = await Promise.all([
        listWatchFeed(),
        listMyCampaignPlans().catch(() => ({ plans: [] })),
      ]);
      setItems(feedRes.items);
      setMyPublishedCount(
        (plansRes.plans ?? []).filter((p) => p.publishedVideo?.publishId).length,
      );
    } catch (err) {
      if (isUnauthorizedError(err)) {
        onNeedLogin();
        return;
      }
      setError(displayError(err));
      setItems([]);
      setMyPublishedCount(0);
    } finally {
      setLoading(false);
    }
  }, [onNeedLogin]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return (
    <div className="watch-tab-page">
      <header className="watch-tab-page__header">
        <h1 className="watch-tab-page__title">{t("tab.watch")}</h1>
        <p className="watch-tab-page__desc">{t("watch.intro")}</p>
      </header>
      {loading && <p className="watch-tab-page__msg">{t("common.loading")}</p>}
      {error && <p className="watch-tab-page__msg watch-tab-page__msg--err">{error}</p>}
      {!loading && !error && items.length === 0 ? (
        <div className="watch-tab-page__empty">
          <p>{myPublishedCount > 0 ? t("watch.myPublishedHint") : t("watch.empty")}</p>
        </div>
      ) : null}
      <ul className="watch-tab-page__grid">
        {items.map((item) => (
          <li key={item.publishId}>
            <WatchFeedCard item={item} onOpen={() => onOpenVideo(item.publishId)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
