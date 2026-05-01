import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pgPool } from "../storage/postgres.js";
import { mongo } from "../storage/mongo.js";
import { transition, type WorkItemStatus, RcaRequiredError, InvalidTransitionError } from "../patterns/state-machine.js";

export async function workItemsRoutes(app: FastifyInstance) {
  app.get("/work-items", async () => {
    const { rows } = await pgPool.query(
      `SELECT * FROM work_items ORDER BY severity, start_time DESC LIMIT 200`,
    );
    return rows;
  });

  app.get("/work-items/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await pgPool.query(`SELECT * FROM work_items WHERE id=$1`, [id]);
    return rows[0] ?? null;
  });

  app.get("/work-items/:id/signals", async (req) => {
    const { id } = req.params as { id: string };
    return mongo.db().collection("signals").find({ work_item_id: id })
      .sort({ received_at: -1 }).limit(500).toArray();
  });

  const StatusBody = z.object({ status: z.enum(["OPEN","INVESTIGATING","RESOLVED","CLOSED"]) });

  app.patch("/work-items/:id/status", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = StatusBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());

    const { rows: [current] } = await pgPool.query(
      `SELECT status FROM work_items WHERE id=$1`, [id]);
    if (!current) return reply.code(404).send({ error: "not found" });

    const { rows: [rca] } = await pgPool.query(
      `SELECT * FROM rcas WHERE work_item_id=$1`, [id]);

    try {
      const next = transition(
        current.status as WorkItemStatus,
        parsed.data.status,
        { rca: rca ? {
            category: rca.category, fix_applied: rca.fix_applied,
            prevention_steps: rca.prevention_steps,
            incident_start: rca.incident_start, incident_end: rca.incident_end,
          } : undefined,
        },
      );
      // Triggers also enforce close-with-RCA at DB level (defence-in-depth)
      const { rows } = await pgPool.query(
        `UPDATE work_items SET status=$1 WHERE id=$2 RETURNING *`, [next, id]);
      return rows[0];
    } catch (e) {
      if (e instanceof RcaRequiredError) return reply.code(422).send({ error: e.message });
      if (e instanceof InvalidTransitionError) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });
}
