import { useCallback, useState } from "react";
import { displayError, isUnauthorizedError } from "../../i18n";
import { formatProductionError } from "../../lib/formatProductionError";
import { parseApiErrorMessage } from "./utils";

export function useProductionRunner(onNeedLogin: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        await fn();
      } catch (err) {
        if (isUnauthorizedError(err)) {
          onNeedLogin();
          setError(displayError(err));
        } else {
          const raw = parseApiErrorMessage(err);
          const friendly = formatProductionError(raw);
          setError(
            friendly
              ? `${friendly.title}${friendly.hint ? ` — ${friendly.hint}` : ""}`
              : displayError(err),
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [onNeedLogin],
  );

  return { loading, error, message, setMessage, setError, run };
}
