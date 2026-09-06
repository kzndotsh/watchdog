import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const emitList = vi.fn();
  const emit = vi.fn();
  const emitOk = vi.fn();
  const fail = vi.fn();

  const client = {
    capabilities: {
      list: vi.fn().mockResolvedValue([
        {
          id: "web.page.enrich",
          kind: "web",
          egress: true,
          title: "Page enrich",
          description: "Fetch page metadata",
        },
      ]),
      listPlaybooks: vi.fn().mockResolvedValue([]),
    },
    cases: {
      list: vi.fn().mockResolvedValue([
        {
          id: "case-1",
          name: "Alpha",
          slug: "alpha",
          allowThirdPartyEgress: false,
        },
      ]),
      get: vi.fn().mockResolvedValue({ id: "case-1", name: "Alpha" }),
    },
    claims: {
      list: vi.fn().mockResolvedValue([
        {
          id: "claim-1",
          text: "Claim",
          confidence: "unverified",
          class: "observation",
          retracted: false,
        },
      ]),
    },
    credentials: {
      list: vi.fn().mockResolvedValue([
        {
          name: "shodan",
          configured: true,
          updatedAt: "2026-01-01",
          label: "Shodan",
        },
      ]),
    },
    edges: {
      list: vi.fn().mockResolvedValue([
        {
          id: "edge-1",
          fromId: "a",
          toId: "b",
          predicate: "knows",
          confidence: "unverified",
        },
      ]),
    },
    entities: {
      list: vi
        .fn()
        .mockResolvedValue([
          { id: "ent-1", kind: "person", name: "Jane", slug: "jane" },
        ]),
    },
    events: {
      list: vi.fn().mockResolvedValue([
        {
          id: "event-1",
          when: "2026-01-01",
          what: "Observed activity",
          where: "NYC",
        },
      ]),
    },
    evidence: {
      list: vi.fn().mockResolvedValue([
        {
          id: "evidence-1",
          kind: "note",
          label: "Screenshot",
          capturedAt: "2026-01-01T12:00:00.000Z",
        },
      ]),
    },
    identifiers: {
      list: vi.fn().mockResolvedValue([
        {
          id: "id-1",
          type: "email",
          value: "jane@example.com",
          confidence: "unverified",
          status: "active",
        },
      ]),
    },
    graph: {
      write: vi.fn().mockResolvedValue({ ok: true }),
    },
    jobs: {
      listForCase: vi.fn().mockResolvedValue([
        {
          id: "job-1",
          capabilityId: "web.page.enrich",
          status: "queued",
          createdAt: "2026-01-01T12:00:00.000Z",
        },
      ]),
    },
    proposals: {
      listForCase: vi.fn().mockResolvedValue([
        {
          id: "proposal-1",
          status: "pending",
          summary: "Add identifier",
          createdAt: "2026-01-01T12:00:00.000Z",
        },
      ]),
    },
    questions: {
      list: vi
        .fn()
        .mockResolvedValue([
          { id: "question-1", text: "Who owns this?", status: "open" },
        ]),
    },
  };

  const api = vi.fn(() => client);

  return { emitList, emit, emitOk, fail, api, client };
});

vi.mock("../../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../client")>();
  return {
    ...actual,
    api: mocks.api,
    emitList: mocks.emitList,
    emit: mocks.emit,
    emitOk: mocks.emitOk,
    fail: mocks.fail,
  };
});

vi.mock("../../ids", () => ({
  resolveEntityId: vi.fn(async () => "entity-id-1"),
  parseIdList: vi.fn(() => {}),
}));

vi.mock("../../download", () => ({
  downloadToFile: vi.fn(async () => "/tmp/export.zip"),
}));

vi.mock("../../load-patch", () => ({
  loadPatch: vi.fn(() => []),
}));

import { capsCmd } from "../caps";
import { casesCmd } from "../cases";
import { claimsCmd } from "../claims";
import { credentialsCmd } from "../credentials";
import { edgesCmd } from "../edges";
import { entitiesCmd } from "../entities";
import { eventsCmd } from "../events";
import { evidenceCmd } from "../evidence";
import { exportCmd } from "../export";
import { graphCmd } from "../graph";
import { identifiersCmd } from "../identifiers";
import { jobsCmd } from "../jobs";
import { proposalsCmd } from "../proposals";
import { questionsCmd } from "../questions";

describe("CLI noun commands", () => {
  it("capsCmd lists capabilities", async () => {
    await capsCmd.run?.({ args: {} } as never);
    expect(mocks.client.capabilities.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("casesCmd lists cases", async () => {
    await casesCmd.run?.({ args: {} } as never);
    expect(mocks.client.cases.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("claimsCmd requires case and entity then lists claims", async () => {
    await claimsCmd.run?.({
      args: { case: "case-1", entity: "jane" },
    } as never);
    expect(mocks.client.claims.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("credentialsCmd lists vault credentials", async () => {
    await credentialsCmd.run?.({ args: {} } as never);
    expect(mocks.client.credentials.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("edgesCmd lists edges for a case entity", async () => {
    await edgesCmd.run?.({ args: { case: "case-1", entity: "jane" } } as never);
    expect(mocks.client.edges.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("entitiesCmd lists entities for a case", async () => {
    await entitiesCmd.run?.({ args: { case: "case-1" } } as never);
    expect(mocks.client.entities.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("eventsCmd lists timeline events for a case entity", async () => {
    await eventsCmd.run?.({
      args: { case: "case-1", entity: "jane" },
    } as never);
    expect(mocks.client.events.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("evidenceCmd lists evidence for a case", async () => {
    await evidenceCmd.run?.({ args: { case: "case-1" } } as never);
    expect(mocks.client.evidence.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("identifiersCmd lists identifiers for a case entity", async () => {
    await identifiersCmd.run?.({
      args: { case: "case-1", entity: "jane" },
    } as never);
    expect(mocks.client.identifiers.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("exportCmd zip downloads the case export archive", async () => {
    const zip = exportCmd.subCommands?.zip;
    await zip?.run?.({ args: { case: "case-1" } });
    expect(mocks.emitOk).toHaveBeenCalledWith({ path: "/tmp/export.zip" });
  });

  it("graphCmd write sends a patch with userOverride", async () => {
    const write = graphCmd.subCommands?.write;
    await write?.run?.({ args: { case: "case-1", patch: "[]" } });
    expect(mocks.client.graph.write).toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("jobsCmd lists jobs for a case", async () => {
    await jobsCmd.run?.({ args: { case: "case-1" } } as never);
    expect(mocks.client.jobs.listForCase).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("proposalsCmd lists pending proposals for a case", async () => {
    await proposalsCmd.run?.({ args: { case: "case-1" } } as never);
    expect(mocks.client.proposals.listForCase).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("questionsCmd lists questions for a case entity", async () => {
    await questionsCmd.run?.({
      args: { case: "case-1", entity: "jane" },
    } as never);
    expect(mocks.client.questions.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });
});
