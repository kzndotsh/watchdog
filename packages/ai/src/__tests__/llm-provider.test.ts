import { describe, expect, it } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

import { llmProviderConfigSchema } from "../llm-provider.ts";

describe("llmProviderConfigSchema", () => {
  it("accepts anthropic and openai_compat shapes", () => {
    expect(
      llmProviderConfigSchema.parse({
        kind: "anthropic",
        apiKey: "sk-test",
        model: "claude-sonnet-4-6",
      }).kind
    ).toBe("anthropic");
    expect(
      llmProviderConfigSchema.parse({
        kind: "openai_compat",
        apiKey: "sk-test",
        baseUrl: testHttpOrigin("127.0.0.1:4000", "/v1"),
        model: "gpt-4o",
      }).kind
    ).toBe("openai_compat");
  });

  it("trims padded openai_compat baseUrl", () => {
    expect(
      llmProviderConfigSchema.parse({
        kind: "openai_compat",
        apiKey: "sk-test",
        baseUrl: `  ${testHttpOrigin("127.0.0.1:4000", "/v1")}  `,
        model: "gpt-4o",
      }).baseUrl
    ).toBe(testHttpOrigin("127.0.0.1:4000", "/v1"));
  });

  it("rejects a missing discriminator", () => {
    expect(
      llmProviderConfigSchema.safeParse({
        apiKey: "sk-test",
        model: "x",
      }).success
    ).toBe(false);
  });

  it("rejects whitespace-only apiKey and model", () => {
    expect(
      llmProviderConfigSchema.safeParse({
        kind: "anthropic",
        apiKey: "   ",
        model: "claude-sonnet-4-6",
      }).success
    ).toBe(false);
    expect(
      llmProviderConfigSchema.safeParse({
        kind: "anthropic",
        apiKey: "sk-test",
        model: "   ",
      }).success
    ).toBe(false);
  });
});
