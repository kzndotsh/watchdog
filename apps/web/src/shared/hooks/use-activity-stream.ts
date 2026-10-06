import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { bindActivityInvalidation } from "@/shared/lib/activity-invalidation";
import { subscribeActivityStream } from "@/shared/lib/activity-stream";
import type { ActivityEntry } from "@watchdog/schemas/feed";

/**
 * Bind the organization's activity stream to the Query cache. Mount once, in
 * the signed-in shell: every entry (any Case) invalidates the slices it touches
 * and a `resync` invalidates everything, so no screen subscribes for
 * invalidation. Screens that do more than refetch use `useActivityEntries`.
 */
export function useActivityInvalidation(): void {
  const queryClient = useQueryClient();
  useEffect(() => bindActivityInvalidation(queryClient), [queryClient]);
}

/**
 * Run `onEntry` for each activity entry of the organization, on the same single
 * connection (this opens no second one). For a side effect beyond cache
 * invalidation, such as resetting a filter; filter by `entry.caseId` or
 * `entry.kind` in the callback.
 */
export function useActivityEntries(
  onEntry: (entry: ActivityEntry) => void
): void {
  const handleEntry = useEffectEvent(onEntry);
  useEffect(() => subscribeActivityStream({ onEntry: handleEntry }), []);
}
