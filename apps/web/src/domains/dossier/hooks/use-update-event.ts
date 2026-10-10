import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { TimelineEventValues } from "@/domains/dossier/hooks/use-create-event";
import type { DossierEntityScope } from "@/domains/dossier/types";
import { updateEventFn } from "@/domains/entities/events/events.functions";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { updateEventInputSchema } from "@watchdog/schemas/graph";

export type UpdateEventVariables = DossierEntityScope & {
  eventId: string;
  value: TimelineEventValues;
};

/** Edit a timeline Event, then settle its Entity caches. */
export function useUpdateEvent({ onUpdated }: { onUpdated?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({ caseId, eventId, value }: UpdateEventVariables) =>
      updateEventFn({
        data: updateEventInputSchema.parse({
          caseId,
          eventId,
          when: value.when,
          what: value.what,
          where: value.where,
        }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onUpdated?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Event updated");
    },
  });
}
