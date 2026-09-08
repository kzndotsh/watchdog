import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (fn: unknown) => fn,
    }),
    handler: (fn: unknown) => fn,
  }),
}));

const entitiesApi = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({ entities: entitiesApi }),
  orpcNullIfNotFound: (value: unknown) => value ?? null,
}));

import {
  createEntityFn,
  getEntityBySlugFn,
  listEntitiesFn,
  updateEntityFieldsFn,
} from "@/domains/entities/entities.functions";

interface ServerDataContext<T> {
  data: T;
  context: Record<string, never>;
}

const ENTITY = {
  id: testId(1),
  caseId: testId(10),
  slug: "alpha",
  name: "Alpha",
  kind: "person" as const,
  summary: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("entities.functions", () => {
  it("lists entities for a case", async () => {
    entitiesApi.list.mockResolvedValue([ENTITY]);

    const rows = await (
      listEntitiesFn as unknown as (
        input: ServerDataContext<{ caseId: string }>
      ) => Promise<(typeof ENTITY)[]>
    )({
      data: { caseId: testId(10) },
      context: {},
    });

    expect(rows).toEqual([ENTITY]);
  });

  it("loads entity by slug and routes writes through oRPC", async () => {
    entitiesApi.get.mockResolvedValue(ENTITY);
    entitiesApi.create.mockResolvedValue(ENTITY);
    entitiesApi.update.mockResolvedValue(ENTITY);

    await (
      getEntityBySlugFn as unknown as (
        input: ServerDataContext<{ caseId: string; slug: string }>
      ) => Promise<unknown>
    )({
      data: { caseId: testId(10), slug: "alpha" },
      context: {},
    });
    await (
      createEntityFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: {
        caseId: testId(10),
        kind: "person",
        name: "Alpha",
        slug: "alpha",
      },
      context: {},
    });
    await (
      updateEntityFieldsFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: { caseId: testId(10), entityId: testId(1), name: "Beta" },
      context: {},
    });

    expect(entitiesApi.get).toHaveBeenCalledWith({
      caseId: testId(10),
      slug: "alpha",
    });
    expect(entitiesApi.create).toHaveBeenCalled();
    expect(entitiesApi.update).toHaveBeenCalled();
  });

  it("trims padded entity slug before lookup", async () => {
    entitiesApi.get.mockResolvedValue(ENTITY);

    await (
      getEntityBySlugFn as unknown as (
        input: ServerDataContext<{ caseId: string; slug: string }>
      ) => Promise<unknown>
    )({
      data: { caseId: testId(10), slug: "  alpha  " },
      context: {},
    });

    expect(entitiesApi.get).toHaveBeenCalledWith({
      caseId: testId(10),
      slug: "alpha",
    });
  });
});
