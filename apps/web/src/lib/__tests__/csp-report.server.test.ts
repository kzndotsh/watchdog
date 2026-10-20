import { describe, expect, it } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

import {
  CSP_REPORT_MAX_BYTES,
  createReportLimiter,
  handleCspReport,
  isFirstPartyEvalProbe,
  parseCspReports,
  readCappedText,
  type CspViolation,
} from "../csp-report.server";

/** Node needs `duplex` to send a stream body; the DOM `RequestInit` type does not list it. */
const HALF_DUPLEX = { duplex: "half" } as const;

const REPORT_URL = testHttpOrigin("watchdog.example.test", "/api/csp-report");

const legacyReport = {
  "csp-report": {
    "document-uri": "https://watchdog.example.test/cases?token=secret#frag",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://evil.example.test/x.js?k=v",
    "source-file": "https://watchdog.example.test/assets/app.js",
    "line-number": 12,
    disposition: "enforce",
  },
};

function post(
  body: BodyInit | null,
  headers: Record<string, string> = {}
): Request {
  return new Request(REPORT_URL, { method: "POST", body, headers });
}

function collector() {
  const seen: CspViolation[] = [];
  return { seen, log: (violation: CspViolation) => void seen.push(violation) };
}

const open = { take: () => true };

describe("parseCspReports", () => {
  it("reads the report-uri format and drops query strings and fragments", () => {
    const [violation] = parseCspReports(JSON.stringify(legacyReport));

    expect(violation).toEqual({
      directive: "script-src-elem",
      blocked: "https://evil.example.test/x.js",
      document: "https://watchdog.example.test/cases",
      source: "https://watchdog.example.test/assets/app.js",
      line: 12,
      disposition: "enforce",
    });
  });

  it("reads the Reporting API format", () => {
    const violations = parseCspReports(
      JSON.stringify([
        {
          type: "csp-violation",
          url: "https://watchdog.example.test/",
          body: {
            documentURL: "https://watchdog.example.test/",
            effectiveDirective: "img-src",
            blockedURL: "inline",
            disposition: "report",
          },
        },
      ])
    );

    expect(violations).toEqual([
      {
        directive: "img-src",
        blocked: "inline",
        document: "https://watchdog.example.test/",
        source: "",
        line: null,
        disposition: "report",
      },
    ]);
  });

  it("returns nothing for a body that is not a report", () => {
    expect(parseCspReports("not json")).toEqual([]);
    expect(parseCspReports(JSON.stringify({ hello: "world" }))).toEqual([]);
    expect(parseCspReports(JSON.stringify([{ body: { nope: 1 } }]))).toEqual(
      []
    );
  });

  it("truncates long fields and keeps at most five reports per request", () => {
    const long = "x".repeat(5000);
    const many = Array.from({ length: 9 }, () => ({
      body: { effectiveDirective: long, blockedURL: long },
    }));

    const violations = parseCspReports(JSON.stringify(many));

    expect(violations).toHaveLength(5);
    expect(violations[0]?.directive.length).toBeLessThanOrEqual(200);
    expect(violations[0]?.blocked.length).toBeLessThanOrEqual(200);
  });
});

describe("readCappedText", () => {
  it("reads a body within the cap", async () => {
    expect(await readCappedText(post("hello"), 100)).toBe("hello");
  });

  it("returns null for a body past the cap even without a Content-Length", async () => {
    const request = post("a".repeat(200));

    expect(request.headers.get("content-length")).toBeNull();
    expect(await readCappedText(request, 100)).toBeNull();
  });
});

describe("handleCspReport", () => {
  it("logs a valid report and answers 204 with an empty body", async () => {
    const { seen, log } = collector();

    const response = await handleCspReport(post(JSON.stringify(legacyReport)), {
      log,
      limiter: open,
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.directive).toBe("script-src-elem");
  });

  it("never echoes the report back", async () => {
    const response = await handleCspReport(post(JSON.stringify(legacyReport)), {
      log: () => undefined,
      limiter: open,
    });

    expect(await response.text()).toBe("");
    expect(response.headers.get("content-type")).toBeNull();
  });

  it("stops reading a chunked report at the report cap, not the global body limit", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const { seen, log } = collector();
    const response = await handleCspReport(
      new Request(REPORT_URL, {
        method: "POST",
        body,
        ...HALF_DUPLEX,
      }),
      { log, limiter: open }
    );
    expect(response.status).toBe(413);
    expect(seen).toHaveLength(0);
    // 8 KiB cap in 1 KiB chunks: nowhere near the 2 MiB global limit.
    expect(pulls).toBeLessThan(40);
  });

  it("answers 413 when the declared size is over the cap, without reading or logging", async () => {
    const { seen, log } = collector();

    const response = await handleCspReport(
      post("{}", { "content-length": String(CSP_REPORT_MAX_BYTES + 1) }),
      { log, limiter: open }
    );

    expect(response.status).toBe(413);
    expect(await response.text()).toBe("");
    expect(seen).toEqual([]);
  });

  it("answers 413 when the streamed body is over the cap", async () => {
    const { seen, log } = collector();
    const padding = "a".repeat(CSP_REPORT_MAX_BYTES + 10);

    const response = await handleCspReport(
      post(JSON.stringify({ "csp-report": { "violated-directive": padding } })),
      { log, limiter: open }
    );

    expect(response.status).toBe(413);
    expect(seen).toEqual([]);
  });

  it("answers 204 and logs nothing for a body that is not a report", async () => {
    const { seen, log } = collector();

    const response = await handleCspReport(post("garbage"), {
      log,
      limiter: open,
    });

    expect(response.status).toBe(204);
    expect(seen).toEqual([]);
  });

  it("answers 429 past the rate limit and logs nothing for the excess", async () => {
    const { seen, log } = collector();
    const limiter = createReportLimiter({ max: 2, windowMs: 60_000 });
    const body = JSON.stringify(legacyReport);

    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- requests are sent in order
      const response = await handleCspReport(post(body), { log, limiter });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([204, 204, 429, 429]);
    expect(seen).toHaveLength(2);
  });
});

