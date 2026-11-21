import { describe, expect, it } from "vitest";

import { capTimeoutCeilingMs } from "@watchdog/caps";

import {
  CASE_EXPORT_JOB,
  isSystemJobId,
  systemJobTimeoutMs,
} from "../system-jobs";
import {
  POST_RUN_SLACK_MS,
  capExpireSeconds,
  gracefulStopTimeoutMs,
  queueExpireSeconds,
} from "../timeouts";

describe("system Jobs", () => {
  it("knows the export Job and no Cap id", () => {
    expect(isSystemJobId(CASE_EXPORT_JOB)).toBe(true);
    expect(isSystemJobId("network.dns.lookup")).toBe(false);
    expect(isSystemJobId("toString")).toBe(false);
  });

  it("derives the queue expiry of an export from its own timeout, not a Cap's", () => {
    expect(capExpireSeconds(CASE_EXPORT_JOB)).toBe(
      Math.ceil(
        (systemJobTimeoutMs(CASE_EXPORT_JOB) + POST_RUN_SLACK_MS) / 1000
      )
    );
  });

  it("keeps the queue defaults above the longest Cap and the longest system Job", () => {
    const longest = Math.max(
      capTimeoutCeilingMs(),
      systemJobTimeoutMs(CASE_EXPORT_JOB)
    );
    expect(queueExpireSeconds()).toBe(
      Math.ceil((longest + POST_RUN_SLACK_MS) / 1000)
    );
    expect(gracefulStopTimeoutMs()).toBe(longest + POST_RUN_SLACK_MS);
  });

  it("still refuses an unknown Cap id", () => {
    expect(() => capExpireSeconds("no.such.cap")).toThrow();
  });
});
