import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";
import { toolsHttpClientLayer } from "@watchdog/tools";

import { ingestRemotePageEffect } from "../ingest-page.ts";

describe("ingestRemotePageEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it("converts live HTML into markdownish text", async () => {
    mockServer.use(
      http.get("https://mailhost.test/live", () =>
        HttpResponse.text("<html><title>Ada</title><p>Hello</p></html>", {
          headers: { "content-type": "text/html" },
        })
      )
    );
    const uploaded: string[] = [];
    const result = await Effect.runPromise(
      ingestRemotePageEffect({
        fetchUrl: "https://mailhost.test/live",
        linkBaseUrl: "https://mailhost.test/live",
        signal: new AbortController().signal,
        label: "live",
        uploadArtifact: ({ name }) => {
          const artName = name ?? "blob";
          uploaded.push(artName);
          return Effect.succeed({
            name: artName,
            mime: "text/plain",
            uri: `s3://${artName}`,
            sha256: "ab".repeat(32),
          });
        },
        log: () => {},
        allowPlainBinary: true,
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );
    expect(result.step.ok).toBe(true);
    expect(result.title).toBe("Ada");
    expect(result.text).toMatch(/Hello/);
    expect(uploaded.length).toBeGreaterThan(0);
  });
});
