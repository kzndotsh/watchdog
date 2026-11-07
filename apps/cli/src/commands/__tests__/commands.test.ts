import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { HttpResponse, http, mockServer } from "@watchdog/test-kit/http";

import { firstJson, runWd } from "../../__tests__/run-wd";
import {
  API_KEY,
  API_URL,
  queryOf,
  standInApi,
} from "../../__tests__/stand-in-api";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const standIn = standInApi();
const API = { WD_API_KEY: API_KEY, WD_API_URL: API_URL };

const CASE = "00000000-0000-4000-8000-000000000001";
const ENTITY = "00000000-0000-4000-8000-000000000002";
const ENTITY_ACME = "00000000-0000-4000-8000-000000000003";
const EDGE = "00000000-0000-4000-8000-000000000099";
const JOB = "00000000-0000-4000-8000-000000000010";
const RUN = "00000000-0000-4000-8000-0000000000a1";
const NOW = "2026-01-01T12:00:00.000Z";

type Json = Record<string, unknown>;

/** Run `wd <args>` against the stand-in API; stdout's first JSON object is parsed. */
async function wd(...args: string[]) {
  const run = await runWd(args, API);
  return {
    ...run,
    json: run.stdout === "" ? undefined : firstJson(run.stdout),
  };
}

function entity(id: string, slug: string, name = slug): Json {
  return { id, slug, name, kind: "person", summary: null, notes: null };
}

/** `GET /cases/{CASE}/entities/{slug}` answers with this Entity (slug lookup for `--entity`). */
function serveEntity(slug: string, id: string): void {
  standIn.json("get", `/cases/${CASE}/entities/${slug}`, entity(id, slug));
}

function paths(): string[] {
  return standIn.seen.map((request) => `${request.method} ${request.path}`);
}

function queryOfRequest(index: number) {
  const request = standIn.seen[index];
  if (request === undefined) expect.fail(`no request #${index}`);
  return queryOf(request.url);
}

function bodyOfRequest(index: number): unknown {
  return standIn.seen[index]?.body;
}

function errorOf(json: unknown): { code: string; message: string } {
  expect(json).toMatchObject({ ok: false });
  const error: unknown = Reflect.get(new Object(json), "error");
  return {
    code: String(Reflect.get(new Object(error), "code")),
    message: String(Reflect.get(new Object(error), "message")),
  };
}

/** A command that must refuse before any request is sent. */
async function expectUsage(args: string[], message: RegExp): Promise<void> {
  const run = await wd(...args);
  expect(run.status).toBe(1);
  const error = errorOf(run.json);
  expect(error.code).toBe("USAGE");
  expect(error.message).toMatch(message);
  expect(standIn.seen).toEqual([]);
}

async function expectUsageOrCustody(
  args: string[],
  code: "USAGE" | "CUSTODY"
): Promise<void> {
  const run = await wd(...args);
  expect(run.status).toBe(1);
  expect(errorOf(run.json).code).toBe(code);
  expect(standIn.seen).toEqual([]);
}

const EDGE_ROW = {
  id: "edge-1",
  fromId: "a",
  fromSlug: "jane",
  toId: "b",
  toSlug: "beta-corp",
  predicate: "owns",
  confidence: "unverified",
};

const EDGE_WRITTEN = {
  id: EDGE,
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
};

describe("wd caps", () => {
  it("lists capabilities", async () => {
    standIn.json("get", "/capabilities", [
      {
        id: "web.page.enrich",
        kind: "web",
        egress: ["target"],
        title: "Page enrich",
        description: "Fetch page metadata",
      },
    ]);

    const run = await wd("caps", "list");

    expect(run.status).toBe(0);
    expect(run.json).toMatchObject({
      count: 1,
      items: [expect.objectContaining({ id: "web.page.enrich" })],
    });
  });

  it("lists playbooks with labeled seed kinds and steps", async () => {
    standIn.json("get", "/playbooks", [
      {
        id: "host-footprint-lite",
        title: "Host Footprint Lite",
        description: "Light host recon",
        seedKinds: ["host", "url"],
        steps: ["network.dns.lookup"],
        requires: {
          credentials: [],
          egress: ["local"],
          contacts: [],
          flags: [],
        },
      },
    ]);

    const run = await wd("caps", "playbooks");

    expect(run.json).toMatchObject({
      items: [
        expect.objectContaining({
          id: "host-footprint-lite",
          seeds: "Host, URL",
          steps: "DNS Lookup",
        }),
      ],
    });
  });

  it.each([["caps"], ["credentials"]])(
    "%s list does not advertise paging flags",
    async (noun) => {
      standIn.json("get", `/${noun === "caps" ? "capabilities" : noun}`, []);

      const run = await wd(noun, "list", "--limit", "5");

      expect(run.status).toBe(2);
      expect(errorOf(run.json).code).toBe("UNKNOWN_FLAG");
    }
  );
});

