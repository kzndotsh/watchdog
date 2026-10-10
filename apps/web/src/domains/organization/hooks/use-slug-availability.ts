import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { slugTakenQuery } from "@/domains/organization/queries";

export type SlugAvailability = "idle" | "checking" | "available" | "taken";

const DEBOUNCE_MS = 400;

/**
 * `true` once `value` has stopped changing for `delayMs`. Every change of `value`,
 * including a return to an earlier one, starts the wait again.
 */
function useSettled(value: string, delayMs: number): boolean {
  const [state, setState] = useState({ input: "", settled: false });
  if (state.input !== value) setState({ input: value, settled: false });
  useEffect(() => {
    const timer = setTimeout(() => {
      setState({ input: value, settled: true });
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return state.input === value && state.settled;
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
  const settled = useSettled(trimmed, DEBOUNCE_MS);

  const { data: taken, isError } = useQuery({
    ...slugTakenQuery(trimmed),
    enabled: !skip && settled,
  });

  if (skip) return "idle";
  if (!settled || (taken === undefined && !isError)) return "checking";
  if (isError) return "idle";
  return taken ? "taken" : "available";
}
