import { Effect, Result } from "effect";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  InvalidOutputError,
  RateLimitedOutputError,
  structuredExtractEffect,
} from "../structured-extract";

const { generateText } = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText,
  };
});

const schema = z.object({ answer: z.string() });
const model = {} as import("ai").LanguageModel;

describe("structuredExtract error mapping", () => {
  it("maps HTTP 429 provider errors to RateLimitedOutputError", async () => {
    const { StreamProviderError } = await import("ai");
    generateText.mockRejectedValue(
      new StreamProviderError({
        message: "Too Many Requests",
        statusCode: 429,
        isRetryable: true,
      })
    );

    const outcome = await Effect.runPromise(
      Effect.result(
        structuredExtractEffect({
          model,
          schema,
          prompt: "test",
        })
      )
    );

    expect(Result.isFailure(outcome)).toBe(true);
    if (Result.isFailure(outcome)) {
      expect(outcome.failure).toBeInstanceOf(RateLimitedOutputError);
    }
  });

  it("maps abort errors to InvalidOutputError", async () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    generateText.mockRejectedValue(abort);

    const outcome = await Effect.runPromise(
      Effect.result(
        structuredExtractEffect({
          model,
          schema,
          prompt: "test",
        })
      )
    );

    expect(Result.isFailure(outcome)).toBe(true);
    if (Result.isFailure(outcome)) {
      expect(outcome.failure).toBeInstanceOf(InvalidOutputError);
      expect(outcome.failure.reason).toMatch(/^aborted:/);
    }
  });

  it("maps TimeoutError without Error prototype to InvalidOutputError", async () => {
    generateText.mockRejectedValue({
      name: "TimeoutError",
      message: "timed out",
    });

    const outcome = await Effect.runPromise(
      Effect.result(
        structuredExtractEffect({
          model,
          schema,
          prompt: "test",
        })
      )
    );

    expect(Result.isFailure(outcome)).toBe(true);
    if (Result.isFailure(outcome)) {
      expect(outcome.failure).toBeInstanceOf(InvalidOutputError);
      expect(outcome.failure.reason).toBe("aborted: timed out");
    }
  });

  it("maps NoObjectGeneratedError to InvalidOutputError with model text", async () => {
    const { NoObjectGeneratedError } = await import("ai");
    generateText.mockRejectedValue(
      new NoObjectGeneratedError({
        message: "No object generated",
        text: '{"partial":true}',
        response: {},
        usage: {},
        cause: new Error("schema mismatch"),
      })
    );

    const outcome = await Effect.runPromise(
      Effect.result(
        structuredExtractEffect({
          model,
          schema,
          prompt: "test",
        })
      )
    );

    expect(Result.isFailure(outcome)).toBe(true);
    if (Result.isFailure(outcome)) {
      expect(outcome.failure).toBeInstanceOf(InvalidOutputError);
      expect(outcome.failure.reason).toContain("No object generated");
      expect(outcome.failure.reason).toContain('text={"partial":true}');
      expect(outcome.failure.reason).toContain("schema mismatch");
    }
  });
});
