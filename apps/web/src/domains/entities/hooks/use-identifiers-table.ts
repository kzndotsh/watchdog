import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import type { CaseRecord } from "@/domains/cases/types";
import {
  identifiersTableColumns,
  type IdentifiersTableActions,
} from "@/domains/entities/components/identifiers-table.columns";
import { useEntityRefSource } from "@/domains/entities/hooks/use-entity-ref-source";
import { identifierListView } from "@/domains/entities/identifiers/queries";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { copyIdentifierValue } from "@/domains/entities/lib/entity-export";
import { entityOptionsFromRecords } from "@/domains/entities/lib/entity-options";
import { entitiesListQuery } from "@/domains/entities/queries";
import { mergeEvidenceRecords } from "@/domains/intake/lib/evidence";
import { evidenceListQuery } from "@/domains/intake/queries";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { useListTable } from "@/shared/hooks/list/use-list-table";
import { listPending } from "@/shared/lib/list-pending";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import { toast } from "@/shared/ui/toast";
import type { identifierList } from "@watchdog/schemas/graph";
import type { ListSearch, UnfixedSearchPatch } from "@watchdog/schemas/shared";

import { useIdentifiersTableComposer } from "./use-identifiers-table-composer";
import { useIdentifiersTableMutations } from "./use-identifiers-table-mutations";

/** The route's view of the list: its validated search and its URL writer. */
export type IdentifiersTableSearch = {
  readonly search: ListSearch<typeof identifierList>;
  readonly onSearchChange: (
    patch: UnfixedSearchPatch<typeof identifierList, never>
  ) => void;
};

/**
 * The Identifiers table (ADR-0007): the Case's Identifier list a page at a time, its view in the
 * URL. Search, filters and sort run on the server; the Entity and Evidence reads feed the
 * composer, the Entity filter's picker and the Evidence cell.
 */
export function useIdentifiersTable(
  active: CaseRecord,
  { search, onSearchChange }: IdentifiersTableSearch
) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const caseSlug = active.slug;
  const [deleteTarget, setDeleteTarget] = useState<CaseIdentifierRecord | null>(
    null
  );
  const list = useList(identifierListView, {
    scope: { caseId: active.id },
    search,
    onSearchChange,
  });
  const display = useListDisplay("identifiers");
  const { table } = useListTable(list, {
    columns: identifiersTableColumns,
    sortColumns: { value: "value" },
    display,
  });
  const entitySource = useEntityRefSource(
    active.id,
    list.query.filters.entityId
  );

  const entitiesQuery = useQuery(entitiesListQuery(active.id));
  const activeEvidenceQuery = useQuery(evidenceListQuery(active.id));
  const hiddenEvidenceQuery = useQuery(
    evidenceListQuery(active.id, { isHiddenOnly: true })
  );
  const contextQueries = [
    entitiesQuery,
    activeEvidenceQuery,
    hiddenEvidenceQuery,
  ];
  const contextLoadError = combinedQueryLoadError(
    contextQueries,
    contextQueries.some((query) => listPending(query)),
    "Failed to load identifier context"
  );
  const entities = entitiesQuery.data;
  const entityOptions = useMemo(
    () => entityOptionsFromRecords(entities ?? []),
    [entities]
  );
  const evidenceOptions = useMemo(
    () =>
      mergeEvidenceRecords(
        activeEvidenceQuery.data,
        hiddenEvidenceQuery.data
      ).map((e) => ({
        id: e.id,
        kind: e.kind,
        label: e.label,
        sourceUrl: e.sourceUrl,
        sha256: e.sha256,
      })),
    [activeEvidenceQuery.data, hiddenEvidenceQuery.data]
  );

  const mutations = useIdentifiersTableMutations(active.id, list.rows);
  const composer = useIdentifiersTableComposer(active.id, queryClient);

  const onOpenSubject = useCallback(
    (row: Pick<CaseIdentifierRecord, "entitySlug">) => {
      void navigate({
        to: "/cases/$caseSlug/entities/$entitySlug",
        params: { caseSlug, entitySlug: row.entitySlug },
        search: { tab: "identifiers" },
      });
    },
    [navigate, caseSlug]
  );
  const onCopyValue = useCallback((value: string) => {
    void (async () => {
      try {
        await copyIdentifierValue(value);
      } catch {
        toast.error("Couldn't copy");
      }
    })();
  }, []);

  const tableActions = useMemo(
    (): IdentifiersTableActions => ({
      evidenceOptions,
      updateField: mutations.updateField,
      saveEvidence: mutations.saveEvidence,
      saveNotes: mutations.saveNotes,
      onOpenSubject,
      onCopyValue,
      onDeleteIdentifier: setDeleteTarget,
    }),
    [mutations, evidenceOptions, onOpenSubject, onCopyValue]
  );

  return {
    ...composer,
    list,
    table,
    display,
    entitySource,
    tableActions,
    columns: identifiersTableColumns,
    onRowClick: onOpenSubject,
    entityOptions,
    evidenceOptions,
    contextLoadError,
    retryContext: () => {
      for (const query of contextQueries) {
        if (query.isError) void query.refetch();
      }
    },
    caseId: active.id,
    deleteTarget,
    setDeleteTarget,
  };
}
