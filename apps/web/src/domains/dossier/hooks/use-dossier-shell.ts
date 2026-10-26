import type { DossierTab } from "@/domains/dossier/lib/dossier-tabs";
import type { EntityRecord } from "@/domains/entities/types";

import { useDossierShellMutations } from "./use-dossier-shell-mutations";
import { useDossierShellQueries } from "./use-dossier-shell-queries";

export function useDossierShell(
  caseId: string,
  entity: EntityRecord,
  tab: DossierTab
) {
  const queryState = useDossierShellQueries(caseId, entity, tab);
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
