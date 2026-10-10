import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { deleteQuestionFn } from "@/domains/entities/questions/questions.functions";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { questionScopeInputSchema } from "@watchdog/schemas/graph";

export type DeleteQuestionVariables = DossierEntityScope & {
  questionId: string;
};

/** Delete a Question, then settle its Entity caches. */
export function useDeleteQuestion({
  onDeleted,
  onError,
}: {
  onDeleted?: () => void;
  onError?: (message: string) => void;
} = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({ caseId, questionId }: DeleteQuestionVariables) =>
      deleteQuestionFn({
        data: questionScopeInputSchema.parse({ caseId, questionId }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onDeleted?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Question deleted");
    },
    onError: (caughtError) => {
      onError?.(errMessage(caughtError, "Delete failed"));
    },
  });
}
