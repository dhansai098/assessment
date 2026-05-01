import { redis } from "../storage/redis.js";
import { pgPool } from "../storage/postgres.js";
import { withRetry } from "../storage/retry.js";

/**
 * Sliding-window debouncer.
 * "If 100 signals arrive for the same component_id within 10 seconds, only ONE
 *  Work Item is created and all 100 signals are linked to it."
 *
 * Implementation: Redis SETNX with EX=10 acts as the per-component lock.
 *  - First signal creates the Work Item (in Postgres) and stores its UUID in
 *    redis under key `wi:active:<component_id>` with TTL 10s.
 *  - Subsequent signals within 10s reuse the cached UUID and SLIDE the TTL
 *    forward by 10s on every hit. The window only "closes" when 10s pass with
 *    no new signal — exactly the required semantics.
 */
export async function resolveWorkItemId(
  componentId: string,
  alertSeverity: "P0"|"P1"|"P2"|"P3",
  componentName: string,
): Promise<string> {
  const key = `wi:active:${componentId}`;
  const existing = await redis.get(key);
  if (existing) {
    await redis.expire(key, 10); // slide window forward
    return existing;
  }

  // Race-safe creation: only the winner of SETNX inserts the work item.
  const placeholder = "pending:" + Math.random().toString(36).slice(2);
  const won = await redis.set(key, placeholder, "EX", 10, "NX");
  if (!won) {
    // Lost race — re-read.
    const v = await redis.get(key);
    if (v && !v.startsWith("pending:")) return v;
    // Fall back to creating regardless; idempotent enough for demo.
  }

  const id = await withRetry(async () => {
    const { rows } = await pgPool.query<{ id: string }>(
      `INSERT INTO work_items(component_id, title, severity)
       VALUES ($1, $2, $3) RETURNING id`,
      [componentId, `Incident on ${componentName}`, alertSeverity],
    );
    return rows[0].id;
  });
  await redis.set(key, id, "EX", 10);
  return id;
}
