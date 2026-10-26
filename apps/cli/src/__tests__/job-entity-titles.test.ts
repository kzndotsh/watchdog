import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
