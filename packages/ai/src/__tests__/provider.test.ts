import { describe, expect, it } from "vitest";

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
