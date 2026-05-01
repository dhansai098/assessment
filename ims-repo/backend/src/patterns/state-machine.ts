/**
 * State pattern for the Work Item lifecycle.
 *   OPEN → INVESTIGATING → RESOLVED → CLOSED
 *
 * Each state is a class that knows its allowed next transitions.
 * Trying to skip states throws InvalidTransitionError.
 * Closing without an RCA throws RcaRequiredError.
 */
export type WorkItemStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";

export class InvalidTransitionError extends Error {}
export class RcaRequiredError extends Error {}

export interface RcaSnapshot {
  category: string;
  fix_applied: string;
  prevention_steps: string;
  incident_start: Date;
  incident_end: Date;
}

interface State {
  readonly name: WorkItemStatus;
  next(target: WorkItemStatus, ctx: { rca?: RcaSnapshot }): State;
}

class OpenState implements State {
  readonly name = "OPEN";
  next(t: WorkItemStatus): State {
    if (t === "INVESTIGATING") return new InvestigatingState();
    throw new InvalidTransitionError(`OPEN → ${t} not allowed`);
  }
}
class InvestigatingState implements State {
  readonly name = "INVESTIGATING";
  next(t: WorkItemStatus): State {
    if (t === "RESOLVED") return new ResolvedState();
    throw new InvalidTransitionError(`INVESTIGATING → ${t} not allowed`);
  }
}
class ResolvedState implements State {
  readonly name = "RESOLVED";
  next(t: WorkItemStatus, ctx: { rca?: RcaSnapshot }): State {
    if (t !== "CLOSED") throw new InvalidTransitionError(`RESOLVED → ${t} not allowed`);
    if (!ctx.rca || !ctx.rca.fix_applied?.trim() || !ctx.rca.prevention_steps?.trim()) {
      throw new RcaRequiredError("Cannot close: RCA missing or incomplete");
    }
    return new ClosedState();
  }
}
class ClosedState implements State {
  readonly name = "CLOSED";
  next(t: WorkItemStatus): State {
    throw new InvalidTransitionError(`CLOSED is terminal (got ${t})`);
  }
}

const FACTORY: Record<WorkItemStatus, () => State> = {
  OPEN: () => new OpenState(),
  INVESTIGATING: () => new InvestigatingState(),
  RESOLVED: () => new ResolvedState(),
  CLOSED: () => new ClosedState(),
};

export function transition(
  current: WorkItemStatus,
  target: WorkItemStatus,
  ctx: { rca?: RcaSnapshot } = {},
): WorkItemStatus {
  return FACTORY[current]().next(target, ctx).name;
}

export function calculateMttrSeconds(startTime: Date, endTime: Date): number {
  return Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
}
