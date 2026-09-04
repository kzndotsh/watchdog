import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { mockJson, mockServer } from "@watchdog/test-kit/http";

import { createWatchdogModel } from "../provider";
import { structuredExtractEffect } from "../structured-extract";

const draftSchema = z.object({
  identifiers: z.array(z.object({ type: z.string(), value: z.string() })),
  claims: z.array(z.object({ text: z.string() })),
});

describe("structuredExtract", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "bypass" });
  });

  afterEach(() => {
    mockServer.resetHandlers();
  });

  afterAll(() => {
    mockServer.close();
  });

  it("parses a JSON object from an openai-compat chat completion", async () => {
    mockJson(
      "http://127.0.0.1:4000/v1/chat/completions",
      {
        id: "chatcmpl-test",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                identifiers: [{ type: "email", value: "ada@example.com" }],
                claims: [{ text: "Ada observed a host" }],
              }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 },
      },
      { method: "post" }
    );

    const model = createWatchdogModel({
      kind: "openai_compat",
      apiKey: "sk-test",
      baseUrl: "http://127.0.0.1:4000/v1",
      model: "gpt-4o",
    });

    const extracted = await Effect.runPromise(
      structuredExtractEffect({
        model,
        schema: draftSchema,
        prompt: "extract",
      })
    );
    expect(extracted.object.identifiers).toEqual([
      { type: "email", value: "ada@example.com" },
    ]);
    expect(extracted.object.claims[0]?.text).toMatch(/Ada observed/);
  });

  it("rejects malformed JSON from the model", async () => {
    mockJson(
      "http://127.0.0.1:4000/v1/chat/completions",
      {
        id: "chatcmpl-bad",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "not-json{" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      { method: "post" }
    );

    const model = createWatchdogModel({
      kind: "openai_compat",
      apiKey: "sk-test",
      baseUrl: "http://127.0.0.1:4000/v1",
      model: "gpt-4o",
    });

    await expect(
      Effect.runPromise(
        structuredExtractEffect({
          model,
          schema: draftSchema,
          prompt: "extract",
        })
      )
    ).rejects.toThrow();
  });

  it("rejects output that fails the schema", async () => {
    mockJson(
      "http://127.0.0.1:4000/v1/chat/completions",
      {
        id: "chatcmpl-shape",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({ identifiers: "nope", claims: [] }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      { method: "post" }
    );

    const model = createWatchdogModel({
      kind: "openai_compat",
      apiKey: "sk-test",
      baseUrl: "http://127.0.0.1:4000/v1",
      model: "gpt-4o",
    });

    await expect(
      Effect.runPromise(
        structuredExtractEffect({
          model,
          schema: draftSchema,
          prompt: "extract",
        })
      )
    ).rejects.toThrow();
  });
});
