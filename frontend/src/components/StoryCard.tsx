import { IconFilm } from "./icons";
import { VideoTaskCover } from "./VideoTaskCover";

type Props = {
  title: string;
  interviewId: string;
  coverTaskId?: string | null;
  onOpenCreate: () => void;
  onDelete: () => void;
};

const framePlaceholder = (
  <div className="story-card__frame-placeholder" aria-hidden>
    <IconFilm size={32} />
  </div>
);

/** 故事墙卡片：标题 + 进入创作（有成功成片时显示真实封面）。 */
export function StoryCard({ title, interviewId, coverTaskId, onOpenCreate, onDelete }: Props) {
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
        {coverTaskId ? (
          <VideoTaskCover
            interviewId={interviewId}
            taskId={coverTaskId}
            className="story-card__frame-img"
            fallback={framePlaceholder}
          />
        ) : (
          framePlaceholder
        )}
        <span className="story-card__frame-cta">进入创作</span>
      </button>
    </article>
  );
}
