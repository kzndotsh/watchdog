import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";
import {
  RateLimitedError,
  ValidationVendorError,
} from "@watchdog/tools/errors";
import {
  waybackHistorySnapshotSchema,
  type WaybackHistorySnapshot,
} from "@watchdog/tools/wayback";

import { createCapRunHarness, runCap } from "../../../testing";
import { pageHistoryInput } from "../input";
import { runPageHistory } from "../run";

const URL_ = "https://example.com/page";
const HEADER = [
  "timestamp",
  "original",
  "statuscode",
  "mimetype",
  "digest",
  "length",
];
const cdxRow = (timestamp: string, digest: string) => [
  timestamp,
  URL_,
  "200",
  "text/html",
  digest,
  "100",
];

const TOOLBAR =
  '<!-- BEGIN WAYBACK TOOLBAR INSERT --><div id="wm-ipp">toolbar</div><!-- END WAYBACK TOOLBAR INSERT -->';
const page = (title: string, body: string, furniture = "") =>
  `<html><head><title>${title}</title></head><body>${furniture}${body}</body></html>`;

type Capture = Response | ((ts: string) => Response);

/** Serves CDX rows and the `id_` captures, and records what was requested. */
function serveWayback(opts: {
  rows: string[][];
  captures: Record<string, Capture>;
  /** CDX answers with a resume key (the listing was cut). */
  cdxTail?: unknown[][];
}) {
  const cdxQueries: URLSearchParams[] = [];
  const captureUrls: string[] = [];
  mockServer.use(
    http.get(/https:\/\/web\.archive\.org\/cdx\/search\/cdx/, ({ request }) => {
      const params = new URL(request.url).searchParams;
      cdxQueries.push(params);
      if (params.get("collapse") !== "digest") {
        return HttpResponse.json([
          ["timestamp"],
          ...opts.rows.map((r) => [r[0]]),
        ]);
      }
      const limit = Number(params.get("limit"));
      return HttpResponse.json([HEADER, ...opts.rows.slice(0, limit)]);
    }),
    http.get(/https:\/\/web\.archive\.org\/web\//, ({ request }) => {
      captureUrls.push(request.url);
      const ts = /\/web\/(\d{14})id_\//.exec(request.url)?.[1] ?? "";
      const capture = opts.captures[ts];
      if (capture === undefined)
        return new HttpResponse("nope", { status: 404 });
      return typeof capture === "function" ? capture(ts) : capture.clone();
    })
  );
  return { cdxQueries, captureUrls };
}

const html = (body: string) =>
  new HttpResponse(body, { headers: { "content-type": "text/html" } });

async function run(input: Record<string, unknown>) {
  const parsed = pageHistoryInput.parse({ url: URL_, ...input });
  const harness = createCapRunHarness({ input: parsed });
  const result = await runCap(runPageHistory(harness.ctx, { delayMs: 0 }));
  const reportBytes = harness.artifacts.find(
    (a) => a.name === REPORT_JSON_ARTIFACT
  )?.bytes;
  const report: WaybackHistorySnapshot | undefined =
    reportBytes === undefined
      ? undefined
      : waybackHistorySnapshotSchema.parse(
          JSON.parse(new TextDecoder().decode(reportBytes))
        );
  const stored = (name: string) => {
    const bytes = harness.artifacts.find((a) => a.name === name)?.bytes;
    return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
  };
  return { result, report, harness, stored };
}

async function failureOf(input: Record<string, unknown>): Promise<unknown> {
  return run(input).then(
    () => undefined,
    (error: unknown) => error
  );
}

