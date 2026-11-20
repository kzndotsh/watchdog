import { describe, expect, it } from "vitest";

import { groupQueueByRun } from "@/domains/triage/lib/queue-run-groups";
import { buildProposalQueueItem } from "@/testing/records";
import { testId } from "@watchdog/test-kit";

const RUN = { id: testId(80), proposalCount: 3, pendingCount: 2 };

const inRun = (n: number, run = RUN) =>
  buildProposalQueueItem({
    id: testId(n),
    playbookId: "domain-recon",
    playbookRun: run,
  });

const shape = (entries: ReturnType<typeof groupQueueByRun>) =>
  entries.map((e) =>
    e.kind === "run"
      ? `run:${e.proposals.map((p) => p.id).join(",")}`
      : e.proposal.id
  );

describe("groupQueueByRun", () => {
  it("folds a run's Proposals into one entry at its first member's place", () => {
    const lone = buildProposalQueueItem({ id: testId(1) });
    const entries = groupQueueByRun([inRun(2), lone, inRun(3)]);
    expect(shape(entries)).toEqual([
      `run:${testId(2)},${testId(3)}`,
      testId(1),
    ]);
    expect(entries[0]).toMatchObject({
      kind: "run",
      run: RUN,
      playbookId: "domain-recon",
    });
  });

  it("keeps a run with only one loaded Proposal as a run, when it made more", () => {
    expect(shape(groupQueueByRun([inRun(2)]))).toEqual([`run:${testId(2)}`]);
  });

  it("keeps a run that made one Proposal as a plain row", () => {
    const single = inRun(2, {
      id: testId(81),
      proposalCount: 1,
      pendingCount: 1,
    });
    expect(shape(groupQueueByRun([single]))).toEqual([testId(2)]);
  });

  it("keeps two runs apart", () => {
    const other = { id: testId(82), proposalCount: 2, pendingCount: 0 };
    expect(
      shape(
        groupQueueByRun([inRun(2), inRun(3, other), inRun(4), inRun(5, other)])
      )
    ).toEqual([
      `run:${testId(2)},${testId(4)}`,
      `run:${testId(3)},${testId(5)}`,
    ]);
  });
});
