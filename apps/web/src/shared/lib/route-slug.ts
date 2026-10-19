import {
  NAME_MAX,
  entitySlugSchema,
  requiredText,
} from "@watchdog/schemas/shared";

/** Trim a route path segment; undefined when blank after trim. */
export function normalizeRouteSegment(raw: string): string | undefined {
  const parsed = requiredText(NAME_MAX).safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Normalize an entity/case slug for lookup; slugifies display-style names. */
export function normalizeEntitySlug(raw: string): string | undefined {
  const parsed = entitySlugSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
