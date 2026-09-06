import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

import type { CaseRecord } from "../../types.ts";
import { caseCardActions } from "../case-card-actions.ts";

const CASE: CaseRecord = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

describe("caseCardActions", () => {
  it("includes Set as active when provided", () => {
    const actions = caseCardActions(CASE, {
      onOpen: vi.fn(),
      onSetActiveOnly: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(actions.map((a) => a.id)).toEqual([
      "case-open",
      "case-set-active",
      "case-delete",
    ]);
  });

  it("omits Set as active for the active case", () => {
    const actions = caseCardActions(CASE, {
      onOpen: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(actions.map((a) => a.id)).toEqual(["case-open", "case-delete"]);
  });
});
