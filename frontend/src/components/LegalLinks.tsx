import { t } from "../i18n";
import { getLegalUrls } from "../lib/legalUrls";
import { openExternalUrl } from "../lib/openExternalUrl";
import "./LegalLinks.css";

type Props = {
  /** 登录页底部紧凑链接 */
  variant?: "inline" | "block";
};

export function LegalLinks({ variant = "inline" }: Props) {
  const urls = getLegalUrls();

  if (variant === "block") {
    return (
      <nav className="legal-links legal-links--block" aria-label={t("legal.navAria")}>
        <button type="button" className="legal-links__btn" onClick={() => openExternalUrl(urls.privacy)}>
          {t("legal.privacy")}
        </button>
        <button type="button" className="legal-links__btn" onClick={() => openExternalUrl(urls.terms)}>
          {t("legal.terms")}
        </button>
        <button type="button" className="legal-links__btn" onClick={() => openExternalUrl(urls.support)}>
          {t("legal.support")}
        </button>
      </nav>
    );
  }

  return (
    <p className="legal-links legal-links--inline">
      <a href={urls.privacy} target="_blank" rel="noopener noreferrer">
        {t("legal.privacy")}
      </a>
      <span className="legal-links__sep" aria-hidden="true">
        ·
      </span>
      <a href={urls.terms} target="_blank" rel="noopener noreferrer">
        {t("legal.terms")}
      </a>
      <span className="legal-links__sep" aria-hidden="true">
        ·
      </span>
      <a href={urls.support} target="_blank" rel="noopener noreferrer">
        {t("legal.support")}
      </a>
    </p>
  );
}
