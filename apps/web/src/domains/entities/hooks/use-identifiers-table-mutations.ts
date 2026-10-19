import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateIdentifierFn } from "@/domains/entities/identifiers/identifiers.functions";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { entityChangedOpts } from "@/domains/entities/lib/entity-invalidation-opts";
import { buildUpdateIdentifierData } from "@/domains/entities/lib/identifier-write";
import { couldnt, errMessage } from "@/lib/utils";
import { useStaleVersionToast } from "@/shared/hooks/use-stale-version-toast";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { TOAST_IDENTIFIER_UPDATED } from "@/shared/lib/toast-copy";
import type {
  IdentifierEditTarget,
  IdentifierFieldUpdate,
} from "@/shared/ui/identifiers/identifier-cells";
import { toast } from "@/shared/ui/toast";
import type {
  ConfidenceTier,
  IdentifierStatus,
  IdentifierType,
} from "@watchdog/schemas/shared";

type UpdateIdentifierVars = {
  identifierId: string;
  expectedVersion: number;
  value?: string;
  platform?: string;
  type?: IdentifierType;
  status?: IdentifierStatus;
  confidence?: ConfidenceTier;
  notes?: string;
  evidenceIds?: string[];
};

function updateIdentifierFields(caseId: string, input: UpdateIdentifierVars) {
  return updateIdentifierFn({
    data: buildUpdateIdentifierData(caseId, input),
  });
}

async function onIdentifierUpdated(
  queryClient: QueryClient,
  caseId: string,
  rows: CaseIdentifierRecord[],
  identifierId: string
): Promise<void> {
  toast.success(TOAST_IDENTIFIER_UPDATED);
  const row = rows.find((entry) => entry.id === identifierId);
  await invalidateAfterEntityChanged(
    queryClient,
    caseId,
    row === undefined
      ? undefined
      : entityChangedOpts(queryClient, caseId, row.entityId, row.entitySlug)
  );
}

function onIdentifierUpdateError(error: unknown): void {
  toast.error(errMessage(error, couldnt("update", "identifier")));
}

function buildIdentifierMutationHandlers(
  mutate: (input: UpdateIdentifierVars) => void,
  mutateAsync: (input: UpdateIdentifierVars) => Promise<unknown>
) {
  return {
    updateField(target: IdentifierEditTarget, field: IdentifierFieldUpdate) {
      mutate({
        identifierId: target.id,
        expectedVersion: target.version,
        ...field,
      });
    },
    async saveEvidence(target: IdentifierEditTarget, evidenceIds: string[]) {
      await mutateAsync({
        identifierId: target.id,
        expectedVersion: target.version,
        evidenceIds,
      });
    },
  };
}

export function useIdentifiersTableMutations(
  caseId: string,
  rows: CaseIdentifierRecord[]
) {
  const queryClient = useQueryClient();
  const notifyStale = useStaleVersionToast();

  const { mutate, mutateAsync } = useMutation({
    mutationFn: async (input: UpdateIdentifierVars) =>
      updateIdentifierFields(caseId, input),
    onSuccess: async (_data, vars) =>
      onIdentifierUpdated(queryClient, caseId, rows, vars.identifierId),
    onError: (error, vars) => {
      const row = rows.find((entry) => entry.id === vars.identifierId);
      const handled = notifyStale(error, {
        noun: "identifier",
        caseId,
        entityId: row?.entityId,
        entitySlug: row?.entitySlug,
      });
      if (!handled) onIdentifierUpdateError(error);
    },
  });

  return buildIdentifierMutationHandlers(mutate, mutateAsync);
}