describe("isFirstPartyEvalProbe", () => {
  const probe: CspViolation = {
    directive: "script-src",
    blocked: "eval",
    document: "https://watchdog.example.test/cases",
    source: "https://watchdog.example.test/assets/utils-abc123.js",
    line: 1,
    disposition: "enforce",
  };

  it("recognizes a refused eval from the app's own bundle", () => {
    expect(isFirstPartyEvalProbe(probe)).toBe(true);
  });

  it("does not hide an eval from another origin", () => {
    expect(
      isFirstPartyEvalProbe({
        ...probe,
        source: "https://evil.example.test/assets/x.js",
      })
    ).toBe(false);
  });

  it("does not hide an eval from a same-origin path outside the build output", () => {
    expect(
      isFirstPartyEvalProbe({
        ...probe,
        source: "https://watchdog.example.test/uploads/x.js",
      })
    ).toBe(false);
  });

  it("does not hide a blocked inline script or any other directive", () => {
    expect(isFirstPartyEvalProbe({ ...probe, blocked: "inline" })).toBe(false);
    expect(isFirstPartyEvalProbe({ ...probe, directive: "img-src" })).toBe(
      false
    );
  });

  it("handleCspReport skips the probe and logs other violations", async () => {
    const { seen, log } = collector();
    const body = JSON.stringify([
      {
        body: {
          effectiveDirective: "script-src",
          blockedURL: "eval",
          documentURL: probe.document,
          sourceFile: probe.source,
        },
      },
      {
        body: {
          effectiveDirective: "script-src-elem",
          blockedURL: "inline",
          documentURL: probe.document,
        },
      },
    ]);

    await handleCspReport(post(body), { log, limiter: open });

    expect(seen.map((violation) => violation.blocked)).toEqual(["inline"]);
  });
});

describe("handleCspReport quota", () => {
  it("is not used up by oversized bodies, non-reports or the ignored eval probe", async () => {
    const { seen, log } = collector();
    const limiter = createReportLimiter({ max: 1, windowMs: 60_000 });
    const probe = JSON.stringify([
      {
        body: {
          effectiveDirective: "script-src",
          blockedURL: "eval",
          documentURL: "https://watchdog.example.test/",
          sourceFile: "https://watchdog.example.test/assets/utils.js",
        },
      },
    ]);

    const noise = [
      post("a".repeat(CSP_REPORT_MAX_BYTES + 1)),
      post("garbage"),
      post(probe),
    ];
    for (const request of noise) {
      // oxlint-disable-next-line no-await-in-loop -- requests are sent in order
      await handleCspReport(request, { log, limiter });
    }
    const real = await handleCspReport(post(JSON.stringify(legacyReport)), {
      log,
      limiter,
    });

    expect(real.status).toBe(204);
    expect(seen).toHaveLength(1);
  });

  it("counts every violation of a batch against the quota", async () => {
    const { seen, log } = collector();
    const limiter = createReportLimiter({ max: 2, windowMs: 60_000 });
    const batch = JSON.stringify(
      Array.from({ length: 4 }, () => ({
        body: { effectiveDirective: "img-src", blockedURL: "inline" },
      }))
    );

    const response = await handleCspReport(post(batch), { log, limiter });

    expect(response.status).toBe(429);
    expect(seen).toHaveLength(2);
  });
});

describe("parseCspReports URL scrubbing", () => {
  it("drops the query and fragment of a relative value too", () => {
    const [violation] = parseCspReports(
      JSON.stringify({
        "csp-report": {
          "violated-directive": "img-src",
          "blocked-uri": "/cases?token=secret#frag",
        },
      })
    );

    expect(violation?.blocked).toBe("/cases");
  });
});

describe("createReportLimiter", () => {
  it("opens a new window once the old one has elapsed", () => {
    let now = 0;
    const limiter = createReportLimiter({
      max: 1,
      windowMs: 1000,
      now: () => now,
    });

    expect(limiter.take()).toBe(true);
    expect(limiter.take()).toBe(false);
    now = 1000;
    expect(limiter.take()).toBe(true);
  });
});
