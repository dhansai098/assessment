import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pgPool } from "../storage/postgres.js";

const RcaBody = z.object({
  work_item_id: z.string().uuid(),
  incident_start: z.string(),
  incident_end: z.string(),
  category: z.enum(["CONFIG_ERROR","CODE_BUG","INFRA_FAILURE","CAPACITY","DEPENDENCY_FAILURE","HUMAN_ERROR","UNKNOWN"]),
  fix_applied: z.string().min(1),
  prevention_steps: z.string().min(1),
});

export async function rcaRoutes(app: FastifyInstance) {
  app.post("/rcas", async (req, reply) => {
    const parsed = RcaBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    const r = parsed.data;
    const { rows } = await pgPool.query(
      `INSERT INTO rcas(work_item_id, incident_start, incident_end, category, fix_applied, prevention_steps)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [r.work_item_id, r.incident_start, r.incident_end, r.category, r.fix_applied, r.prevention_steps],
    );
    return rows[0];
  });
}
