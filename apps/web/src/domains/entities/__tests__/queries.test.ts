import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/domains/entities/entities.functions", () => ({
  getEntityBySlugFn: vi.fn(),
  listEntitiesPickerPageFn: vi.fn(),
  matchEntityNamesFn: vi.fn(),
}));

import {
  listEntitiesPickerPageFn,
  matchEntityNamesFn,
} from "@/domains/entities/entities.functions";
import {
  entitiesKeys,
  entityBySlugQuery,
  entityNameMatchesQuery,
  entityPickerPort,
} from "@/domains/entities/queries";
import { placeholderFor } from "@/testing/query-placeholder";
import { buildEntityRecord } from "@/testing/records";
import { testId } from "@watchdog/test-kit";

describe("entities queries", () => {
  it("reads an Entity by slug only with a usable Case id", () => {
    expect(entityBySlugQuery("case-1", "alpha").enabled).toBe(false);
    expect(entityBySlugQuery(testId(10), "alpha").enabled).toBe(true);
  });

  it("keeps previous data only for the same Entity detail key", () => {
    const caseId = testId(10);
    const alpha = buildEntityRecord({ slug: "alpha" });
    const query = entityBySlugQuery(caseId, "alpha");

    expect(
      placeholderFor(query, alpha, entitiesKeys.detail(caseId, "alpha"))
    ).toBe(alpha);
    expect(
      placeholderFor(query, alpha, entitiesKeys.detail(caseId, "beta"))
    ).toBeUndefined();
  });

  it("reads the Entity picker's page through the slim projection, never the full list", async () => {
    const caseId = testId(10);
    vi.mocked(listEntitiesPickerPageFn).mockResolvedValue({
      items: [{ id: testId(1), kind: "org", name: "Acme", slug: "acme" }],
      nextCursor: null,
      total: null,
    });
    const query = entityPickerPort(caseId, { kinds: ["org"] }).search("acm");
    const rows = await new QueryClient().query(query);
    expect(listEntitiesPickerPageFn).toHaveBeenCalledWith({
      data: { caseId, limit: 20, q: "acm", kind: ["org"] },
    });
    expect(rows).toEqual([
      { id: testId(1), name: "Acme", kind: "org", slug: "acme" },
    ]);
  });

  it("looks pasted names up on the server under the Case's Entity keys, and asks nothing for none", async () => {
    const caseId = testId(10);
    vi.mocked(matchEntityNamesFn).mockResolvedValue([
      { id: testId(1), kind: "org", name: "Acme", slug: "acme" },
    ]);
    const query = entityNameMatchesQuery(caseId, ["Acme"]);
    expect(query.queryKey.slice(0, 2)).toEqual(entitiesKeys.all(caseId));
    expect(query.enabled).toBe(true);
    expect(entityNameMatchesQuery(caseId, []).enabled).toBe(false);
    const rows = await new QueryClient().query(query);
    expect(matchEntityNamesFn).toHaveBeenCalledWith({
      data: { caseId, names: ["Acme"] },
    });
    expect(rows).toEqual([
      { id: testId(1), name: "Acme", kind: "org", slug: "acme" },
    ]);
  });
});
