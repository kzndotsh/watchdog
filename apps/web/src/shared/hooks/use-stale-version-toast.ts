import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import {
  isStaleVersionError,
  staleVersionMessage,
} from "@/shared/lib/stale-version";
import { toast } from "@/shared/ui/toast";

export type StaleVersionTarget = {
  /** What was being edited, lower case: `claim`, `entity`, `connection`. */
  noun: string;
  caseId: string;
  entityId?: string;
  entitySlug?: string;
  /** Runs when the person chooses Reload, after the caches refetch (close the open editor). */
  onReload?: () => void;
};

/**
 * Handles an edit that lost to another writer (the API's `stale_version`, #307): a toast that says
 * the row "changed since you opened it" with a Reload action that refetches the Entity's caches
 * (`invalidateAfterEntityChanged`). Returns a function to call from a mutation's `onError`; it
 * answers `true` when it handled the error and `false` for any other failure, which the caller
 * still reports its own way.
 */
export function useStaleVersionToast(): (
  error: unknown,
  target: StaleVersionTarget
) => boolean {
  const queryClient = useQueryClient();
  return useCallback(
    (error, { noun, caseId, entityId, entitySlug, onReload }) => {
      if (!isStaleVersionError(error)) return false;
      toast.add({
        title: staleVersionMessage(noun),
        type: "error",
        actionProps: {
          children: "Reload",
          onClick: () => {
            onReload?.();
            void invalidateAfterEntityChanged(queryClient, caseId, {
              entityId,
              slug: entitySlug,
            });
          },
        },
      });
      return true;
    },
    [queryClient]
  );
}