describe("archive.page.history run", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it("stores each distinct version, strips the toolbar and summarizes the changes", async () => {
    const seen = serveWayback({
      rows: [
        cdxRow("20190101000000", "D1"),
        cdxRow("20200101000000", "D2"),
        cdxRow("20210101000000", "D3"),
      ],
      captures: {
        "20190101000000": html(page("Ada", "<p>one</p><p>two</p>", TOOLBAR)),
        "20200101000000": html(page("Ada", "<p>one</p><p>three</p>")),
        "20210101000000": html(
          page("Ada Lovelace", "<p>one</p><p>three</p><p>four</p>")
        ),
      },
    });
    const { result, report, stored } = await run({});

    // `id_` mode: the raw capture, never the toolbar-wrapped page.
    expect(seen.captureUrls).toEqual([
      `https://web.archive.org/web/20190101000000id_/${URL_}`,
      `https://web.archive.org/web/20200101000000id_/${URL_}`,
      `https://web.archive.org/web/20210101000000id_/${URL_}`,
    ]);
    // The version list is the collapsed CDX listing, one row past the limit to detect more.
    expect(seen.cdxQueries[0]?.get("collapse")).toBe("digest");
    expect(seen.cdxQueries[0]?.get("limit")).toBe("11");

    expect(report?.versions.map((v) => v.timestamp)).toEqual([
      "20190101000000",
      "20200101000000",
      "20210101000000",
    ]);
    expect(report?.totalCaptures).toBe(3);
    expect(report?.isTruncated).toBe(false);
    expect(report?.failed).toEqual([]);

    const [first, second, third] = report?.versions ?? [];
    expect(first?.change).toBeNull();
    expect(first?.title).toBe("Ada");
    expect(first?.digest).toBe("D1");
    expect(first?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second?.change).toMatchObject({
      titleChanged: false,
      linesAdded: 1,
      linesRemoved: 1,
      sampleAdded: ["three"],
      sampleRemoved: ["two"],
    });
    expect(third?.change).toMatchObject({
      titleChanged: true,
      previousTitle: "Ada",
      linesAdded: 1,
      linesRemoved: 0,
    });

    // Each version is an artifact, stripped of the toolbar; plus report.json and the summary.
    const names = result.artifacts.map((a) => a.name);
    expect(names).toEqual(
      expect.arrayContaining([
        REPORT_JSON_ARTIFACT,
        "page-history.json",
        "page-20190101000000.html",
        "page-20200101000000.html",
        "page-20210101000000.html",
      ])
    );
    expect(stored("page-20190101000000.html")).toContain("<p>one</p>");
    expect(stored("page-20190101000000.html")).not.toMatch(
      /wm-ipp|WAYBACK TOOLBAR/
    );
  });

  it("drops a version whose stored content matches an earlier one although its digest differs", async () => {
    serveWayback({
      rows: [
        cdxRow("20190101000000", "D1"),
        cdxRow("20200101000000", "D2"),
        cdxRow("20210101000000", "D3"),
      ],
      captures: {
        // Same page; the second only differs by the toolbar the archive wrapped it in.
        "20190101000000": html(page("Ada", "<p>same</p>")),
        "20200101000000": html(page("Ada", "<p>same</p>", TOOLBAR)),
        "20210101000000": html(page("Ada", "<p>different</p>")),
      },
    });
    const { result, report } = await run({});
    expect(report?.versions.map((v) => v.timestamp)).toEqual([
      "20190101000000",
      "20210101000000",
    ]);
    expect(report?.duplicates).toEqual([
      {
        timestamp: "20200101000000",
        digest: "D2",
        duplicateOf: "20190101000000",
      },
    ]);
    expect(result.artifacts.map((a) => a.name)).not.toContain(
      "page-20200101000000.html"
    );
    // The change is against the last stored version, not the dropped duplicate.
    expect(report?.versions[1]?.change).toMatchObject({
      linesAdded: 1,
      linesRemoved: 1,
    });
  });

  it("fetches at most maxVersions and says more exist", async () => {
    const seen = serveWayback({
      rows: [
        cdxRow("20190101000000", "D1"),
        cdxRow("20200101000000", "D2"),
        cdxRow("20210101000000", "D3"),
      ],
      captures: {
        "20190101000000": html(page("A", "<p>1</p>")),
        "20200101000000": html(page("A", "<p>2</p>")),
        "20210101000000": html(page("A", "<p>3</p>")),
      },
    });
    const { report } = await run({ maxVersions: 2 });
    expect(seen.captureUrls).toHaveLength(2);
    expect(report?.versions).toHaveLength(2);
    expect(report?.versionsListed).toBe(2);
    expect(report?.isTruncated).toBe(true);
  });

  it("keeps the versions that were fetched and reports the ones that failed", async () => {
    serveWayback({
      rows: [
        cdxRow("20190101000000", "D1"),
        cdxRow("20200101000000", "D2"),
        cdxRow("20210101000000", "D3"),
      ],
      captures: {
        "20190101000000": html(page("A", "<p>1</p>")),
        "20200101000000": new HttpResponse("boom", { status: 500 }),
        "20210101000000": html(page("A", "<p>3</p>")),
      },
    });
    const { result, report } = await run({});
    expect(report?.versions.map((v) => v.timestamp)).toEqual([
      "20190101000000",
      "20210101000000",
    ]);
    expect(report?.failed).toEqual([
      { timestamp: "20200101000000", reason: "http_error", status: 500 },
    ]);
    expect(result.artifacts.map((a) => a.name)).toContain(
      "page-20210101000000.html"
    );
  });

  it("stops fetching after a 429 and names the skipped versions", async () => {
    const seen = serveWayback({
      rows: [
        cdxRow("20190101000000", "D1"),
        cdxRow("20200101000000", "D2"),
        cdxRow("20210101000000", "D3"),
      ],
      captures: {
        "20190101000000": html(page("A", "<p>1</p>")),
        "20200101000000": new HttpResponse("slow down", { status: 429 }),
        "20210101000000": html(page("A", "<p>3</p>")),
      },
    });
    const { report } = await run({});
    expect(seen.captureUrls).toHaveLength(2);
    expect(report?.versions.map((v) => v.timestamp)).toEqual([
      "20190101000000",
    ]);
    expect(report?.failed).toEqual([
      { timestamp: "20200101000000", reason: "rate_limited", status: 429 },
      {
        timestamp: "20210101000000",
        reason: "skipped_rate_limited",
        status: null,
      },
    ]);
  });

  it("fails as rate limited, not as an empty history, when nothing could be fetched", async () => {
    serveWayback({
      rows: [cdxRow("20190101000000", "D1")],
      captures: { "20190101000000": new HttpResponse("slow", { status: 429 }) },
    });
    const failure = await failureOf({});
    expect(failure).toBeInstanceOf(RateLimitedError);
  });

  it("fails when every fetch fails for another reason", async () => {
    serveWayback({
      rows: [cdxRow("20190101000000", "D1")],
      captures: { "20190101000000": new HttpResponse("gone", { status: 404 }) },
    });
    const failure = await failureOf({});
    expect(failure).toBeInstanceOf(ValidationVendorError);
    expect(String((failure as ValidationVendorError).cause)).toContain(
      "http_error"
    );
  });

  it("starts no fetch past the time budget", async () => {
    const seen = serveWayback({
      rows: [cdxRow("20190101000000", "D1")],
      captures: { "20190101000000": html(page("A", "<p>1</p>")) },
    });
    const parsed = pageHistoryInput.parse({ url: URL_ });
    const harness = createCapRunHarness({ input: parsed });
    const failure = await runCap(
      runPageHistory(harness.ctx, { delayMs: 0, startBudgetMs: -1 })
    ).then(
      () => undefined,
      (error: unknown) => error
    );
    expect(seen.captureUrls).toHaveLength(0);
    expect(failure).toBeInstanceOf(ValidationVendorError);
    expect(String((failure as ValidationVendorError).cause)).toContain(
      "skipped_time_budget"
    );
  });

  it("returns an empty history, without failing, when the range has no captures", async () => {
    serveWayback({ rows: [], captures: {} });
    const { report, result } = await run({ after: "1999", before: "1999" });
    expect(report?.versions).toEqual([]);
    expect(report?.failed).toEqual([]);
    expect(report?.after).toBe("1999");
    expect(result.artifacts.map((a) => a.name)).toEqual([
      REPORT_JSON_ARTIFACT,
      "page-history.json",
    ]);
  });
});
