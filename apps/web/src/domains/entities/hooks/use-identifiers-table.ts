import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type { CaseRecord } from "@/domains/cases/types";
import { identifiersTableColumns } from "@/domains/entities/components/identifiers-table.columns";
import { identifiersForCaseQuery } from "@/domains/entities/identifiers/queries";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { listPending } from "@/shared/lib/list-pending";

import { useIdentifiersTableComposer } from "./use-identifiers-table-composer";
import { useIdentifiersTableMutations } from "./use-identifiers-table-mutations";
import { useIdentifiersTableState } from "./use-identifiers-table-state";

export function useIdentifiersTable(active: CaseRecord) {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<CaseIdentifierRecord | null>(
    null
  );
  const identifiersQuery = useQuery(identifiersForCaseQuery(active.id));
  const rows = identifiersQuery.data ?? [];
  const pending = listPending(identifiersQuery);
  const identifiersPlaceholder = identifiersQuery.isPlaceholderData;
  const mutations = useIdentifiersTableMutations(active.id, rows);
  const onDeleteIdentifier = useCallback((row: CaseIdentifierRecord) => {
    setDeleteTarget(row);
  }, []);
  const tableState = useIdentifiersTableState(
    active,
    rows,
    mutations,
    pending,
    onDeleteIdentifier
  );
  const composer = useIdentifiersTableComposer(active.id, queryClient);

  return {
    ...tableState,
    ...composer,
    columns: identifiersTableColumns,
    identifiersPlaceholder,
    caseId: active.id,
    deleteTarget,
    setDeleteTarget,
  };
}
