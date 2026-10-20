import { afterEach, describe, expect, it } from "vitest";

import {
  configureErrorReporting,
  flushErrorReports,
  isErrorReportingEnabled,
  reportError,
  reportWideEvent,
  resetErrorReporting,
  type ErrorReport,
  type ErrorSink,
} from "../error-report.ts";
import { createScrubber, REDACTED } from "../error-scrub.ts";

function fakeSink() {
  const reports: ErrorReport[] = [];
  const sink: ErrorSink = {
    send: async (report) => {
      reports.push(report);
      await Promise.resolve();
    },
  };
  return { reports, sink };
}

async function settle(): Promise<void> {
  await flushErrorReports(500);
}

afterEach(() => {
  resetErrorReporting();
});

describe("unconfigured", () => {
  it("is off and every entry point is a silent no-op", () => {
    expect(isErrorReportingEnabled()).toBe(false);
    expect(() => {
      reportError(new Error("boom"));
      reportWideEvent({ level: "error", error: { message: "boom" } });
    }).not.toThrow();
  });

  it("sends nothing until a sink is configured", async () => {
    const { reports, sink } = fakeSink();
    reportError(new Error("before"));
    configureErrorReporting({ sink, service: "svc" });
    await settle();
    expect(reports).toEqual([]);
  });
});

describe("what is reported", () => {
  it("reports error-level wide events with route, request id, job id and release", async () => {
    const { reports, sink } = fakeSink();
    configureErrorReporting({
      sink,
      service: "watchdog-web",
      release: "1.2.3",
      environment: "production",
    });

    reportWideEvent({
      level: "error",
      requestId: "req-1",
      method: "POST",
      path: "/api/v1/cases",
      status: 500,
      operation: "cases.create",
      job: { jobId: "job-9", outcome: "failed" },
      cap: { capabilityId: "cap.x" },
      error: { name: "TypeError", message: "x is not a function", stack: "s" },
    });
    await settle();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      name: "TypeError",
      message: "x is not a function",
      level: "error",
      service: "watchdog-web",
      release: "1.2.3",
      environment: "production",
      context: {
        requestId: "req-1",
        method: "POST",
        path: "/api/v1/cases",
        status: 500,
        operation: "cases.create",
        jobId: "job-9",
        capabilityId: "cap.x",
      },
    });
  });

  it("ignores info and warn events", async () => {
    const { reports, sink } = fakeSink();
    configureErrorReporting({ sink, service: "svc" });
    reportWideEvent({ level: "info", status: 200 });
    reportWideEvent({ level: "warn", status: 403 });
    await settle();
    expect(reports).toEqual([]);
  });

  it("reports a 5xx request whose cause was set as a field (mapped InternalError)", async () => {
    const { reports, sink } = fakeSink();
    configureErrorReporting({ sink, service: "svc" });
    reportWideEvent({
      level: "info",
      status: 500,
      path: "/api/v1/cases",
      error: {
        domainTag: "InternalError",
        reason: "Failed to create case",
        cause: { name: "PostgresError", message: "connection refused" },
      },
    });
    await settle();
    expect(reports[0]).toMatchObject({
      name: "PostgresError",
      message: "connection refused",
    });
  });

  it("reports an uncaught failure through reportError", async () => {
    const { reports, sink } = fakeSink();
    configureErrorReporting({ sink, service: "svc" });
    reportError(new RangeError("bad"), { scope: "process.x" }, "fatal");
    await settle();
    expect(reports[0]).toMatchObject({
      name: "RangeError",
      level: "fatal",
      context: { scope: "process.x" },
    });
  });
});

describe("scrubbing: secrets never leave", () => {
  const SECRET = "s3cr3t-vault-key-value-0123456789";

  it("removes configured secret values, credentials and tokens from every field", async () => {
    const { reports, sink } = fakeSink();
    configureErrorReporting({ sink, service: "svc", secrets: [SECRET] });

    const error = new Error(
      `failed with ${SECRET} and Bearer abc.def-ghi and postgres://app:hunter22@db:5432/wd and https://x.test/cb?token=zzz&a=1 for jane@example.com`
    );
    error.stack = `Error: ${SECRET}\n    at f (https://x.test/a.js?sig=abc:1:2)`;
    reportError(error, {
      path: `/p?key=${SECRET}`,
      password: "hunter22",
      nested: { authorization: "Bearer zzz", apiKey: "k", note: SECRET },
      evidenceBody: "leaked credential dump",
      requestBody: "raw body",
      email: "jane@example.com",
    });
    await settle();

    const wire = JSON.stringify(reports);
    for (const leaked of [
      SECRET,
      "abc.def-ghi",
      "hunter22",
      "token=zzz",
      "jane@example.com",
      "sig=abc",
      "leaked credential dump",
      "raw body",
    ]) {
      expect(wire).not.toContain(leaked);
    }
    expect(wire).toContain(REDACTED);
  });

  it("keeps case and job UUIDs readable", () => {
    const { scrubText } = createScrubber();
    const id = "00000000-0000-4000-8000-000000000001";
    expect(scrubText(`case ${id} failed`)).toBe(`case ${id} failed`);
  });

  it("bounds depth, width and string length", () => {
    const { scrubValue, scrubText } = createScrubber();
    expect(scrubText("a ".repeat(5000)).length).toBeLessThanOrEqual(2000);
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: "x" } } } } } } } };
    expect(JSON.stringify(scrubValue(deep))).toContain("[truncated]");
  });
});

describe("a failing reporter never reaches the caller", () => {
  it("swallows a sink that rejects or throws synchronously", async () => {
    const calls: string[] = [];
    configureErrorReporting({
      service: "svc",
      sink: {
        send: (report) => {
          calls.push(report.message);
          if (report.message === "sync") throw new Error("sink exploded");
          return Promise.reject(new Error("network down"));
        },
      },
    });
    expect(() => {
      reportError(new Error("sync"));
      reportError(new Error("async"));
    }).not.toThrow();
    await settle();
    expect(calls).toEqual(["sync", "async"]);
  });

  it("returns at once for a sink that never answers, and flush is bounded", async () => {
    configureErrorReporting({
      service: "svc",
      sink: { send: async () => new Promise<void>(() => {}) },
    });
    const started = Date.now();
    reportError(new Error("slow sink"));
    expect(Date.now() - started).toBeLessThan(50);
    await flushErrorReports(100);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("drops reports past the per-minute limit and past the in-flight cap", async () => {
    const { reports, sink } = fakeSink();
    let now = 0;
    configureErrorReporting({
      sink,
      service: "svc",
      maxPerMinute: 2,
      now: () => now,
    });
    for (let i = 0; i < 5; i += 1) reportError(new Error(`e${i}`));
    await settle();
    expect(reports).toHaveLength(2);

    now = 61_000;
    reportError(new Error("next window"));
    await settle();
    expect(reports).toHaveLength(3);
  });
});
