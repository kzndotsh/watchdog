import { describe, expect, it } from "vitest";

import {
  JOB_LOG_MAX_LINE_CHARS,
  createJobLog,
  jobLogTruncationMarker,
  type JobLogSettings,
} from "../job-log";

const SMALL: JobLogSettings = { maxLines: 5, maxBytes: 1024, flushMs: 1000 };

describe("createJobLog bounds", () => {
  it("keeps lines under the bound untouched", () => {
    const log = createJobLog([], SMALL);
    log.log("a");
    log.log("b");
    expect(log.lines).toEqual(["a", "b"]);
    expect(log.truncated()).toBe(false);
  });

  it("ends a log past the line limit with one marker and drops the rest", () => {
    const log = createJobLog([], SMALL);
    for (let i = 0; i < 50; i += 1) log.log(`line ${i}`);
    expect(log.lines).toHaveLength(SMALL.maxLines);
    expect(log.lines.at(-1)).toBe(jobLogTruncationMarker(SMALL));
    expect(
      log.lines.filter((line) => line === jobLogTruncationMarker(SMALL))
    ).toHaveLength(1);
    expect(log.lines.slice(0, 4)).toEqual([
      "line 0",
      "line 1",
      "line 2",
      "line 3",
    ]);
    expect(log.truncated()).toBe(true);
  });

  it("ends a log past the byte limit with the marker", () => {
    const settings = { ...SMALL, maxLines: 1000, maxBytes: 100 };
    const log = createJobLog([], settings);
    for (let i = 0; i < 20; i += 1) log.log("x".repeat(30));
    const kept = log.lines.slice(0, -1);
    expect(kept.join("").length).toBeLessThanOrEqual(settings.maxBytes);
    expect(log.lines.at(-1)).toBe(jobLogTruncationMarker(settings));
  });

  it("counts bytes, not characters", () => {
    const settings = { ...SMALL, maxLines: 1000, maxBytes: 40 };
    const log = createJobLog([], settings);
    // Each line is 10 characters and 30 bytes.
    log.log("€".repeat(10));
    log.log("€".repeat(10));
    expect(log.lines).toEqual([
      "€".repeat(10),
      jobLogTruncationMarker(settings),
    ]);
  });

  it("cuts one long line", () => {
    const log = createJobLog([], SMALL);
    log.log("y".repeat(JOB_LOG_MAX_LINE_CHARS * 3));
    expect(log.lines[0]).toHaveLength(JOB_LOG_MAX_LINE_CHARS + 1);
    expect(log.lines[0]?.endsWith("…")).toBe(true);
  });

  it("never cuts a character in half at the line limit", () => {
    const log = createJobLog();
    log.log(`${"x".repeat(JOB_LOG_MAX_LINE_CHARS - 1)}😀 and more`);
    log.outcome(`${"x".repeat(JOB_LOG_MAX_LINE_CHARS - 1)}😀 and more`);
    for (const line of log.lines) {
      // A lone surrogate does not survive a UTF-8 round trip.
      expect(Buffer.from(line, "utf-8").toString("utf-8")).toBe(line);
      expect(line).toBe(`${"x".repeat(JOB_LOG_MAX_LINE_CHARS - 1)}…`);
    }
  });

  it("stores only text Postgres jsonb accepts: no NUL, no lone surrogate", () => {
    const log = createJobLog();
    log.log("a\0b \uD83D c");
    expect(log.lines).toEqual(["ab \uFFFD c"]);
  });

  it("counts an outcome line's bytes toward the bound", () => {
    const log = createJobLog([], { ...SMALL, maxBytes: 10 });
    log.outcome("12345678");
    log.log("abc");
    expect(log.truncated()).toBe(true);
  });

  it("keeps an outcome line after the bound, so a truncated log still says how it ended", () => {
    const log = createJobLog([], SMALL);
    for (let i = 0; i < 50; i += 1) log.log(`line ${i}`);
    log.outcome("run failed: boom");
    expect(log.lines.at(-1)).toBe("run failed: boom");
    log.log("late");
    expect(log.lines).not.toContain("late");
  });

  it("counts a reclaimed attempt's stored lines toward the bound", () => {
    const log = createJobLog(["1", "2", "3"], SMALL);
    log.log("4");
    log.log("5");
    expect(log.lines).toEqual([
      "1",
      "2",
      "3",
      "4",
      jobLogTruncationMarker(SMALL),
    ]);
  });
});

describe("createJobLog saved count", () => {
  it("reports the lines logged since the last save", () => {
    const log = createJobLog(["stored"], SMALL);
    expect(log.unsaved()).toBe(0);
    log.log("a");
    log.log("b");
    expect(log.unsaved()).toBe(2);
    log.markSaved(2);
    expect(log.unsaved()).toBe(1);
    log.markSaved(3);
    expect(log.unsaved()).toBe(0);
  });

  it("never moves the saved count back", () => {
    const log = createJobLog([], SMALL);
    log.log("a");
    log.log("b");
    log.markSaved(2);
    log.markSaved(1);
    expect(log.unsaved()).toBe(0);
  });
});
