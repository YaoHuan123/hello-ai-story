import { IconFilm } from "./icons";

type Props = {
  title: string;
  onOpenCreate: () => void;
  onDelete: () => void;
};

/** 故事墙卡片：标题 + 进入创作。 */
export function StoryCard({ title, onOpenCreate, onDelete }: Props) {
  return (
    <article className="story-card story-card--wall">
      <div className="story-card__head story-card__head--wall">
        <h3 className="story-card__title story-card__title--wall">{title}</h3>
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

      <button
        type="button"
        className="story-card__frame"
        onClick={onOpenCreate}
        aria-label={`进入创作 ${title}`}
      >
        <div className="story-card__frame-placeholder" aria-hidden>
          <IconFilm size={32} />
        </div>
        <span className="story-card__frame-cta">进入创作</span>
      </button>
    </article>
  );
}
