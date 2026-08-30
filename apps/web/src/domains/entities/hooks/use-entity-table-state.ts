import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

import type { CaseRecord } from "@/domains/cases/types";
import {
  entityGlobalFilterFn,
  entityTableColumns,
  type EntityTableMeta,
} from "@/domains/entities/components/entity-table.columns";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import { connectionPeersByEntityId } from "@/domains/entities/lib/connection-peers";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import type { PageFilterChip } from "@/shared/layout/page-filter-menu";
import { listPending } from "@/shared/lib/list-pending";
import { useDataTable } from "@/shared/ui/data-table";

import type { useEntityTableMutations } from "./use-entity-table-mutations";

type EntityTableMutations = ReturnType<typeof useEntityTableMutations>;

function entityRowId(row: EntityRecord): string {
  return row.id;
}

function entityOptionsFromRows(rows: EntityRecord[]) {
  return rows.map((e) => ({ id: e.id, name: e.name, kind: e.kind }));
}

function kindColumnFilters(kindFilter: string[]) {
  if (kindFilter.length === 0) return [];
  return [{ id: "kind", value: kindFilter }];
}

function withoutKind(prev: string[], kind: string): string[] {
  return prev.filter((x) => x !== kind);
}

function kindFilterClearHandler(
  setKindFilter: Dispatch<SetStateAction<string[]>>,
  kind: string
): () => void {
  return () => {
    setKindFilter((prev) => withoutKind(prev, kind));
  };
}

function kindFilterChip(
  kind: string,
  setKindFilter: Dispatch<SetStateAction<string[]>>
): PageFilterChip {
  return {
    id: `kind:${kind}`,
    label: kind,
    onClear: kindFilterClearHandler(setKindFilter, kind),
  };
}

function kindFilterChips(
  kindFilter: string[],
  setKindFilter: Dispatch<SetStateAction<string[]>>
): PageFilterChip[] {
  return kindFilter.map((k) => kindFilterChip(k, setKindFilter));
}

function entityTableEmptyText(rowCount: number): string {
  return rowCount === 0
    ? "No entities yet — add one below."
    : "No entities match your filters.";
}

function buildEntityTableMeta(
  mutations: EntityTableMutations,
  peersByEntityId: ReturnType<typeof connectionPeersByEntityId>,
  entityOptions: ReturnType<typeof entityOptionsFromRows>
): EntityTableMeta {
  return {
    updateKind: mutations.updateKind,
    updateSummary: mutations.updateSummary,
    peersByEntityId,
    entityOptions,
    createConnection: mutations.createConnection,
    updateConnection: mutations.updateConnection,
  };
}

export function useEntityTableState(
  active: CaseRecord,
  mutations: EntityTableMutations
) {
  const navigate = useNavigate();
  const entitiesQuery = useQuery(entitiesListQuery(active.id));
  const edgesQuery = useQuery(edgesForCaseQuery(active.id));
  const pending = listPending(entitiesQuery) || listPending(edgesQuery);
  const rows = entitiesQuery.data;
  const caseEdges = edgesQuery.data;

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string[]>([]);

  const peersByEntityId = useMemo(
    () => connectionPeersByEntityId(caseEdges ?? []),
    [caseEdges]
  );

  const entityOptions = useMemo(
    () => entityOptionsFromRows(rows ?? []),
    [rows]
  );

  const columnFilters = useMemo(
    () => kindColumnFilters(kindFilter),
    [kindFilter]
  );

  const tableMeta = useMemo(
    () => buildEntityTableMeta(mutations, peersByEntityId, entityOptions),
    [mutations, peersByEntityId, entityOptions]
  );

  const { table } = useDataTable({
    data: rows ?? [],
    columns: entityTableColumns,
    meta: tableMeta,
    getRowId: entityRowId,
    globalFilter: search,
    onGlobalFilterChange: setSearch,
    columnFilters,
    globalFilterFn: entityGlobalFilterFn,
    initialSorting: [{ id: "name", desc: false }],
    pageSize: 50,
  });

  const filterChips = useMemo(
    () => kindFilterChips(kindFilter, setKindFilter),
    [kindFilter]
  );

  const emptyText = entityTableEmptyText(rows?.length ?? 0);

  const onRowClick = useCallback(
    (row: { slug: string }) => {
      void navigate({
        to: "/entities/$entitySlug",
        params: { entitySlug: row.slug },
      });
    },
    [navigate]
  );

  return {
    rows: rows ?? [],
    pending,
    table,
    search,
    setSearch,
    kindFilter,
    setKindFilter,
    filterChips,
    emptyText,
    onRowClick,
  };
}
