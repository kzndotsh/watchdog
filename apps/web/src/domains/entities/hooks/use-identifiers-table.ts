import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { CaseRecord } from "@/domains/cases/types";
import { identifiersTableColumns } from "@/domains/entities/components/identifiers-table.columns";
import { identifiersForCaseQuery } from "@/domains/entities/identifiers/queries";
import { listPending } from "@/shared/lib/list-pending";

import { useIdentifiersTableComposer } from "./use-identifiers-table-composer";
import { useIdentifiersTableMutations } from "./use-identifiers-table-mutations";
import { useIdentifiersTableState } from "./use-identifiers-table-state";

export function useIdentifiersTable(active: CaseRecord) {
  const queryClient = useQueryClient();
  const identifiersQuery = useQuery(identifiersForCaseQuery(active.id));
  const rows = identifiersQuery.data ?? [];
  const pending = listPending(identifiersQuery);
  const identifiersPlaceholder = identifiersQuery.isPlaceholderData;
  const mutations = useIdentifiersTableMutations(active.id, rows);
  const tableState = useIdentifiersTableState(active, rows, mutations, pending);
  const composer = useIdentifiersTableComposer(active.id, queryClient);

  return {
    ...tableState,
    ...composer,
    columns: identifiersTableColumns,
    identifiersPlaceholder,
  };
}
