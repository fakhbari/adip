// In-memory token-bucket rate limiter. Single-process — fine for the
// local-or-small-team deploy ADIP is built for. Swap to a Redis-backed
// implementation if/when this moves to a multi-instance prod.

type Bucket = { tokens: number; refilledAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitConfig = {
  capacity: number;        // burst size
  refillPerSec: number;    // sustained rate
};

const DEFAULT_CONFIG: RateLimitConfig = { capacity: 10, refillPerSec: 1 };

/**
 * Returns `true` when the request is allowed, `false` when it should be 429'd.
 * Key is up to the caller — typically `${userId}:${routeName}`.
 */
export function consume(key: string, config: RateLimitConfig = DEFAULT_CONFIG): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing) {
    buckets.set(key, { tokens: config.capacity - 1, refilledAt: now });
    return true;
  }
  const elapsedSec = (now - existing.refilledAt) / 1000;
  const refill = Math.floor(elapsedSec * config.refillPerSec);
  const tokens = Math.min(config.capacity, existing.tokens + refill);
  if (tokens <= 0) {
    // Don't refill the clock here — keep refilledAt where it was so we don't
    // starve the bucket between requests.
    return false;
  }
  buckets.set(key, { tokens: tokens - 1, refilledAt: refill > 0 ? now : existing.refilledAt });
  return true;
}

/** Test-only — reset all buckets between runs. */
export function __resetForTests(): void {
  buckets.clear();
}
