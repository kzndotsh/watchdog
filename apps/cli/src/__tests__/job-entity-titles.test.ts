import { beforeEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const apiMocks = vi.hoisted(() => ({
  listEntities: vi.fn(),
}));

vi.mock("../client", () => ({
  api: () => ({
    entities: {
      list: apiMocks.listEntities,
    },
  }),
}));

import { entityTitlesForJobs } from "../job-entity-titles";

describe("entityTitlesForJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty map when jobs have no entityId inputs", async () => {
    const titles = await entityTitlesForJobs("case-1", [
      { input: { host: "x" } },
    ]);
    expect(titles.size).toBe(0);
    expect(apiMocks.listEntities).not.toHaveBeenCalled();
  });

  it("loads entity display labels for referenced ids", async () => {
    const caseId = testId(0);
    const entityId = "00000000-0000-4000-8000-000000000001";
    apiMocks.listEntities.mockResolvedValue([
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

    expect(apiMocks.listEntities).toHaveBeenCalledWith({ caseId });
    expect(titles.get(entityId)).toBe("Acme Corp");
  });
});
