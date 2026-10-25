import { generateText } from "ai";
import { describe, expect, it, vi } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

import { createWatchdogModel } from "../provider";

describe("createWatchdogModel", () => {
  it("returns a model for anthropic", () => {
    const model = createWatchdogModel({
      kind: "anthropic",
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
    });
    expect(model).toBeTruthy();
  });

  it("returns a model for openai_compat", () => {
    const model = createWatchdogModel({
      kind: "openai_compat",
      apiKey: "sk-test",
      baseUrl: testHttpOrigin("127.0.0.1:4000", "/v1"),
      model: "gpt-4o",
    });
    expect(model).toBeTruthy();
  });

  it("sends every request through the fetch it is given", async () => {
    const urls: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      urls.push(new URL(input instanceof Request ? input.url : input).href);
      return new Response("{}", { status: 500 });
    });
    const base = testHttpOrigin("127.0.0.1:4000", "/v1");
    const models = [
      createWatchdogModel(
        { kind: "anthropic", apiKey: "sk-test", model: "claude-sonnet-4-6" },
        { fetch }
      ),
      createWatchdogModel(
        { kind: "openai_compat", apiKey: "sk-test", baseUrl: base, model: "m" },
        { fetch }
      ),
    ];

    for (const model of models) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: the stub records in order
      await expect(
        generateText({ model, prompt: "hi", maxRetries: 0 })
      ).rejects.toThrow();
    }

    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/^https:\/\/api\.anthropic\.com\//);
    expect(urls[1]).toMatch(new RegExp(`^${base}/`));
  });

  it("rejects invalid provider config", () => {
    expect(() =>
      createWatchdogModel({
        kind: "openai_compat",
        apiKey: "sk-test",
        baseUrl: "not-a-url",
        model: "gpt-4o",
      })
    ).toThrow();
  });
});
