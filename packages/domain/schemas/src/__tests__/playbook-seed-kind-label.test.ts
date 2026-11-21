import { describe, expect, it } from "vitest";

import {
  playbookSeedKindLabel,
  PLAYBOOK_SEED_KIND_LABELS,
} from "../display-labels";
import { isPlaybookSeedKind } from "../vocab";

describe("playbookSeedKindLabel", () => {
  it("maps playbook seed kinds to display labels", () => {
    expect(playbookSeedKindLabel("host")).toBe("Host");
    expect(playbookSeedKindLabel("evidence")).toBe("Evidence");
    expect(PLAYBOOK_SEED_KIND_LABELS.handle).toBe("Handle");
  });
});

describe("isPlaybookSeedKind", () => {
  it("accepts catalog seed kinds only", () => {
    expect(isPlaybookSeedKind("host")).toBe(true);
    expect(isPlaybookSeedKind("not-a-seed")).toBe(false);
  });
});