describe("wd cases", () => {
  it("lists cases with a label for each Case's allowed egress", async () => {
    standIn.json("get", "/cases", {
      items: [
        {
          id: "case-1",
          name: "Alpha",
          slug: "alpha",
          allowedEgress: ["local", "target"],
        },
      ],
      nextCursor: null,
    });

    const run = await wd("cases", "list");

    expect(run.json).toMatchObject({
      count: 1,
      items: [
        {
          id: "case-1",
          name: "Alpha",
          slug: "alpha",
          allowedEgress: ["local", "target"],
          egressLabel: "Local only, The target itself",
        },
      ],
      nextCursor: null,
    });
  });

  it("sends --local-only, --search and --sort as the list query", async () => {
    standIn.json("get", "/cases", { items: [], nextCursor: null });

    await wd(
      "cases",
      "list",
      "--local-only",
      "--search",
      "alpha",
      "--sort",
      "updated.desc"
    );

    expect(queryOfRequest(0)).toEqual({
      localOnly: "true",
      q: "alpha",
      sort: "updated.desc",
    });
  });

  it("normalizes an explicit slug before creating", async () => {
    standIn.json("post", "/cases", {
      id: "case-2",
      name: "Beta Case",
      slug: "beta-case",
      allowedEgress: ["local", "target"],
    });

    const run = await wd(
      "cases",
      "create",
      "--name",
      "Beta Case",
      "--slug",
      "  Beta Case  "
    );

    expect(run.status).toBe(0);
    expect(bodyOfRequest(0)).toEqual({ name: "Beta Case", slug: "beta-case" });
  });

  it("offers no delete or restore verb (session-only in the web app)", async () => {
    const help = await runWd(["cases", "--help"]);
    expect(help.stdout).toContain("list");
    expect(help.stdout).not.toMatch(/\b(delete|restore|purge)\b/);
  });
});

describe("wd credentials", () => {
  it("lists which vault slots are set", async () => {
    standIn.json("get", "/credentials", [
      {
        name: "SHODAN",
        configured: true,
        updatedAt: "2026-01-01",
        label: "Shodan",
      },
    ]);

    const run = await wd("credentials", "list");

    expect(run.json).toMatchObject({
      count: 1,
      items: [expect.objectContaining({ name: "SHODAN", configured: true })],
    });
  });

  it("offers no put or delete verb (Settings only)", async () => {
    const help = await runWd(["credentials", "--help"]);
    expect(help.stdout).toContain("list");
    expect(help.stdout).not.toMatch(/\b(put|delete)\b/);
  });
});

describe("wd claims, events, questions", () => {
  it.each([
    [
      "claims",
      "claims",
      {
        id: "claim-1",
        text: "Claim",
        confidence: "unverified",
        class: "observation",
        retracted: false,
      },
    ],
    [
      "events",
      "events",
      {
        id: "event-1",
        when: "2026-01-01",
        what: "Observed activity",
        where: "NYC",
      },
    ],
    [
      "questions",
      "questions",
      { id: "question-1", text: "Who owns this?", status: "open" },
    ],
  ])(
    "%s lists one Entity's rows, resolving the slug",
    async (noun, route, row) => {
      serveEntity("jane", ENTITY);
      standIn.json("get", `/cases/${CASE}/${route}`, {
        items: [row],
        nextCursor: null,
      });

      const run = await wd(noun, "list", "-c", CASE, "--entity-id", "jane");

      expect(run.status).toBe(0);
      expect(run.json).toMatchObject({
        count: 1,
        items: [expect.objectContaining({ id: row.id })],
      });
      expect(queryOfRequest(1)).toMatchObject({ entityId: ENTITY });
    }
  );
});

