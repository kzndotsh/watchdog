import { describe, expect, it, vi } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";

import type { CaseRecord } from "../../types.ts";
import { caseCardActions } from "../case-card-actions.ts";

const CASE: CaseRecord = {
  id: testCaseId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
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

  it("offers no Delete when the caller may not delete Cases", () => {
    const actions = caseCardActions(CASE, { onOpen: vi.fn() });
    expect(actions.map((a) => a.id)).toEqual(["case-open"]);
  });

  it("omits Set as active for the active case", () => {
    const actions = caseCardActions(CASE, {
      onOpen: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(actions.map((a) => a.id)).toEqual(["case-open", "case-delete"]);
  });
});
