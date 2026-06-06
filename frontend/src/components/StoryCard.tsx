type Props = {
  title: string;
  textProgressLabel: string;
  textProgressPct: number;
  statePill: string;
  videoStatusLine?: string;
  onOpenCreate: () => void;
  onDelete: () => void;
};

/** 故事 Tab 单列卡（布局参考老项目 StoryCard layout=wall）。 */
export function StoryCard({
  title,
  textProgressLabel,
  textProgressPct,
  statePill,
  videoStatusLine,
  onOpenCreate,
  onDelete,
}: Props) {
  return (
    <div className="story-card story-card--wall">
      <div className="story-card__head story-card__head--wall">
        <h3 className="story-card__title story-card__title--wall">{title}</h3>
        <div className="story-card__head-actions story-card__head-actions--wall">
          <button
            type="button"
            className="story-card__edit"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCreate();
            }}
            aria-label={`进入访谈 ${title}`}
          >
            创作
          </button>
          <button
            type="button"
            className="story-card__del story-card__del--wall"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`删除故事 ${title}`}
          >
            删除
          </button>
        </div>
      </div>

      <p className="story-card__progress-text">
        写作进度：{textProgressLabel}
        <span className="story-card__progress-pct" aria-hidden>
          （{textProgressPct}%）
        </span>
      </p>

      {videoStatusLine ? (
        <p className="story-card__video-line story-card__video-line--wall">{videoStatusLine}</p>
      ) : null}

      <button
        type="button"
        className="story-card__frame"
        onClick={onOpenCreate}
        aria-label={`进入创作 ${title}`}
      >
        <div className="story-card__frame-placeholder" aria-hidden>
          <span className="story-card__frame-placeholder-emoji">🎬</span>
        </div>
      </button>

      <div className="story-card__wall-foot">
        <span className="story-card__pill story-card__pill--wall">{statePill}</span>
      </div>
    </div>
  );
}
