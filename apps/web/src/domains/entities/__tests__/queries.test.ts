import { ORPCError } from "@orpc/client";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import {
  entitiesKeys,
  entityBySlugQuery,
  entityListView,
  entityNameMatchesQuery,
  entityPickerPort,
} from "@/domains/entities/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { placeholderFor } from "@/testing/query-placeholder";
import { buildEntityRecord } from "@/testing/records";
import { entityList } from "@watchdog/domain/schemas/graph";
import { testId } from "@watchdog/domain/test-kit";

const getEntity = procedureDouble("entities.get");
const pickerPage = procedureDouble("entities.pickerPage");
const matchNames = procedureDouble("entities.matchNames");

beforeEach(() => {
  getEntity.mockReset();
});

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

  it("looks the Entity up by the slugified form of a display-style slug", async () => {
    const caseId = testId(10);
    const alpha = buildEntityRecord({ slug: "alpha-corp" });
    getEntity.mockResolvedValue(alpha);

    await expect(
      new QueryClient().query(entityBySlugQuery(caseId, "Alpha Corp"))
    ).resolves.toEqual(alpha);
    expect(getEntity).toHaveBeenCalledWith({ caseId, slug: "alpha-corp" });
  });

  it("answers null when the Entity is gone, and rethrows any other failure", async () => {
    const caseId = testId(10);
    getEntity.mockRejectedValueOnce(new ORPCError("NOT_FOUND"));
    await expect(
      new QueryClient().query(entityBySlugQuery(caseId, "gone"))
    ).resolves.toBeNull();

    getEntity.mockRejectedValueOnce(new ORPCError("FORBIDDEN"));
    await expect(
      new QueryClient().query(entityBySlugQuery(caseId, "other"))
    ).rejects.toThrow();
  });

  it("keys the Entity list views and the detail under the Case's entities key", () => {
    const caseId = testId(10);
    const client = new QueryClient();
    const view = entityListView.key({ caseId }, entityList.queryOf({}, {}));
    client.setQueryData(view, { pages: [], pageParams: [] });
    client.setQueryData(entitiesKeys.detail(caseId, "alpha"), null);
    client.setQueryData(
      entityListView.key({ caseId: testId(11) }, entityList.queryOf({}, {})),
      { pages: [], pageParams: [] }
    );
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: entitiesKeys.all(caseId) })
        .map((query) => query.queryKey)
    ).toEqual([view, entitiesKeys.detail(caseId, "alpha")]);
  });

  it("reads the Entity picker's page through the slim projection, never the full list", async () => {
    const caseId = testId(10);
    pickerPage.mockResolvedValue({
      items: [{ id: testId(1), kind: "org", name: "Acme", slug: "acme" }],
      nextCursor: null,
      total: null,
    });
    const query = entityPickerPort(caseId, { kinds: ["org"] }).search("acm");
    const rows = await new QueryClient().query(query);
    expect(pickerPage).toHaveBeenCalledWith({
      caseId,
      limit: 20,
      q: "acm",
      kind: ["org"],
    });
    expect(rows).toEqual([
      { id: testId(1), name: "Acme", kind: "org", slug: "acme" },
    ]);
  });

  it("looks pasted names up on the server under the Case's Entity keys, and asks nothing for none", async () => {
    const caseId = testId(10);
    matchNames.mockResolvedValue([
      { id: testId(1), kind: "org", name: "Acme", slug: "acme" },
    ]);
    const query = entityNameMatchesQuery(caseId, ["Acme"]);
    expect(query.enabled).toBe(true);
    expect(entityNameMatchesQuery(caseId, []).enabled).toBe(false);
    const client = new QueryClient();
    const rows = await client.query(query);
    expect(matchNames).toHaveBeenCalledWith({ caseId, names: ["Acme"] });
    expect(rows).toEqual([
      { id: testId(1), name: "Acme", kind: "org", slug: "acme" },
    ]);
    expect(
      client.getQueryCache().findAll({ queryKey: entitiesKeys.all(caseId) })
    ).toHaveLength(1);
  });
});
