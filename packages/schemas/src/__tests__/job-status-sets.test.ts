import { describe, expect, it } from "vitest";

import {
  CANCELLABLE_JOB_STATUSES,
  JOB_STATUSES,
  LIVE_JOB_STATUSES,
  OPEN_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  isCancellableJobStatus,
  isLiveJobStatus,
  isOpenJobStatus,
  isTerminalJobStatus,
} from "../vocab.ts";

const sorted = (xs: readonly string[]) => [...xs].sort();

describe("job status sets", () => {
  it("names the exact members", () => {
    expect(sorted(OPEN_JOB_STATUSES)).toEqual(["blocked", "queued", "running"]);
    expect(sorted(TERMINAL_JOB_STATUSES)).toEqual([
      "cancelled",
      "failed",
      "succeeded",
    ]);
    expect(sorted(LIVE_JOB_STATUSES)).toEqual(["queued", "running"]);
    expect(sorted(CANCELLABLE_JOB_STATUSES)).toEqual([
      "blocked",
      "queued",
      "running",
    ]);
  });

  it("open and terminal partition every job status", () => {
    const union = [...OPEN_JOB_STATUSES, ...TERMINAL_JOB_STATUSES];
    expect(sorted(union)).toEqual(sorted(JOB_STATUSES));
    expect(new Set(union).size).toBe(JOB_STATUSES.length);
  });

  it("live is a subset of open, and cancellable equals open", () => {
    for (const s of LIVE_JOB_STATUSES) expect(isOpenJobStatus(s)).toBe(true);
    expect(sorted(CANCELLABLE_JOB_STATUSES)).toEqual(sorted(OPEN_JOB_STATUSES));
  });

  it.each(JOB_STATUSES)("predicates agree with the sets for %s", (status) => {
    const open = (OPEN_JOB_STATUSES as readonly string[]).includes(status);
    expect(isOpenJobStatus(status)).toBe(open);
    expect(isCancellableJobStatus(status)).toBe(open);
    expect(isTerminalJobStatus(status)).toBe(!open);
    expect(isLiveJobStatus(status)).toBe(
      status === "queued" || status === "running"
    );
  });

  it("blocked is open and cancellable but not live", () => {
    expect(isOpenJobStatus("blocked")).toBe(true);
    expect(isCancellableJobStatus("blocked")).toBe(true);
    expect(isLiveJobStatus("blocked")).toBe(false);
  });
});
