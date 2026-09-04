import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "@effect/vitest";
import { Effect } from "effect";

import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";

import { toolsHttpClientLayer } from "../http-client-layer";
import { fetchPageEnrichEffect } from "../page-enrich.ts";

describe("fetchPageEnrichEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it.effect("extracts the title from live HTML", () =>
    Effect.gen(function* fetchPageEnrichTitleGen() {
      mockServer.use(
        http.get("https://mailhost.test/page", () =>
          HttpResponse.text("<html><title>Ada</title></html>", {
            headers: { "content-type": "text/html" },
          })
        )
      );
      const snap = yield* fetchPageEnrichEffect(
        "https://mailhost.test/page",
        new AbortController().signal,
        { userAgent: "watchdog-test" }
      );
      expect(snap.title).toBe("Ada");
      expect(snap.ok).toBe(true);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
