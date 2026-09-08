import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type { CaseRecord } from "@/domains/cases/types";
import { identifiersTableColumns } from "@/domains/entities/components/identifiers-table.columns";
import { identifiersForCaseQuery } from "@/domains/entities/identifiers/queries";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { listPending } from "@/shared/lib/list-pending";
import {
  invalidateAfterEntityChanged,
  invalidateAfterEvidenceMutation,
} from "@/shared/lib/query-invalidation";
import { queryLoadError } from "@/shared/lib/query-load-error";

import { useIdentifiersTableComposer } from "./use-identifiers-table-composer";
import { useIdentifiersTableMutations } from "./use-identifiers-table-mutations";
import { useIdentifiersTableState } from "./use-identifiers-table-state";

const EMPTY_IDENTIFIERS: CaseIdentifierRecord[] = [];

export function useIdentifiersTable(active: CaseRecord) {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<CaseIdentifierRecord | null>(
    null
  );
  const identifiersQuery = useQuery(identifiersForCaseQuery(active.id));
  const rows = identifiersQuery.data ?? EMPTY_IDENTIFIERS;
  const pending = listPending(identifiersQuery);
  const identifiersLoadError = queryLoadError(
    identifiersQuery,
    pending,
    "Failed to load identifiers"
  );
  const identifiersPlaceholder = identifiersQuery.isPlaceholderData;
  const mutations = useIdentifiersTableMutations(active.id, rows);

  useLiveEvents(active.id, (event) => {
    if (event.type === "entity_changed") {
      void invalidateAfterEntityChanged(queryClient, active.id);
    }
    if (event.type === "evidence_changed") {
      void invalidateAfterEvidenceMutation(queryClient, active.id);
    }
  });

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
    identifiersPlaceholder:
      identifiersPlaceholder || tableState.auxiliaryPlaceholder,
    identifiersLoadError: identifiersLoadError ?? tableState.auxiliaryLoadError,
    retryTable: () => {
      if (identifiersQuery.isError) void identifiersQuery.refetch();
      tableState.retryAuxiliary();
    },
    caseId: active.id,
    deleteTarget,
    setDeleteTarget,
  };
}
