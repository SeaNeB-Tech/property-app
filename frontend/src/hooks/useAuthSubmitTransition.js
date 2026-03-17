"use client";

import { useCallback, useState } from "react";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function useAuthSubmitTransition(options = {}) {
  const { minDurationMs = 450 } = options;
  const [isTransitioning, setIsTransitioning] = useState(false);

  const runWithTransition = useCallback(
    async (request, handlers = {}) => {
      if (isTransitioning) {
        return { ok: false, skipped: true };
      }

      const startedAt = Date.now();
      setIsTransitioning(true);

      const ensureMinDuration = async () => {
        const elapsed = Date.now() - startedAt;
        const remaining = minDurationMs - elapsed;
        if (remaining > 0) {
          await sleep(remaining);
        }
      };

      try {
        const result = await request();
        await ensureMinDuration();
        await handlers.onSuccess?.(result);
        setIsTransitioning(false);
        return { ok: true, result };
      } catch (error) {
        await ensureMinDuration();
        try {
          await handlers.onError?.(error);
        } finally {
          setIsTransitioning(false);
        }
        return { ok: false, error };
      }
    },
    [isTransitioning, minDurationMs]
  );

  const stopTransition = useCallback(() => {
    setIsTransitioning(false);
  }, []);

  return {
    isTransitioning,
    showTransition: isTransitioning,
    runWithTransition,
    stopTransition,
  };
}
