import { beforeEach, describe, expect, it, vi } from "vitest";

/** One emitted process-log event, as the logger boundary received it. */
type LoggedEvent = {
  context: Record<string, unknown>;
  error: Error | undefined;
};

const { events } = vi.hoisted(() => ({ events: [] as LoggedEvent[] }));

// `@watchdog/log` is the logger boundary: capture what it is asked to emit.
vi.mock("@watchdog/log", () => ({
  createLogger: (context: Record<string, unknown>) => {
    let error: Error | undefined;
    return {
      error: (value: Error) => {
        error = value;
      },
      set: () => undefined,
      setLevel: () => undefined,
      emit: () => {
        events.push({ context, error });
      },
    };
  },
}));

import {
  ConflictError,
  InternalError,
  InvalidError,
} from "../../errors/tagged-errors";
import { logJobFailureCause } from "../failure-cause";

describe("logJobFailureCause", () => {
  beforeEach(() => {
    events.length = 0;
  });

  it("logs the cause of an InvalidError next to the fixed reason", () => {
    logJobFailureCause(
      "job-1",
      new InvalidError({ reason: "oEmbed lookup failed", cause: "HTTP 403 x" })
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.context).toEqual({
      scope: "job.failure_cause",
      jobId: "job-1",
      domainTag: "InvalidError",
      reason: "oEmbed lookup failed",
    });
    expect(events[0]?.error?.message).toBe("HTTP 403 x");
  });

  it("logs the original fault of an InternalError", () => {
    const fault = new Error("ECONNRESET");
    logJobFailureCause(
      "job-2",
      new InternalError({ reason: "Tool failed unexpectedly", cause: fault })
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.context).toMatchObject({
      jobId: "job-2",
      domainTag: "InternalError",
    });
    expect(events[0]?.error).toBe(fault);
  });

  it("stays quiet when there is no cause", () => {
    logJobFailureCause("job-3", new InvalidError({ reason: "bad" }));
    logJobFailureCause("job-3", new ConflictError({ reason: "dup" }));
    expect(events).toEqual([]);
  });
});
