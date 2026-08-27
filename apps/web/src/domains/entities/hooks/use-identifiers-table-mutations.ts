import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { updateIdentifierFn } from "@/domains/entities/identifiers/identifiers.functions";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import type { IdentifierFieldUpdate } from "@/shared/ui/identifiers/identifier-cells";
import type {
  ConfidenceTier,
  IdentifierStatus,
  IdentifierType,
} from "@watchdog/schemas";

interface UpdateIdentifierVars {
  identifierId: string;
  value?: string;
  platform?: string;
  type?: IdentifierType;
  status?: IdentifierStatus;
  confidence?: ConfidenceTier;
  notes?: string;
  evidenceIds?: string[];
}

function updateIdentifierFields(caseId: string, input: UpdateIdentifierVars) {
  return updateIdentifierFn({ data: { caseId, ...input } });
}

async function onIdentifierUpdated(
  queryClient: QueryClient,
  caseId: string,
  rows: CaseIdentifierRecord[],
  identifierId: string
): Promise<void> {
  toast.success("Updated");
  const row = rows.find((entry) => entry.id === identifierId);
  await invalidateAfterEntityChanged(queryClient, caseId, {
    entityId: row?.entityId,
  });
}

function onIdentifierUpdateError(error: unknown): void {
  toast.error(errMessage(error, "Update failed"));
}

function buildIdentifierMutationHandlers(
  mutate: (input: UpdateIdentifierVars) => void,
  mutateAsync: (input: UpdateIdentifierVars) => Promise<unknown>
) {
  return {
    updateField(identifierId: string, field: IdentifierFieldUpdate) {
      mutate({ identifierId, ...field });
    },
    async saveEvidence(identifierId: string, evidenceIds: string[]) {
      await mutateAsync({ identifierId, evidenceIds });
    },
  };
}

export function useIdentifiersTableMutations(
  caseId: string,
  rows: CaseIdentifierRecord[]
) {
  const queryClient = useQueryClient();

  const { mutate, mutateAsync } = useMutation({
    mutationFn: async (input: UpdateIdentifierVars) =>
      updateIdentifierFields(caseId, input),
    onSuccess: async (_data, vars) =>
      onIdentifierUpdated(queryClient, caseId, rows, vars.identifierId),
    onError: onIdentifierUpdateError,
  });

  return buildIdentifierMutationHandlers(mutate, mutateAsync);
}
