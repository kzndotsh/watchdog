import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { updateCaseFn } from "@/domains/cases/cases.functions";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import { writeCaseRecordCache } from "@/domains/cases/lib/case-cache";
import { buildUpdateCaseData } from "@/domains/cases/lib/case-write";
import { errMessage } from "@/lib/utils";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";
import { TOAST_CASE_UPDATED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";

/** Update a Case (name, description, egress). A rename can change the slug, so it re-routes. */
export function useUpdateCase(caseId: string, currentSlug: string | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (vars: {
      name?: string;
      description?: string | null;
      allowThirdPartyEgress?: boolean;
    }) => updateCaseFn({ data: buildUpdateCaseData(caseId, vars) }),
    onSuccess: async (updated) => {
      writeCaseRecordCache(
        queryClient,
        updated,
        currentSlug === undefined ? undefined : { slug: currentSlug }
      );
      notifyCasesChanged();
      toast.success(TOAST_CASE_UPDATED);
      if (updated.slug !== currentSlug) {
        await navigate({
          to: "/cases/$caseSlug",
          params: { caseSlug: updated.slug },
          replace: true,
        });
      }
      await invalidateAfterCaseSwitch(queryClient);
    },
    onError: (err) => {
      toast.error(errMessage(err, "Update failed"));
    },
  });
}
