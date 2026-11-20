import { describe, expect, it } from "vitest";

import { groupFoundValues } from "@/domains/jobs/lib/found-value-groups";
import type { FoundValueRecord } from "@watchdog/schemas/jobs";
import { testId } from "@watchdog/test-kit";

function row(
  type: FoundValueRecord["type"],
  value: string,
  sources: string[],
  held = false
): FoundValueRecord {
  return {
    type,
    platform: "",
    value,
    sources,
    onEntities: held ? [{ id: testId(1), name: "Alice", slug: "alice" }] : [],
  };
}

const VALUES = [
  row("ip", "192.0.2.1", ["A record"], true),
  row("domain", "ns1.dns.test", ["NS record"]),
  row("ip", "192.0.2.2", ["A record"]),
];

describe("groupFoundValues", () => {
  it("groups by type in first-seen order and counts held values", () => {
    expect(
      groupFoundValues(VALUES, "").map((g) => [
        g.label,
        g.values.length,
        g.heldCount,
      ])
    ).toEqual([
      ["IP", 2, 1],
      ["Domain", 1, 0],
    ]);
  });

  it("filters on the value and on its sources, case-insensitively, and drops empty groups", () => {
    expect(groupFoundValues(VALUES, " NS ").map((g) => g.label)).toEqual([
      "Domain",
    ]);
    expect(groupFoundValues(VALUES, "0.2.2")[0]?.values).toHaveLength(1);
    expect(groupFoundValues(VALUES, "nothing")).toEqual([]);
  });
});
