import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const CASE_UUID = "00000000-0000-4000-8000-000000000001";
  const ENTITY_UUID = "00000000-0000-4000-8000-000000000002";
  const ENTITY_ACME_UUID = "00000000-0000-4000-8000-000000000003";
  const JOB_UUID = "00000000-0000-4000-8000-000000000010";
  const emitList = vi.fn();
  const emit = vi.fn();
  const emitOk = vi.fn();
  const fail = vi.fn(
    (code: string, message: string, opts?: { help?: string[] }) => {
      throw new Error(`${code}: ${message}`, { cause: opts });
    }
  );

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
      create: vi.fn().mockResolvedValue({
        id: "case-2",
        name: "Beta Case",
        slug: "beta-case",
        allowThirdPartyEgress: false,
      }),
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
          name: "SHODAN",
          configured: true,
          updatedAt: "2026-01-01",
          label: "Shodan",
        },
      ]),
      put: vi.fn().mockResolvedValue({
        name: "WHOIS_API_KEY",
        configured: true,
        updatedAt: "2026-01-01",
        label: null,
      }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
    edges: {
      list: vi.fn().mockResolvedValue([
        {
          id: "edge-1",
          fromId: "a",
          toId: "b",
          predicate: "knows",
          confidence: "unverified",
          peerId: "b",
          peerName: "Beta Corp",
          peerSlug: "beta-corp",
          peerKind: "org",
          direction: "out",
        },
      ]),
      create: vi.fn().mockResolvedValue({
        id: "edge-2",
        fromId: "a",
        toId: "b",
        predicate: "same_as",
        confidence: "unverified",
        notes: null,
        evidenceIds: [],
        peerId: "b",
        peerName: "Beta Corp",
        peerSlug: "beta-corp",
        peerKind: "org",
        direction: "out",
      }),
      update: vi.fn().mockResolvedValue({
        id: "edge-1",
        fromId: "a",
        toId: "b",
        predicate: "knows",
        confidence: "possible",
        notes: null,
        evidenceIds: [],
        peerId: "b",
        peerName: "Beta Corp",
        peerSlug: "beta-corp",
        peerKind: "org",
        direction: "out",
      }),
    },
    entities: {
      list: vi
        .fn()
        .mockResolvedValue([
          { id: "ent-1", kind: "person", name: "Jane", slug: "jane" },
        ]),
      get: vi.fn().mockResolvedValue({
        id: "ent-1",
        kind: "person",
        name: "Jane",
        slug: "alpha-corp",
      }),
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
      createUrl: vi.fn().mockResolvedValue({
        id: "evidence-2",
        kind: "url_archive",
        label: null,
        capturedAt: "2026-01-01T12:00:00.000Z",
      }),
      createPaste: vi.fn().mockResolvedValue({
        id: "evidence-3",
        kind: "note",
        label: null,
        capturedAt: "2026-01-01T12:00:00.000Z",
      }),
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
      delete: vi.fn().mockResolvedValue(undefined),
    },
    graph: {
      write: vi.fn().mockResolvedValue({
        writeId: "00000000-0000-4000-8000-000000000001",
        confidence: "unverified",
        opCount: 1,
        replayed: false,
        actorLabel: "test",
      }),
    },
    jobs: {
      listForCase: vi.fn().mockResolvedValue([
        {
          id: JOB_UUID,
          capabilityId: "web.page.enrich",
          input: { url: "https://example.com" },
          status: "queued",
          createdAt: "2026-01-01T12:00:00.000Z",
        },
      ]),
      get: vi.fn().mockResolvedValue({
        id: JOB_UUID,
        capabilityId: "web.page.enrich",
        input: { url: "https://example.com" },
        status: "queued",
        logs: ["line one", "line two"],
      }),
      start: vi.fn().mockResolvedValue({
        id: JOB_UUID,
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
        status: "queued",
        createdAt: "2026-01-01T12:00:00.000Z",
      }),
      startPlaybook: vi.fn().mockResolvedValue({
        playbookId: "host-footprint",
        playbookRunId: "00000000-0000-4000-8000-000000000020",
        jobs: [],
      }),
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
      accept: vi.fn().mockResolvedValue({
        id: "proposal-1",
        status: "accepted",
        summary: "Add identifier",
        createdAt: "2026-01-01T12:00:00.000Z",
      }),
      reject: vi.fn().mockResolvedValue({
        id: "proposal-1",
        status: "rejected",
        summary: "Add identifier",
        createdAt: "2026-01-01T12:00:00.000Z",
      }),
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

  return {
    CASE_UUID,
    ENTITY_UUID,
    ENTITY_ACME_UUID,
    JOB_UUID,
    emitList,
    emit,
    emitOk,
    fail,
    api,
    client,
  };
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

vi.mock("../../ids", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ids")>();
  return {
    ...actual,
    resolveEntityId: vi.fn(async (_caseId: string, entity: string) => {
      if (entity === "acme") return mocks.ENTITY_ACME_UUID;
      return mocks.ENTITY_UUID;
    }),
  };
});

vi.mock("../../download", () => ({
  downloadToFile: vi.fn(async () => "/tmp/export.zip"),
}));

vi.mock("../../load-patch", () => ({
  loadPatch: vi.fn(() => [
    {
      op: "create",
      resource: "claim",
      id: "00000000-0000-4000-8000-000000000002",
      data: {
        entityId: "00000000-0000-4000-8000-000000000003",
        text: "observed",
      },
    },
  ]),
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

  it("capsCmd playbooks lists labeled seed kinds", async () => {
    mocks.client.capabilities.listPlaybooks.mockResolvedValueOnce([
      {
        id: "host-footprint-lite",
        title: "Host Footprint Lite",
        description: "Light host recon",
        seedKinds: ["host", "url"],
        steps: ["network.dns.lookup"],
        requires: { credentials: [], egress: "none", flags: [] },
      },
    ]);
    const playbooks = capsCmd.subCommands?.playbooks;
    await playbooks?.run?.({ args: { table: false, full: false } } as never);
    expect(mocks.client.capabilities.listPlaybooks).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: "host-footprint-lite",
            seeds: "Host, URL",
            steps: "DNS Lookup",
          }),
        ],
      })
    );
  });

  it("casesCmd lists cases", async () => {
    await casesCmd.run?.({ args: {} } as never);
    expect(mocks.client.cases.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            id: "case-1",
            name: "Alpha",
            slug: "alpha",
            allowThirdPartyEgress: false,
            egressLabel: "Third party blocked",
          },
        ],
      })
    );
  });

  it("casesCmd create normalizes explicit slug before API call", async () => {
    const create = casesCmd.subCommands?.create;
    mocks.client.cases.create.mockClear();
    await create?.run?.({
      args: { name: "Beta Case", slug: "  Beta Case  " },
    } as never);
    expect(mocks.client.cases.create).toHaveBeenCalledWith({
      name: "Beta Case",
      slug: "beta-case",
    });
  });

  it("claimsCmd requires case and entity then lists claims", async () => {
    await claimsCmd.run?.({
      args: { case: mocks.CASE_UUID, entity: "jane" },
    } as never);
    expect(mocks.client.claims.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("credentialsCmd lists vault credentials", async () => {
    await credentialsCmd.run?.({ args: {} } as never);
    expect(mocks.client.credentials.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("credentialsCmd put rejects lowercase credential names", async () => {
    const put = credentialsCmd.subCommands?.put;
    await expect(
      put?.run?.({
        args: { name: "shodan", stdin: true },
      })
    ).rejects.toThrow(/USAGE: Credential name must be SCREAMING_SNAKE/);
    expect(mocks.client.credentials.put).not.toHaveBeenCalled();
  });

  it("edgesCmd lists edges for a case entity", async () => {
    await edgesCmd.run?.({
      args: { case: mocks.CASE_UUID, entity: "jane" },
    } as never);
    expect(mocks.client.edges.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            id: "edge-1",
            dir: "out",
            dirLabel: "Outbound",
            peer: "Beta Corp",
            predicate: "knows",
            predicateLabel: "knows",
            confidence: "unverified",
            confidenceLabel: "Unverified",
          },
        ],
      })
    );
  });

  it("edgesCmd update clears notes with an empty --notes value", async () => {
    const update = edgesCmd.subCommands?.update;
    await update?.run?.({
      args: {
        case: mocks.CASE_UUID,
        edge: "00000000-0000-4000-8000-000000000099",
        notes: "",
        "user-override": true,
      },
    } as never);
    expect(mocks.client.edges.update).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      edgeId: "00000000-0000-4000-8000-000000000099",
      userOverride: true,
      notes: null,
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("edgesCmd update rejects --entity without another mutable field", async () => {
    const update = edgesCmd.subCommands?.update;
    mocks.client.edges.update.mockClear();
    await expect(
      update?.run?.({
        args: {
          case: mocks.CASE_UUID,
          edge: "00000000-0000-4000-8000-000000000099",
          entity: "jane",
          "user-override": true,
        },
      } as never)
    ).rejects.toThrow(/graph view/i);
    expect(mocks.client.edges.update).not.toHaveBeenCalled();
  });

  it("edgesCmd create rejects related_to without notes", async () => {
    const create = edgesCmd.subCommands?.create;
    mocks.client.edges.create.mockClear();
    await expect(
      create?.run?.({
        args: {
          case: mocks.CASE_UUID,
          from: "jane",
          to: "acme",
          predicate: "related_to",
          confidence: "unverified",
          "user-override": true,
        },
      } as never)
    ).rejects.toThrow(/related_to requires notes/i);
    expect(mocks.client.edges.create).not.toHaveBeenCalled();
  });

  it("edgesCmd create rejects self-linked endpoints", async () => {
    const create = edgesCmd.subCommands?.create;
    mocks.client.edges.create.mockClear();
    await expect(
      create?.run?.({
        args: {
          case: mocks.CASE_UUID,
          from: "jane",
          to: "jane",
          predicate: "same_as",
          confidence: "unverified",
          "user-override": true,
        },
      } as never)
    ).rejects.toThrow(/must differ/i);
    expect(mocks.client.edges.create).not.toHaveBeenCalled();
  });

  it("edgesCmd update rejects self-linked endpoints", async () => {
    const update = edgesCmd.subCommands?.update;
    mocks.client.edges.update.mockClear();
    await expect(
      update?.run?.({
        args: {
          case: mocks.CASE_UUID,
          edge: "00000000-0000-4000-8000-000000000099",
          from: "jane",
          to: "jane",
          "user-override": true,
        },
      } as never)
    ).rejects.toThrow(/must differ/i);
    expect(mocks.client.edges.update).not.toHaveBeenCalled();
  });

  it("edgesCmd update rejects related_to with empty notes", async () => {
    const update = edgesCmd.subCommands?.update;
    mocks.client.edges.update.mockClear();
    await expect(
      update?.run?.({
        args: {
          case: mocks.CASE_UUID,
          edge: "00000000-0000-4000-8000-000000000099",
          predicate: "related_to",
          notes: "   ",
          "user-override": true,
        },
      } as never)
    ).rejects.toThrow(/related_to requires notes/i);
    expect(mocks.client.edges.update).not.toHaveBeenCalled();
  });

  it("edgesCmd update allows predicate-only related_to (server merges notes)", async () => {
    const update = edgesCmd.subCommands?.update;
    mocks.client.edges.update.mockClear();
    mocks.client.edges.update.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000000099",
      fromId: "a",
      toId: "b",
      predicate: "related_to",
      confidence: "unverified",
      notes: "existing link",
      evidenceIds: [],
      peerId: "b",
      peerName: "Beta Corp",
      peerSlug: "beta-corp",
      peerKind: "org",
      direction: "out",
    });
    await update?.run?.({
      args: {
        case: mocks.CASE_UUID,
        edge: "00000000-0000-4000-8000-000000000099",
        predicate: "related_to",
        "user-override": true,
      },
    } as never);
    expect(mocks.client.edges.update).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      edgeId: "00000000-0000-4000-8000-000000000099",
      predicate: "related_to",
      userOverride: true,
    });
  });

  it("identifiersCmd delete removes an identifier", async () => {
    const del = identifiersCmd.subCommands?.delete;
    await del?.run?.({
      args: {
        case: mocks.CASE_UUID,
        identifier: "00000000-0000-4000-8000-000000000088",
        "user-override": true,
      },
    } as never);
    expect(mocks.client.identifiers.delete).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      identifierId: "00000000-0000-4000-8000-000000000088",
      userOverride: true,
    });
    expect(mocks.emitOk).toHaveBeenCalledWith({
      deleted: true,
      id: "00000000-0000-4000-8000-000000000088",
    });
  });

  it("entitiesCmd lists entities for a case", async () => {
    await entitiesCmd.run?.({ args: { case: mocks.CASE_UUID } } as never);
    expect(mocks.client.entities.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("entitiesCmd get normalizes padded slug before API call", async () => {
    const get = entitiesCmd.subCommands?.get;
    mocks.client.entities.get.mockClear();
    await get?.run?.({
      args: { case: mocks.CASE_UUID, slug: "  Alpha Corp  " },
    } as never);
    expect(mocks.client.entities.get).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      slug: "alpha-corp",
    });
  });

  it("eventsCmd lists timeline events for a case entity", async () => {
    await eventsCmd.run?.({
      args: { case: mocks.CASE_UUID, entity: "jane" },
    } as never);
    expect(mocks.client.events.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("evidenceCmd lists evidence for a case", async () => {
    await evidenceCmd.run?.({ args: { case: mocks.CASE_UUID } } as never);
    expect(mocks.client.evidence.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("evidenceCmd list rejects hidden with active-queue filters", async () => {
    mocks.client.evidence.list.mockClear();
    await expect(
      evidenceCmd.run?.({
        args: { case: mocks.CASE_UUID, hidden: true, unprocessed: true },
      } as never)
    ).rejects.toThrow(/USAGE: .*mutually exclusive/i);
    expect(mocks.client.evidence.list).not.toHaveBeenCalled();
  });

  it("evidenceCmd url rejects a blank source URL", async () => {
    const url = evidenceCmd.subCommands?.url;
    await expect(
      url?.run?.({ args: { case: mocks.CASE_UUID, source: "   " } })
    ).rejects.toThrow(/USAGE: URL must be http or https/);
    expect(mocks.client.evidence.createUrl).not.toHaveBeenCalled();
  });

  it("evidenceCmd url trims the source URL", async () => {
    const url = evidenceCmd.subCommands?.url;
    await url?.run?.({
      args: { case: mocks.CASE_UUID, source: "  https://example.com  " },
    });
    expect(mocks.client.evidence.createUrl).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      sourceUrl: "https://example.com",
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("evidenceCmd paste rejects a blank body", async () => {
    const paste = evidenceCmd.subCommands?.paste;
    await expect(
      paste?.run?.({ args: { case: mocks.CASE_UUID, body: "   " } })
    ).rejects.toThrow(
      /USAGE: Provide --body or --stdin \(body must not be blank\)/
    );
    expect(mocks.client.evidence.createPaste).not.toHaveBeenCalled();
  });

  it("evidenceCmd paste trims the body", async () => {
    const paste = evidenceCmd.subCommands?.paste;
    await paste?.run?.({
      args: { case: mocks.CASE_UUID, body: "  paste text  " },
    });
    expect(mocks.client.evidence.createPaste).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      body: "paste text",
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("identifiersCmd lists identifiers for a case entity", async () => {
    await identifiersCmd.run?.({
      args: { case: mocks.CASE_UUID, entity: "jane" },
    } as never);
    expect(mocks.client.identifiers.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("exportCmd zip downloads the case export archive", async () => {
    const zip = exportCmd.subCommands?.zip;
    await zip?.run?.({ args: { case: mocks.CASE_UUID } });
    expect(mocks.emitOk).toHaveBeenCalledWith({ path: "/tmp/export.zip" });
  });

  it("graphCmd write sends a patch with userOverride", async () => {
    const write = graphCmd.subCommands?.write;
    await write?.run?.({ args: { case: mocks.CASE_UUID, patch: "[]" } });
    expect(mocks.client.graph.write).toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        confidenceLabel: "Unverified",
        patchSummary: "Create Claim",
        opCount: 1,
      })
    );
  });

  it("jobsCmd lists jobs for a case", async () => {
    await jobsCmd.run?.({ args: { case: mocks.CASE_UUID } } as never);
    expect(mocks.client.jobs.listForCase).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("jobsCmd get enriches cap label and subject", async () => {
    const get = jobsCmd.subCommands?.get;
    await get?.run?.({
      args: { case: mocks.CASE_UUID, job: mocks.JOB_UUID, full: false },
    });
    expect(mocks.client.jobs.get).toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        capLabel: "Page Enrich",
        subject: "https://example.com",
      })
    );
  });

  it("jobsCmd start trims padded graph ids in --input JSON", async () => {
    const entityId = "00000000-0000-4000-8000-000000000050";
    const evidenceId = "00000000-0000-4000-8000-000000000099";
    const start = jobsCmd.subCommands?.start;
    await start?.run?.({
      args: {
        case: mocks.CASE_UUID,
        cap: "network.dns.lookup",
        input: `{"entityId":"  ${entityId}  ","evidenceId":"  ${evidenceId}  ","host":"example.com"}`,
      },
    });
    expect(mocks.client.jobs.start).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      capabilityId: "network.dns.lookup",
      input: { entityId, evidenceId, host: "example.com" },
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("jobsCmd start trims padded --input JSON before parsing", async () => {
    const start = jobsCmd.subCommands?.start;
    await start?.run?.({
      args: {
        case: mocks.CASE_UUID,
        cap: "network.dns.lookup",
        input: `  {"host":"example.com"}  `,
      },
    });
    expect(mocks.client.jobs.start).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("jobsCmd playbook rejects an empty seed", async () => {
    const playbook = jobsCmd.subCommands?.playbook;
    await expect(
      playbook?.run?.({
        args: { case: mocks.CASE_UUID, id: "host-footprint" },
      })
    ).rejects.toThrow(/USAGE: At least one playbook seed is required/);
    expect(mocks.fail).toHaveBeenCalledWith(
      "USAGE",
      "At least one playbook seed is required",
      expect.objectContaining({ help: expect.any(Array) })
    );
    expect(mocks.client.jobs.startPlaybook).not.toHaveBeenCalled();
  });

  it("jobsCmd playbook starts with a host seed", async () => {
    const playbook = jobsCmd.subCommands?.playbook;
    await playbook?.run?.({
      args: {
        case: mocks.CASE_UUID,
        id: "host-footprint",
        host: "example.com",
      },
    });
    expect(mocks.client.jobs.startPlaybook).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      playbookId: "host-footprint",
      seed: { host: "example.com" },
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("jobsCmd playbook rejects non-http seed URLs", async () => {
    const playbook = jobsCmd.subCommands?.playbook;
    const callsBefore = mocks.client.jobs.startPlaybook.mock.calls.length;
    await expect(
      playbook?.run?.({
        args: {
          case: mocks.CASE_UUID,
          id: "host-footprint",
          url: "ftp://example.com",
        },
      })
    ).rejects.toThrow(/USAGE: Invalid playbook seed/);
    expect(mocks.client.jobs.startPlaybook.mock.calls.length).toBe(callsBefore);
  });

  it("proposalsCmd lists pending proposals for a case", async () => {
    await proposalsCmd.run?.({ args: { case: mocks.CASE_UUID } } as never);
    expect(mocks.client.proposals.listForCase).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("proposalsCmd case-folds padded --status values", async () => {
    await proposalsCmd.run?.({
      args: { case: mocks.CASE_UUID, status: "  REJECTED  " },
    } as never);
    expect(mocks.client.proposals.listForCase).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      status: "rejected",
    });
  });

  it("proposalsCmd accept forwards shared evidence and attestation", async () => {
    const accept = proposalsCmd.subCommands?.accept;
    const proposalId = "00000000-0000-4000-8000-000000000099";
    const evidenceId = "00000000-0000-4000-8000-000000000088";
    await accept?.run?.({
      args: {
        case: mocks.CASE_UUID,
        proposal: proposalId,
        confidence: "possible",
        sharedEvidence: evidenceId,
        attestation: "Reviewed source export",
      },
    } as never);

    expect(mocks.client.proposals.accept).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      proposalId,
      confidence: "possible",
      sharedEvidenceIds: [evidenceId],
      attestationText: "Reviewed source export",
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("questionsCmd lists questions for a case entity", async () => {
    await questionsCmd.run?.({
      args: { case: mocks.CASE_UUID, entity: "jane" },
    } as never);
    expect(mocks.client.questions.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });
});