describe("wd edges", () => {
  it("lists one Entity's Connections through --entity-id, both ends per row", async () => {
    serveEntity("acme", ENTITY_ACME);
    standIn.json("get", `/cases/${CASE}/edges`, {
      items: [EDGE_ROW],
      nextCursor: null,
      total: { count: 1, isCapped: false },
    });

    const run = await wd(
      "edges",
      "-c",
      CASE,
      "--entity-id",
      "acme",
      "--predicate",
      "owns"
    );

    expect(queryOfRequest(1)).toEqual({
      entityId: ENTITY_ACME,
      predicate: ["owns"],
    });
    expect(run.json).toMatchObject({
      items: [
        {
          id: "edge-1",
          from: "jane",
          predicate: "owns",
          predicateLabel: "Owns",
          to: "beta-corp",
          confidence: "unverified",
          confidenceLabel: "Unverified",
        },
      ],
      total: { count: 1, isCapped: false },
    });
  });

  describe("update", () => {
    function serveVersion(): void {
      standIn.json("get", `/cases/${CASE}/edges/by-ids`, [
        { id: EDGE, version: 4 },
      ]);
      standIn.json("patch", `/cases/${CASE}/edges/${EDGE}`, EDGE_WRITTEN);
    }

    const base = ["edges", "update", "-c", CASE, EDGE, "--user-override"];

    it("clears notes with an empty --notes value, reading the row's version first", async () => {
      serveVersion();

      const run = await wd(...base, "--notes", "");

      expect(run.status).toBe(0);
      expect(paths()).toEqual([
        `GET /cases/${CASE}/edges/by-ids`,
        `PATCH /cases/${CASE}/edges/${EDGE}`,
      ]);
      expect(bodyOfRequest(1)).toMatchObject({
        expectedVersion: 4,
        userOverride: true,
        notes: null,
      });
    });

    it("sends --expected-version as given and does not read the row first (#307)", async () => {
      serveVersion();

      await wd(...base, "--notes", "x", "--expected-version", "9");

      expect(paths()).toEqual([`PATCH /cases/${CASE}/edges/${EDGE}`]);
      expect(bodyOfRequest(0)).toMatchObject({
        expectedVersion: 9,
        notes: "x",
      });
    });

    it("sends a predicate-only related_to change without notes (the server merges them)", async () => {
      serveVersion();

      const run = await wd(...base, "--predicate", "related_to");

      expect(run.status).toBe(0);
      const body = bodyOfRequest(1);
      expect(body).toMatchObject({
        predicate: "related_to",
        expectedVersion: 4,
      });
      expect(body).not.toHaveProperty("notes");
    });

    it("rejects a malformed --expected-version", async () => {
      await expectUsage(
        [...base, "--notes", "x", "--expected-version", "abc"],
        /positive integer/i
      );
    });

    it("rejects --entity without another mutable field", async () => {
      await expectUsage([...base, "--entity", "jane"], /graph view/i);
    });

    it("rejects self-linked endpoints", async () => {
      serveEntity("jane", ENTITY);
      const run = await wd(...base, "--from", "jane", "--to", "jane");

      expect(run.status).toBe(1);
      expect(errorOf(run.json).message).toMatch(/must differ/i);
      expect(paths().filter((p) => p.startsWith("PATCH"))).toEqual([]);
    });

    it("rejects related_to with empty notes", async () => {
      await expectUsage(
        [...base, "--predicate", "related_to", "--notes", "   "],
        /related_to requires notes/i
      );
    });
  });

  describe("create", () => {
    const create = [
      "edges",
      "create",
      "-c",
      CASE,
      "--confidence",
      "unverified",
      "--user-override",
    ];

    it("rejects related_to without notes", async () => {
      serveEntity("jane", ENTITY);
      serveEntity("acme", ENTITY_ACME);

      const run = await wd(
        ...create,
        "--from",
        "jane",
        "--to",
        "acme",
        "--predicate",
        "related_to"
      );

      expect(run.status).toBe(1);
      expect(errorOf(run.json).message).toMatch(/related_to requires notes/i);
      expect(paths().filter((p) => p.startsWith("POST"))).toEqual([]);
    });

    it("rejects self-linked endpoints", async () => {
      serveEntity("jane", ENTITY);

      const run = await wd(
        ...create,
        "--from",
        "jane",
        "--to",
        "jane",
        "--predicate",
        "same_as"
      );

      expect(run.status).toBe(1);
      expect(errorOf(run.json).message).toMatch(/must differ/i);
      expect(paths().filter((p) => p.startsWith("POST"))).toEqual([]);
    });
  });
});

