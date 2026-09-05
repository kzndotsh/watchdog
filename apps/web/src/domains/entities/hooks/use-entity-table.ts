import { useCallback, useState } from "react";

import type { CaseRecord } from "@/domains/cases/types";
import { entityTableColumns } from "@/domains/entities/components/entity-table.columns";
import type { EntityRecord } from "@/domains/entities/types";

import { useEntityTableComposer } from "./use-entity-table-composer";
import { useEntityTableMutations } from "./use-entity-table-mutations";
import { useEntityTableState } from "./use-entity-table-state";

export function useEntityTable(active: CaseRecord) {
  const [deleteTarget, setDeleteTarget] = useState<EntityRecord | null>(null);
  const mutations = useEntityTableMutations(active.id);
  const onDeleteEntity = useCallback((entity: EntityRecord) => {
    setDeleteTarget(entity);
  }, []);
  const tableState = useEntityTableState(active, mutations, onDeleteEntity);
  const composer = useEntityTableComposer(mutations.createEntity);

  return {
    ...tableState,
    ...composer,
    columns: entityTableColumns,
    caseId: active.id,
    deleteTarget,
    setDeleteTarget,
  };
}
