import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { createEventFn } from "@/domains/entities/events/events.functions";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { createEventInputSchema } from "@watchdog/schemas/graph";

export type TimelineEventValues = {
  when: string;
  what: string;
  where: string;
};

export type CreateEventVariables = DossierEntityScope & {
  value: TimelineEventValues;
};

/** Add a timeline Event to an Entity, then settle its Entity caches. */
export function useCreateEvent({ onCreated }: { onCreated?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({ caseId, entityId, value }: CreateEventVariables) =>
      createEventFn({
        data: createEventInputSchema.parse({
          caseId,
          entityId,
          when: value.when,
          what: value.what,
          where: value.where,
        }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onCreated?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Event added");
    },
  });
}
