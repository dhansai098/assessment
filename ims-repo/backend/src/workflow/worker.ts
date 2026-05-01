import { ingestionQueue, type RawSignal } from "../ingestion/queue.js";
import { mongo } from "../storage/mongo.js";
import { pgPool } from "../storage/postgres.js";
import { resolveWorkItemId } from "./debouncer.js";
import { dispatchAlert } from "../patterns/alert-strategy.js";
import { writeMetric } from "../storage/influx.js";
import { withRetry } from "../storage/retry.js";

/**
 * Worker pool: drains the bounded queue in batches and persists.
 * Decouples API latency from DB latency (backpressure friend).
 */
export async function startWorker() {
  const componentCache = new Map<string, { name: string; severity: "P0"|"P1"|"P2"|"P3" }>();

  async function getComponent(id: string) {
    const hit = componentCache.get(id);
    if (hit) return hit;
    const { rows } = await pgPool.query(
      `SELECT name, default_severity AS severity FROM components WHERE id=$1`, [id],
    );
    const v = rows[0] ?? { name: id, severity: "P2" as const };
    componentCache.set(id, v);
    return v;
  }

  // Three concurrent workers
  for (let i = 0; i < 3; i++) {
    void (async function loop() {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await ingestionQueue.dequeueBatch(500);
        if (batch.length === 0) continue;
        await Promise.all(batch.map(s => process(s, getComponent).catch(err => {
          // Dead-letter — never lose data
          mongo.db().collection("dead_letter").insertOne({ s, err: String(err), ts: new Date() });
        })));
      }
    })();
  }
}

async function process(
  s: RawSignal,
  getComponent: (id: string) => Promise<{ name: string; severity: "P0"|"P1"|"P2"|"P3" }>,
) {
  const c = await getComponent(s.component_id);
  const workItemId = await resolveWorkItemId(s.component_id, c.severity, c.name);

  // Audit log → Mongo (raw payload)
  await withRetry(() => mongo.db().collection("signals").insertOne({
    work_item_id: workItemId,
    component_id: s.component_id,
    message: s.message,
    payload: s.payload ?? {},
    received_at: new Date(s.received_at),
  }));

  // Counters → Postgres (source of truth)
  await withRetry(() => pgPool.query(
    `UPDATE work_items SET signal_count = signal_count + 1, updated_at = now() WHERE id = $1`,
    [workItemId],
  ));

  // Timeseries → InfluxDB
  writeMetric(s.component_id);

  // Strategy: alert routing per severity
  await dispatchAlert(c.severity, { workItemId, componentId: s.component_id });
}
