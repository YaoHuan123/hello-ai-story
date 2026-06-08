import { formatProductionError } from "../../lib/formatProductionError";

type Props = {
  lastError?: string;
};

export function ProductionFailureNotice({ lastError }: Props) {
  const formatted = formatProductionError(lastError);
  if (!formatted) return null;

  return (
    <div className="production-failure" role="alert">
      <strong>{formatted.title}</strong>
      {formatted.detail && formatted.detail !== formatted.title && (
        <p className="production-failure__detail">{formatted.detail}</p>
      )}
      {formatted.hint && <p className="production-failure__hint">{formatted.hint}</p>}
    </div>
  );
}
