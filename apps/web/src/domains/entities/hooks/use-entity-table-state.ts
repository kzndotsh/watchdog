import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

import type { CaseRecord } from "@/domains/cases/types";
import {
  entityGlobalFilterFn,
  type EntityRow,
  entityTableColumns,
  type EntityTableActions,
} from "@/domains/entities/components/entity-table.columns";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import type { CaseEdgeRecord } from "@/domains/entities/edges/types";
import { connectionPeersByEntityId } from "@/domains/entities/lib/connection-peers";
import {
  copyEntityLink,
  copyEntityMarkdown,
} from "@/domains/entities/lib/entity-export";
import { entityOptionsFromRecords } from "@/domains/entities/lib/entity-options";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { couldnt, errMessage } from "@/lib/utils";
import type { PageFilterChip } from "@/shared/layout/page-filter-menu";
import { listPending } from "@/shared/lib/list-pending";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import { useDataTable } from "@/shared/ui/data-table";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { toast } from "@/shared/ui/toast";
import { ENTITY_KIND_LABELS } from "@watchdog/schemas/shared";
import type { EntityKind } from "@watchdog/schemas/shared";

import type { useEntityTableMutations } from "./use-entity-table-mutations";

type EntityTableMutations = ReturnType<typeof useEntityTableMutations>;

const EMPTY_ENTITIES: EntityRecord[] = [];
const EMPTY_EDGES: CaseEdgeRecord[] = [];
const NO_PEERS: EntityRow["peers"] = [];

function entityRowId(row: EntityRow): string {
  return row.id;
}

/** The table rows: each Entity with its Connection peers, so a peers refresh is a data change the filtered row model sees. */
function entityRowsWithPeers(
  entities: readonly EntityRecord[],
  peersByEntityId: ReadonlyMap<string, EntityRow["peers"]>
): EntityRow[] {
  return entities.map((entity) => ({
    ...entity,
    peers: peersByEntityId.get(entity.id) ?? NO_PEERS,
  }));
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

function entityKindFilterLabel(kind: string): string {
  return kind in ENTITY_KIND_LABELS
    ? ENTITY_KIND_LABELS[kind as EntityKind]
    : kind;
}

function kindFilterChip(
  kind: string,
  setKindFilter: Dispatch<SetStateAction<string[]>>
): PageFilterChip {
  return {
    id: `kind:${kind}`,
    label: entityKindFilterLabel(kind),
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

function buildEntityTableActions(
  mutations: EntityTableMutations,
  entityOptions: EntityOption[],
  actions: Pick<
    EntityTableActions,
    | "onOpenEntity"
    | "onCopyEntityLink"
    | "onCopyEntityMarkdown"
    | "onDeleteEntity"
  >
): EntityTableActions {
  return {
    updateKind: mutations.updateKind,
    updateSummary: mutations.updateSummary,
    updateNotes: mutations.updateNotes,
    entityOptions,
    createConnection: mutations.createConnection,
    updateConnection: mutations.updateConnection,
    deleteConnection: mutations.deleteConnection,
    ...actions,
  };
}

export function useEntityTableState(
  active: CaseRecord,
  mutations: EntityTableMutations,
  onDeleteEntity: (entity: EntityRecord) => void
) {
  const navigate = useNavigate();
  const caseSlug = active.slug;
  const entitiesQuery = useQuery(entitiesListQuery(active.id));
  const edgesQuery = useQuery(edgesForCaseQuery(active.id));
  const pending = listPending(entitiesQuery) || listPending(edgesQuery);
  const tableLoadError = combinedQueryLoadError(
    [entitiesQuery, edgesQuery],
    pending,
    "Failed to load entities"
  );
  const entitiesPlaceholder =
    entitiesQuery.isPlaceholderData || edgesQuery.isPlaceholderData;
  const rows = entitiesQuery.data ?? EMPTY_ENTITIES;
  const caseEdges = edgesQuery.data;

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string[]>([]);

  const entityTextById = useMemo(() => {
    const map = new Map<
      string,
      { summary: string | null; notes: string | null }
    >();
    for (const entity of rows) {
      map.set(entity.id, { summary: entity.summary, notes: entity.notes });
    }
    return map;
  }, [rows]);

  const peersByEntityId = useMemo(
    () => connectionPeersByEntityId(caseEdges ?? EMPTY_EDGES, entityTextById),
    [caseEdges, entityTextById]
  );

  const entityOptions = useMemo(() => entityOptionsFromRecords(rows), [rows]);

  const columnFilters = useMemo(
    () => kindColumnFilters(kindFilter),
    [kindFilter]
  );

  const onOpenEntity = useCallback(
    (entity: EntityRecord) => {
      void navigate({
        to: "/cases/$caseSlug/entities/$entitySlug",
        params: { caseSlug, entitySlug: entity.slug },
      });
    },
    [navigate, caseSlug]
  );

  const onCopyEntityLink = useCallback(
    (entity: EntityRecord) => {
      void (async () => {
        try {
          await copyEntityLink(caseSlug, entity.slug);
        } catch (error: unknown) {
          toast.error(errMessage(error, couldnt("copy", "entity")));
        }
      })();
    },
    [caseSlug]
  );

  const onCopyEntityMarkdown = useCallback(
    (entity: EntityRecord) => {
      void (async () => {
        try {
          await copyEntityMarkdown(active.id, entity.slug);
        } catch (error: unknown) {
          toast.error(errMessage(error, couldnt("copy", "entity")));
        }
      })();
    },
    [active.id]
  );

  const tableActions = useMemo(
    () =>
      buildEntityTableActions(mutations, entityOptions, {
        onOpenEntity,
        onCopyEntityLink,
        onCopyEntityMarkdown,
        onDeleteEntity,
      }),
    [
      mutations,
      entityOptions,
      onOpenEntity,
      onCopyEntityLink,
      onCopyEntityMarkdown,
      onDeleteEntity,
    ]
  );

  const tableRows = useMemo(
    () => entityRowsWithPeers(rows, peersByEntityId),
    [rows, peersByEntityId]
  );

  const { table } = useDataTable({
    data: tableRows,
    columns: entityTableColumns,
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

  const emptyText = entityTableEmptyText(rows.length);

  const onRowClick = useCallback(
    (row: { slug: string }) => {
      void navigate({
        to: "/cases/$caseSlug/entities/$entitySlug",
        params: { caseSlug, entitySlug: row.slug },
      });
    },
    [navigate, caseSlug]
  );

  return {
    rows,
    pending,
    tableLoadError,
    retryTable: () => {
      if (entitiesQuery.isError) void entitiesQuery.refetch();
      if (edgesQuery.isError) void edgesQuery.refetch();
    },
    entitiesPlaceholder,
    table,
    tableActions,
    columns: entityTableColumns,
    search,
    setSearch,
    kindFilter,
    setKindFilter,
    filterChips,
    emptyText,
    onRowClick,
  };
}
