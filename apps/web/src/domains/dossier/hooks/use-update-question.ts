import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { updateQuestionFn } from "@/domains/entities/questions/questions.functions";
import { useStaleVersionToast } from "@/shared/hooks/use-stale-version-toast";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { updateQuestionInputSchema } from "@watchdog/schemas/graph";

export type UpdateQuestionVariables = DossierEntityScope & {
  questionId: string;
  /** The Question's `version` when the editor opened; the save fails as stale if it moved on. */
  expectedVersion: number;
  text: string;
  resolvedNote?: string | null;
};

/** Edit an Open Question's text (or resolution note), then settle its Entity caches. */
export function useUpdateQuestion({
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
      questionId,
      expectedVersion,
      text,
      resolvedNote,
    }: UpdateQuestionVariables) =>
      updateQuestionFn({
        data: updateQuestionInputSchema.parse({
          caseId,
          questionId,
          expectedVersion,
          text,
          ...(resolvedNote === undefined ? {} : { resolvedNote }),
        }),
      }),
    onSuccess: async (_data, { caseId, entityId, entitySlug }) => {
      onUpdated?.();
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      });
      toast.success("Question updated");
    },
    onError: (caughtError, { caseId, entityId, entitySlug }) => {
      notifyStale(caughtError, {
        noun: "question",
        caseId,
        entityId,
        entitySlug,
        onReload,
      });
    },
  });
}
