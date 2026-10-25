import { z } from "zod";

import {
  waybackBoundsOrdered,
  waybackBoundTimestamp,
  type WaybackBoundEdge,
} from "@watchdog/tools/wayback";

const BOUND_HINT = "Use YYYY, YYYY-MM or YYYY-MM-DD";

/** A blank form field is an absent bound. */
function blankToUndefined(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function boundSchema(edge: WaybackBoundEdge, label: string) {
  return z.preprocess(
    blankToUndefined,
    z
      .string()
      .refine(
        (value) => waybackBoundTimestamp(value, edge) !== null,
        BOUND_HINT
      )
      .describe(`${label} (YYYY, YYYY-MM or YYYY-MM-DD)`)
      .optional()
  );
}

/** `after`: inclusive from the start of the period. */
export const waybackAfterSchema = boundSchema("after", "Captured on or after");

/** `before`: inclusive to the end of the period. */
export const waybackBeforeSchema = boundSchema(
  "before",
  "Captured on or before"
);

/** The object-level check: `after` may not be later than `before`. */
export function afterNotLaterThanBefore(input: {
  after?: string | undefined;
  before?: string | undefined;
}): boolean {
  return waybackBoundsOrdered(input.after, input.before);
}

export const AFTER_BEFORE_MESSAGE = "after must not be later than before";