describe("wd identifiers", () => {
  it("deletes an identifier", async () => {
    const id = "00000000-0000-4000-8000-000000000088";
    standIn.json("delete", `/cases/${CASE}/identifiers/${id}`, {});

    const run = await wd(
      "identifiers",
      "delete",
      "-c",
      CASE,
      id,
      "--user-override"
    );

    expect(run.json).toMatchObject({ ok: true, deleted: true, id });
    expect(standIn.seen[0]?.method).toBe("DELETE");
  });

  it("refuses to delete without --user-override", async () => {
    await expectUsageOrCustody(
      ["identifiers", "delete", "-c", CASE, EDGE],
      "CUSTODY"
    );
  });

  it("lists one Entity's identifiers through --entity-id, resolving a slug", async () => {
    serveEntity("acme", ENTITY_ACME);
    standIn.json("get", `/cases/${CASE}/identifiers`, {
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
    });

    const run = await wd(
      "identifiers",
      "-c",
      CASE,
      "--entity-id",
      "acme",
      "--type",
      "email,url"
    );

    expect(queryOfRequest(1)).toEqual({
      entityId: ENTITY_ACME,
      type: ["email", "url"],
    });
    expect(run.json).toMatchObject({
      items: [expect.objectContaining({ id: "id-1" })],
    });
  });

  it("lists the whole Case without --entity-id", async () => {
    standIn.json("get", `/cases/${CASE}/identifiers`, {
      items: [],
      nextCursor: null,
    });

    await wd("identifiers", "-c", CASE);

    expect(queryOfRequest(0)).toEqual({});
  });
});

describe("wd entities", () => {
  const rows = (...slugs: string[]) =>
    slugs.map((slug) => ({
      id: `ent-${slug}`,
      kind: "person",
      name: slug,
      slug,
    }));

  it("lists entities for a case", async () => {
    standIn.json("get", `/cases/${CASE}/entities`, {
      items: rows("jane"),
      nextCursor: null,
    });

    const run = await wd("entities", "-c", CASE);

    expect(run.json).toMatchObject({
      count: 1,
      items: [expect.objectContaining({ slug: "jane" })],
    });
  });

  it("takes --limit and --cursor and prints nextCursor", async () => {
    standIn.json("get", `/cases/${CASE}/entities`, {
      items: rows("jane"),
      nextCursor: "next-page",
    });

    const run = await wd(
      "entities",
      "-c",
      CASE,
      "--limit",
      "1",
      "--cursor",
      "first-page"
    );

    expect(queryOfRequest(0)).toEqual({ limit: "1", cursor: "first-page" });
    expect(run.json).toMatchObject({ nextCursor: "next-page" });
  });

  it("--all follows nextCursor to the last page", async () => {
    standIn.json("get", `/cases/${CASE}/entities`, (request) =>
      queryOf(request.url).cursor === "page-2"
        ? { items: rows("b"), nextCursor: null }
        : { items: rows("a"), nextCursor: "page-2" }
    );

    const run = await wd("entities", "-c", CASE, "--all");

    expect(standIn.seen).toHaveLength(2);
    expect(queryOfRequest(1)).toEqual({ limit: "200", cursor: "page-2" });
    expect(run.json).toMatchObject({ count: 2, nextCursor: null });
  });

  it("gets an Entity by a padded display name through its slug", async () => {
    serveEntity("alpha-corp", ENTITY);

    const run = await wd("entities", "get", "-c", CASE, "  Alpha Corp  ");

    expect(run.status).toBe(0);
    expect(paths()).toEqual([`GET /cases/${CASE}/entities/alpha-corp`]);
  });
});

