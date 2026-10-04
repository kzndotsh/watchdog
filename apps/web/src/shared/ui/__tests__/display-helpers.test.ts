import { describe, expect, it } from "vitest";

import { titleCase } from "@watchdog/schemas";

import { artifactBodyFromContent } from "../artifact-body-from-content.ts";
import { formatOpaqueId } from "../format-opaque-id.ts";
import { groupItemsByDay } from "../group-by-day.ts";

describe("shared display helpers", () => {
  it("groups items by day", () => {
    const buckets = groupItemsByDay(
      [{ at: "2026-01-01T10:00:00.000Z" }, { at: "2026-01-01T11:00:00.000Z" }],
      (row) => row.at
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.items).toHaveLength(2);
  });

  it("formats opaque ids and title-cases acronyms", () => {
    expect(formatOpaqueId("abcdefghijklmnop", 4)).toBe("abcd…");
    expect(titleCase("network.dns.lookup")).toMatch(/DNS/);
  });

  it("parses json artifact bodies", () => {
    const body = artifactBodyFromContent('{"ok":true}', "application/json");
    expect(body.kind).toBe("json");
  });
});
