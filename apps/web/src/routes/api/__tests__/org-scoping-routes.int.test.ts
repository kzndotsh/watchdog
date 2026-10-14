import { unzipSync, strFromU8 } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { appRuntime } from "@watchdog/api";
import {
  formatActivityCursor,
  activityEntrySchema,
  type ActivityEntry,
} from "@watchdog/schemas/feed";
import type { OrganizationId } from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
  testCaseId,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedJob,
  testDb,
} from "@watchdog/test-db";
import { testHttpOrigin, testId } from "@watchdog/test-kit";

/**
 * Organization scoping of the two routes that sit outside oRPC, against real data.
 * Only the session lookup (`createApiContext`) and the router factory are replaced:
 * Case visibility is decided by the real core Effects over the test database.
 */
const session = vi.hoisted(() => ({
  organizationId: null as string | null,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@/auth/api-context.server", () => ({
  createApiContext: vi.fn(() =>
    Promise.resolve({
      headers: new Headers(),
      actor:
        session.organizationId === null
          ? null
          : {
              userId: "scoping-user",
              email: null,
              name: "Scoping user",
              organizationId: session.organizationId,
            },
      log: { set: vi.fn() },
    })
  ),
}));

import { Route as eventsRoute } from "@/routes/api/events";
import { Route as entityMdRoute } from "@/routes/api/v1/cases.$caseId.entities.$slug.export[.]md";
import { Route as zipRoute } from "@/routes/api/v1/cases.$caseId.export[.]zip";

const ORG_A: OrganizationId = TEST_ORGANIZATION_ID;
const ORG_B: OrganizationId = TEST_OTHER_ORGANIZATION_ID;

const ids = { caseA: testCaseId(1), caseB: testCaseId(2) };
/** Before every seeded entry (the log starts at xid 1; a cursor needs id >= 1). */
const START = formatActivityCursor({ xid: "1", id: 1 });

function actAs(organizationId: OrganizationId | null) {
  session.organizationId = organizationId;
}

function request(path: string, signal?: AbortSignal) {
  return new Request(testHttpOrigin("localhost", path), { signal });
}

type GetHandler = (ctx: {
  request: Request;
  params: { caseId: string; slug: string };
}) => Promise<Response>;

function isGetHandler(value: unknown): value is GetHandler {
  return typeof value === "function";
}

function fieldOf(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The GET handler of a route built by the mocked `createFileRoute` (`{ options }`). */
function getHandlerOf(route: { options: unknown }): GetHandler {
  const server = fieldOf(route.options, "server");
  const handlers = fieldOf(server, "handlers");
  const get = fieldOf(handlers, "GET");
  if (!isGetHandler(get)) return expect.unreachable("route has no GET handler");
  return get;
}

async function getZip(caseId: string) {
  return getHandlerOf(zipRoute)({
    request: request(`/api/v1/cases/${caseId}/export.zip`),
    params: { caseId, slug: "" },
  });
}

async function getEntityMd(caseId: string, slug: string) {
  return getHandlerOf(entityMdRoute)({
    request: request(`/api/v1/cases/${caseId}/entities/${slug}/export.md`),
    params: { caseId, slug },
  });
}

function getEvents(query: string, signal?: AbortSignal) {
  return getHandlerOf(eventsRoute)({
    request: request(`/api/events?${query}`, signal),
    params: { caseId: "", slug: "" },
  });
}

/** Activity entries in an SSE body, in the order they were sent. */
function activityEntries(text: string): ActivityEntry[] {
  return text
    .split("\n\n")
    .filter((frame) => frame.includes("event: activity"))
    .map((frame) => {
      const data = frame
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length);
      return activityEntrySchema.parse(JSON.parse(data ?? "null"));
    });
}

