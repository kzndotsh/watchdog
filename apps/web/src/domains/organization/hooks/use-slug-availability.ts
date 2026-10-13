import { useQuery } from "@tanstack/react-query";

import { slugTakenQuery } from "@/domains/organization/queries";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { SLUG_CHECK_DEBOUNCE_MS } from "@/shared/lib/debounce";

export type SlugAvailability = "idle" | "checking" | "available" | "taken";

/**
 * Debounced `checkSlug`. `current` is the slug the organization already has: it is never
 * reported as taken. An empty slug stays `idle` (the server derives one from the name).
 */
export function useSlugAvailability(
  slug: string,
  current?: string
): SlugAvailability {
  const trimmed = slug.trim();
  const skip = trimmed === "" || trimmed === current;
  const { isSettled } = useDebouncedValue(trimmed, SLUG_CHECK_DEBOUNCE_MS, "");

  const { data: taken, isError } = useQuery({
    ...slugTakenQuery(trimmed),
    enabled: !skip && isSettled,
  });

  if (skip) return "idle";
  if (!isSettled || (taken === undefined && !isError)) return "checking";
  if (isError) return "idle";
  return taken ? "taken" : "available";
}
