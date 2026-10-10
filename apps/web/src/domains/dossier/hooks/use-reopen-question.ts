import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { reopenQuestionFn } from "@/domains/entities/questions/questions.functions";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { questionScopeInputSchema } from "@watchdog/schemas/graph";

export type ReopenQuestionVariables = DossierEntityScope & {
  questionId: string;
};

/** Reopen a resolved Question, then settle its Entity caches. */
export function useReopenQuestion({
  onReopened,
  onError,
}: {
  onReopened?: () => void;
  onError?: (message: string) => void;
} = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    // Case and target travel as the mutation variables: hook props follow re-renders (an
    // Active Case switch), and a pending write must settle the Case it was started for.
    mutationFn: async ({ caseId, questionId }: ReopenQuestionVariables) =>
      reopenQuestionFn({
        data: questionScopeInputSchema.parse({ caseId, questionId }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onReopened?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Question reopened");
    },
    onError: (caughtError) => {
      onError?.(errMessage(caughtError, "Reopen failed"));
    },
  });
}
