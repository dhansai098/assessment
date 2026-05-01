/**
 * Strategy pattern for alert dispatch.
 * Different component severities → different channels & escalation rules.
 *
 * Adding a new strategy: implement AlertStrategy and register in registry.
 * The workflow engine never changes.
 */
export interface AlertContext {
  workItemId: string;
  componentId: string;
}

export interface AlertStrategy {
  send(ctx: AlertContext): Promise<void>;
}

class PagerDutyP0Strategy implements AlertStrategy {
  async send(ctx: AlertContext): Promise<void> {
    // Real impl: POST to PagerDuty Events API v2 with severity=critical.
    console.log(`[ALERT][P0] PagerDuty: page on-call NOW for ${ctx.componentId} (WI ${ctx.workItemId})`);
  }
}
class PagerDutyP1Strategy implements AlertStrategy {
  async send(ctx: AlertContext): Promise<void> {
    console.log(`[ALERT][P1] PagerDuty: notify on-call for ${ctx.componentId}`);
  }
}
class SlackP2Strategy implements AlertStrategy {
  async send(ctx: AlertContext): Promise<void> {
    console.log(`[ALERT][P2] Slack #ops: degraded ${ctx.componentId}`);
  }
}
class EmailP3Strategy implements AlertStrategy {
  async send(ctx: AlertContext): Promise<void> {
    console.log(`[ALERT][P3] Email digest: ${ctx.componentId}`);
  }
}

const REGISTRY: Record<string, AlertStrategy> = {
  P0: new PagerDutyP0Strategy(),
  P1: new PagerDutyP1Strategy(),
  P2: new SlackP2Strategy(),
  P3: new EmailP3Strategy(),
};

export async function dispatchAlert(severity: string, ctx: AlertContext): Promise<void> {
  const strat = REGISTRY[severity] ?? REGISTRY.P3;
  await strat.send(ctx);
}
