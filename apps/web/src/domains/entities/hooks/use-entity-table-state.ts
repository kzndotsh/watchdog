import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { CaseRecord } from "@/domains/cases/types";
import {
  entityGlobalFilterFn,
  entityTableColumns,
  type EntityTableMeta,
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
import { errMessage } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import type { PageFilterChip } from "@/shared/layout/page-filter-menu";
import { listPending } from "@/shared/lib/list-pending";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { useDataTable } from "@/shared/ui/data-table";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { ENTITY_KIND_LABELS } from "@/shared/ui/vocab";
import type { EntityKind } from "@watchdog/schemas";

import type { useEntityTableMutations } from "./use-entity-table-mutations";

type EntityTableMutations = ReturnType<typeof useEntityTableMutations>;

const EMPTY_ENTITIES: EntityRecord[] = [];
const EMPTY_EDGES: CaseEdgeRecord[] = [];

function entityRowId(row: EntityRecord): string {
  return row.id;
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

function buildEntityTableMeta(
  mutations: EntityTableMutations,
  peersByEntityId: ReturnType<typeof connectionPeersByEntityId>,
  entityOptions: EntityOption[],
  actions: Pick<
    EntityTableMeta,
    | "onOpenEntity"
    | "onCopyEntityLink"
    | "onCopyEntityMarkdown"
    | "onDeleteEntity"
  >
): EntityTableMeta {
  return {
    updateKind: mutations.updateKind,
    updateSummary: mutations.updateSummary,
    updateNotes: mutations.updateNotes,
    peersByEntityId,
    entityOptions,
    createConnection: mutations.createConnection,
    updateConnection: mutations.updateConnection,
    ...actions,
  };
}

export function useEntityTableState(
  active: CaseRecord,
  mutations: EntityTableMutations,
  onDeleteEntity: (entity: EntityRecord) => void
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const entitiesQuery = useQuery(entitiesListQuery(active.id));
  const edgesQuery = useQuery(edgesForCaseQuery(active.id));
  const pending = listPending(entitiesQuery) || listPending(edgesQuery);
  const tableLoadError =
    !pending && (entitiesQuery.isError || edgesQuery.isError)
      ? errMessage(
          entitiesQuery.error ?? edgesQuery.error,
          "Failed to load entities"
        )
      : null;
  const entitiesPlaceholder =
    entitiesQuery.isPlaceholderData || edgesQuery.isPlaceholderData;
  const rows = entitiesQuery.data;
  const caseEdges = edgesQuery.data;

  useLiveEvents(active.id, (event) => {
    if (event.type === "entity_changed") {
      void invalidateAfterEntityChanged(queryClient, active.id);
    }
  });

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string[]>([]);

  const entityTextById = useMemo(() => {
    const map = new Map<
      string,
      { summary: string | null; notes: string | null }
    >();
    for (const entity of rows ?? EMPTY_ENTITIES) {
      map.set(entity.id, { summary: entity.summary, notes: entity.notes });
    }
    return map;
  }, [rows]);

  const peersByEntityId = useMemo(
    () => connectionPeersByEntityId(caseEdges ?? EMPTY_EDGES, entityTextById),
    [caseEdges, entityTextById]
  );

  const entityOptions = useMemo(
    () => entityOptionsFromRecords(rows ?? EMPTY_ENTITIES),
    [rows]
  );

  const columnFilters = useMemo(
    () => kindColumnFilters(kindFilter),
    [kindFilter]
  );

  const onOpenEntity = useCallback(
    (entity: EntityRecord) => {
      void navigate({
        to: "/entities/$entitySlug",
        params: { entitySlug: entity.slug },
      });
    },
    [navigate]
  );

  const onCopyEntityLink = useCallback((entity: EntityRecord) => {
    void (async () => {
      try {
        await copyEntityLink(entity.slug);
      } catch (error: unknown) {
        toast.error(errMessage(error, "Copy failed"));
      }
    })();
  }, []);

  const onCopyEntityMarkdown = useCallback(
    (entity: EntityRecord) => {
      void (async () => {
        try {
          await copyEntityMarkdown(active.id, entity.slug);
        } catch (error: unknown) {
          toast.error(errMessage(error, "Copy failed"));
        }
      })();
    },
    [active.id]
  );

  const tableMeta = useMemo(
    () =>
      buildEntityTableMeta(mutations, peersByEntityId, entityOptions, {
        onOpenEntity,
        onCopyEntityLink,
        onCopyEntityMarkdown,
        onDeleteEntity,
      }),
    [
      mutations,
      peersByEntityId,
      entityOptions,
      onOpenEntity,
      onCopyEntityLink,
      onCopyEntityMarkdown,
      onDeleteEntity,
    ]
  );

  const { table } = useDataTable({
    data: rows ?? EMPTY_ENTITIES,
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
    rows: rows ?? EMPTY_ENTITIES,
    pending,
    tableLoadError,
    retryTable: () => {
      if (entitiesQuery.isError) void entitiesQuery.refetch();
      if (edgesQuery.isError) void edgesQuery.refetch();
    },
    entitiesPlaceholder,
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
