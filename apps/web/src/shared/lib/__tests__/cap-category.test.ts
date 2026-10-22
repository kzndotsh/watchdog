import { describe, expect, it } from "vitest";

import {
  capCategory,
  categoryLabel,
  PLAYBOOK_CATEGORY,
} from "@/shared/lib/cap-category";

describe("capCategory", () => {
  it("is the first segment of a Cap id", () => {
    expect(capCategory("network.ct.lookup")).toBe("network");
  });
});

describe("categoryLabel", () => {
  it("names a category as Collect and the Library show it", () => {
    expect(categoryLabel("network")).toBe("Network");
    expect(categoryLabel("threat")).toBe("Threat");
    expect(categoryLabel(PLAYBOOK_CATEGORY)).toBe("Playbooks");
  });
});
