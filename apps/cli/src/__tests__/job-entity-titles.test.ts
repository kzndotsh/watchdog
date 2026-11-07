import { describe, expect, it, vi } from "vitest";

import { ARRAY_MAX } from "@watchdog/schemas/shared";
import { testCaseId } from "@watchdog/schemas/testing";

import { entityTitlesForJobs } from "../job-entity-titles";
import { queryIds, standInApi } from "./stand-in-api";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const standIn = standInApi();

function entity(id: string, name: string) {
  return { id, name, slug: id, kind: "org", summary: null, notes: null };
}

describe("entityTitlesForJobs", () => {
  it("returns an empty map and sends no request when jobs have no entityId inputs", async () => {
    const titles = await entityTitlesForJobs(testCaseId(0), [
      { input: { host: "x" } },
    ]);
    expect(titles.size).toBe(0);
    expect(standIn.seen).toEqual([]);
  });

  it("loads entity display labels for referenced ids", async () => {
    const caseId = testCaseId(0);
    const entityId = "00000000-0000-4000-8000-000000000001";
    standIn.json("get", `/cases/${caseId}/entities-by-ids`, [
      entity(entityId, "Acme Corp"),
    ]);

    const titles = await entityTitlesForJobs(caseId, [{ input: { entityId } }]);

    expect(titles.get(entityId)).toBe("Acme Corp");
    expect(standIn.seen.map((r) => queryIds(r.url))).toEqual([[entityId]]);
  });

  it("reads more than ARRAY_MAX ids in chunks and merges the labels", async () => {
    const caseId = testCaseId(0);
    const ids = Array.from(
      { length: ARRAY_MAX + 1 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
    );
    standIn.json("get", `/cases/${caseId}/entities-by-ids`, (request) =>
      queryIds(request.url).map((id) => entity(id, `Entity ${id.slice(-4)}`))
    );

    const titles = await entityTitlesForJobs(
      caseId,
      ids.map((entityId) => ({ input: { entityId } }))
    );

    expect(standIn.seen).toHaveLength(2);
    for (const request of standIn.seen) {
      expect(queryIds(request.url).length).toBeLessThanOrEqual(ARRAY_MAX);
    }
    expect(titles.size).toBe(ARRAY_MAX + 1);
    const last = ids.at(-1) ?? "";
    expect(titles.get(last)).toBe(`Entity ${last.slice(-4)}`);
  });
});
