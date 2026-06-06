import { AppPageShell } from "../components/AppPageShell";
import "./CreateHomePage.css";

const CARDS = [
  {
    id: "interview-chat",
    title: "采访聊天",
    desc: "与 AI 对话收集故事内容",
    action: "interview" as const,
  },
  {
    id: "create-text",
    title: "创作文本",
    desc: "查看文本素材并生成故事文本",
    action: "text" as const,
  },
  {
    id: "create-video",
    title: "创作视频",
    desc: "查看本故事的视频列表与生成进度",
    action: "video" as const,
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
      <header className="create-home-header">
        <button type="button" className="create-home-back" onClick={onBack}>
          返回
        </button>
        <h1 className="create-home-header-title">创作</h1>
        <span className="create-home-header-spacer" aria-hidden />
      </header>

      <main className="create-home-scroll">
        {interviewTitle?.trim() ? <p className="create-home-story">{interviewTitle.trim()}</p> : null}
        <ul className="create-home-cards" aria-label="创作方式">
          {CARDS.map((card) => (
            <li key={card.id} className="create-home-cards__item">
              <button
                type="button"
                className="create-home-card"
                onClick={handlers[card.action]}
                aria-label={card.title}
              >
                <span className="create-home-card__title">{card.title}</span>
                <span className="create-home-card__desc">{card.desc}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </AppPageShell>
  );
}
