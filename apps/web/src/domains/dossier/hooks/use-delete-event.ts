import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { deleteEventFn } from "@/domains/entities/events/events.functions";
import { couldnt, errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { eventScopeInputSchema } from "@watchdog/schemas/graph";

export type DeleteEventVariables = DossierEntityScope & { eventId: string };

/** Delete a timeline Event, then settle its Entity caches. */
export function useDeleteEvent({
  onError,
}: { onError?: (message: string) => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({ caseId, eventId }: DeleteEventVariables) =>
      deleteEventFn({
        data: eventScopeInputSchema.parse({ caseId, eventId }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Event deleted");
    },
    onError: (caughtError) => {
      onError?.(errMessage(caughtError, couldnt("delete", "event")));
    },
  });
}
