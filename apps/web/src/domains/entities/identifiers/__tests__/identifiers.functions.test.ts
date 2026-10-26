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

const identifiersApi = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({ identifiers: identifiersApi }),
}));

import {
  createIdentifierFn,
  listIdentifiersForCaseFn,
  listIdentifiersPageFn,
  updateIdentifierFn,
} from "@/domains/entities/identifiers/identifiers.functions";

type ServerDataContext<T> = {
  data: T;
  context: Record<string, never>;
};

describe("identifiers.functions", () => {
  it("routes identifier list and write ServerFns through oRPC", async () => {
    const identifier = {
      id: testId(1),
      entityId: testId(20),
      type: "email" as const,
      platform: "",
      value: "user@example.com",
      confidence: "possible" as const,
      status: "unknown" as const,
      notes: null,
      evidenceIds: [],
    };
    identifiersApi.list.mockResolvedValue({
      items: [
        {
          ...identifier,
          entityName: "Alpha",
          entitySlug: "alpha",
          entityKind: "person" as const,
        },
      ],
      nextCursor: null,
      total: { count: 1, isCapped: false },
    });
    identifiersApi.create.mockResolvedValue(identifier);
    identifiersApi.update.mockResolvedValue(identifier);

    await (
      listIdentifiersPageFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: { caseId: testId(10), entityId: testId(20), q: "acme" },
      context: {},
    });
    await (
      listIdentifiersForCaseFn as unknown as (
        input: ServerDataContext<{ caseId: string }>
      ) => Promise<unknown[]>
    )({
      data: { caseId: testId(10) },
      context: {},
    });
    await (
      createIdentifierFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: {
        caseId: testId(10),
        entityId: testId(20),
        type: "email",
        value: "user@example.com",
        confidence: "possible",
      },
      context: {},
    });
    await (
      updateIdentifierFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: {
        caseId: testId(10),
        identifierId: testId(1),
        value: "next@example.com",
      },
      context: {},
    });

    // A list page passes its view through whole; the Case overview still reads every page.
    expect(identifiersApi.list.mock.calls.map(([input]) => input)).toEqual([
      { caseId: testId(10), entityId: testId(20), q: "acme" },
      { caseId: testId(10), limit: 200 },
    ]);
    expect(identifiersApi.create).toHaveBeenCalled();
    expect(identifiersApi.update).toHaveBeenCalled();
  });
});
