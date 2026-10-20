import { describe, expect, it } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

import {
  CLIENT_ERROR_MAX_BYTES,
  handleClientError,
  parseClientError,
  type ClientErrorReport,
} from "../client-errors.server";

const URL_ = testHttpOrigin("watchdog.example.test", "/api/client-errors");

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: "POST",
    body,
    headers: { "sec-fetch-site": "same-origin", ...headers },
  });
}

function collector() {
  const seen: ClientErrorReport[] = [];
  return { seen, log: (report: ClientErrorReport) => void seen.push(report) };
}

const open = { take: () => true };
const body = JSON.stringify({
  kind: "render",
  name: "TypeError",
  message: "x is not a function",
  stack: "TypeError: x\n    at a (https://wd.example.test/a.js:1:1)",
  page: "https://wd.example.test/cases/abc?token=secret#frag",
});

describe("parseClientError", () => {
  it("keeps short fields and only the page path (no query or fragment)", () => {
    expect(parseClientError(body)).toMatchObject({
      kind: "render",
      name: "TypeError",
      message: "x is not a function",
      page: "/cases/abc",
    });
  });

  it("truncates long fields", () => {
    const parsed = parseClientError(
      JSON.stringify({ message: "m".repeat(5000), stack: "s".repeat(9000) })
    );
    expect(parsed?.message).toHaveLength(1000);
    expect(parsed?.stack).toHaveLength(4000);
  });

  it("rejects what is not a report", () => {
    expect(parseClientError("not json")).toBeNull();
    expect(parseClientError("[]")).toBeNull();
    expect(parseClientError(JSON.stringify({ kind: "x" }))).toBeNull();
  });
});

describe("handleClientError", () => {
  it("logs a same-origin report and answers 204 with an empty body", async () => {
    const { seen, log } = collector();
    const response = await handleClientError(
      post(body, { "sec-fetch-site": "same-origin" }),
      { log, limiter: open }
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(seen).toHaveLength(1);
  });

  it("refuses a cross-site post", async () => {
    const { seen, log } = collector();
    const response = await handleClientError(
      post(body, { "sec-fetch-site": "cross-site" }),
      { log, limiter: open }
    );
    expect(response.status).toBe(403);
    expect(seen).toEqual([]);
  });

  it("with no Sec-Fetch-Site, accepts only an Origin that is this app's own", async () => {
    const host = new URL(URL_).host;
    const noFetchMetadata = (headers: Record<string, string>) =>
      new Request(URL_, {
        method: "POST",
        body,
        headers: { ...headers },
      });
    const { seen, log } = collector();

    const none = await handleClientError(noFetchMetadata({}), {
      log,
      limiter: open,
    });
    const foreign = await handleClientError(
      noFetchMetadata({ origin: "https://evil.example.test" }),
      { log, limiter: open }
    );
    const own = await handleClientError(
      noFetchMetadata({ origin: `https://${host}` }),
      { log, limiter: open }
    );

    expect([none.status, foreign.status, own.status]).toEqual([403, 403, 204]);
    expect(seen).toHaveLength(1);
  });

  it("refuses an oversized body", async () => {
    const { seen, log } = collector();
    const response = await handleClientError(
      post("x".repeat(CLIENT_ERROR_MAX_BYTES + 1)),
      { log, limiter: open }
    );
    expect(response.status).toBe(413);
    expect(seen).toEqual([]);
  });

  it("rate limits with 429", async () => {
    const { seen, log } = collector();
    const response = await handleClientError(post(body), {
      log,
      limiter: { take: () => false },
    });
    expect(response.status).toBe(429);
    expect(seen).toEqual([]);
  });

  it("answers 204 for a body that is not a report, and logs nothing", async () => {
    const { seen, log } = collector();
    const response = await handleClientError(post("nope"), {
      log,
      limiter: open,
    });
    expect(response.status).toBe(204);
    expect(seen).toEqual([]);
  });
});
