import { describe, expect, it } from "vitest";

import {
  partitionViolations,
  type KnownViolation,
} from "./axe-known-violations";

const known: KnownViolation[] = [
  { rule: "color-contrast", route: "/cases", reason: "muted label" },
  { rule: "label", route: "/tasks", reason: "unlabelled input" },
];

describe("partitionViolations", () => {
  it("reports a serious violation with no known entry as fresh", () => {
    const report = partitionViolations(
      "/cases",
      [{ id: "button-name", impact: "serious" }],
      []
    );

    expect(report.fresh).toEqual(["button-name"]);
  });

  it("reports a critical violation as fresh", () => {
    const report = partitionViolations(
      "/",
      [{ id: "aria-required-attr", impact: "critical" }],
      []
    );

    expect(report.fresh).toEqual(["aria-required-attr"]);
  });

  it("ignores moderate, minor and unrated violations", () => {
    const report = partitionViolations(
      "/",
      [
        { id: "region", impact: "moderate" },
        { id: "tabindex", impact: "minor" },
        { id: "unrated", impact: null },
      ],
      []
    );

    expect(report).toEqual({ fresh: [], stale: [] });
  });

  it("accepts a known violation on its own route", () => {
    const report = partitionViolations(
      "/cases",
      [{ id: "color-contrast", impact: "serious" }],
      known
    );

    expect(report).toEqual({ fresh: [], stale: [] });
  });

  it("does not let a known entry cover the same rule on another route", () => {
    const report = partitionViolations(
      "/collect",
      [{ id: "color-contrast", impact: "serious" }],
      known
    );

    expect(report.fresh).toEqual(["color-contrast"]);
  });

  it("reports a known entry whose rule no longer occurs as stale", () => {
    const report = partitionViolations("/cases", [], known);

    expect(report.stale).toEqual([known[0]]);
  });

  it("reports an entry as stale when the rule only occurs below the blocking impact", () => {
    const report = partitionViolations(
      "/cases",
      [{ id: "color-contrast", impact: "moderate" }],
      known
    );

    expect(report.stale).toEqual([known[0]]);
  });

  it("does not report entries for other routes as stale", () => {
    const report = partitionViolations("/collect", [], known);

    expect(report.stale).toEqual([]);
  });
});
