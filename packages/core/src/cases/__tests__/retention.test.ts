import { afterEach, describe, expect, it, vi } from "vitest";

import {
  caseRetentionDays,
  DEFAULT_CASE_RETENTION_DAYS,
  daysUntilPurge,
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

  it("counts whole days left from the stored purge date, rounding up, and never goes below zero", () => {
    const due = purgeDueAt(DELETED, 30);
    const at = (offsetMs: number) => new Date(DELETED.getTime() + offsetMs);
    expect(daysUntilPurge(due, at(0))).toBe(30);
    expect(daysUntilPurge(due, at(DAY_MS / 2))).toBe(30);
    expect(daysUntilPurge(due, at(DAY_MS + 1))).toBe(29);
    expect(daysUntilPurge(due, at(29 * DAY_MS + DAY_MS / 2))).toBe(1);
    expect(daysUntilPurge(due, at(30 * DAY_MS))).toBe(0);
    expect(daysUntilPurge(due, at(90 * DAY_MS))).toBe(0);
  });

  it("keeps the date fixed when the configured window changes later", () => {
    const due = purgeDueAt(DELETED, 30);
    vi.stubEnv("WD_CASE_RETENTION_DAYS", "3");
    expect(daysUntilPurge(due, DELETED)).toBe(30);
  });
});
