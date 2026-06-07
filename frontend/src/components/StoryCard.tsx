import { t } from "../i18n";
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
          aria-label={t("storyWall.deleteStoryAria", { title })}
        >
          {t("common.delete")}
        </button>
      </div>

      <button
        type="button"
        className="story-card__frame"
        onClick={onOpenCreate}
        aria-label={t("storyWall.enterCreateAria", { title })}
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
        <span className="story-card__frame-cta">{t("storyWall.enterCreate")}</span>
      </button>
    </article>
  );
}
