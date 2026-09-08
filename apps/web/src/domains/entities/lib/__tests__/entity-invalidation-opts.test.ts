import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { entitiesKeys } from "@/domains/entities/entities-keys";
import { entityChangedOpts } from "@/domains/entities/lib/entity-invalidation-opts";
import type { EntityRecord } from "@/domains/entities/types";
import { testId } from "@watchdog/test-kit";

const CASE_ID = testId(10);
const ENTITY_ID = testId(1);

const ENTITY: EntityRecord = {
  id: ENTITY_ID,
  caseId: CASE_ID,
  kind: "person",
  name: "Alpha",
  slug: "alpha",
  summary: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("entityChangedOpts", () => {
  it("uses an explicit slug when provided", () => {
    const client = new QueryClient();
    expect(
      entityChangedOpts(client, CASE_ID, ENTITY_ID, "explicit-slug")
    ).toEqual({
      entityId: ENTITY_ID,
      slug: "explicit-slug",
    });
  });

  it("resolves slug from the entities list cache", () => {
    const client = new QueryClient();
    client.setQueryData(entitiesKeys.all(CASE_ID), [ENTITY]);
    expect(entityChangedOpts(client, CASE_ID, ENTITY_ID)).toEqual({
      entityId: ENTITY_ID,
      slug: "alpha",
    });
  });

  it("resolves slug from the scoped entities list cache key", () => {
    const client = new QueryClient();
    client.setQueryData(entitiesKeys.all(CASE_ID), [ENTITY]);
    expect(entityChangedOpts(client, `  ${CASE_ID}  `, ENTITY_ID)).toEqual({
      entityId: ENTITY_ID,
      slug: "alpha",
    });
  });

  it("falls back to entityId only when slug is unknown", () => {
    const client = new QueryClient();
    expect(entityChangedOpts(client, CASE_ID, ENTITY_ID)).toEqual({
      entityId: ENTITY_ID,
    });
  });

  it("trims padded entity ids before cache lookup", () => {
    const client = new QueryClient();
    client.setQueryData(entitiesKeys.all(CASE_ID), [ENTITY]);
    expect(entityChangedOpts(client, CASE_ID, `  ${ENTITY_ID}  `)).toEqual({
      entityId: ENTITY_ID,
      slug: "alpha",
    });
  });

  it("treats whitespace-only entity ids as empty", () => {
    const client = new QueryClient();
    expect(entityChangedOpts(client, CASE_ID, "   ")).toEqual({
      entityId: "",
    });
  });
});