describe("wd evidence", () => {
  const row = (id: string): Json => ({
    id,
    kind: "file",
    label: id,
    capturedAt: NOW,
  });

  it("lists evidence for a case", async () => {
    standIn.json("get", `/cases/${CASE}/evidence`, {
      items: [row("evidence-1")],
      nextCursor: null,
    });

    const run = await wd("evidence", "-c", CASE);

    expect(run.json).toMatchObject({
      count: 1,
      items: [expect.objectContaining({ id: "evidence-1" })],
    });
  });

  it("list --all pages through and prints the first page's total", async () => {
    standIn.json("get", `/cases/${CASE}/evidence`, (request) =>
      queryOf(request.url).cursor === "c1"
        ? { items: [row("e2")], nextCursor: null, total: null }
        : {
            items: [row("e1")],
            nextCursor: "c1",
            total: { count: 2, isCapped: false },
          }
    );

    const run = await wd("evidence", "-c", CASE, "--all", "--search", "notes");

    expect(standIn.seen.map((r) => queryOf(r.url))).toEqual([
      { q: "notes", limit: "200" },
      { q: "notes", limit: "200", cursor: "c1" },
    ]);
    expect(run.json).toMatchObject({
      items: [
        expect.objectContaining({ id: "e1" }),
        expect.objectContaining({ id: "e2" }),
      ],
      nextCursor: null,
      total: { count: 2, isCapped: false },
    });
  });

  it("rejects hidden with active-queue filters", async () => {
    await expectUsage(
      ["evidence", "-c", CASE, "--hidden", "--unprocessed"],
      /--unprocessed: Hidden and Unprocessed cannot both be set/
    );
  });

  it("url rejects a blank source URL", async () => {
    await expectUsage(
      ["evidence", "url", "-c", CASE, "   "],
      /URL must be http or https/
    );
  });

  it("url trims the source URL", async () => {
    standIn.json("post", `/cases/${CASE}/evidence/url`, {
      id: "evidence-2",
      kind: "url_archive",
      label: null,
      capturedAt: NOW,
    });

    const run = await wd(
      "evidence",
      "url",
      "-c",
      CASE,
      "  https://example.com  "
    );

    expect(run.status).toBe(0);
    expect(bodyOfRequest(0)).toMatchObject({
      sourceUrl: "https://example.com",
    });
  });

  it("paste rejects a blank body", async () => {
    await expectUsage(
      ["evidence", "paste", "-c", CASE, "--body", "   "],
      /Provide --body or --stdin \(body must not be blank\)/
    );
  });

  it("paste trims the body", async () => {
    standIn.json("post", `/cases/${CASE}/evidence/paste`, {
      id: "evidence-3",
      kind: "note",
      label: null,
      capturedAt: NOW,
    });

    const run = await wd(
      "evidence",
      "paste",
      "-c",
      CASE,
      "--body",
      "  paste text  "
    );

    expect(run.status).toBe(0);
    expect(bodyOfRequest(0)).toMatchObject({ body: "paste text" });
  });
});

