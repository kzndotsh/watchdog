import { describe, expect, it } from "vitest";

import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";

describe("placeholderDeemphasisClass", () => {
  it("applies reduced opacity for placeholder data", () => {
    expect(placeholderDeemphasisClass(true)).toContain("opacity-60");
  });

  it("keeps full opacity when data is current", () => {
    expect(placeholderDeemphasisClass(false)).not.toContain("opacity-60");
    expect(placeholderDeemphasisClass()).not.toContain("opacity-60");
  });
});
