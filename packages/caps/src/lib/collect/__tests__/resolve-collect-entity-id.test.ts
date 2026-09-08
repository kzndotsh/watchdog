import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  INVALID_COLLECT_ENTITY_SUMMARY,
  resolveCollectEntityId,
} from "../resolve-collect-entity-id.ts";

describe("resolveCollectEntityId", () => {
  it("returns undefined for absent or blank entity ids", () => {
    expect(resolveCollectEntityId(undefined)).toBeUndefined();
    expect(resolveCollectEntityId("")).toBeUndefined();
    expect(resolveCollectEntityId("   ")).toBeUndefined();
  });

  it("returns a trimmed UUID for valid ids", () => {
    const id = testId(1);
    expect(resolveCollectEntityId(`  ${id}  `)).toBe(id);
  });

  it("returns null for present but invalid ids", () => {
    expect(resolveCollectEntityId(null)).toBeNull();
    expect(resolveCollectEntityId("entity-1")).toBeNull();
    expect(INVALID_COLLECT_ENTITY_SUMMARY).toContain("valid UUID");
  });
});
