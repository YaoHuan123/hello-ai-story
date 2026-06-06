import { useCallback, useState } from "react";
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
        const raw = parseApiErrorMessage(err);
        if (raw.includes("未登录") || raw.includes("Unauthorized")) {
          onNeedLogin();
        }
        const friendly = formatProductionError(raw);
        setError(friendly ? `${friendly.title}${friendly.hint ? ` — ${friendly.hint}` : ""}` : raw);
      } finally {
        setLoading(false);
      }
    },
    [onNeedLogin],
  );

  return { loading, error, message, setMessage, setError, run };
}
