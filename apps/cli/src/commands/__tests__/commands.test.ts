import { parseArgs, type CommandContext, type CommandDef } from "citty";
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
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: "case-1",
            name: "Alpha",
            slug: "alpha",
            allowThirdPartyEgress: false,
          },
        ],
        nextCursor: null,
      }),
      get: vi.fn().mockResolvedValue({ id: "case-1", name: "Alpha" }),
      create: vi.fn().mockResolvedValue({
        id: "case-2",
        name: "Beta Case",
        slug: "beta-case",
        allowThirdPartyEgress: false,
      }),
    },
    claims: {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: "claim-1",
            text: "Claim",
            confidence: "unverified",
            class: "observation",
            retracted: false,
          },
        ],
        nextCursor: null,
      }),
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
    },
    edges: {
      listForCase: vi.fn().mockResolvedValue({
        items: [{ id: "00000000-0000-4000-8000-000000000099", version: 4 }],
        nextCursor: null,
      }),
      list: vi.fn().mockResolvedValue({
        items: [
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
        ],
        nextCursor: null,
      }),
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
      list: vi.fn().mockResolvedValue({
        items: [{ id: "ent-1", kind: "person", name: "Jane", slug: "jane" }],
        nextCursor: null,
      }),
      get: vi.fn().mockResolvedValue({
        id: "ent-1",
        kind: "person",
        name: "Jane",
        slug: "alpha-corp",
      }),
    },
    events: {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: "event-1",
            when: "2026-01-01",
            what: "Observed activity",
            where: "NYC",
          },
        ],
        nextCursor: null,
      }),
    },
    evidence: {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: "evidence-1",
            kind: "note",
            label: "Screenshot",
            capturedAt: "2026-01-01T12:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
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
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: "id-1",
            type: "email",
            value: "jane@example.com",
            confidence: "unverified",
            status: "active",
          },
        ],
        nextCursor: null,
      }),
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
      listForCase: vi.fn().mockResolvedValue({
        items: [
          {
            id: JOB_UUID,
            capabilityId: "web.page.enrich",
            input: { url: "https://example.com" },
            status: "queued",
            createdAt: "2026-01-01T12:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
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
      getPlaybookRun: vi.fn(),
      startPlaybook: vi.fn().mockResolvedValue({
        playbookId: "host-footprint",
        playbookRunId: "00000000-0000-4000-8000-000000000020",
        jobs: [],
      }),
    },
    proposals: {
      listForCase: vi.fn().mockResolvedValue({
        items: [
          {
            id: "proposal-1",
            status: "pending",
            summary: "Add identifier",
            createdAt: "2026-01-01T12:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
    },
    questions: {
      list: vi.fn().mockResolvedValue({
        items: [{ id: "question-1", text: "Who owns this?", status: "open" }],
        nextCursor: null,
      }),
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

function ctx(args: Record<string, string | boolean>): CommandContext {
  return { rawArgs: [], args: Object.assign(parseArgs([], {}), args), cmd: {} };
}

async function verbsOf(parent: CommandDef): Promise<string[]> {
  const def = parent.subCommands;
  const subs = typeof def === "function" ? await def() : await def;
  return Object.keys(subs ?? {});
}

async function subCommand(
  parent: CommandDef,
  name: string
): Promise<CommandDef> {
  const def = parent.subCommands;
  const subs = typeof def === "function" ? await def() : await def;
  const entry = subs?.[name];
  if (entry === undefined) {
    expect.fail(`missing subcommand ${name}`);
  }
  return typeof entry === "function" ? entry() : entry;
}

const PARTIAL_RUN_ID = "00000000-0000-4000-8000-0000000000a1";
const PARTIAL_RUN = {
  id: PARTIAL_RUN_ID,
  caseId: "00000000-0000-4000-8000-000000000001",
  playbookId: "host-footprint",
  status: "finished",
  outcome: "partial",
  createdAt: "2026-01-01T12:00:00.000Z",
  finishedAt: "2026-01-01T12:03:00.000Z",
  steps: [
    {
      step: 0,
      capabilityId: "network.dns.lookup",
      state: "failed",
      jobIds: ["00000000-0000-4000-8000-0000000000b0"],
    },
    {
      step: 1,
      capabilityId: "network.whois.lookup",
      state: "succeeded",
      jobIds: ["00000000-0000-4000-8000-0000000000b1"],
    },
    {
      step: 2,
      capabilityId: "network.ct.lookup",
      state: "skipped",
      reason: "step 0 (network.dns.lookup) failed",
      jobIds: [],
    },
  ],
};

describe("CLI noun commands", () => {
  it("capsCmd lists capabilities", async () => {
    await capsCmd.run?.(ctx({}));
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
    const playbooks = await subCommand(capsCmd, "playbooks");
    await playbooks.run?.(ctx({ table: false, full: false }));
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
    await casesCmd.run?.(ctx({}));
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
    const create = await subCommand(casesCmd, "create");
    mocks.client.cases.create.mockClear();
    await create.run?.(ctx({ name: "Beta Case", slug: "  Beta Case  " }));
    expect(mocks.client.cases.create).toHaveBeenCalledWith({
      name: "Beta Case",
      slug: "beta-case",
    });
  });

  it("casesCmd offers no delete or restore verb (session-only in the web app)", async () => {
    const verbs = await verbsOf(casesCmd);
    expect(verbs).not.toContain("delete");
    expect(verbs).not.toContain("restore");
  });

  it("claimsCmd requires case and entity then lists claims", async () => {
    await claimsCmd.run?.(ctx({ case: mocks.CASE_UUID, entity: "jane" }));
    expect(mocks.client.claims.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("credentialsCmd lists vault credentials", async () => {
    await credentialsCmd.run?.(ctx({}));
    expect(mocks.client.credentials.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("credentialsCmd offers no put or delete verb (Settings only)", async () => {
    const verbs = await verbsOf(credentialsCmd);
    expect(verbs).toEqual(["list"]);
  });

  it("edgesCmd lists edges for a case entity", async () => {
    await edgesCmd.run?.(ctx({ case: mocks.CASE_UUID, entity: "jane" }));
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
    const update = await subCommand(edgesCmd, "update");
    await update.run?.(
      ctx({
        case: mocks.CASE_UUID,
        edge: "00000000-0000-4000-8000-000000000099",
        notes: "",
        "user-override": true,
      })
    );
    expect(mocks.client.edges.update).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      edgeId: "00000000-0000-4000-8000-000000000099",
      expectedVersion: 4,
      userOverride: true,
      notes: null,
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("edgesCmd update sends --expected-version as given and does not read the row first (#307)", async () => {
    const update = await subCommand(edgesCmd, "update");
    mocks.client.edges.update.mockClear();
    mocks.client.edges.listForCase.mockClear();
    await update.run?.(
      ctx({
        case: mocks.CASE_UUID,
        edge: "00000000-0000-4000-8000-000000000099",
        notes: "x",
        "expected-version": "9",
        "user-override": true,
      })
    );
    expect(mocks.client.edges.listForCase).not.toHaveBeenCalled();
    expect(mocks.client.edges.update).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 9, notes: "x" })
    );
  });

  it("edgesCmd update rejects a malformed --expected-version", async () => {
    const update = await subCommand(edgesCmd, "update");
    mocks.client.edges.update.mockClear();
    await expect(
      update.run?.(
        ctx({
          case: mocks.CASE_UUID,
          edge: "00000000-0000-4000-8000-000000000099",
          notes: "x",
          "expected-version": "abc",
          "user-override": true,
        })
      )
    ).rejects.toThrow(/positive integer/i);
    expect(mocks.client.edges.update).not.toHaveBeenCalled();
  });

  it("edgesCmd update rejects --entity without another mutable field", async () => {
    const update = await subCommand(edgesCmd, "update");
    mocks.client.edges.update.mockClear();
    await expect(
      update.run?.(
        ctx({
          case: mocks.CASE_UUID,
          edge: "00000000-0000-4000-8000-000000000099",
          entity: "jane",
          "user-override": true,
        })
      )
    ).rejects.toThrow(/graph view/i);
    expect(mocks.client.edges.update).not.toHaveBeenCalled();
  });

  it("edgesCmd create rejects related_to without notes", async () => {
    const create = await subCommand(edgesCmd, "create");
    mocks.client.edges.create.mockClear();
    await expect(
      create.run?.(
        ctx({
          case: mocks.CASE_UUID,
          from: "jane",
          to: "acme",
          predicate: "related_to",
          confidence: "unverified",
          "user-override": true,
        })
      )
    ).rejects.toThrow(/related_to requires notes/i);
    expect(mocks.client.edges.create).not.toHaveBeenCalled();
  });

  it("edgesCmd create rejects self-linked endpoints", async () => {
    const create = await subCommand(edgesCmd, "create");
    mocks.client.edges.create.mockClear();
    await expect(
      create.run?.(
        ctx({
          case: mocks.CASE_UUID,
          from: "jane",
          to: "jane",
          predicate: "same_as",
          confidence: "unverified",
          "user-override": true,
        })
      )
    ).rejects.toThrow(/must differ/i);
    expect(mocks.client.edges.create).not.toHaveBeenCalled();
  });

  it("edgesCmd update rejects self-linked endpoints", async () => {
    const update = await subCommand(edgesCmd, "update");
    mocks.client.edges.update.mockClear();
    await expect(
      update.run?.(
        ctx({
          case: mocks.CASE_UUID,
          edge: "00000000-0000-4000-8000-000000000099",
          from: "jane",
          to: "jane",
          "user-override": true,
        })
      )
    ).rejects.toThrow(/must differ/i);
    expect(mocks.client.edges.update).not.toHaveBeenCalled();
  });

  it("edgesCmd update rejects related_to with empty notes", async () => {
    const update = await subCommand(edgesCmd, "update");
    mocks.client.edges.update.mockClear();
    await expect(
      update.run?.(
        ctx({
          case: mocks.CASE_UUID,
          edge: "00000000-0000-4000-8000-000000000099",
          predicate: "related_to",
          notes: "   ",
          "user-override": true,
        })
      )
    ).rejects.toThrow(/related_to requires notes/i);
    expect(mocks.client.edges.update).not.toHaveBeenCalled();
  });

  it("edgesCmd update allows predicate-only related_to (server merges notes)", async () => {
    const update = await subCommand(edgesCmd, "update");
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
    await update.run?.(
      ctx({
        case: mocks.CASE_UUID,
        edge: "00000000-0000-4000-8000-000000000099",
        predicate: "related_to",
        "user-override": true,
      })
    );
    expect(mocks.client.edges.update).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      edgeId: "00000000-0000-4000-8000-000000000099",
      expectedVersion: 4,
      predicate: "related_to",
      userOverride: true,
    });
  });

  it("identifiersCmd delete removes an identifier", async () => {
    const del = await subCommand(identifiersCmd, "delete");
    await del.run?.(
      ctx({
        case: mocks.CASE_UUID,
        identifier: "00000000-0000-4000-8000-000000000088",
        "user-override": true,
      })
    );
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
    await entitiesCmd.run?.(ctx({ case: mocks.CASE_UUID }));
    expect(mocks.client.entities.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("entitiesCmd list takes --limit and --cursor and prints nextCursor", async () => {
    mocks.client.entities.list.mockClear();
    mocks.client.entities.list.mockResolvedValueOnce({
      items: [{ id: "ent-1", kind: "person", name: "Jane", slug: "jane" }],
      nextCursor: "next-page",
    });
    mocks.emitList.mockClear();
    await entitiesCmd.run?.(
      ctx({ case: mocks.CASE_UUID, limit: "1", cursor: "first-page" })
    );
    expect(mocks.client.entities.list).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      limit: 1,
      cursor: "first-page",
    });
    expect(mocks.emitList).toHaveBeenCalledWith(
      expect.objectContaining({ nextCursor: "next-page" })
    );
  });

  it("entitiesCmd list --all follows nextCursor to the last page", async () => {
    mocks.client.entities.list.mockClear();
    mocks.client.entities.list
      .mockResolvedValueOnce({
        items: [{ id: "ent-1", kind: "person", name: "A", slug: "a" }],
        nextCursor: "page-2",
      })
      .mockResolvedValueOnce({
        items: [{ id: "ent-2", kind: "person", name: "B", slug: "b" }],
        nextCursor: null,
      });
    mocks.emitList.mockClear();
    await entitiesCmd.run?.(ctx({ case: mocks.CASE_UUID, all: true }));
    expect(mocks.client.entities.list).toHaveBeenCalledTimes(2);
    expect(mocks.client.entities.list).toHaveBeenLastCalledWith({
      caseId: mocks.CASE_UUID,
      limit: 200,
      cursor: "page-2",
    });
    const [call] = mocks.emitList.mock.calls;
    expect(call?.[0]).toMatchObject({ nextCursor: null });
    expect(call?.[0].items).toHaveLength(2);
  });

  it("entitiesCmd get normalizes padded slug before API call", async () => {
    const get = await subCommand(entitiesCmd, "get");
    mocks.client.entities.get.mockClear();
    await get.run?.(ctx({ case: mocks.CASE_UUID, slug: "  Alpha Corp  " }));
    expect(mocks.client.entities.get).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      slug: "alpha-corp",
    });
  });

  it("eventsCmd lists timeline events for a case entity", async () => {
    await eventsCmd.run?.(ctx({ case: mocks.CASE_UUID, entity: "jane" }));
    expect(mocks.client.events.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("evidenceCmd lists evidence for a case", async () => {
    await evidenceCmd.run?.(ctx({ case: mocks.CASE_UUID }));
    expect(mocks.client.evidence.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("evidenceCmd list rejects hidden with active-queue filters", async () => {
    mocks.client.evidence.list.mockClear();
    await expect(
      evidenceCmd.run?.(
        ctx({ case: mocks.CASE_UUID, hidden: true, unprocessed: true })
      )
    ).rejects.toThrow(/USAGE: .*mutually exclusive/i);
    expect(mocks.client.evidence.list).not.toHaveBeenCalled();
  });

  it("evidenceCmd url rejects a blank source URL", async () => {
    const url = await subCommand(evidenceCmd, "url");
    await expect(
      url.run?.(ctx({ case: mocks.CASE_UUID, source: "   " }))
    ).rejects.toThrow(/USAGE: URL must be http or https/);
    expect(mocks.client.evidence.createUrl).not.toHaveBeenCalled();
  });

  it("evidenceCmd url trims the source URL", async () => {
    const url = await subCommand(evidenceCmd, "url");
    await url.run?.(
      ctx({ case: mocks.CASE_UUID, source: "  https://example.com  " })
    );
    expect(mocks.client.evidence.createUrl).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      sourceUrl: "https://example.com",
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("evidenceCmd paste rejects a blank body", async () => {
    const paste = await subCommand(evidenceCmd, "paste");
    await expect(
      paste.run?.(ctx({ case: mocks.CASE_UUID, body: "   " }))
    ).rejects.toThrow(
      /USAGE: Provide --body or --stdin \(body must not be blank\)/
    );
    expect(mocks.client.evidence.createPaste).not.toHaveBeenCalled();
  });

  it("evidenceCmd paste trims the body", async () => {
    const paste = await subCommand(evidenceCmd, "paste");
    await paste.run?.(ctx({ case: mocks.CASE_UUID, body: "  paste text  " }));
    expect(mocks.client.evidence.createPaste).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      body: "paste text",
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("identifiersCmd lists identifiers for a case entity", async () => {
    await identifiersCmd.run?.(ctx({ case: mocks.CASE_UUID, entity: "jane" }));
    expect(mocks.client.identifiers.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("exportCmd zip downloads the case export archive", async () => {
    const zip = await subCommand(exportCmd, "zip");
    await zip.run?.(ctx({ case: mocks.CASE_UUID }));
    expect(mocks.emitOk).toHaveBeenCalledWith({ path: "/tmp/export.zip" });
  });

  it("graphCmd write sends a patch with userOverride", async () => {
    const write = await subCommand(graphCmd, "write");
    await write.run?.(ctx({ case: mocks.CASE_UUID, patch: "[]" }));
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
    await jobsCmd.run?.(ctx({ case: mocks.CASE_UUID }));
    expect(mocks.client.jobs.listForCase).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("jobsCmd reads on past a page that ends inside a playbook run, so the run shows as one row", async () => {
    const RUN = "00000000-0000-4000-8000-0000000000a1";
    const step = (n: number, id: string) => ({
      id,
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
      status: "succeeded",
      playbookRunId: RUN,
      playbookId: "host-footprint",
      playbookStep: n,
      createdAt: `2026-01-01T12:0${n}:00.000Z`,
    });
    mocks.client.jobs.listForCase.mockClear();
    mocks.client.jobs.listForCase
      .mockResolvedValueOnce({
        items: [step(2, "00000000-0000-4000-8000-0000000000b2")],
        nextCursor: "more",
      })
      .mockResolvedValueOnce({
        items: [
          step(1, "00000000-0000-4000-8000-0000000000b1"),
          step(0, "00000000-0000-4000-8000-0000000000b0"),
        ],
        nextCursor: "later",
      });
    mocks.emitList.mockClear();
    await jobsCmd.run?.(ctx({ case: mocks.CASE_UUID }));
    expect(mocks.client.jobs.listForCase).toHaveBeenCalledTimes(2);
    expect(mocks.client.jobs.listForCase).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "more", limit: 200 })
    );
    const [call] = mocks.emitList.mock.calls;
    expect(call?.[0].items).toHaveLength(1);
    expect(call?.[0]).toMatchObject({ nextCursor: "later" });
  });

  it("jobsCmd does not read on when no playbook run is open", async () => {
    mocks.client.jobs.listForCase.mockClear();
    mocks.client.jobs.listForCase.mockResolvedValueOnce({
      items: [
        {
          id: "00000000-0000-4000-8000-0000000000c1",
          capabilityId: "web.page.enrich",
          input: {},
          status: "queued",
          createdAt: "2026-01-01T12:00:00.000Z",
        },
      ],
      nextCursor: "more",
    });
    await jobsCmd.run?.(ctx({ case: mocks.CASE_UUID }));
    expect(mocks.client.jobs.listForCase).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["caps", capsCmd],
    ["credentials", credentialsCmd],
  ])("%s list does not advertise paging flags", async (_name, cmd) => {
    const list = await subCommand(cmd, "list");
    const args =
      typeof list.args === "function" ? await list.args() : await list.args;
    const names = Object.keys(args ?? {});
    expect(names).not.toContain("limit");
    expect(names).not.toContain("cursor");
    expect(names).not.toContain("all");
  });

  it("jobsCmd get enriches cap label and subject", async () => {
    const get = await subCommand(jobsCmd, "get");
    await get.run?.(
      ctx({ case: mocks.CASE_UUID, job: mocks.JOB_UUID, full: false })
    );
    expect(mocks.client.jobs.get).toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        capLabel: "Page Enrich",
        subject: "https://example.com",
      })
    );
  });

  it("jobsCmd get on a step of a playbook run adds the run and every step's outcome, skipped steps with their reason", async () => {
    mocks.client.jobs.get.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-0000000000b1",
      capabilityId: "network.whois.lookup",
      input: { host: "example.com" },
      status: "succeeded",
      playbookRunId: PARTIAL_RUN_ID,
      playbookId: "host-footprint",
      playbookStep: 1,
      playbookRunOutcome: "partial",
      logs: [],
    });
    mocks.client.jobs.getPlaybookRun.mockResolvedValueOnce(PARTIAL_RUN);
    mocks.emit.mockClear();
    const get = await subCommand(jobsCmd, "get");
    await get.run?.(
      ctx({
        case: mocks.CASE_UUID,
        job: "00000000-0000-4000-8000-0000000000b1",
        full: false,
      })
    );
    expect(mocks.client.jobs.getPlaybookRun).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      playbookRunId: PARTIAL_RUN_ID,
    });
    const [call] = mocks.emit.mock.calls;
    expect(call?.[0]).toMatchObject({
      outcomeLabel: "Partial",
      playbookRun: {
        outcome: "partial",
        outcomeLabel: "Partial",
        steps: [
          { step: 0, stateLabel: "Failed", capLabel: "DNS Lookup" },
          { step: 1, stateLabel: "Succeeded" },
          {
            step: 2,
            state: "skipped",
            stateLabel: "Skipped",
            reason: "step 0 (network.dns.lookup) failed",
          },
        ],
      },
    });
  });

  it("jobsCmd get on a standalone job does not read a run", async () => {
    mocks.client.jobs.getPlaybookRun.mockClear();
    const get = await subCommand(jobsCmd, "get");
    await get.run?.(
      ctx({ case: mocks.CASE_UUID, job: mocks.JOB_UUID, full: false })
    );
    expect(mocks.client.jobs.getPlaybookRun).not.toHaveBeenCalled();
  });

  it("jobsCmd playbook-run shows the run with each step's outcome", async () => {
    mocks.client.jobs.getPlaybookRun.mockResolvedValueOnce(PARTIAL_RUN);
    mocks.emit.mockClear();
    const run = await subCommand(jobsCmd, "playbook-run");
    await run.run?.(ctx({ case: mocks.CASE_UUID, run: PARTIAL_RUN_ID }));
    expect(mocks.client.jobs.getPlaybookRun).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      playbookRunId: PARTIAL_RUN_ID,
    });
    const [call] = mocks.emit.mock.calls;
    expect(call?.[0]).toMatchObject({
      playbookLabel: "Host Footprint",
      statusLabel: "Finished",
      outcomeLabel: "Partial",
    });
    expect(
      call?.[0].steps.map(
        (s: { step: number; stateLabel: string }) => `${s.step} ${s.stateLabel}`
      )
    ).toEqual(["0 Failed", "1 Succeeded", "2 Skipped"]);
  });

  it("jobsCmd list shows a finished run's outcome on its row", async () => {
    const step = (n: number, status: string, id: string) => ({
      id,
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
      status,
      playbookRunId: PARTIAL_RUN_ID,
      playbookId: "host-footprint",
      playbookStep: n,
      playbookRunStatus: "finished",
      playbookRunOutcome: "partial",
      createdAt: `2026-01-01T12:0${n}:00.000Z`,
    });
    mocks.client.jobs.listForCase.mockClear();
    mocks.client.jobs.listForCase.mockResolvedValueOnce({
      items: [
        step(1, "succeeded", "00000000-0000-4000-8000-0000000000b1"),
        step(0, "failed", "00000000-0000-4000-8000-0000000000b0"),
      ],
      nextCursor: null,
    });
    mocks.emitList.mockClear();
    await jobsCmd.run?.(ctx({ case: mocks.CASE_UUID }));
    const [call] = mocks.emitList.mock.calls;
    expect(call?.[0].items).toHaveLength(1);
    expect(call?.[0].items[0]).toMatchObject({
      status: "failed",
      statusLabel: "Failed",
      playbookRunOutcome: "partial",
      outcomeLabel: "Partial",
    });
    expect(call?.[0].columns).toContain("outcomeLabel");
  });

  it("jobsCmd start trims padded graph ids in --input JSON", async () => {
    const entityId = "00000000-0000-4000-8000-000000000050";
    const evidenceId = "00000000-0000-4000-8000-000000000099";
    const start = await subCommand(jobsCmd, "start");
    await start.run?.(
      ctx({
        case: mocks.CASE_UUID,
        cap: "network.dns.lookup",
        input: `{"entityId":"  ${entityId}  ","evidenceId":"  ${evidenceId}  ","host":"example.com"}`,
      })
    );
    expect(mocks.client.jobs.start).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      capabilityId: "network.dns.lookup",
      input: { entityId, evidenceId, host: "example.com" },
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("jobsCmd start trims padded --input JSON before parsing", async () => {
    const start = await subCommand(jobsCmd, "start");
    await start.run?.(
      ctx({
        case: mocks.CASE_UUID,
        cap: "network.dns.lookup",
        input: `  {"host":"example.com"}  `,
      })
    );
    expect(mocks.client.jobs.start).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("jobsCmd playbook rejects an empty seed", async () => {
    const playbook = await subCommand(jobsCmd, "playbook");
    await expect(
      playbook.run?.(ctx({ case: mocks.CASE_UUID, id: "host-footprint" }))
    ).rejects.toThrow(/USAGE: At least one playbook seed is required/);
    expect(mocks.fail).toHaveBeenCalledWith(
      "USAGE",
      "At least one playbook seed is required",
      expect.objectContaining({ help: expect.any(Array) })
    );
    expect(mocks.client.jobs.startPlaybook).not.toHaveBeenCalled();
  });

  it("jobsCmd playbook starts with a host seed", async () => {
    const playbook = await subCommand(jobsCmd, "playbook");
    await playbook.run?.(
      ctx({
        case: mocks.CASE_UUID,
        id: "host-footprint",
        host: "example.com",
      })
    );
    expect(mocks.client.jobs.startPlaybook).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      playbookId: "host-footprint",
      seed: { host: "example.com" },
    });
    expect(mocks.emit).toHaveBeenCalled();
  });

  it("jobsCmd playbook rejects non-http seed URLs", async () => {
    const playbook = await subCommand(jobsCmd, "playbook");
    const callsBefore = mocks.client.jobs.startPlaybook.mock.calls.length;
    await expect(
      playbook.run?.(
        ctx({
          case: mocks.CASE_UUID,
          id: "host-footprint",
          url: "ftp://example.com",
        })
      )
    ).rejects.toThrow(/USAGE: Invalid playbook seed/);
    expect(mocks.client.jobs.startPlaybook.mock.calls.length).toBe(callsBefore);
  });

  it("proposalsCmd lists pending proposals for a case", async () => {
    await proposalsCmd.run?.(ctx({ case: mocks.CASE_UUID }));
    expect(mocks.client.proposals.listForCase).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });

  it("proposalsCmd case-folds padded --status values", async () => {
    await proposalsCmd.run?.(
      ctx({ case: mocks.CASE_UUID, status: "  REJECTED  " })
    );
    expect(mocks.client.proposals.listForCase).toHaveBeenCalledWith({
      caseId: mocks.CASE_UUID,
      status: "rejected",
      limit: 50,
    });
  });

  it("questionsCmd lists questions for a case entity", async () => {
    await questionsCmd.run?.(ctx({ case: mocks.CASE_UUID, entity: "jane" }));
    expect(mocks.client.questions.list).toHaveBeenCalled();
    expect(mocks.emitList).toHaveBeenCalled();
  });
});