describe("wd export zip", () => {
  it("downloads the Case export archive to --out", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wd-export-"));
    try {
      mockServer.use(
        http.get(
          `${API_URL}/cases/${CASE}/export.zip`,
          () => new HttpResponse("zip-bytes")
        )
      );
      const out = path.join(dir, "case.zip");

      const run = await wd("export", "zip", "-c", CASE, "-o", out);

      expect(run.json).toEqual({ ok: true, path: out });
      expect(readFileSync(out, "utf-8")).toBe("zip-bytes");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("wd graph", () => {
  it("write sends the patch with userOverride and prints a labeled summary", async () => {
    standIn.json("post", `/cases/${CASE}/graph/write`, {
      writeId: "00000000-0000-4000-8000-000000000001",
      confidence: "unverified",
      opCount: 1,
      replayed: false,
      actorLabel: "test",
    });
    const patch = [
      {
        op: "create",
        resource: "claim",
        id: "00000000-0000-4000-8000-000000000002",
        data: { entityId: ENTITY, text: "observed" },
      },
    ];

    const run = await wd(
      "graph",
      "write",
      "-c",
      CASE,
      "--patch",
      JSON.stringify(patch)
    );

    expect(run.json).toMatchObject({
      confidenceLabel: "Unverified",
      patchSummary: "Create Claim",
      opCount: 1,
    });
    expect(bodyOfRequest(0)).toMatchObject({ userOverride: true, patch });
  });

  it("writes lists the audit rows with its declared flags", async () => {
    standIn.json("get", `/cases/${CASE}/graph/writes`, {
      items: [
        {
          id: "00000000-0000-4000-8000-0000000000d1",
          caseId: CASE,
          actorId: "u1",
          actorLabel: "Agent",
          channel: "agent_write",
          userOverridden: true,
          confidence: "unverified",
          summary: "import",
          createdAt: NOW,
        },
      ],
      nextCursor: null,
      total: { count: 1, isCapped: false },
    });

    const run = await wd(
      "graph",
      "writes",
      "-c",
      CASE,
      "--confidence",
      "possible",
      "--actor",
      "u1, api-key:k1",
      "--search",
      "import"
    );

    expect(queryOfRequest(0)).toEqual({
      confidence: ["possible"],
      actor: ["u1", "api-key:k1"],
      q: "import",
    });
    expect(run.json).toMatchObject({
      total: { count: 1, isCapped: false },
      items: [expect.objectContaining({ summary: "import" })],
    });
  });
});

const step = (n: number, id: string, extra: Json = {}): Json => ({
  id,
  capabilityId: "network.dns.lookup",
  input: { host: "example.com" },
  status: "succeeded",
  playbookRunId: RUN,
  playbookId: "host-footprint",
  playbookStep: n,
  createdAt: `2026-01-01T12:0${n}:00.000Z`,
  ...extra,
});

const PARTIAL_RUN = {
  id: RUN,
  caseId: CASE,
  playbookId: "host-footprint",
  status: "finished",
  outcome: "partial",
  createdAt: NOW,
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
      blockedBy: 0,
      jobIds: [],
    },
  ],
};

describe("wd jobs", () => {
  const queued = {
    id: JOB,
    capabilityId: "web.page.enrich",
    input: { url: "https://example.com" },
    status: "queued",
    createdAt: NOW,
  };

  it("lists jobs for a case", async () => {
    standIn.json("get", `/cases/${CASE}/jobs`, {
      items: [queued],
      nextCursor: null,
    });

    const run = await wd("jobs", "-c", CASE);

    expect(run.json).toMatchObject({
      count: 1,
      items: [expect.objectContaining({ id: JOB })],
    });
  });

  it("sends its declared flags and does not read on past a filtered page", async () => {
    standIn.json("get", `/cases/${CASE}/jobs`, {
      items: [
        step(3, "00000000-0000-4000-8000-0000000000c2", { status: "failed" }),
      ],
      nextCursor: "more",
      total: { count: 9, isCapped: false },
    });

    const run = await wd(
      "jobs",
      "-c",
      CASE,
      "--status",
      "failed, cancelled",
      "--capability",
      "network.dns.lookup",
      "--playbook-run-id",
      RUN,
      "--search",
      "dns",
      "--sort",
      "created.asc"
    );

    // One request: a filtered view holds only the steps that matched, so no run is completed.
    expect(standIn.seen).toHaveLength(1);
    expect(queryOfRequest(0)).toEqual({
      status: ["failed", "cancelled"],
      capability: ["network.dns.lookup"],
      playbookRunId: RUN,
      q: "dns",
      sort: "created.asc",
    });
    expect(run.json).toMatchObject({
      nextCursor: "more",
      total: { count: 9, isCapped: false },
    });
  });

  it("reads on past a page that ends inside a playbook run, so the run shows as one row", async () => {
    standIn.json("get", `/cases/${CASE}/jobs`, (request) =>
      queryOf(request.url).cursor === "more"
        ? {
            items: [
              step(1, "00000000-0000-4000-8000-0000000000b1"),
              step(0, "00000000-0000-4000-8000-0000000000b0"),
            ],
            nextCursor: "later",
          }
        : {
            items: [step(2, "00000000-0000-4000-8000-0000000000b2")],
            nextCursor: "more",
          }
    );

    const run = await wd("jobs", "-c", CASE);

    expect(standIn.seen).toHaveLength(2);
    expect(queryOfRequest(1)).toEqual({ cursor: "more", limit: "200" });
    expect(run.json).toMatchObject({ count: 1, nextCursor: "later" });
  });

  it("does not read on when no playbook run is open", async () => {
    standIn.json("get", `/cases/${CASE}/jobs`, {
      items: [queued],
      nextCursor: "more",
    });

    const run = await wd("jobs", "-c", CASE);

    expect(standIn.seen).toHaveLength(1);
    expect(run.json).toMatchObject({ nextCursor: "more" });
  });

  it("shows a finished run's outcome on its row", async () => {
    standIn.json("get", `/cases/${CASE}/jobs`, {
      items: [
        step(1, "00000000-0000-4000-8000-0000000000b1", {
          playbookRunStatus: "finished",
          playbookRunOutcome: "partial",
        }),
        step(0, "00000000-0000-4000-8000-0000000000b0", {
          status: "failed",
          playbookRunStatus: "finished",
          playbookRunOutcome: "partial",
        }),
      ],
      nextCursor: null,
    });

    const run = await wd("jobs", "-c", CASE);

    expect(run.json).toMatchObject({
      count: 1,
      items: [
        {
          status: "failed",
          statusLabel: "Failed",
          playbookRunOutcome: "partial",
          outcomeLabel: "Partial",
        },
      ],
    });
  });

  it("get enriches the cap label and subject", async () => {
    standIn.json("get", `/cases/${CASE}/jobs/${JOB}`, {
      ...queued,
      logs: ["line one"],
    });

    const run = await wd("jobs", "get", "-c", CASE, JOB);

    expect(run.json).toMatchObject({
      capLabel: "Page Enrich",
      subject: "https://example.com",
    });
    expect(paths()).toEqual([`GET /cases/${CASE}/jobs/${JOB}`]);
  });

  it("get on a step of a playbook run adds the run and every step's outcome, skipped steps with their reason", async () => {
    const stepJob = "00000000-0000-4000-8000-0000000000b1";
    standIn.json("get", `/cases/${CASE}/jobs/${stepJob}`, {
      ...step(1, stepJob, { playbookRunOutcome: "partial" }),
      capabilityId: "network.whois.lookup",
      logs: [],
    });
    standIn.json("get", `/cases/${CASE}/playbook-runs/${RUN}`, PARTIAL_RUN);

    const run = await wd("jobs", "get", "-c", CASE, stepJob);

    expect(paths()).toEqual([
      `GET /cases/${CASE}/jobs/${stepJob}`,
      `GET /cases/${CASE}/playbook-runs/${RUN}`,
    ]);
    expect(run.json).toMatchObject({
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

  it("get on a standalone job does not read a run", async () => {
    standIn.json("get", `/cases/${CASE}/jobs/${JOB}`, { ...queued, logs: [] });

    await wd("jobs", "get", "-c", CASE, JOB);

    expect(paths()).toEqual([`GET /cases/${CASE}/jobs/${JOB}`]);
  });

  it("playbook-run shows the run with each step's outcome", async () => {
    standIn.json("get", `/cases/${CASE}/playbook-runs/${RUN}`, PARTIAL_RUN);

    const run = await wd("jobs", "playbook-run", "-c", CASE, RUN);

    expect(run.json).toMatchObject({
      playbookLabel: "Host Footprint",
      statusLabel: "Finished",
      outcomeLabel: "Partial",
      steps: [
        { step: 0, stateLabel: "Failed" },
        { step: 1, stateLabel: "Succeeded" },
        { step: 2, stateLabel: "Skipped" },
      ],
    });
  });

  describe("start", () => {
    const started = {
      id: JOB,
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
      status: "queued",
      createdAt: NOW,
    };

    it("trims padded graph ids in --input JSON", async () => {
      standIn.json("post", `/cases/${CASE}/jobs`, started);
      const entityId = "00000000-0000-4000-8000-000000000050";
      const evidenceId = "00000000-0000-4000-8000-000000000099";

      const run = await wd(
        "jobs",
        "start",
        "-c",
        CASE,
        "--cap",
        "network.dns.lookup",
        "--input",
        `{"entityId":"  ${entityId}  ","evidenceId":"  ${evidenceId}  ","host":"example.com"}`
      );

      expect(run.status).toBe(0);
      expect(bodyOfRequest(0)).toMatchObject({
        capabilityId: "network.dns.lookup",
        input: { entityId, evidenceId, host: "example.com" },
      });
    });

    it("trims padded --input JSON before parsing", async () => {
      standIn.json("post", `/cases/${CASE}/jobs`, started);

      const run = await wd(
        "jobs",
        "start",
        "-c",
        CASE,
        "--cap",
        "network.dns.lookup",
        "--input",
        `  {"host":"example.com"}  `
      );

      expect(run.status).toBe(0);
      expect(bodyOfRequest(0)).toMatchObject({
        input: { host: "example.com" },
      });
    });
  });

  describe("playbook", () => {
    it("rejects an empty seed", async () => {
      const run = await wd(
        "jobs",
        "playbook",
        "-c",
        CASE,
        "--id",
        "host-footprint"
      );

      expect(run.status).toBe(1);
      expect(errorOf(run.json)).toEqual({
        code: "USAGE",
        message: "At least one playbook seed is required",
      });
      expect(Reflect.get(new Object(run.json), "help")).toEqual(
        expect.any(Array)
      );
      expect(standIn.seen).toEqual([]);
    });

    it("starts with a host seed", async () => {
      standIn.json("post", `/cases/${CASE}/playbooks/host-footprint/run`, {
        playbookId: "host-footprint",
        playbookRunId: "00000000-0000-4000-8000-000000000020",
        jobs: [],
      });

      const run = await wd(
        "jobs",
        "playbook",
        "-c",
        CASE,
        "--id",
        "host-footprint",
        "--host",
        "example.com"
      );

      expect(run.status).toBe(0);
      expect(bodyOfRequest(0)).toMatchObject({ seed: { host: "example.com" } });
    });

    it("rejects non-http seed URLs", async () => {
      await expectUsage(
        [
          "jobs",
          "playbook",
          "-c",
          CASE,
          "--id",
          "host-footprint",
          "--url",
          "ftp://example.com",
        ],
        /Invalid playbook seed/
      );
    });
  });
});

describe("wd proposals", () => {
  const row = {
    id: "proposal-1",
    status: "pending",
    summary: "Add identifier",
    createdAt: NOW,
  };

  it("lists every status of a case without --status", async () => {
    standIn.json("get", `/cases/${CASE}/proposals`, {
      items: [row],
      nextCursor: null,
    });

    const run = await wd("proposals", "-c", CASE);

    expect(queryOfRequest(0)).toEqual({});
    expect(run.json).toMatchObject({
      items: [expect.objectContaining({ id: "proposal-1" })],
    });
  });

  it("sends --status, --search and --sort as the list query", async () => {
    standIn.json("get", `/cases/${CASE}/proposals`, {
      items: [],
      nextCursor: null,
    });

    await wd(
      "proposals",
      "-c",
      CASE,
      "--status",
      " rejected, pending ",
      "--search",
      "lead",
      "--sort",
      "created.asc"
    );

    expect(queryOfRequest(0)).toEqual({
      status: ["rejected", "pending"],
      q: "lead",
      sort: "created.asc",
    });
  });
});

describe("wd collect", () => {
  it("sends its declared flags and prints a row per queue item", async () => {
    standIn.json("get", `/cases/${CASE}/collect`, {
      items: [
        {
          id: "00000000-0000-4000-8000-0000000000c1",
          kind: "job",
          state: "failed",
          sortAt: NOW,
          activityAt: "2026-01-01T12:05:00.000Z",
          evidence: null,
          jobs: [{ capabilityId: "network.dns.lookup", playbookId: null }],
        },
      ],
      nextCursor: null,
      total: { count: 1, isCapped: false },
    });

    const run = await wd(
      "collect",
      "-c",
      CASE,
      "--state",
      "failed, running",
      "--kind",
      "job",
      "--capability",
      "network.dns.lookup",
      "--search",
      "dns",
      "--sort",
      "started.asc"
    );

    expect(queryOfRequest(0)).toEqual({
      state: ["failed", "running"],
      kind: ["job"],
      capability: ["network.dns.lookup"],
      q: "dns",
      sort: "started.asc",
    });
    expect(run.json).toMatchObject({
      items: [
        expect.objectContaining({ kind: "job", label: "network.dns.lookup" }),
      ],
    });
  });

  it("refuses --hidden with a state filter as a usage error", async () => {
    const run = await wd(
      "collect",
      "-c",
      CASE,
      "--hidden",
      "--state",
      "failed"
    );

    expect(run.status).toBe(1);
    expect(errorOf(run.json).code).toBe("USAGE");
    expect(standIn.seen).toEqual([]);
  });
});
