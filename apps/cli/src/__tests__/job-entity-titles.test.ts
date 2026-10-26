import { beforeEach, describe, expect, it, vi } from "vitest";

import { ARRAY_MAX } from "@watchdog/schemas/shared";
import { testCaseId } from "@watchdog/schemas/testing";

const apiMocks = vi.hoisted(() => ({
  getEntities: vi.fn(),
}));

vi.mock("../client", () => ({
  api: () => ({
    entities: {
      getMany: apiMocks.getEntities,
    },
  }),
}));

import { entityTitlesForJobs } from "../job-entity-titles";

describe("entityTitlesForJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty map when jobs have no entityId inputs", async () => {
    const titles = await entityTitlesForJobs(testCaseId(0), [
      { input: { host: "x" } },
    ]);
    expect(titles.size).toBe(0);
    expect(apiMocks.getEntities).not.toHaveBeenCalled();
  });

  it("loads entity display labels for referenced ids", async () => {
    const caseId = testCaseId(0);
    const entityId = "00000000-0000-4000-8000-000000000001";
    apiMocks.getEntities.mockResolvedValue([
      {
        id: entityId,
        name: "Acme Corp",
        slug: "acme-corp",
        kind: "org",
        summary: null,
        notes: null,
      },
    ]);

    const titles = await entityTitlesForJobs(caseId, [{ input: { entityId } }]);

    expect(apiMocks.getEntities).toHaveBeenCalledWith({
      caseId,
      ids: [entityId],
    });
    expect(titles.get(entityId)).toBe("Acme Corp");
  });

  it("reads more than ARRAY_MAX ids in chunks and merges the labels", async () => {
    const caseId = testCaseId(0);
    const ids = Array.from(
      { length: ARRAY_MAX + 1 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
    );
    apiMocks.getEntities.mockImplementation(async (input: { ids: string[] }) =>
      input.ids.map((id) => ({
        id,
        name: `Entity ${id.slice(-4)}`,
        slug: id,
        kind: "org",
        summary: null,
        notes: null,
      }))
    );

    const titles = await entityTitlesForJobs(
      caseId,
      ids.map((entityId) => ({ input: { entityId } }))
    );

    expect(apiMocks.getEntities).toHaveBeenCalledTimes(2);
    for (const [call] of apiMocks.getEntities.mock.calls) {
      expect(call.ids.length).toBeLessThanOrEqual(ARRAY_MAX);
    }
    expect(titles.size).toBe(ARRAY_MAX + 1);
  });
});
