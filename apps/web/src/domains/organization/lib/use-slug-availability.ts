import { useEffect, useState } from "react";

import { authClient } from "@/auth/client";

export type SlugAvailability = "idle" | "checking" | "available" | "taken";

const DEBOUNCE_MS = 400;

/** Cleanup for the skipped case: nothing was started. */
function noop(): void {
  return undefined;
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
  const [result, setResult] = useState<{
    slug: string;
    taken: boolean;
  } | null>(null);

  useEffect(() => {
    if (skip) return noop;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { error } = await authClient.organization.checkSlug({
            slug: trimmed,
          });
          if (!cancelled) setResult({ slug: trimmed, taken: Boolean(error) });
        } catch {
          if (!cancelled) setResult(null);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [skip, trimmed]);

  if (skip) return "idle";
  if (result?.slug !== trimmed) return "checking";
  return result.taken ? "taken" : "available";
}
