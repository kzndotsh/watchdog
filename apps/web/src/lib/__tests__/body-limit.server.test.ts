import { describe, expect, it } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

import {
  PAYLOAD_TOO_LARGE_CODE,
  enforceBodyLimit,
  payloadTooLargeResponse,
} from "../body-limit.server";

const TARGET = testHttpOrigin("watchdog.example.test", "/api/v1/cases");
const MAX = 100;

/** Node needs `duplex` to send a stream body; the DOM `RequestInit` type does not list it. */
const HALF_DUPLEX = { duplex: "half" } as const;

/** A POST whose body streams in `chunks` with no declared length. */
function chunked(chunks: Uint8Array[]): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request(TARGET, { method: "POST", body, ...HALF_DUPLEX });
}

function declared(size: number, length: number): Request {
  return new Request(TARGET, {
    method: "POST",
    body: new Uint8Array(size),
    headers: { "content-length": String(length) },
  });
}

describe("enforceBodyLimit", () => {
  it("passes a request with no body through untouched", async () => {
    const request = new Request(TARGET);
    expect(await enforceBodyLimit(request, MAX)).toBe(request);
  });

  it("accepts a declared length of exactly the limit", async () => {
    const request = declared(MAX, MAX);
    expect(await enforceBodyLimit(request, MAX)).toBe(request);
  });

  it("refuses a declared length over the limit with a 413 and a stable code", async () => {
    const result = await enforceBodyLimit(declared(MAX + 1, MAX + 1), MAX);
    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      defined: false,
      code: "PAYLOAD_TOO_LARGE",
      status: 413,
      message: "Request body too large",
      data: { code: PAYLOAD_TOO_LARGE_CODE, maxBytes: MAX },
    });
  });

  it("refuses a declared length over the limit without reading the body", async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled = true;
        controller.enqueue(new Uint8Array(1));
      },
    });
    const request = new Request(TARGET, {
      method: "POST",
      body,
      ...HALF_DUPLEX,
      headers: { "content-length": String(MAX + 1) },
    });
    const result = await enforceBodyLimit(request, MAX);
    expect((result as Response).status).toBe(413);
    expect(pulled).toBe(false);
  });

  it("accepts an undeclared (chunked) body of exactly the limit and hands it on intact", async () => {
    const result = await enforceBodyLimit(
      chunked([new Uint8Array(60).fill(1), new Uint8Array(40).fill(2)]),
      MAX
    );
    expect(result).toBeInstanceOf(Request);
    const bytes = new Uint8Array(await (result as Request).arrayBuffer());
    expect(bytes).toHaveLength(MAX);
    expect(bytes[0]).toBe(1);
    expect(bytes[MAX - 1]).toBe(2);
  });

  it("refuses an undeclared (chunked) body one byte over the limit", async () => {
    const result = await enforceBodyLimit(
      chunked([new Uint8Array(60), new Uint8Array(41)]),
      MAX
    );
    expect((result as Response).status).toBe(413);
  });

  it("stops reading an endless undeclared body", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(50));
      },
    });
    const request = new Request(TARGET, {
      method: "POST",
      body,
      ...HALF_DUPLEX,
    });
    const result = await enforceBodyLimit(request, MAX);
    expect((result as Response).status).toBe(413);
    expect(pulls).toBeLessThan(10);
  });

  it("never limits a GET, HEAD or OPTIONS", async () => {
    const requests = ["GET", "HEAD", "OPTIONS"].map(
      (method) =>
        new Request(TARGET, {
          method,
          headers: { "content-length": String(MAX * 10) },
        })
    );
    const results = await Promise.all(
      requests.map(async (request) => enforceBodyLimit(request, MAX))
    );
    expect(results).toEqual(requests);
    for (const [index, request] of requests.entries()) {
      expect(results[index]).toBe(request);
    }
  });

  it("defaults to the schemas limit", async () => {
    const { REQUEST_BODY_MAX_BYTES } = await import("@watchdog/schemas/shared");
    const over = declared(1, REQUEST_BODY_MAX_BYTES + 1);
    expect(((await enforceBodyLimit(over)) as Response).status).toBe(413);
    const at = declared(1, REQUEST_BODY_MAX_BYTES);
    expect(await enforceBodyLimit(at)).toBe(at);
  });
});

describe("payloadTooLargeResponse", () => {
  it("is JSON, uncacheable and carries the limit", async () => {
    const response = payloadTooLargeResponse(7);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body: { data: { maxBytes: number } } = await response.json();
    expect(body.data.maxBytes).toBe(7);
  });
});
