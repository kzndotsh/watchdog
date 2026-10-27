import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import type { CaseRecord } from "@/domains/cases/types";
import {
  entityTableColumns,
  type EntityTableActions,
} from "@/domains/entities/components/entity-table.columns";
import {
  copyEntityLink,
  copyEntityMarkdown,
} from "@/domains/entities/lib/entity-export";
import { entityListView } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { couldnt, errMessage } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { useListTable } from "@/shared/hooks/list/use-list-table";
import { toast } from "@/shared/ui/toast";
import type { entityList } from "@watchdog/schemas/graph";
import type { ListSearch, UnfixedSearchPatch } from "@watchdog/schemas/shared";

import { useEntityTableComposer } from "./use-entity-table-composer";
import { useEntityTableMutations } from "./use-entity-table-mutations";

/** The route's view of the list: its validated search and its URL writer. */
export type EntityTableSearch = {
  readonly search: ListSearch<typeof entityList>;
  readonly onSearchChange: (
    patch: UnfixedSearchPatch<typeof entityList, never>
  ) => void;
};

/**
 * The Entities table (ADR-0007): the Case's Entity list a page at a time, its view in the URL.
 * Search, the Kind filter and sort run on the server. Each row brings its Connection counts and
 * its one Connection, so no Case-wide Entity or Edge list is read; a Connection's peer picker
 * searches on the server (#559).
 */
export function useEntityTable(
  active: CaseRecord,
  { search, onSearchChange }: EntityTableSearch
) {
  const navigate = useNavigate();
  const caseSlug = active.slug;
  const [deleteTarget, setDeleteTarget] = useState<EntityRecord | null>(null);
  const list = useList(entityListView, {
    scope: { caseId: active.id },
    search,
    onSearchChange,
  });
  const display = useListDisplay("entities");
  const { table } = useListTable(list, {
    columns: entityTableColumns,
    sortColumns: { name: "name", created: "createdAt", updated: "updatedAt" },
    display,
  });

  const mutations = useEntityTableMutations(active.id);
  const composer = useEntityTableComposer(mutations.createEntity);

  const onOpenEntity = useCallback(
    (entity: Pick<EntityRecord, "slug">) => {
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
    (): EntityTableActions => ({
      caseId: active.id,
      updateKind: mutations.updateKind,
      updateSummary: mutations.updateSummary,
      updateNotes: mutations.updateNotes,
      createConnection: mutations.createConnection,
      updateConnection: mutations.updateConnection,
      deleteConnection: mutations.deleteConnection,
      onOpenEntity,
      onCopyEntityLink,
      onCopyEntityMarkdown,
      onDeleteEntity: setDeleteTarget,
    }),
    [active.id, mutations, onOpenEntity, onCopyEntityLink, onCopyEntityMarkdown]
  );

  return {
    ...composer,
    list,
    table,
    display,
    tableActions,
    columns: entityTableColumns,
    onRowClick: onOpenEntity,
    caseId: active.id,
    deleteTarget,
    setDeleteTarget,
  };
}
