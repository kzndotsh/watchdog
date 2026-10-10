import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { bindCasesChangedInvalidation } from "@/shared/lib/query-invalidation";

/**
 * Bind the Active Case switch event to the Query cache. Mount once, in the
 * signed-in shell: every switch settles the case, activity and search slices,
 * so no screen binds it again.
 */
export function useCasesChangedInvalidation(): void {
  const queryClient = useQueryClient();
  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);
}
