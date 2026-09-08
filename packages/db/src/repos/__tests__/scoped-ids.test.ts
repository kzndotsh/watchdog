import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  trimActorId,
  trimCaseId,
  trimResourceId,
  resolveNullableGraphIdForWrite,
} from "../_scoped-ids.ts";

describe("scoped ids", () => {
  it("trimActorId trims without requiring a UUID", () => {
    expect(trimActorId("test-actor")).toBe("test-actor");
    expect(trimActorId("  api-key:demo  ")).toBe("api-key:demo");
    expect(trimActorId("   ")).toBeUndefined();
  });

  it("trimResourceId rejects non-UUID graph ids", () => {
    expect(trimResourceId("entity-1")).toBeUndefined();
    expect(trimResourceId(testId(1))).toBe(testId(1));
  });

  it("trimCaseId rejects non-UUID case ids", () => {
    expect(trimCaseId("case-1")).toBeUndefined();
    expect(trimCaseId(testId(2))).toBe(testId(2));
  });

  it("resolveNullableGraphIdForWrite rejects invalid non-empty ids", () => {
    expect(resolveNullableGraphIdForWrite(undefined)).toEqual({
      ok: true,
      id: undefined,
    });
    expect(resolveNullableGraphIdForWrite(null)).toEqual({
      ok: true,
      id: null,
    });
    expect(resolveNullableGraphIdForWrite("   ")).toEqual({
      ok: true,
      id: null,
    });
    expect(resolveNullableGraphIdForWrite(`  ${testId(3)}  `)).toEqual({
      ok: true,
      id: testId(3),
    });
    expect(resolveNullableGraphIdForWrite("ent-1")).toEqual({ ok: false });
  });
});
