import { describe, expect, it } from "vitest";

import { entityDisplayLabel } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit";

import {
  buildEntityDisplayMaps,
  entityIdsFromNullable,
  entityNameForId,
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
    expect(Object.keys(maps).sort()).toEqual(["entityNames", "entitySlugs"]);
  });
});
