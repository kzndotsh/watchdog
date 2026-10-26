import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { bindActivityInvalidation } from "@/shared/lib/activity-invalidation";

/**
 * Bind the organization's activity stream to the Query cache. Mount once, in
 * the signed-in shell: every entry (any Case) invalidates the slices it touches
 * and a `resync` invalidates everything, so no screen subscribes for
 * invalidation.
 */
export function useActivityInvalidation(): void {
  const queryClient = useQueryClient();
  useEffect(() => bindActivityInvalidation(queryClient), [queryClient]);
}
