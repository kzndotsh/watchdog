import { beforeEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const apiMocks = vi.hoisted(() => ({
  listEntities: vi.fn(),
  getEntity: vi.fn(),
}));

vi.mock("../client", () => ({
  api: () => ({
    entities: {
      list: apiMocks.listEntities,
      get: apiMocks.getEntity,
    },
  }),
}));

import { resolveEntityId, resolveEntitySlug } from "../ids";

describe("resolveEntityRef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("slugifies display names before entities.get", async () => {
    const caseId = testId(1);
    const entityId = testId(2);
    apiMocks.getEntity.mockResolvedValue({
      id: entityId,
      slug: "alpha-corp",
      name: "Alpha Corp",
      kind: "org",
      summary: null,
      notes: null,
    });

    const id = await resolveEntityId(caseId, "  Alpha Corp  ");
    const slug = await resolveEntitySlug(caseId, "Alpha Corp");

    expect(apiMocks.getEntity).toHaveBeenCalledWith({
      caseId,
      slug: "alpha-corp",
    });
    expect(id).toBe(entityId);
    expect(slug).toBe("alpha-corp");
  });

  it("resolves entity UUID via list without entities.get", async () => {
    const caseId = testId(3);
    const entityId = testId(4);
    apiMocks.listEntities.mockResolvedValue([
      {
        id: entityId,
        slug: "beta-llc",
        name: "Beta LLC",
        kind: "org",
        summary: null,
        notes: null,
      },
    ]);

    const id = await resolveEntityId(caseId, `  ${entityId}  `);

    expect(apiMocks.listEntities).toHaveBeenCalledWith({ caseId });
    expect(apiMocks.getEntity).not.toHaveBeenCalled();
    expect(id).toBe(entityId);
  });

  it("normalizes padded case id before entities.list", async () => {
    const caseId = testId(5);
    const entityId = testId(6);
    apiMocks.listEntities.mockResolvedValue([
      {
        id: entityId,
        slug: "gamma",
        name: "Gamma",
        kind: "org",
        summary: null,
        notes: null,
      },
    ]);

    await resolveEntityId(`  ${caseId}  `, entityId);

    expect(apiMocks.listEntities).toHaveBeenCalledWith({ caseId });
  });
});
