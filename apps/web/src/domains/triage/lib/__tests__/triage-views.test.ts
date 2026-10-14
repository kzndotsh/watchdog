import { describe, expect, it } from "vitest";

import { buildProposalRecord } from "@/testing/records";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { testId } from "@watchdog/test-kit";

import { totalEvidenceCount } from "../accept-validation.ts";
import { buildDecideHeaderView } from "../decide-header-view.ts";
import { collectProposalEvidenceIds, evidenceIdsForOp } from "../evidence.ts";
import {
  EMPTY_TRIAGE_FILTERS,
  PENDING_TRIAGE_FILTERS,
  filterTriageQueue,
  isTriagePendingOnlyFilters,
  proposalTitle,
  opLabel,
  triageStatusesFromSearch,
  triageStatusSearchParam,
} from "../filters.ts";

describe("triage filters", () => {
  it("defaults to pending-only", () => {
    expect(isTriagePendingOnlyFilters(PENDING_TRIAGE_FILTERS)).toBe(true);
    expect(isTriagePendingOnlyFilters(EMPTY_TRIAGE_FILTERS)).toBe(false);
    const pending = buildProposalRecord({ status: "pending" });
    const accepted = buildProposalRecord({
      id: testId(51),
      status: "accepted",
    });
    expect(
      filterTriageQueue([pending, accepted], PENDING_TRIAGE_FILTERS).map(
        (row) => row.id
      )
    ).toEqual([pending.id]);
  });

  it("labels patch op counts with resource display names", () => {
    const row = buildProposalRecord({
      patch: [
        {
          op: "create",
          resource: "claim",
          id: testId(31),
          data: {
            entityId: testId(20),
            text: "one",
            class: "observation",
          },
        },
        {
          op: "create",
          resource: "claim",
          id: testId(32),
          data: {
            entityId: testId(20),
            text: "two",
            class: "observation",
          },
        },
        {
          op: "create",
          resource: "edge",
          id: testId(33),
          data: {
            fromId: testId(20),
            toId: testId(21),
            predicate: "related_to",
            notes: "linked",
          },
        },
      ],
    });
    expect(opLabel(row.patch)).toBe("2 Claims, 1 Connection");
  });

  it("still filters by raw patch resource names", () => {
    const row = buildProposalRecord({
      patch: [
        {
          op: "create",
          resource: "edge",
          id: testId(34),
          data: {
            fromId: testId(20),
            toId: testId(21),
            predicate: "related_to",
            notes: "linked",
          },
        },
      ],
    });
    expect(
      filterTriageQueue([row], { q: "edge", statuses: [] }).map(
        (item) => item.id
      )
    ).toEqual([row.id]);
  });

  it("filters by linked entity display name", () => {
    const alpha = buildProposalRecord({
      id: testId(52),
      entityNames: { [testId(20)]: "Alpha Corp" },
    });
    const beta = buildProposalRecord({
      id: testId(53),
      entityNames: { [testId(20)]: "Beta LLC" },
    });
    expect(
      filterTriageQueue([alpha, beta], { q: "alpha", statuses: [] }).map(
        (row) => row.id
      )
    ).toEqual([alpha.id]);
  });

  it("filters by linked entity slug", () => {
    const entityId = testId(20);
    const alpha = buildProposalRecord({
      id: testId(56),
      entityNames: { [entityId]: "  " },
      entitySlugs: { [entityId]: "unnamed-host" },
    });
    const beta = buildProposalRecord({
      id: testId(57),
      entityNames: { [entityId]: "Beta LLC" },
      entitySlugs: { [entityId]: "beta-llc" },
    });
    expect(
      filterTriageQueue([alpha, beta], { q: "unnamed-host", statuses: [] }).map(
        (row) => row.id
      )
    ).toEqual([alpha.id]);
  });

  it("filters by linked entity slug using slugified query", () => {
    const entityId = testId(20);
    const alpha = buildProposalRecord({
      id: testId(56),
      entityNames: { [entityId]: "  " },
      entitySlugs: { [entityId]: "unnamed-host" },
    });
    const beta = buildProposalRecord({
      id: testId(57),
      entityNames: { [entityId]: "Beta LLC" },
      entitySlugs: { [entityId]: "beta-llc" },
    });
    expect(
      filterTriageQueue([alpha, beta], { q: "Unnamed Host", statuses: [] }).map(
        (row) => row.id
      )
    ).toEqual([alpha.id]);
  });

  it("filters by linked entity summary and notes", () => {
    const entityId = testId(20);
    const bySummary = buildProposalRecord({
      id: testId(58),
      entitySummaries: { [entityId]: "Lead subject in the fraud thread" },
    });
    const byNotes = buildProposalRecord({
      id: testId(59),
      entityNotes: { [entityId]: "Mailbox tied to the fraud thread" },
    });
    const other = buildProposalRecord({ id: testId(60) });
    expect(
      filterTriageQueue([bySummary, other], {
        q: "fraud thread",
        statuses: [],
      }).map((row) => row.id)
    ).toEqual([bySummary.id]);
    expect(
      filterTriageQueue([byNotes, other], {
        q: "fraud thread",
        statuses: [],
      }).map((row) => row.id)
    ).toEqual([byNotes.id]);
  });

  it("filters by capability display label", () => {
    const dns = buildProposalRecord({
      id: testId(54),
      capabilityId: "network.dns.lookup",
    });
    const other = buildProposalRecord({
      id: testId(55),
      capabilityId: "network.shodan.lookup",
    });
    expect(
      filterTriageQueue([dns, other], { q: "dns lookup", statuses: [] }).map(
        (row) => row.id
      )
    ).toEqual([dns.id]);
  });

  it("filters by humanized capability id", () => {
    const shodan = buildProposalRecord({
      id: testId(60),
      capabilityId: "network.shodan.lookup",
    });
    const other = buildProposalRecord({
      id: testId(61),
      capabilityId: "network.dns.lookup",
    });
    expect(
      filterTriageQueue([shodan, other], {
        q: "network shodan",
        statuses: [],
      }).map((row) => row.id)
    ).toEqual([shodan.id]);
  });

  it("filters by playbook display label", () => {
    const playbook = buildProposalRecord({
      id: testId(58),
      summary: null,
      capabilityId: "network.dns.lookup",
      playbookId: "host-footprint",
      patch: [],
    });
    const other = buildProposalRecord({
      id: testId(59),
      capabilityId: "network.shodan.lookup",
      playbookId: null,
      patch: [],
    });
    expect(
      filterTriageQueue([playbook, other], {
        q: "host footprint",
        statuses: [],
      }).map((row) => row.id)
    ).toEqual([playbook.id]);
  });

  it("filters by proposal title when summary is empty", () => {
    const row = buildProposalRecord({
      id: testId(56),
      summary: null,
      capabilityId: "network.shodan.lookup",
      patch: [],
    });
    expect(
      filterTriageQueue([row], { q: "shodan lookup", statuses: [] }).map(
        (item) => item.id
      )
    ).toEqual([row.id]);
  });

  it("filters by patch claim text when summary does not match", () => {
    const row = buildProposalRecord({
      id: testId(57),
      summary: "custody probe confirmed claim",
    });
    expect(
      filterTriageQueue([row], { q: "ada observed", statuses: [] }).map(
        (item) => item.id
      )
    ).toEqual([row.id]);
  });

  it("filters by edge notes in patch body", () => {
    const row = buildProposalRecord({
      id: testId(63),
      summary: null,
      patch: [
        {
          op: "create",
          resource: "edge",
          id: testId(64),
          data: {
            fromId: testId(60),
            toId: testId(61),
            predicate: "related_to",
            notes: "shared registrar contact",
          },
        },
      ],
    });
    expect(
      filterTriageQueue([row], { q: "registrar contact", statuses: [] }).map(
        (item) => item.id
      )
    ).toEqual([row.id]);
  });

  it("filters by entity summary in patch body", () => {
    const row = buildProposalRecord({
      id: testId(65),
      summary: null,
      patch: [
        {
          op: "create",
          resource: "entity",
          id: testId(66),
          data: {
            kind: "org",
            name: "Acme",
            slug: "acme-corp",
            summary: "Shell company for the fraud thread",
          },
        },
      ],
    });
    expect(
      filterTriageQueue([row], { q: "fraud thread", statuses: [] }).map(
        (item) => item.id
      )
    ).toEqual([row.id]);
  });

  it("filters by proposal status and display label", () => {
    const accepted = buildProposalRecord({
      id: testId(67),
      status: "accepted",
      summary: "done item",
    });
    const pending = buildProposalRecord({
      id: testId(68),
      status: "pending",
      summary: "open item",
    });
    expect(
      filterTriageQueue([accepted, pending], {
        q: "accepted",
        statuses: [],
      }).map((item) => item.id)
    ).toEqual([accepted.id]);
    expect(
      filterTriageQueue([accepted, pending], {
        q: "pending",
        statuses: [],
      }).map((item) => item.id)
    ).toEqual([pending.id]);
  });

  it("filters by reject reason and actor labels", () => {
    const rejected = buildProposalRecord({
      id: testId(69),
      status: "rejected",
      summary: "closed",
      rejectReason: "Duplicate finding",
      decidedByLabel: "investigator zed",
      patch: [],
    });
    const other = buildProposalRecord({
      id: testId(70),
      status: "pending",
      summary: "open",
      patch: [],
    });
    expect(
      filterTriageQueue([rejected, other], {
        q: "duplicate",
        statuses: [],
      }).map((item) => item.id)
    ).toEqual([rejected.id]);
    expect(
      filterTriageQueue([rejected, other], {
        q: "investigator zed",
        statuses: [],
      }).map((item) => item.id)
    ).toEqual([rejected.id]);
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

describe("triage status search sync", () => {
  it("maps pending-only filters to no search param", () => {
    expect(triageStatusSearchParam(PENDING_TRIAGE_FILTERS)).toBeUndefined();
    expect(triageStatusesFromSearch()).toEqual(["pending"]);
  });

  it("round-trips accepted and rejected facets", () => {
    expect(triageStatusSearchParam({ q: "", statuses: ["accepted"] })).toBe(
      "accepted"
    );
    expect(triageStatusesFromSearch("rejected")).toEqual(["rejected"]);
  });

  it("clears search param for all-status and non-pending multi facets", () => {
    expect(triageStatusSearchParam(EMPTY_TRIAGE_FILTERS)).toBeUndefined();
    expect(
      triageStatusSearchParam({ q: "", statuses: ["pending", "accepted"] })
    ).toBeUndefined();
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