/** Reads the stream until `done(text)` holds, then closes it. Ends when the data does: no timers. */
async function readStreamUntil(
  response: Response,
  done: (text: string) => boolean
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return expect.unreachable("expected a stream body");
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (!done(text)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- chunks must be read in order
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  return text;
}

const jobs = { a1: "", b1: "", a2: "" };

describe("organization scoping of the export and live-update routes", () => {
  beforeAll(async () => {
    await resetTestDb();
    const caseA = await seedCase(testDb, {
      name: "Org A",
      slug: "org-a-case",
      organizationId: ORG_A,
    });
    const caseB = await seedCase(testDb, {
      name: "Org B",
      slug: "org-b-case",
      organizationId: ORG_B,
    });
    ids.caseA = caseA.id;
    ids.caseB = caseB.id;
    await seedEntity(testDb, caseA.id, {
      id: testId(10),
      name: "Alice A",
      slug: "alice-a",
    });
    await seedEntity(testDb, caseB.id, {
      id: testId(20),
      name: "Carol B",
      slug: "carol-b",
    });
    // Log order: A, B, A. A stream of one organization that never shows the other
    // organization's entry between its own two has been filtered by the server.
    jobs.a1 = (await seedJob(testDb, caseA.id)).id;
    jobs.b1 = (await seedJob(testDb, caseB.id)).id;
    jobs.a2 = (await seedJob(testDb, caseA.id)).id;
  });

  afterAll(async () => {
    actAs(null);
    await appRuntime.dispose();
  });

  describe("case export zip", () => {
    it("serves the caller's own Case", async () => {
      actAs(ORG_A);
      const response = await getZip(ids.caseA);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/zip");
      const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
      const paths = Object.keys(files);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((path) => path.startsWith("org-a-case/"))).toBe(true);
      expect(
        paths.some((path) =>
          strFromU8(files[path] ?? new Uint8Array()).includes("Alice A")
        )
      ).toBe(true);
    });

    it("answers another organization's Case exactly like a missing one", async () => {
      actAs(ORG_B);
      const foreign = await getZip(ids.caseA);
      const missing = await getZip(testCaseId(999));
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(await foreign.text()).toBe(await missing.text());
    });

    it("refuses a caller with no organization", async () => {
      actAs(null);
      expect((await getZip(ids.caseA)).status).toBe(401);
    });
  });

  describe("entity markdown export", () => {
    it("serves the caller's own entity", async () => {
      actAs(ORG_A);
      const response = await getEntityMd(ids.caseA, "alice-a");
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Alice A");
    });

    it("answers another organization's entity exactly like a missing one", async () => {
      actAs(ORG_B);
      const foreign = await getEntityMd(ids.caseA, "alice-a");
      const missing = await getEntityMd(testCaseId(999), "alice-a");
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(await foreign.text()).toBe(await missing.text());
    });

    it("does not find the entity through the caller's own Case", async () => {
      actAs(ORG_B);
      expect((await getEntityMd(ids.caseB, "alice-a")).status).toBe(404);
    });
  });

  describe("live updates", () => {
    it("refuses a stream filtered to another organization's Case", async () => {
      actAs(ORG_B);
      const response = await getEvents(`caseId=${ids.caseA}&after=${START}`);
      expect(response.status).toBe(404);
    });

    it("replays only the caller's own organization's entries", async () => {
      actAs(ORG_B);
      const controller = new AbortController();
      const response = await getEvents(`after=${START}`, controller.signal);
      expect(response.status).toBe(200);
      // B's one entry is between A's two: reaching it proves A's first was filtered,
      // and the replay is read in log order, so A's second would follow it.
      const text = await readStreamUntil(response, (seen) =>
        activityEntries(seen).some((entry) => entry.subjectId === jobs.b1)
      );
      controller.abort();
      const entries = activityEntries(text);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((entry) => entry.caseId === ids.caseB)).toBe(true);
    });

    it("streams organization A its own entries and none of B's", async () => {
      actAs(ORG_A);
      const controller = new AbortController();
      const response = await getEvents(`after=${START}`, controller.signal);
      const text = await readStreamUntil(response, (seen) =>
        activityEntries(seen).some((entry) => entry.subjectId === jobs.a2)
      );
      controller.abort();
      const entries = activityEntries(text);
      expect(entries.map((entry) => entry.subjectId)).toContain(jobs.a1);
      expect(entries.every((entry) => entry.caseId === ids.caseA)).toBe(true);
    });
  });
});
