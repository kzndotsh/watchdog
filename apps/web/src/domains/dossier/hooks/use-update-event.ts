import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useStaleVersionToast } from "@/app/hooks/use-stale-version-toast";
import { invalidateAfterEntityChanged } from "@/app/lib/query-invalidation";
import type { TimelineEventValues } from "@/domains/dossier/hooks/use-create-event";
import type { DossierEntityScope } from "@/domains/dossier/types";
import { updateEventFn } from "@/domains/entities/events/events.functions";
import { toast } from "@/shared/ui/toast";
import { updateEventInputSchema } from "@watchdog/schemas/graph";

export type UpdateEventVariables = DossierEntityScope & {
  eventId: string;
  /** The Event's `version` when the editor opened; the save fails as stale if it moved on. */
  expectedVersion: number;
  value: TimelineEventValues;
};

/** Edit a timeline Event, then settle its Entity caches. */
export function useUpdateEvent({
  onUpdated,
  onReload,
}: { onUpdated?: () => void; onReload?: () => void } = {}) {
  const queryClient = useQueryClient();
  const notifyStale = useStaleVersionToast();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({
      caseId,
      eventId,
      expectedVersion,
      value,
    }: UpdateEventVariables) =>
      updateEventFn({
        data: updateEventInputSchema.parse({
          caseId,
          eventId,
          expectedVersion,
          when: value.when,
          what: value.what,
          where: value.where,
        }),
      }),
    onSuccess: async (_data, { caseId, entityId }) => {
      onUpdated?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
      });
      toast.success("Event updated");
    },
    onError: (caughtError, { caseId, entityId }) => {
      notifyStale(caughtError, {
        noun: "event",
        caseId,
        entityId,
        onReload,
      });
    },
  });
}
