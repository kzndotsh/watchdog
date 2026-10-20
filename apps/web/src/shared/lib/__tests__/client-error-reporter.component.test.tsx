import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHUNK_RELOAD_KEY } from "@/shared/lib/chunk-reload";
import {
  buildReportBody,
  installClientErrorHandlers,
  reportClientError,
  resetClientErrorReporter,
} from "@/shared/lib/client-error-reporter";

const SERVER_CAP = 8 * 1024;

function recorder() {
  const bodies: string[] = [];
  const send = vi.fn(
    async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(typeof init?.body === "string" ? init.body : "");
      return new Response(null, { status: 204 });
    }
  );
  return { bodies, send };
}

describe("buildReportBody", () => {
  it("keeps a long error under the server cap, even with multi-byte text", () => {
    const body = buildReportBody(
      "render",
      {
        name: "Error",
        message: "é".repeat(5000),
        stack: "𝒳".repeat(9000),
      },
      "/cases"
    );
    expect(new Blob([body]).size).toBeLessThan(SERVER_CAP);
    expect(JSON.parse(body)).toMatchObject({ kind: "render", page: "/cases" });
  });

  it("leaves a short error whole", () => {
    const body = buildReportBody(
      "error",
      { name: "TypeError", message: "m", stack: "s" },
      "/"
    );
    expect(JSON.parse(body)).toMatchObject({ message: "m", stack: "s" });
  });
});

describe("reportClientError", () => {
  beforeEach(() => {
    resetClientErrorReporter();
  });

  it("caps distinct reports in a window, then reports again once it slides past", () => {
    const { send, bodies } = recorder();
    for (let i = 0; i < 8; i += 1) {
      reportClientError(new Error(`e${i}`), "error", send, () => 0);
    }
    expect(bodies).toHaveLength(5);

    // a long-lived tab: five minutes later, new failures are reported again
    reportClientError(new Error("later"), "error", send, () => 5 * 60_000 + 1);
    expect(bodies).toHaveLength(6);
  });

  it("dedupes by message and stack inside the window, not by message alone", () => {
    const { send, bodies } = recorder();
    const a = new Error("same message");
    a.stack = "Error: same message\n    at a (/a.js:1:1)";
    const b = new Error("same message");
    b.stack = "Error: same message\n    at b (/b.js:2:2)";

    reportClientError(a, "error", send, () => 0);
    reportClientError(a, "error", send, () => 1000);
    reportClientError(b, "error", send, () => 2000);
    expect(bodies).toHaveLength(2);
  });
});

describe("vite:preloadError that cannot reload", () => {
  const chunkError = new TypeError(
    "Failed to fetch dynamically imported module: /assets/a.js"
  );

  beforeEach(() => {
    resetClientErrorReporter();
    window.sessionStorage.clear();
  });

  it("reports it and lets the error through to the boundary", () => {
    const { send, bodies } = recorder();
    vi.stubGlobal("fetch", send);
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    const stop = installClientErrorHandlers(window);

    const event = Object.assign(
      new Event("vite:preloadError", { cancelable: true }),
      { payload: chunkError }
    );
    window.dispatchEvent(event);
    stop();

    expect(event.defaultPrevented).toBe(false);
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({
      message: expect.stringContaining("dynamically imported module"),
    });
  });
});
