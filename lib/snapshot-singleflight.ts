/**
 * Deduplicate concurrent CRM snapshot reads and reuse a very recent response.
 * Local to one server process only: no cross-instance coordination is assumed.
 * This caches read-only data, never request auth or WhatsApp send actions.
 */
export function createSnapshotSingleflight<T>(
  maxFreshnessMs = 10000,
  now: () => number = () => Date.now(),
) {
  let stored: { value: T; expiresAt: number } | null = null;
  let pending: Promise<T> | null = null;

  return {
    get(
      load: () => Promise<T>,
      ttlForResult: (value: T) => number = () => maxFreshnessMs,
    ): Promise<T> {
      if (stored && now() < stored.expiresAt) return Promise.resolve(stored.value);
      if (pending) return pending;

      // Only start one read for all concurrent visitors of this process.
      pending = Promise.resolve()
        .then(load)
        .then(
          (value) => {
            const desired = ttlForResult(value);
            const ttl = Number.isFinite(desired)
              ? Math.min(maxFreshnessMs, Math.max(0, desired)) : 0;
            stored = ttl > 0 ? { value, expiresAt: now() + ttl } : null;
            pending = null;
            return value;
          },
          (error) => {
            // Never cache failures: the next request may recover immediately.
            pending = null;
            throw error;
          },
        );
      return pending;
    },
  };
}
