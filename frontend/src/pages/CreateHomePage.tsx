import { AppPageShell } from "../components/AppPageShell";
import { SubpageHeader } from "../components/SubpageHeader";
import { IconFileText, IconFilm, IconMic } from "../components/icons";
import "./CreateHomePage.css";

const CARDS = [
  {
    id: "interview-chat",
    step: 1,
    title: "采访聊天",
    desc: "和 AI 轻松对话，把回忆变成结构化素材",
    action: "interview" as const,
    Icon: IconMic,
    accent: "warm",
  },
  {
    id: "create-text",
    step: 2,
    title: "创作文本",
    desc: "将访谈整理成可朗读的故事正文",
    action: "text" as const,
    Icon: IconFileText,
    accent: "paper",
  },
  {
    id: "create-video",
    step: 3,
    title: "创作视频",
    desc: "选择文本与风格，生成传记或访谈成片",
    action: "video" as const,
    Icon: IconFilm,
    accent: "film",
  },
] as const;

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
  const handlers = {
    interview: onInterviewChat,
    text: onTextCreate,
    video: onVideoCreate,
  };

  return (
    <AppPageShell className="create-home-page">
      <SubpageHeader title="创作工作台" subtitle={interviewTitle} onBack={onBack} />

      <main className="create-home-scroll">
        <ul className="create-home-cards" aria-label="创作方式">
          {CARDS.map((card) => {
            const Icon = card.Icon;
            return (
              <li key={card.id} className="create-home-cards__item">
                <button
                  type="button"
                  className={`create-home-card create-home-card--${card.accent}`}
                  onClick={handlers[card.action]}
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
                  <span className="create-home-card__arrow" aria-hidden>
                    →
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
