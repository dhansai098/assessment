/**
 * Bounded async queue with backpressure.
 * - tryEnqueue() returns false when full → caller responds with 429
 * - dequeueBatch() drains up to N items for the worker to persist
 * - throughput() returns moving signals/sec for the /metrics endpoint
 */
export interface RawSignal {
  component_id: string;
  message: string;
  payload?: Record<string, unknown>;
  received_at: string;
}

class BoundedAsyncQueue {
  readonly maxSize: number;
  private buf: RawSignal[] = [];
  private waiters: Array<() => void> = [];
  private windowCount = 0;
  private windowStart = Date.now();

  constructor(maxSize: number) { this.maxSize = maxSize; }

  size(): number { return this.buf.length; }

  tryEnqueue(s: RawSignal): boolean {
    if (this.buf.length >= this.maxSize) return false;
    this.buf.push(s);
    this.windowCount++;
    const w = this.waiters.shift();
    if (w) w();
    return true;
  }

  async dequeueBatch(max: number, timeoutMs = 100): Promise<RawSignal[]> {
    if (this.buf.length === 0) {
      await new Promise<void>(resolve => {
        const t = setTimeout(() => { this.waiters = this.waiters.filter(x => x !== resolve); resolve(); }, timeoutMs);
        this.waiters.push(() => { clearTimeout(t); resolve(); });
      });
    }
    return this.buf.splice(0, max);
  }

  throughput(): number {
    const elapsed = (Date.now() - this.windowStart) / 1000;
    const tps = elapsed > 0 ? this.windowCount / elapsed : 0;
    if (elapsed >= 5) { this.windowCount = 0; this.windowStart = Date.now(); }
    return tps;
  }
}

export const ingestionQueue = new BoundedAsyncQueue(
  Number(process.env.QUEUE_MAX_SIZE ?? 50_000),
);
