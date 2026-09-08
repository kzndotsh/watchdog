import { entitySlugSchema, nonEmptyTrimmed } from "@watchdog/schemas";

/** Trim a route path segment; undefined when blank after trim. */
export function normalizeRouteSegment(raw: string): string | undefined {
  const parsed = nonEmptyTrimmed.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Normalize an entity/case slug for lookup; slugifies display-style names. */
export function normalizeEntitySlug(raw: string): string | undefined {
  const parsed = entitySlugSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
