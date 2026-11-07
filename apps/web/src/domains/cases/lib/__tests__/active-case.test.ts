import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bumpActiveCaseHealEpoch,
  CASES_CHANGED_EVENT,
  getActiveCaseHealEpoch,
  notifyCasesChanged,
} from "@/domains/cases/lib/active-case";

describe("active case helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bumps the heal epoch monotonically", () => {
    const start = getActiveCaseHealEpoch();
    bumpActiveCaseHealEpoch();
    bumpActiveCaseHealEpoch();
    expect(getActiveCaseHealEpoch()).toBe(start + 2);
  });

  it("dispatches the cases-changed event in the browser", () => {
    const listener = vi.fn();
    window.addEventListener(CASES_CHANGED_EVENT, listener);
    notifyCasesChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(CASES_CHANGED_EVENT, listener);
  });
});
