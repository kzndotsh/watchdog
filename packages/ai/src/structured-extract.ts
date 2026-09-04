import { generateText, Output, type LanguageModel } from "ai";
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

function mapExtractCatch(error: unknown): StructuredExtractTag {
  if (error instanceof RateLimitedOutputError) return error;
  if (error instanceof InvalidOutputError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/\b429\b|rate.?limit/i.test(message)) {
    return new RateLimitedOutputError({ reason: message });
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

      if (result.output === null || result.output === undefined) {
        throw new InvalidOutputError({
          reason: "structuredExtract: model returned no output object",
        });
      }

      const usage = {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      };

      return { object: input.schema.parse(result.output), usage };
    },
    catch: mapExtractCatch,
  });
}
