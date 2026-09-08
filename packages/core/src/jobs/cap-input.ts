import { Effect } from "effect";
import type { z } from "zod";

import { parseCapJobInput, type JsonObject } from "@watchdog/schemas";

import { InvalidError, type DomainTag } from "../infra/tagged-errors";

export interface CapInputParser {
  input: z.ZodType;
}

/** Validate Cap input against its schema and normalize graph id fields. */
export function parseValidatedCapInputEffect(
  cap: CapInputParser,
  raw: unknown
): Effect.Effect<JsonObject, DomainTag> {
  const result = parseCapJobInput(cap.input, raw);
  if (!result.ok) {
    return Effect.fail(new InvalidError({ reason: result.message }));
  }
  return Effect.succeed(result.input);
}
