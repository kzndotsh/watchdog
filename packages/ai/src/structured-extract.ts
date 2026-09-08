import {
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  StreamProviderError,
  type LanguageModel,
} from "ai";
import { Data, Effect } from "effect";
import type { z } from "zod";

export class RateLimitedOutputError extends Data.TaggedError(
  "RateLimitedOutputError"
)<{
  readonly reason: string;
}> {}

export class InvalidOutputError extends Data.TaggedError("InvalidOutputError")<{
  readonly reason: string;
}> {}

export type StructuredExtractTag = RateLimitedOutputError | InvalidOutputError;

export interface StructuredExtractUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface StructuredExtractResult<T> {
  object: T;
  usage?: StructuredExtractUsage;
}

interface StructuredExtractInput<TSchema extends z.ZodType> {
  model: LanguageModel;
  schema: TSchema;
  instructions?: string;
  prompt: string;
  abortSignal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
}

function httpStatusCode(error: unknown): number | undefined {
  if (StreamProviderError.isInstance(error)) {
    return error.statusCode;
  }
  if (typeof error === "object" && error !== null) {
    const statusCode: unknown = Reflect.get(error, "statusCode");
    if (typeof statusCode === "number") return statusCode;
    const status: unknown = Reflect.get(error, "status");
    if (typeof status === "number") return status;
    const cause: unknown = Reflect.get(error, "cause");
    if (cause !== undefined && cause !== error) {
      return httpStatusCode(cause);
    }
  }
  return undefined;
}

function invalidObjectReason(error: NoObjectGeneratedError): string {
  const parts = [
    error.message || "structuredExtract: model returned invalid object",
  ];
  if (error.text) {
    parts.push(`text=${error.text.slice(0, 200)}`);
  }
  if (error.cause instanceof Error && error.cause.message) {
    parts.push(`cause=${error.cause.message}`);
  }
  return parts.join("; ");
}

function abortMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const message: unknown = Reflect.get(error, "message");
    if (typeof message === "string") return message;
  }
  return String(error);
}

function isAbortLike(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name: unknown = Reflect.get(error, "name");
  return name === "AbortError" || name === "TimeoutError";
}

function mapExtractCatch(error: unknown): StructuredExtractTag {
  if (error instanceof RateLimitedOutputError) return error;
  if (error instanceof InvalidOutputError) return error;
  if (NoOutputGeneratedError.isInstance(error)) {
    const suffix = error.message ? `: ${error.message}` : "";
    return new InvalidOutputError({
      reason: `structuredExtract: model returned no output object${suffix}`,
    });
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    return new InvalidOutputError({ reason: invalidObjectReason(error) });
  }
  const statusCode = httpStatusCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (statusCode === 429 || /\b429\b|rate.?limit/i.test(message)) {
    return new RateLimitedOutputError({ reason: message });
  }
  if (isAbortLike(error)) {
    return new InvalidOutputError({
      reason: `aborted: ${abortMessage(error)}`,
    });
  }
  return new InvalidOutputError({ reason: message });
}

export function structuredExtractEffect<TSchema extends z.ZodType>(
  input: StructuredExtractInput<TSchema>
): Effect.Effect<
  StructuredExtractResult<z.infer<TSchema>>,
  StructuredExtractTag
> {
  return Effect.tryPromise({
    try: async () => {
      const result = await generateText({
        model: input.model,
        instructions: input.instructions,
        prompt: input.prompt,
        abortSignal: input.abortSignal,
        temperature: input.temperature ?? 0,
        maxOutputTokens: input.maxOutputTokens,
        output: Output.object({ schema: input.schema }),
      });

      const usage = result.usage
        ? {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined;

      return { object: input.schema.parse(result.output), usage };
    },
    catch: mapExtractCatch,
  });
}
