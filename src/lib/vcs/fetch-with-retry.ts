// Shared fetch wrapper for the VCS clients. Adds:
//   - retry on 429 / 5xx with exponential backoff (jittered).
//   - honor `Retry-After` when present.
//   - capped concurrency for batch operations via `pLimit`.
//
// Kept dependency-free so the mini-services bundle stays small.

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
};

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {}
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      // 2xx / 3xx / 4xx (non-429) — return immediately. Only 429 + 5xx retry.
      if (res.status !== 429 && res.status < 500) return res;

      // Last attempt — don't sleep, just return.
      if (attempt === maxAttempts) return res;

      // Prefer server-supplied Retry-After when present.
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelay * 2 ** (attempt - 1) + Math.random() * 200;
      await sleep(delay);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) throw err;
      await sleep(baseDelay * 2 ** (attempt - 1) + Math.random() * 200);
    }
  }
  // Unreachable, but TypeScript wants a definite return.
  throw lastErr instanceof Error ? lastErr : new Error("fetchWithRetry exhausted retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Tiny p-limit. Calls `task` up to `concurrency` at a time. Avoids pulling in
 * a dep just for this.
 */
export function pLimit<T>(concurrency: number, items: T[], task: (item: T) => Promise<unknown>): Promise<void> {
  let i = 0;
  let active = 0;
  return new Promise((resolve, reject) => {
    const next = () => {
      if (i >= items.length && active === 0) {
        resolve();
        return;
      }
      while (active < concurrency && i < items.length) {
        const item = items[i++];
        active++;
        task(item)
          .catch(reject)
          .finally(() => {
            active--;
            next();
          });
      }
    };
    next();
  });
}
