import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { resolveQuestionFn } from "@/domains/entities/questions/questions.functions";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { resolveQuestionInputSchema } from "@watchdog/schemas/graph";

export type ResolveQuestionVariables = DossierEntityScope & {
  questionId: string;
  resolvedNote?: string;
};

/** Resolve an Open Question, then settle its Entity caches. */
export function useResolveQuestion({
  onResolved,
}: { onResolved?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({
      caseId,
      questionId,
      resolvedNote,
    }: ResolveQuestionVariables) =>
      resolveQuestionFn({
        data: resolveQuestionInputSchema.parse({
          caseId,
          questionId,
          resolvedNote,
        }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onResolved?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Question resolved");
    },
  });
}
