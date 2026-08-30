import { describe, expect, it } from "vitest";

import type { ProposalRecord } from "@watchdog/core";
import { testId } from "@watchdog/test-kit";

import { totalEvidenceCount } from "../accept-validation.ts";
import { buildDecideHeaderView } from "../decide-header-view.ts";
import { collectProposalEvidenceIds, evidenceIdsForOp } from "../evidence.ts";
import {
  EMPTY_TRIAGE_FILTERS,
  PENDING_TRIAGE_FILTERS,
  filterTriageQueue,
  isTriagePendingOnlyFilters,
} from "../filters.ts";

function proposal(overrides: Partial<ProposalRecord> = {}): ProposalRecord {
  return {
    id: testId(50),
    caseId: testId(10),
    jobId: null,
    capabilityId: "network.dns.lookup",
    status: "pending",
    patch: [
      {
        op: "create",
        resource: "claim",
        id: testId(30),
        data: {
          entityId: testId(20),
          text: "Ada observed a host",
          class: "observation",
        },
        evidenceIds: [testId(40)],
      },
    ],
    summary: "dns",
    suppressedCount: 0,
    evidenceIds: [testId(41)],
    rejectReason: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    agentSourced: false,
    userOverridden: false,
    createdBy: null,
    identifierCollisions: [],
    ...overrides,
  };
}

describe("triage filters", () => {
  it("defaults to pending-only", () => {
    expect(isTriagePendingOnlyFilters(PENDING_TRIAGE_FILTERS)).toBe(true);
    expect(isTriagePendingOnlyFilters(EMPTY_TRIAGE_FILTERS)).toBe(false);
    const pending = proposal({ status: "pending" });
    const accepted = proposal({ id: testId(51), status: "accepted" });
    expect(
      filterTriageQueue([pending, accepted], PENDING_TRIAGE_FILTERS).map(
        (row) => row.id
      )
    ).toEqual([pending.id]);
  });
});

describe("triage evidence", () => {
  it("collects proposal and per-op evidence ids", () => {
    const row = proposal();
    const ids = collectProposalEvidenceIds(row);
    expect(ids).toContain(testId(40));
    expect(ids).toContain(testId(41));
    expect(totalEvidenceCount(["a"], ["b"], "note")).toBe(3);
    const [firstOp] = row.patch;
    expect(firstOp).toBeDefined();
    if (firstOp === undefined) return;
    expect(evidenceIdsForOp(firstOp, row.evidenceIds)).toEqual([testId(40)]);
  });
});

describe("decide-header-view", () => {
  it("shows the accept band for pending claim patches", () => {
    const view = buildDecideHeaderView({
      proposal: proposal(),
      linkedIds: [],
      rejecting: false,
    });
    expect(view.decideMode).toBe("accepting");
    expect(view.showAcceptBand).toBe(true);
    expect(view.evidenceMode).toBe("pick");
  });
});
