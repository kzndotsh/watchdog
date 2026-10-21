import { describe, expect, it } from "vitest";

import {
  buildRunStepRows,
  outcomeDisplay,
  runOutcomeDisplay,
  runStepTally,
  stepOutcomeDisplay,
} from "@/domains/jobs/lib/playbook-run-view";
import type { PlaybookRunView } from "@watchdog/schemas/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

function run(overrides: Partial<PlaybookRunView> = {}): PlaybookRunView {
  return {
    id: testId(60),
    caseId: testCaseId(10),
    playbookId: "domain-triage",
    status: "finished",
    outcome: "partial",
    createdAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
    steps: [
      {
        step: 0,
        capabilityId: "network.dns.lookup",
        state: "failed",
        jobIds: [testId(61)],
      },
      {
        step: 1,
        capabilityId: "network.whois.lookup",
        state: "succeeded",
        jobIds: [testId(62), testId(63)],
      },
      {
        step: 2,
        capabilityId: "network.ct.lookup",
        state: "skipped",
        blockedBy: 0,
        jobIds: [],
      },
    ],
    ...overrides,
  };
}

describe("a step's reason", () => {
  const base = run();
  const at = (steps: PlaybookRunView["steps"]) =>
    buildRunStepRows({ ...base, steps }).map((row) => row.reason);

  it("names the step that held a skipped step back, one-based, with the Cap's label", () => {
    expect(
      at([
        {
          step: 0,
          capabilityId: "network.dns.lookup",
          state: "failed",
          jobIds: [testId(61)],
        },
        {
          step: 3,
          capabilityId: "network.ct.lookup",
          state: "skipped",
          blockedBy: 0,
          jobIds: [],
        },
      ])
    ).toEqual([null, "Step 1 (DNS Lookup) did not succeed"]);
  });

  it("shows a bind or fan-out reason as the API words it", () => {
    expect(
      at([
        {
          step: 0,
          capabilityId: "network.dns.lookup",
          state: "failed",
          reason: "no host in the seed",
          jobIds: [],
        },
      ])
    ).toEqual(["no host in the seed"]);
  });
});

describe("stepOutcomeDisplay", () => {
  it("gives each state its own word and status", () => {
    expect(stepOutcomeDisplay("succeeded", "finished")).toEqual({
      status: "succeeded",
      label: "Succeeded",
    });
    expect(stepOutcomeDisplay("failed", "finished")).toEqual({
      status: "failed",
      label: "Failed",
    });
    expect(stepOutcomeDisplay("running", "running")).toEqual({
      status: "running",
      label: "Running",
    });
    expect(stepOutcomeDisplay("skipped", "finished")).toEqual({
      status: "cancelled",
      label: "Skipped",
    });
    expect(stepOutcomeDisplay("pending", "running")).toEqual({
      status: "pending",
      label: "Pending",
    });
  });

  it("reads a pending step of a cancelled run as not run", () => {
    expect(stepOutcomeDisplay("pending", "cancelled")).toEqual({
      status: "cancelled",
      label: "Not run",
    });
  });
});

describe("run outcome", () => {
  it("names each outcome, and none while the run is open", () => {
    expect(outcomeDisplay("succeeded")?.label).toBe("Succeeded");
    expect(outcomeDisplay("partial")).toEqual({
      status: "contested",
      label: "Partial",
    });
    expect(outcomeDisplay("failed")?.status).toBe("failed");
    expect(outcomeDisplay(null)).toBeNull();
    expect(runOutcomeDisplay(run({ status: "running", outcome: null }))).toBe(
      null
    );
  });

  it("calls a run a person stopped cancelled", () => {
    expect(
      runOutcomeDisplay(run({ status: "cancelled", outcome: null }))
    ).toEqual({ status: "cancelled", label: "Cancelled" });
  });
});

describe("buildRunStepRows", () => {
  it("lists every recipe step in order with its outcome, reason and first Job", () => {
    expect(buildRunStepRows(run())).toEqual([
      {
        key: "0-network.dns.lookup",
        step: 0,
        jobId: testId(61),
        capability: "DNS Lookup",
        outcome: { status: "failed", label: "Failed" },
        reason: null,
      },
      {
        key: "1-network.whois.lookup",
        step: 1,
        jobId: testId(62),
        capability: "WHOIS Lookup",
        outcome: { status: "succeeded", label: "Succeeded" },
        reason: null,
      },
      {
        key: "2-network.ct.lookup",
        step: 2,
        jobId: null,
        capability: "Ct Lookup",
        outcome: { status: "cancelled", label: "Skipped" },
        reason: "Step 1 (DNS Lookup) did not succeed",
      },
    ]);
  });
});

describe("runStepTally", () => {
  it("counts the failed and skipped steps", () => {
    expect(runStepTally(run())).toBe("1 failed · 1 skipped");
  });

  it("is empty when no step failed or was skipped", () => {
    expect(
      runStepTally(
        run({
          steps: [
            {
              step: 0,
              capabilityId: "network.dns.lookup",
              state: "succeeded",
              jobIds: [testId(61)],
            },
          ],
        })
      )
    ).toBe("");
  });
});
