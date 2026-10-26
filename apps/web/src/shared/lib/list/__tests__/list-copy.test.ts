import { describe, expect, it } from "vitest";

import {
  compactCountLabel,
  filterChipLabel,
  fullCountLabel,
  sortOptionLabel,
} from "@/shared/lib/list/list-copy";
import type { ListCountValue } from "@/shared/lib/list/list-types";
import { evidenceList } from "@watchdog/schemas/evidence";

function count(patch: Partial<ListCountValue>): ListCountValue {
  return {
    loaded: 50,
    total: null,
    hasMore: false,
    isAtCeiling: false,
    isSettled: true,
    ...patch,
  };
}

describe("list copy", () => {
  it("shows a capped total with a plus, and the loaded rows against it", () => {
    const capped = count({
      total: { count: 1000, isCapped: true },
      hasMore: true,
    });
    expect(compactCountLabel(capped)).toBe("1,000+");
    expect(fullCountLabel(capped)).toBe("Showing 50 of 1,000+");
  });

  it("says only what is shown when everything is loaded", () => {
    const all = count({ loaded: 12, total: { count: 12, isCapped: false } });
    expect(compactCountLabel(all)).toBe("12");
    expect(fullCountLabel(all)).toBe("Showing 12");
  });

  it("falls back to the loaded rows with a plus while the total is unknown", () => {
    expect(compactCountLabel(count({ hasMore: true }))).toBe("50+");
  });

  it("names sorts by column and the direction word of the key's type", () => {
    expect(sortOptionLabel(evidenceList, "captured.desc")).toBe(
      "Captured, Newest"
    );
    expect(sortOptionLabel(evidenceList, "label.asc")).toBe("Label, A–Z");
  });

  it("reads chips as the filter's label and its values' labels", () => {
    expect(
      filterChipLabel(evidenceList.filters.kind, ["file", "url_archive"], null)
    ).toBe("Kind: File, URL Archive");
    expect(filterChipLabel(evidenceList.filters.hidden, true, null)).toBe(
      "Hidden"
    );
    expect(
      filterChipLabel(evidenceList.filters.entityId, "x", "Acme Ltd")
    ).toBe("Entity: Acme Ltd");
    // While the title is unknown a ref chip says so; it never prints the id.
    expect(filterChipLabel(evidenceList.filters.entityId, "x", null)).toBe(
      "Entity: …"
    );
  });
});
