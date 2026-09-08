import { describe, it, expect } from "vitest";
import { z } from "zod";

import {
  httpUrlSchema,
  isUuidString,
  parseTrimmedCaseId,
  parseOptionalTrimmedUuid,
  normalizeIdList,
  normalizeUuidList,
  parseGraphUuidList,
  parseActorId,
  mimeInputSchema,
  nullableTrimmedPatchSchema,
  nullableUuidSchema,
  optionalHttpUrlSchema,
  optionalTrimmedSchema,
  optionalUuidSchema,
  credentialNameSchema,
  dueDateInputSchema,
  dueDatePatchSchema,
  sha256HexSchema,
  trimmedOrNull,
  trimmedOrUndefined,
  trimmedUuidSchema,
} from "../primitives.ts";

describe("primitives-trim", () => {
  const absent: string | undefined = undefined;
  const absentNull: string | null = null;

  it("trimmedOrUndefined: undefined / empty / whitespace → undefined", () => {
    expect(trimmedOrUndefined(absent)).toBe(undefined);
    expect(trimmedOrUndefined(absentNull)).toBe(undefined);
    expect(trimmedOrUndefined("")).toBe(undefined);
    expect(trimmedOrUndefined("  ")).toBe(undefined);
  });

  it("trimmedOrUndefined: keeps non-empty trimmed string", () => {
    expect(trimmedOrUndefined("x")).toBe("x");
    expect(trimmedOrUndefined("  hello  ")).toBe("hello");
  });

  it("trimmedOrNull: undefined / empty / whitespace → null", () => {
    expect(trimmedOrNull(absent)).toBe(null);
    expect(trimmedOrNull(absentNull)).toBe(null);
    expect(trimmedOrNull("")).toBe(null);
    expect(trimmedOrNull("  ")).toBe(null);
  });

  it("trimmedOrNull: keeps non-empty trimmed string", () => {
    expect(trimmedOrNull("x")).toBe("x");
    expect(trimmedOrNull("  hello  ")).toBe("hello");
  });

  it("optionalTrimmedSchema: collapses blank to absent", () => {
    expect(optionalTrimmedSchema.parse(absent)).toBe(undefined);
    expect(optionalTrimmedSchema.parse("")).toBe(undefined);
    expect(optionalTrimmedSchema.parse("  ")).toBe(undefined);
    expect(optionalTrimmedSchema.parse("  hello  ")).toBe("hello");
  });

  it("nullableTrimmedPatchSchema: omit, clear, or set", () => {
    expect(nullableTrimmedPatchSchema.parse(absent)).toBe(undefined);
    expect(nullableTrimmedPatchSchema.parse(null)).toBe(null);
    expect(nullableTrimmedPatchSchema.parse("")).toBe(null);
    expect(nullableTrimmedPatchSchema.parse("  ")).toBe(null);
    expect(nullableTrimmedPatchSchema.parse("  hello  ")).toBe("hello");
  });

  it("trimmedUuidSchema: trims before validating", () => {
    const id = "00000000-0000-4000-8000-000000000099";
    expect(trimmedUuidSchema.parse(`  ${id}  `)).toBe(id);
    expect(() => trimmedUuidSchema.parse("not-a-uuid")).toThrow();
  });

  it("nullableUuidSchema: accepts null or trimmed UUID", () => {
    const id = "00000000-0000-4000-8000-000000000088";
    expect(nullableUuidSchema.parse(null)).toBe(null);
    expect(nullableUuidSchema.parse(`  ${id}  `)).toBe(id);
    expect(nullableUuidSchema.parse("   ")).toBe(null);
  });

  it("optionalUuidSchema: trims and validates UUIDs", () => {
    const id = "00000000-0000-4000-8000-000000000099";
    expect(optionalUuidSchema.parse(`  ${id}  `)).toBe(id);
    expect(optionalUuidSchema.parse(undefined)).toBe(undefined);
    expect(optionalUuidSchema.parse("   ")).toBe(undefined);
    expect(() => optionalUuidSchema.parse("not-a-uuid")).toThrow();
  });

  it("optionalUuidSchema: omitted object key stays optional", () => {
    const schema = z.object({
      host: z.string(),
      entityId: optionalUuidSchema,
    });
    expect(schema.parse({ host: "example.com" })).toEqual({
      host: "example.com",
    });
    const id = "00000000-0000-4000-8000-000000000077";
    expect(
      schema.parse({ host: "example.com", entityId: `  ${id}  ` })
    ).toEqual({ host: "example.com", entityId: id });
  });

  it("isUuidString: accepts canonical UUIDs only", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(isUuidString(id)).toBe(true);
    expect(isUuidString(`  ${id}  `)).toBe(true);
    expect(isUuidString("host-footprint")).toBe(false);
    expect(isUuidString("not-a-uuid")).toBe(false);
    expect(isUuidString("   ")).toBe(false);
  });

  it("parseTrimmedCaseId: trim + validate scoped UUIDs", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(parseTrimmedCaseId(`  ${id}  `)).toBe(id);
    expect(parseTrimmedCaseId("case-1")).toBe(null);
    expect(parseTrimmedCaseId("   ")).toBe(null);
  });

  it("parseOptionalTrimmedUuid: nullish/invalid → undefined", () => {
    const id = "00000000-0000-4000-8000-000000000066";
    expect(parseOptionalTrimmedUuid(undefined)).toBe(undefined);
    expect(parseOptionalTrimmedUuid(null)).toBe(undefined);
    expect(parseOptionalTrimmedUuid("")).toBe(undefined);
    expect(parseOptionalTrimmedUuid("  ")).toBe(undefined);
    expect(parseOptionalTrimmedUuid("case-1")).toBe(undefined);
    expect(parseOptionalTrimmedUuid(`  ${id}  `)).toBe(id);
  });

  it("normalizeIdList: trims, dedupes, drops blank and non-string ids", () => {
    expect(
      normalizeIdList(["  a  ", "a", "", "  ", undefined, null, "b"] as (
        | string
        | null
        | undefined
      )[])
    ).toEqual(["a", "b"]);
  });

  it("parseActorId: trims without requiring a UUID", () => {
    expect(parseActorId("test-actor")).toBe("test-actor");
    expect(parseActorId("  api-key:demo  ")).toBe("api-key:demo");
    expect(parseActorId("   ")).toBeUndefined();
  });

  it("normalizeUuidList: trims, validates, and dedupes graph UUIDs", () => {
    const a = "00000000-0000-4000-8000-000000000011";
    const b = "00000000-0000-4000-8000-000000000022";
    expect(normalizeUuidList([`  ${a}  `, a, "bad", "", "  "])).toEqual([a]);
    expect(normalizeUuidList([b, ` ${b}`])).toEqual([b]);
  });

  it("parseGraphUuidList: accepts padded UUIDs, rejects invalid entries", () => {
    const a = "00000000-0000-4000-8000-000000000033";
    expect(parseGraphUuidList([])).toEqual([]);
    expect(parseGraphUuidList([`  ${a}  `])).toEqual([a]);
    expect(parseGraphUuidList([a, "not-a-uuid"])).toBe(null);
    expect(parseGraphUuidList(["   "])).toEqual([]);
  });

  it("httpUrlSchema: trims padded http(s) URLs", () => {
    expect(httpUrlSchema.parse("  https://example.com/page  ")).toBe(
      "https://example.com/page"
    );
  });

  it("httpUrlSchema: rejects non-http(s) schemes", () => {
    expect(() => httpUrlSchema.parse("ftp://example.com")).toThrow();
  });

  it("optionalHttpUrlSchema: trims padded URLs and clears blank", () => {
    expect(optionalHttpUrlSchema.parse("  https://example.com/page  ")).toBe(
      "https://example.com/page"
    );
    expect(optionalHttpUrlSchema.parse("   ")).toBeUndefined();
    expect(optionalHttpUrlSchema.parse(undefined)).toBeUndefined();
  });

  it("credentialNameSchema: trims padded SCREAMING_SNAKE names", () => {
    expect(credentialNameSchema.parse("  WHOIS_API_KEY  ")).toBe(
      "WHOIS_API_KEY"
    );
  });

  it("credentialNameSchema: rejects lowercase names", () => {
    expect(() => credentialNameSchema.parse("shodan")).toThrow();
  });

  it("dueDatePatchSchema: whitespace-only clears to null", () => {
    expect(dueDatePatchSchema.parse("   ")).toBe(null);
    expect(dueDatePatchSchema.parse(null)).toBe(null);
  });

  it("dueDateInputSchema: trims padded due dates", () => {
    expect(dueDateInputSchema.parse("  2026-06-15  ")).toBe("2026-06-15");
  });

  it("sha256HexSchema: trims and lowercases hex digests", () => {
    const hex = "a".repeat(64);
    expect(sha256HexSchema.parse(`  ${hex.toUpperCase()}  `)).toBe(hex);
  });

  it("mimeInputSchema: trims padded mime and defaults blank", () => {
    expect(mimeInputSchema.parse("  text/plain  ")).toBe("text/plain");
    expect(mimeInputSchema.parse("   ")).toBe("application/octet-stream");
  });
});
