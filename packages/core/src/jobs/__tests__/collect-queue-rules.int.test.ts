import { describe, expect, it } from "vitest";

import { listCapabilities } from "@watchdog/caps";
import {
  isProcessCapability,
  URL_ENRICH_CAPABILITY_ID,
} from "@watchdog/schemas/jobs";
import { parseTrimmedUuid, type JsonValue } from "@watchdog/schemas/shared";
import {
  collectLinkedCaps,
  parseCollectInputIds,
  testDb,
} from "@watchdog/test-db";
import { fc } from "@watchdog/test-kit/fc";

/*
 * The two rules Collect's queue projection (#574) restates in SQL from TypeScript, held to their
 * TypeScript originals: the Evidence id a Job names in its input, and which Caps link by input.
 */

/** Every character `String.prototype.trim` removes (by code point), and some it keeps. */
const JS_WHITESPACE = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x16_80, 0x20_00, 0x20_01, 0x20_02,
  0x20_03, 0x20_04, 0x20_05, 0x20_06, 0x20_07, 0x20_08, 0x20_09, 0x20_0a,
  0x20_28, 0x20_29, 0x20_2f, 0x20_5f, 0x30_00, 0xfe_ff,
].map((code) => String.fromCodePoint(code));
const NOT_WHITESPACE = [0x85, 0x18_0e, 0x78, 0x2d, 0x7b].map((code) =>
  String.fromCodePoint(code)
);

const uuidArb = fc.oneof(
  fc.uuid(),
  fc.constantFrom(
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
    "-".repeat(36),
    "0".repeat(36),
    "11111111-1111-9111-8111-000000000001",
    "11111111-1111-4111-c111-000000000001"
  )
);
const padArb = fc
  .array(fc.constantFrom(...JS_WHITESPACE, ...NOT_WHITESPACE), { maxLength: 3 })
  .map((chars) => chars.join(""));

/** Strings built from UUIDs (any case, padded, cut, with junk) and values that are not strings. */
const inputValueArb: fc.Arbitrary<JsonValue> = fc.oneof(
  fc
    .record({
      id: uuidArb,
      upper: fc.boolean(),
      cut: fc.boolean(),
      before: padArb,
      after: padArb,
    })
    .map(({ id, upper, cut, before, after }) => {
      const body = upper ? id.toUpperCase() : id;
      return `${before}${cut ? body.slice(1) : body}${after}`;
    }),
  fc.string({ maxLength: 40 }).filter((value) => !value.includes("\u0000")),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant<JsonValue>([]),
  fc.constant<JsonValue>({ id: "nested" })
);

/** What the queue builder links: `parseTrimmedUuid`, compared with a stored lowercase id. */
function builderEvidenceId(value: JsonValue): string | null {
  if (typeof value !== "string") return null;
  const parsed = parseTrimmedUuid(value);
  return parsed !== null && parsed === parsed.toLowerCase() ? parsed : null;
}

describe("Collect queue rules in SQL", () => {
  it("parses an input Evidence id as the builder does, and never raises", async () => {
    const values = fc.sample(inputValueArb, { numRuns: 3000, seed: 574 });
    const parsed = await parseCollectInputIds(testDb, values);
    const mismatches = values.flatMap((value, i) =>
      parsed[i] === builderEvidenceId(value)
        ? []
        : [{ value, sql: parsed[i], builder: builderEvidenceId(value) }]
    );
    expect(mismatches).toEqual([]);
    // The generator reaches both outcomes.
    expect(parsed.some((id) => id !== null)).toBe(true);
    expect(parsed.some((id) => id === null)).toBe(true);
  });

  it("links by input exactly the Caps the builder does", async () => {
    const ids = [
      ...listCapabilities().map((cap) => cap.id),
      URL_ENRICH_CAPABILITY_ID,
      "evidence.harvest",
      "evidence.extract.ai",
      "network.dns.lookup",
      "",
    ];
    const linked = await collectLinkedCaps(testDb, ids);
    expect(linked).toEqual(
      ids.map(
        (id) => isProcessCapability(id) || id === URL_ENRICH_CAPABILITY_ID
      )
    );
  });
});
