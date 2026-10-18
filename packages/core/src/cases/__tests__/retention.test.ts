import { afterEach, describe, expect, it, vi } from "vitest";

import {
  caseRetentionDays,
  DEFAULT_CASE_RETENTION_DAYS,
  daysLeftBeforePurge,
  purgeCutoff,
  purgeDueAt,
} from "../retention";

const DAY_MS = 86_400_000;
const DELETED = new Date("2026-10-01T12:00:00Z");

describe("case retention window", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 30 days", () => {
    expect(DEFAULT_CASE_RETENTION_DAYS).toBe(30);
    expect(caseRetentionDays()).toBe(30);
  });

  it("ends the window the configured number of days after the delete", () => {
    expect(purgeDueAt(DELETED, 30).toISOString()).toBe(
      "2026-10-31T12:00:00.000Z"
    );
    expect(purgeDueAt(DELETED, 7).toISOString()).toBe(
      "2026-10-08T12:00:00.000Z"
    );
  });

  it("counts whole days left, rounding up, and never goes below zero", () => {
    const at = (offsetMs: number) => new Date(DELETED.getTime() + offsetMs);
    expect(daysLeftBeforePurge(DELETED, 30, at(0))).toBe(30);
    expect(daysLeftBeforePurge(DELETED, 30, at(DAY_MS / 2))).toBe(30);
    expect(daysLeftBeforePurge(DELETED, 30, at(DAY_MS + 1))).toBe(29);
    expect(daysLeftBeforePurge(DELETED, 30, at(29 * DAY_MS + DAY_MS / 2))).toBe(
      1
    );
    expect(daysLeftBeforePurge(DELETED, 30, at(30 * DAY_MS))).toBe(0);
    expect(daysLeftBeforePurge(DELETED, 30, at(90 * DAY_MS))).toBe(0);
  });

  it("takes everything deleted at or before the cutoff in the scheduled purge", () => {
    const now = new Date("2026-11-15T00:00:00Z");
    expect(purgeCutoff(now, 30).toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });
});
