/**
 * Per-IP token-bucket rate limiter.
 * Default: 1000 req/sec/IP, burst = 1000.
 * Prevents a single noisy producer from monopolising the ingestion queue.
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(private capacity: number, private refillPerSec: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  allow(): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    this.lastRefill = now;
    if (this.tokens >= 1) { this.tokens -= 1; return true; }
    return false;
  }
}

class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  constructor(private rps: number) {}
  allow(key: string): boolean {
    let b = this.buckets.get(key);
    if (!b) { b = new TokenBucket(this.rps, this.rps); this.buckets.set(key, b); }
    return b.allow();
  }
}

export const rateLimiter = new RateLimiter(Number(process.env.RATE_LIMIT_RPS ?? 1000));
