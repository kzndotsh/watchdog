import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { slugTakenQuery } from "@/domains/organization/queries";

export type SlugAvailability = "idle" | "checking" | "available" | "taken";

const DEBOUNCE_MS = 400;

/** `value`, but only after it has stopped changing for `delayMs`; `""` until the first delay passes. */
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return debounced;
}

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
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const settled = debounced === trimmed;

  const { data: taken, isError } = useQuery({
    ...slugTakenQuery(debounced),
    enabled: !skip && settled,
  });

  if (skip) return "idle";
  if (!settled || (taken === undefined && !isError)) return "checking";
  if (isError) return "idle";
  return taken ? "taken" : "available";
}
