import { describe, expect, it } from "vitest";

import {
  rollUpReadiness,
  rollupSummary,
} from "@/domains/library/lib/playbook-rollup";
import type { LibraryReadiness } from "@/domains/library/types";

const ready: LibraryReadiness = { state: "ready" };
const key: LibraryReadiness = { state: "needs_key", slots: ["K"] };
const off: LibraryReadiness = { state: "off_by_operator" };

const steps = (...states: LibraryReadiness[]) =>
  states.map((readiness) => ({ readiness }));

describe("rollUpReadiness", () => {
  it("counts each state", () => {
    expect(rollUpReadiness(steps(ready, key, key, off))).toEqual({
      total: 4,
      counts: { ready: 1, needs_key: 2, off_by_operator: 1, unavailable: 0 },
    });
  });
});

describe("rollupSummary", () => {
  it("names the steps that need keys and the ones that are off", () => {
    expect(
      rollupSummary(rollUpReadiness(steps(ready, key, key, off, ready)))
    ).toBe(
      "2 of 5 steps are missing API keys; 1 of 5 steps is off by the operator."
    );
  });

  it("says when everything is ready", () => {
    expect(rollupSummary(rollUpReadiness(steps(ready, ready)))).toBe(
      "All 2 steps are ready."
    );
  });

  it("handles one step and none", () => {
    expect(rollupSummary(rollUpReadiness(steps(key)))).toBe(
      "1 of 1 step is missing an API key."
    );
    expect(rollupSummary(rollUpReadiness([]))).toBe(
      "This Playbook has no steps."
    );
  });
});
