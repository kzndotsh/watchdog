import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CASES_CHANGED_EVENT,
  LAST_CASE_STORAGE_KEY,
  notifyCasesChanged,
  pickDefaultCase,
  readLastCaseId,
  rememberLastCase,
  subscribeToLastCase,
} from "@/domains/cases/lib/active-case";
import { testCaseId } from "@watchdog/domain/schemas/testing";

describe("the last Case entered", () => {
  afterEach(() => {
    window.localStorage.removeItem(LAST_CASE_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it("is remembered in this browser and notifies subscribers once per change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLastCase(listener);
    rememberLastCase(testCaseId(1));
    rememberLastCase(testCaseId(1));
    expect(readLastCaseId()).toBe(testCaseId(1));
    expect(window.localStorage.getItem(LAST_CASE_STORAGE_KEY)).toBe(
      testCaseId(1)
    );
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("ignores a stored value that is not a Case id", () => {
    window.localStorage.setItem(LAST_CASE_STORAGE_KEY, "not-a-case");
    expect(readLastCaseId()).toBeNull();
  });

  it("is kept for the tab when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    rememberLastCase(testCaseId(2));
    expect(readLastCaseId()).toBe(testCaseId(2));
  });
});

describe("pickDefaultCase", () => {
  const cases = [{ id: testCaseId(1) }, { id: testCaseId(2) }];

  it("is the last Case entered while it is still visible", () => {
    expect(pickDefaultCase(cases, testCaseId(2))).toBe(cases[1]);
  });

  it("falls back to the first visible Case, and to none without Cases", () => {
    expect(pickDefaultCase(cases, testCaseId(9))).toBe(cases[0]);
    expect(pickDefaultCase(cases, null)).toBe(cases[0]);
    expect(pickDefaultCase([], testCaseId(1))).toBeNull();
  });
});

describe("notifyCasesChanged", () => {
  it("dispatches the cases-changed event in the browser", () => {
    const listener = vi.fn();
    window.addEventListener(CASES_CHANGED_EVENT, listener);
    notifyCasesChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(CASES_CHANGED_EVENT, listener);
  });
});
