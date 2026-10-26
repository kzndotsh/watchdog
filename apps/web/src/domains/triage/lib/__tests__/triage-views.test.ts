import { describe, expect, it } from "vitest";

import { buildProposalRecord } from "@/testing/records";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { testId } from "@watchdog/test-kit";

import { totalEvidenceCount } from "../accept-validation.ts";
import { buildDecideHeaderView } from "../decide-header-view.ts";
import { collectProposalEvidenceIds, evidenceIdsForOp } from "../evidence.ts";
import { opLabel, proposalTitle } from "../filters.ts";

describe("triage proposal display", () => {
  it("labels patch op counts with resource display names", () => {
    expect(opLabel({ claim: 2, edge: 1 })).toBe("2 Claims, 1 Connection");
  });

  it("proposalTitle prefers summary over capability and entity", () => {
    const row = buildProposalRecord({
      summary: "Link domains",
      capabilityId: "network.shodan.lookup",
      entityNames: { [testId(20)]: "Alpha Corp" },
    });
    expect(proposalTitle(row)).toBe("Link domains");
  });

  it("proposalTitle tolerates missing patch when summary is set", () => {
    const row = buildProposalRecord({
      summary: "Link entity A to B",
      patch: undefined as unknown as ProposalRecord["patch"],
    });
    expect(proposalTitle(row)).toBe("Link entity A to B");
  });

  it("proposalTitle uses edge endpoint entity name", () => {
    const fromId = testId(60);
    const toId = testId(61);
    const row = buildProposalRecord({
      summary: null,
      capabilityId: "network.shodan.lookup",
      patch: [
        {
          op: "create",
          resource: "edge",
          id: testId(62),
          data: { fromId, toId, predicate: "knows" },
        },
      ],
      entityNames: { [fromId]: "Alpha Corp", [toId]: "Beta LLC" },
    });
    expect(proposalTitle(row)).toBe("Shodan Lookup · Alpha Corp");
  });

  it("proposalTitle prefers playbook label over step capability", () => {
    const row = buildProposalRecord({
      summary: null,
      capabilityId: "network.dns.lookup",
      playbookId: "host-footprint",
      entityNames: { [testId(20)]: "Alpha Corp" },
    });
    expect(proposalTitle(row)).toBe("Host Footprint · Alpha Corp");
  });

  it("proposalTitle falls back to entity slug when the entity name is blank", () => {
    const entityId = testId(20);
    const row = buildProposalRecord({
      summary: null,
      capabilityId: "network.shodan.lookup",
      entityNames: { [entityId]: "  " },
      entitySlugs: { [entityId]: "unnamed-host" },
    });
    expect(proposalTitle(row)).toBe("Shodan Lookup · unnamed-host");
  });

  it("proposalTitle resolves a later patch entity when the first cited entity has no maps", () => {
    const orphanId = testId(90);
    const knownId = testId(91);
    const row = buildProposalRecord({
      summary: null,
      capabilityId: "network.shodan.lookup",
      patch: [
        {
          op: "create",
          resource: "claim",
          id: testId(92),
          data: { entityId: orphanId, text: "orphan" },
        },
        {
          op: "create",
          resource: "claim",
          id: testId(93),
          data: { entityId: knownId, text: "known" },
        },
      ],
      entityNames: { [knownId]: "Beta LLC" },
      entitySlugs: { [knownId]: "beta-llc" },
    });
    expect(proposalTitle(row)).toBe("Shodan Lookup · Beta LLC");
  });
});

describe("triage evidence", () => {
  it("collects proposal and per-op evidence ids", () => {
    const row = buildProposalRecord();
    const ids = collectProposalEvidenceIds(row);
    expect(ids).toContain(testId(40));
    expect(ids).toContain(testId(41));
    expect(totalEvidenceCount(["a"], ["b"], "note")).toBe(3);
    const [firstOp] = row.patch;
    expect(firstOp).toBeDefined();
    if (firstOp === undefined) return;
    expect(evidenceIdsForOp(firstOp, row.evidenceIds)).toEqual([testId(40)]);
  });

  it("trims padded evidence ids when collecting proposal links", () => {
    const evidenceId = testId(42);
    const row = buildProposalRecord({
      evidenceIds: [`  ${evidenceId}  `],
      patch: [
        {
          op: "create",
          resource: "claim",
          id: testId(31),
          data: {
            entityId: testId(20),
            text: "observed",
            class: "observation",
          },
          evidenceIds: [`  ${evidenceId}  `],
        },
      ],
    });
    expect(collectProposalEvidenceIds(row)).toEqual([evidenceId]);
    const [firstOp] = row.patch;
    expect(firstOp).toBeDefined();
    if (firstOp === undefined) return;
    expect(evidenceIdsForOp(firstOp, row.evidenceIds)).toEqual([evidenceId]);
  });
});

describe("decide-header-view", () => {
  it("shows the accept band for pending claim patches", () => {
    const view = buildDecideHeaderView({
      proposal: buildProposalRecord(),
      linkedIds: [],
      isRejecting: false,
    });
    expect(view.decideMode).toBe("accepting");
    expect(view.shouldShowAcceptBand).toBe(true);
    expect(view.evidenceMode).toBe("pick");
  });
});
