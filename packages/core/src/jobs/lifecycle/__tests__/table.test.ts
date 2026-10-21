import { describe, expect, it } from "vitest";

import {
  JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  type JobStatus,
} from "@watchdog/schemas/shared";

import { JOB_STOP_CAUSES, type JobStopCause } from "../cause.ts";
import {
  allowedFromStatuses,
  decideJob,
  JOB_EVENT_KINDS,
  type JobEvent,
  type JobEventKind,
} from "../table.ts";

const CAUSE: JobStopCause = "cap_failed";

const EVENTS: Record<JobEventKind, JobEvent> = {
  claim: { kind: "claim" },
  succeed: { kind: "succeed" },
  fail: { kind: "fail", cause: CAUSE },
  cancel: { kind: "cancel", cause: CAUSE },
};

/** The expected status each event moves to, or null for no move: one row per status. */
const EXPECTED: Record<JobStatus, Record<JobEventKind, JobStatus | null>> = {
  queued: {
    claim: "running",
    succeed: null,
    fail: "failed",
    cancel: "cancelled",
  },
  running: {
    claim: "running",
    succeed: "succeeded",
    fail: "failed",
    cancel: "cancelled",
  },
  succeeded: { claim: null, succeed: null, fail: null, cancel: null },
  failed: { claim: null, succeed: null, fail: null, cancel: null },
  cancelled: { claim: null, succeed: null, fail: null, cancel: null },
};

const PAIRS = JOB_STATUSES.flatMap((status) =>
  JOB_EVENT_KINDS.map((kind) => ({ status, kind }))
);

describe("decideJob", () => {
  it("has an expected row for every status and every event", () => {
    // Fails when a status or event is added without a row in EXPECTED above.
    expect(Object.keys(EXPECTED).sort()).toEqual([...JOB_STATUSES].sort());
    expect(Object.keys(EVENTS).sort()).toEqual([...JOB_EVENT_KINDS].sort());
    for (const status of JOB_STATUSES) {
      expect(Object.keys(EXPECTED[status]).sort()).toEqual(
        [...JOB_EVENT_KINDS].sort()
      );
    }
  });

  it.each(PAIRS)("$status + $kind", ({ status, kind }) => {
    const next = EXPECTED[status][kind];
    const decision = decideJob({ status }, EVENTS[kind]);
    if (next === null) {
      expect(decision).toEqual({ kind: "none" });
      return;
    }
    expect(decision).toMatchObject({ kind: "move", next });
  });

  it("never moves a terminal Job", () => {
    for (const status of TERMINAL_JOB_STATUSES) {
      for (const kind of JOB_EVENT_KINDS) {
        expect(decideJob({ status }, EVENTS[kind])).toEqual({ kind: "none" });
      }
    }
  });

  it("stores the cause of a fail or cancel and nothing for the other events", () => {
    expect(decideJob({ status: "running" }, EVENTS.fail)).toEqual({
      kind: "move",
      next: "failed",
      errorCode: CAUSE,
    });
    expect(decideJob({ status: "queued" }, EVENTS.cancel)).toEqual({
      kind: "move",
      next: "cancelled",
      errorCode: CAUSE,
    });
    expect(decideJob({ status: "running" }, EVENTS.succeed)).toMatchObject({
      errorCode: null,
    });
    expect(decideJob({ status: "queued" }, EVENTS.claim)).toMatchObject({
      errorCode: null,
    });
  });

  it("accepts every stop cause", () => {
    for (const cause of JOB_STOP_CAUSES) {
      expect(decideJob({ status: "running" }, { kind: "fail", cause })).toEqual(
        { kind: "move", next: "failed", errorCode: cause }
      );
    }
  });
});

describe("allowedFromStatuses", () => {
  it.each(JOB_EVENT_KINDS)(
    "derives the guard for %s from the table",
    (kind) => {
      const expected = JOB_STATUSES.filter(
        (status) => EXPECTED[status][kind] !== null
      );
      expect(allowedFromStatuses(kind)).toEqual(expected);
    }
  );

  it("never lists a terminal status", () => {
    for (const kind of JOB_EVENT_KINDS) {
      for (const status of TERMINAL_JOB_STATUSES) {
        expect(allowedFromStatuses(kind)).not.toContain(status);
      }
    }
  });
});
