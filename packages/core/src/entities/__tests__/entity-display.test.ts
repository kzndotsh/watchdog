import { describe, expect, it } from "vitest";

import { entityDisplayLabel } from "@watchdog/schemas";
import { testId } from "@watchdog/test-kit";

import {
  buildEntityDisplayMaps,
  entityIdsFromNullable,
  entityNameForId,
  firstEntityNameFromPatch,
} from "../entity-display";

describe("entity-display", () => {
  const entityA = testId(1);
  const entityB = testId(2);

  it("entityIdsFromNullable drops empty values", () => {
    expect(
      entityIdsFromNullable([entityA, null, "", entityB, undefined])
    ).toEqual([entityA, entityB]);
  });

  it("entityNameForId resolves a trimmed name", () => {
    expect(entityNameForId(entityA, { [entityA]: " Alpha Corp " })).toBe(
      "Alpha Corp"
    );
  });

  it("entityNameForId rejects whitespace-only ids", () => {
    expect(entityNameForId("   ", { [entityA]: "Alpha Corp" })).toBeNull();
  });

  it("entityNameForId resolves slug fallback from display label map", () => {
    expect(
      entityNameForId(entityA, {
        [entityA]: entityDisplayLabel({ name: "  ", slug: "alpha-corp" }),
      })
    ).toBe("alpha-corp");
  });

  it("buildEntityDisplayMaps stores display labels and slugs", () => {
    const maps = buildEntityDisplayMaps([
      { id: "ent-1", name: "  ", slug: "alpha-corp" },
      { id: "ent-2", name: " Beta LLC ", slug: "beta-llc" },
    ]);
    expect(maps.entityNames).toEqual({
      "ent-1": "alpha-corp",
      "ent-2": "Beta LLC",
    });
    expect(maps.entitySlugs).toEqual({
      "ent-1": "alpha-corp",
      "ent-2": "beta-llc",
    });
    expect(maps.entitySummaries).toEqual({});
    expect(maps.entityNotes).toEqual({});
  });

  it("buildEntityDisplayMaps stores searchable summary and notes", () => {
    const maps = buildEntityDisplayMaps([
      {
        id: "ent-1",
        name: "Alpha",
        slug: "alpha",
        summary: " Lead subject ",
        notes: null,
      },
      {
        id: "ent-2",
        name: "Beta",
        slug: "beta",
        summary: null,
        notes: "Mailbox tied to the fraud thread",
      },
    ]);
    expect(maps.entitySummaries).toEqual({ "ent-1": "Lead subject" });
    expect(maps.entityNotes).toEqual({
      "ent-2": "Mailbox tied to the fraud thread",
    });
  });

  it("firstEntityNameFromPatch uses the first named entity", () => {
    expect(
      firstEntityNameFromPatch(
        [
          {
            op: "create",
            resource: "claim",
            id: "00000000-0000-4000-8000-000000000001",
            data: {
              entityId: "00000000-0000-4000-8000-000000000002",
              text: "observed",
            },
          },
        ],
        {
          "00000000-0000-4000-8000-000000000002": "Beta Holdings",
        }
      )
    ).toBe("Beta Holdings");
  });

  it("firstEntityNameFromPatch resolves edge endpoint names", () => {
    expect(
      firstEntityNameFromPatch(
        [
          {
            op: "create",
            resource: "edge",
            id: "00000000-0000-4000-8000-000000000003",
            data: {
              fromId: "00000000-0000-4000-8000-000000000004",
              toId: "00000000-0000-4000-8000-000000000005",
              predicate: "knows",
            },
          },
        ],
        {
          "00000000-0000-4000-8000-000000000004": "Alpha Corp",
          "00000000-0000-4000-8000-000000000005": "Beta LLC",
        }
      )
    ).toBe("Alpha Corp");
  });

  it("firstEntityNameFromPatch falls back to slug when name maps are missing", () => {
    const entityId = "00000000-0000-4000-8000-000000000001";
    expect(
      firstEntityNameFromPatch(
        [
          {
            op: "create",
            resource: "claim",
            id: "00000000-0000-4000-8000-000000000002",
            data: {
              entityId,
              text: "observed",
            },
          },
        ],
        {},
        { [entityId]: "alpha-corp" }
      )
    ).toBe("alpha-corp");
  });

  it("firstEntityNameFromPatch resolves entity create op body without display maps", () => {
    expect(
      firstEntityNameFromPatch(
        [
          {
            op: "create",
            resource: "entity",
            id: "00000000-0000-4000-8000-000000000010",
            data: { name: "Acme Corp", slug: "acme-corp" },
          },
        ],
        {}
      )
    ).toBe("Acme Corp");
  });

  it("firstEntityNameFromPatch skips first cited entity without display maps", () => {
    const knownId = "00000000-0000-4000-8000-000000000003";
    expect(
      firstEntityNameFromPatch(
        [
          {
            op: "create",
            resource: "claim",
            id: "00000000-0000-4000-8000-000000000001",
            data: {
              entityId: "00000000-0000-4000-8000-000000000099",
              text: "orphan",
            },
          },
          {
            op: "create",
            resource: "claim",
            id: "00000000-0000-4000-8000-000000000002",
            data: { entityId: knownId, text: "known" },
          },
        ],
        { [knownId]: "Beta LLC" }
      )
    ).toBe("Beta LLC");
  });
});
