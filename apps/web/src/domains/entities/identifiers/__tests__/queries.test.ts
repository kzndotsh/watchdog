import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import {
  identifierListView,
  identifiersKeys,
  identifierTypeCountsQuery,
} from "@/domains/entities/identifiers/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { placeholderFor } from "@/testing/query-placeholder";
import { identifierList } from "@watchdog/domain/schemas/graph";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

const listIdentifiers = procedureDouble("identifiers.list");
const typeCounts = procedureDouble("identifiers.typeCounts");

describe("identifiers queries", () => {
  it("sends one page of the view, its fixed filter and cursor with the Case to identifiers.list", async () => {
    const caseId = testCaseId(1);
    listIdentifiers.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
    const options = identifierListView.infinite(
      { caseId },
      identifierList.queryOf(
        { q: "acme", sort: "created.desc" },
        { entityId: testId(2) }
      )
    );
    const client = new QueryClient();
    await client.infiniteQuery(options);
    expect(listIdentifiers).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId,
        entityId: testId(2),
        q: "acme",
        sort: "created.desc",
      })
    );
    expect(listIdentifiers.mock.lastCall?.[0]).not.toHaveProperty("cursor");
  });

  it("counts a view's types through identifiers.typeCounts, under the Case's identifiers key", async () => {
    const caseId = testCaseId(1);
    const counts = {
      counts: [{ type: "email" as const, count: 2 }],
      isCapped: false,
    };
    typeCounts.mockResolvedValue(counts);
    const query = identifierTypeCountsQuery(
      caseId,
      identifierList.queryOf({ q: "acme" }, { entityId: testId(2) })
    );
    const client = new QueryClient();
    await expect(client.query(query)).resolves.toEqual(counts);
    expect(typeCounts).toHaveBeenCalledWith(
      expect.objectContaining({ caseId, entityId: testId(2), q: "acme" })
    );
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: identifiersKeys.all(caseId) })
        .map((cached) => cached.queryKey)
    ).toEqual([query.queryKey]);
  });

  it("keeps an Entity's previous type counts for its next view, never for another Entity", () => {
    const caseId = testCaseId(1);
    const countsOf = (entityId: string, q?: string) =>
      identifierTypeCountsQuery(
        caseId,
        identifierList.queryOf(q === undefined ? {} : { q }, { entityId })
      );
    const previous = {
      counts: [{ type: "email" as const, count: 1 }],
      isCapped: false,
    };
    const next = countsOf(testId(2), "acme");

    expect(
      placeholderFor(next, previous, countsOf(testId(2)).queryKey)
    ).toEqual(previous);
    expect(
      placeholderFor(next, previous, countsOf(testId(3)).queryKey)
    ).toBeUndefined();
  });
});
