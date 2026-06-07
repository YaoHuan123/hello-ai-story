import { t } from "../i18n";
import { IconChevronLeft } from "./icons";

type Props = {
  title: string;
  subtitle?: string | null;
  onBack: () => void;
  backLabel?: string;
};

export function SubpageHeader({ title, subtitle, onBack, backLabel = t("common.back") }: Props) {
  return (
    <header className="hs-subheader">
      <button type="button" className="hs-subheader__back" onClick={onBack}>
        <IconChevronLeft size={18} />
        <span>{backLabel}</span>
      </button>
      <div className="hs-subheader__center">
        <h1 className="hs-subheader__title">{title}</h1>
        {subtitle?.trim() ? <p className="hs-subheader__subtitle">{subtitle.trim()}</p> : null}
      </div>
      <span className="hs-subheader__spacer" aria-hidden />
    </header>
  );
}
