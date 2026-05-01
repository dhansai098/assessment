import { describe, it, expect } from "vitest";
import {
  transition, calculateMttrSeconds,
  RcaRequiredError, InvalidTransitionError,
} from "../src/patterns/state-machine.js";

const completeRca = {
  category: "INFRA_FAILURE",
  fix_applied: "Restarted nodes",
  prevention_steps: "Add alarms",
  incident_start: new Date(),
  incident_end: new Date(),
};

describe("Work Item state machine", () => {
  it("OPEN → INVESTIGATING is allowed", () => {
    expect(transition("OPEN", "INVESTIGATING")).toBe("INVESTIGATING");
  });

  it("OPEN → RESOLVED is rejected (cannot skip states)", () => {
    expect(() => transition("OPEN", "RESOLVED")).toThrow(InvalidTransitionError);
  });

  it("RESOLVED → CLOSED requires an RCA", () => {
    expect(() => transition("RESOLVED", "CLOSED")).toThrow(RcaRequiredError);
  });

  it("RESOLVED → CLOSED rejects an incomplete RCA", () => {
    expect(() => transition("RESOLVED", "CLOSED", {
      rca: { ...completeRca, fix_applied: "" },
    })).toThrow(RcaRequiredError);
  });

  it("RESOLVED → CLOSED succeeds with a complete RCA", () => {
    expect(transition("RESOLVED", "CLOSED", { rca: completeRca })).toBe("CLOSED");
  });

  it("CLOSED is terminal", () => {
    expect(() => transition("CLOSED", "OPEN")).toThrow(InvalidTransitionError);
  });
});

describe("MTTR", () => {
  it("computes seconds between start and end", () => {
    const start = new Date("2025-01-01T00:00:00Z");
    const end = new Date("2025-01-01T00:05:30Z");
    expect(calculateMttrSeconds(start, end)).toBe(330);
  });
});
