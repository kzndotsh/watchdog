import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { updateEntityFieldsFn } from "@/domains/entities/entities.functions";
import { buildUpdateEntityFieldsData } from "@/domains/entities/lib/entity-write";
import { couldnt, errMessage } from "@/lib/utils";
import { useStaleVersionToast } from "@/shared/hooks/use-stale-version-toast";
import { scopeCaseSlug } from "@/shared/lib/query-ingress";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";

export type SaveEntityProseVariables = DossierEntityScope & {
  /** The Entity's `version` when the editor opened; the save fails as stale if it moved on. */
  expectedVersion: number;
  patch: { summary?: string | null; notes?: string | null };
};

/** Save an Entity's summary or notes, seed its detail cache, then settle its Entity caches. */
export function useSaveEntityProse({
  onError,
  onReload,
}: { onError?: (message: string) => void; onReload?: () => void } = {}) {
  const queryClient = useQueryClient();
  const notifyStale = useStaleVersionToast();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({
      caseId,
      entityId,
      expectedVersion,
      patch,
    }: SaveEntityProseVariables) =>
      updateEntityFieldsFn({
        data: buildUpdateEntityFieldsData(caseId, {
          entityId,
          expectedVersion,
          ...patch,
        }),
      }),
    onSuccess: async (next, { caseId, entityId, entitySlug }) => {
      const { scoped } = scopeCaseSlug(caseId, entitySlug);
      queryClient.setQueryData(
        entitiesKeys.detail(scoped.caseId, scoped.slug),
        next
      );
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
    },
    onError: (caughtError, { caseId, entityId, entitySlug }) => {
      notifyStale(caughtError, {
        noun: "entity",
        caseId,
        entityId,
        entitySlug,
        onReload,
      });
      onError?.(errMessage(caughtError, couldnt("save", "entity")));
    },
  });
}
