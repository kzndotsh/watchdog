import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  ACTIVITY_ENTRY_ACTIONS,
  ACTIVITY_ENTRY_KINDS,
  activityEntrySchema,
  compareActivityCursor,
  createActivityGate,
  formatActivityCursor,
  isActivityActionForKind,
  legacyEventForActivityEntry,
  parseActivityCursor,
  type ActivityEntry,
} from "../activity-log.ts";
import { isWatchdogEvent } from "../watchdog-events.ts";

const entry = {
  cursor: "7:3",
  id: 3,
  caseId: testId(10),
  kind: "task",
  action: "created",
  subjectId: testId(20),
  groupId: null,
  label: "Follow up",
  actorId: null,
  actorLabel: null,
  fromValue: null,
  toValue: "backlog",
  at: "2026-01-01T00:00:00.000Z",
} as const;

describe("activity cursor", () => {
  it("round-trips xid:id and rejects anything else", () => {
    expect(formatActivityCursor({ xid: "42", id: 7 })).toBe("42:7");
    expect(parseActivityCursor("42:7")).toEqual({ xid: "42", id: 7 });
    expect(parseActivityCursor(" 42:7 ")).toEqual({ xid: "42", id: 7 });
    for (const bad of [
      "",
      "42",
      "42:",
      ":7",
      "a:7",
      "42:-1",
      "42:0",
      "42:1.5",
      "1:2:3",
      "18446744073709551616:1",
      "42:9007199254740993",
    ]) {
      expect(parseActivityCursor(bad), bad).toBeNull();
    }
  });

  it("orders by xid first (numerically), then id", () => {
    const a = { xid: "9", id: 100 };
    const b = { xid: "10", id: 1 };
    expect(compareActivityCursor(a, b)).toBeLessThan(0);
    expect(compareActivityCursor(b, a)).toBeGreaterThan(0);
    expect(compareActivityCursor(a, { xid: "9", id: 100 })).toBe(0);
    expect(compareActivityCursor({ xid: "9", id: 2 }, a)).toBeLessThan(0);
  });
});

describe("activity vocabulary", () => {
  it("lists the ADR-0005 kinds and a closed action list per kind", () => {
    expect([...ACTIVITY_ENTRY_KINDS]).toEqual([
      "task",
      "job",
      "proposal",
      "evidence",
      "entity",
      "edge",
      "claim",
      "identifier",
      "event",
      "question",
      "case",
    ]);
    expect(ACTIVITY_ENTRY_ACTIONS.task).toEqual([
      "created",
      "status_changed",
      "updated",
      "reordered",
      "deleted",
    ]);
    expect(isActivityActionForKind("task", "reordered")).toBe(true);
    expect(isActivityActionForKind("task", "captured")).toBe(false);
  });
});

describe("activityEntrySchema", () => {
  it("accepts an entry and rejects a label over 200 characters", () => {
    expect(activityEntrySchema.safeParse(entry).success).toBe(true);
    expect(
      activityEntrySchema.safeParse({ ...entry, label: "x".repeat(201) })
        .success
    ).toBe(false);
  });
});

describe("legacyEventForActivityEntry", () => {
  it("adapts a task entry to the legacy task_changed event", () => {
    const event = legacyEventForActivityEntry(activityEntrySchema.parse(entry));
    expect(event).toEqual({ type: "task_changed", caseId: testId(10) });
    expect(isWatchdogEvent(event)).toBe(true);
  });

  it("returns null for a kind that has no legacy event yet", () => {
    const job = activityEntrySchema.parse({
      ...entry,
      kind: "job",
      action: "queued",
    });
    expect(legacyEventForActivityEntry(job)).toBeNull();
  });
});

describe("createActivityGate", () => {
  const at = (id: number): ActivityEntry =>
    activityEntrySchema.parse({
      ...entry,
      id,
      cursor: `10:${id}`,
      label: `e${id}`,
    });

  it("holds live entries until the replay is in, then drops duplicates", () => {
    const out: (string | null)[] = [];
    const gate = createActivityGate({ xid: "10", id: 1 }, (e) => {
      out.push(e.label);
    });
    gate.live(at(3));
    gate.live(at(4));
    expect(out).toEqual([]);
    gate.open([at(2), at(3)]);
    expect(out).toEqual(["e2", "e3", "e4"]);
    gate.live(at(4));
    gate.live(at(5));
    expect(out).toEqual(["e2", "e3", "e4", "e5"]);
  });

  it("passes everything through for a fresh connection, in order", () => {
    const out: (string | null)[] = [];
    const gate = createActivityGate(null, (e) => {
      out.push(e.label);
    });
    gate.live(at(1));
    gate.live(at(2));
    gate.live(at(2));
    expect(out).toEqual(["e1", "e2"]);
  });
});
