import Fastify from "fastify";
import { z } from "zod";
import { ingestionQueue } from "./ingestion/queue.js";
import { rateLimiter } from "./ingestion/rate-limiter.js";
import { startWorker } from "./workflow/worker.js";
import { pgPool } from "./storage/postgres.js";
import { mongo } from "./storage/mongo.js";
import { redis } from "./storage/redis.js";
import { workItemsRoutes } from "./api/work-items.js";
import { rcaRoutes } from "./api/rcas.js";

const app = Fastify({ logger: true });

const SignalSchema = z.object({
  component_id: z.string().min(1),
  message: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

app.post("/signals", async (req, reply) => {
  const ip = req.ip;
  if (!rateLimiter.allow(ip)) return reply.code(429).send({ error: "rate_limited" });

  const parsed = SignalSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const accepted = ingestionQueue.tryEnqueue({
    ...parsed.data,
    received_at: new Date().toISOString(),
  });
  if (!accepted) return reply.code(429).send({ error: "queue_full" });
  return reply.code(202).send({ accepted: true });
});

app.get("/health", async () => {
  const checks = await Promise.allSettled([
    pgPool.query("SELECT 1"),
    mongo.db().command({ ping: 1 }),
    redis.ping(),
  ]);
  const ok = checks.every(c => c.status === "fulfilled");
  return { ok, postgres: checks[0].status, mongo: checks[1].status, redis: checks[2].status };
});

app.get("/metrics", async () => ({
  queue_size: ingestionQueue.size(),
  queue_max: ingestionQueue.maxSize,
  signals_per_sec: ingestionQueue.throughput(),
}));

await workItemsRoutes(app);
await rcaRoutes(app);
await startWorker();

// Throughput logger every 5 seconds (rubric — Observability)
setInterval(() => {
  const tps = ingestionQueue.throughput();
  // eslint-disable-next-line no-console
  console.log(`[IMS] Throughput: ${tps.toFixed(2)} signals/sec | queue=${ingestionQueue.size()}/${ingestionQueue.maxSize}`);
}, 5000);

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: "0.0.0.0" });
