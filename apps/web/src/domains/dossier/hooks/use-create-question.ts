import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { createQuestionFn } from "@/domains/entities/questions/questions.functions";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { createQuestionInputSchema } from "@watchdog/schemas/graph";

export type CreateQuestionVariables = DossierEntityScope & { text: string };

/** Add an Open Question to an Entity, then settle its Entity caches. */
export function useCreateQuestion({
  onCreated,
}: { onCreated?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({ caseId, entityId, text }: CreateQuestionVariables) =>
      createQuestionFn({
        data: createQuestionInputSchema.parse({ caseId, entityId, text }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onCreated?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Question added");
    },
  });
}
