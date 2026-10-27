import { useQueryClient } from "@tanstack/react-query";
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
import { entityPickerPort } from "@/domains/entities/queries";
import { evidencePickerPort } from "@/domains/intake/queries";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { useListTable } from "@/shared/hooks/list/use-list-table";
import { useRecordsByIds } from "@/shared/hooks/use-picker-source";
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
 * URL. Search, filters and sort run on the server, and so do the pickers (#559): the composer's
 * Entity and Evidence pickers, the Entity filter and the Evidence cell read one small page each,
 * and linked Evidence titles come from a by-ids read of the loaded rows. No whole-Case read.
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
    sortColumns: { value: "value", added: "createdAt" },
    display,
  });
  const entitySource = useEntityRefSource(
    active.id,
    list.query.filters.entityId
  );

  const evidencePort = useMemo(
    () => evidencePickerPort(active.id),
    [active.id]
  );
  const entityPort = useMemo(() => entityPickerPort(active.id), [active.id]);
  // The Evidence cell names each row's first link: titles of those ids on the loaded page only.
  const evidenceTitles = useRecordsByIds(
    evidencePort,
    list.rows.flatMap((row) => row.evidenceIds.slice(0, 1))
  );
  const evidence = useMemo(
    () => ({ port: evidencePort, titles: evidenceTitles }),
    [evidencePort, evidenceTitles]
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
      evidence,
      updateField: mutations.updateField,
      saveEvidence: mutations.saveEvidence,
      saveNotes: mutations.saveNotes,
      onOpenSubject,
      onCopyValue,
      onDeleteIdentifier: setDeleteTarget,
    }),
    [mutations, evidence, onOpenSubject, onCopyValue]
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
    entityPort,
    evidencePort,
    caseId: active.id,
    deleteTarget,
    setDeleteTarget,
  };
}
