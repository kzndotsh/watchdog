import type { EntityRecord } from "@/domains/entities/types";

import {
  useDossierShellLiveInvalidation,
  useDossierShellMutations,
} from "./use-dossier-shell-mutations";
import { useDossierShellQueries } from "./use-dossier-shell-queries";

export function useDossierShell(caseId: string, entity: EntityRecord) {
  const queryState = useDossierShellQueries(caseId, entity);
  useDossierShellLiveInvalidation(caseId, entity, queryState.queryClient);
  const mutations = useDossierShellMutations({
    caseId,
    entity,
    queryClient: queryState.queryClient,
    setEditOpen: queryState.setEditOpen,
    setEditError: queryState.setEditError,
    setRenameError: queryState.setRenameError,
  });

  return {
    ...queryState,
    ...mutations,
  };
}
