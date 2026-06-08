import { IconFilm } from "./icons";
import { WatchVideoCover } from "./WatchVideoCover";
import { t } from "../i18n";
import type { WatchFeedItem } from "../types/watch";
import "./WatchFeedCard.css";

type Props = {
  item: WatchFeedItem;
  onOpen: () => void;
};

const framePlaceholder = (
  <div className="watch-feed-card__frame-placeholder" aria-hidden>
    <IconFilm size={32} />
  </div>
);

export function WatchFeedCard({ item, onOpen }: Props) {
  return (
    <article className="watch-feed-card">
      <button type="button" className="watch-feed-card__frame" onClick={onOpen} aria-label={item.title}>
        <WatchVideoCover publishId={item.publishId} className="watch-feed-card__frame-img" fallback={framePlaceholder} />
        <span className="watch-feed-card__badge">
          {t("watch.rewardBadge", {
            points: String(item.rewardPoints),
            count: String(item.quizQuestionCount),
          })}
        </span>
      </button>
      <h3 className="watch-feed-card__title">{item.title}</h3>
    </article>
  );
}
