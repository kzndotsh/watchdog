import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ENRICHED_MD_ARTIFACT } from "@watchdog/schemas";
import { createCapRunHarness, runCap, testId } from "@watchdog/test-kit";
import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";

import { urlEnrich } from "../cap.ts";

describe("network.url.enrich run", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it("uploads live markdown when Wayback CDX is empty", async () => {
    mockServer.use(
      http.get("https://mailhost.test/live", () =>
        HttpResponse.text("<html><title>Ada</title><p>Hello</p></html>", {
          headers: { "content-type": "text/html" },
        })
      ),
      http.get(/https:\/\/web\.archive\.org\/cdx\/search\/cdx/, () =>
        HttpResponse.json([])
      )
    );
    const harness = createCapRunHarness();
    const result = await runCap(
      urlEnrich.run({
        ...harness.ctx,
        input: { url: "https://mailhost.test/live", entityId: testId(20) },
      })
    );
    expect(
      result.artifacts.some((row) => row.name === ENRICHED_MD_ARTIFACT)
    ).toBe(true);
    const markdown = harness.artifacts.find(
      (row) => row.name === ENRICHED_MD_ARTIFACT
    );
    expect(markdown).toBeDefined();
    if (markdown === undefined) {
      throw new TypeError("expected enriched.md");
    }
    expect(new TextDecoder().decode(markdown.bytes)).toMatch(/Ada/);
  });
});
