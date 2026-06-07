import { AppPageShell } from "../components/AppPageShell";
import { SubpageHeader } from "../components/SubpageHeader";
import { IconFileText, IconFilm, IconMic } from "../components/icons";
import { t } from "../i18n";
import "./CreateHomePage.css";

type Props = {
  interviewTitle?: string | null;
  onBack: () => void;
  onInterviewChat: () => void;
  onTextCreate: () => void;
  onVideoCreate: () => void;
};

export function CreateHomePage({
  interviewTitle,
  onBack,
  onInterviewChat,
  onTextCreate,
  onVideoCreate,
}: Props) {
  const cards = [
    {
      id: "interview-chat",
      step: 1,
      title: t("createHome.interviewTitle"),
      desc: t("createHome.interviewDesc"),
      onClick: onInterviewChat,
      Icon: IconMic,
      accent: "warm",
    },
    {
      id: "create-text",
      step: 2,
      title: t("createHome.textTitle"),
      desc: t("createHome.textDesc"),
      onClick: onTextCreate,
      Icon: IconFileText,
      accent: "paper",
    },
    {
      id: "create-video",
      step: 3,
      title: t("createHome.videoTitle"),
      desc: t("createHome.videoDesc"),
      onClick: onVideoCreate,
      Icon: IconFilm,
      accent: "film",
    },
  ] as const;

  return (
    <AppPageShell className="create-home-page">
      <SubpageHeader title={t("createHome.title")} subtitle={interviewTitle} onBack={onBack} />

      <main className="create-home-scroll">
        <ul className="create-home-cards" aria-label={t("createHome.listAria")}>
          {cards.map((card) => {
            const Icon = card.Icon;
            return (
              <li key={card.id} className="create-home-cards__item">
                <button
                  type="button"
                  className={`create-home-card create-home-card--${card.accent}`}
                  onClick={card.onClick}
                  aria-label={card.title}
                >
                  <span className="create-home-card__step" aria-hidden>
                    {card.step}
                  </span>
                  <span className="create-home-card__icon" aria-hidden>
                    <Icon size={22} />
                  </span>
                  <span className="create-home-card__body">
                    <span className="create-home-card__title">{card.title}</span>
                    <span className="create-home-card__desc">{card.desc}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </main>
    </AppPageShell>
  );
}
