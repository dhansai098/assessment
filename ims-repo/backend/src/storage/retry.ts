/**
 * Decorator: retry with exponential backoff + jitter.
 * Used around every DB write so a transient blip doesn't lose a signal.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 5;
  const base = opts.baseMs ?? 100;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = base * 2 ** attempt + Math.random() * 50;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
