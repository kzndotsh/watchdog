import { identifierListView } from "@/domains/entities/identifiers/queries";
import type { IdentifierRecord } from "@/domains/entities/identifiers/types";
import { useList } from "@/shared/hooks/list/use-list";
import type { ListDisplay } from "@/shared/hooks/list/use-list-display";
import { useListTable } from "@/shared/hooks/list/use-list-table";
import type { AppAction } from "@/shared/lib/app-action";
import { dossierIdentifierColumns } from "@/shared/ui/identifiers/identifier-cells";
import { ListTable } from "@/shared/ui/list";
import type { identifierList } from "@watchdog/schemas/graph";
import type {
  IdentifierType,
  UnfixedSearch,
  UnfixedSearchPatch,
} from "@watchdog/schemas/shared";

type IdentifierTypeGroupTableProps = {
  readonly caseId: string;
  readonly entityId: string;
  readonly type: IdentifierType;
  /** The tab's view: its sort, filters and `q` apply inside every group. */
  readonly search: UnfixedSearch<typeof identifierList, "entityId">;
  readonly onSearchChange: (
    patch: UnfixedSearchPatch<typeof identifierList, "entityId">
  ) => void;
  readonly display: ListDisplay;
  readonly getRowActions: (row: IdentifierRecord) => readonly AppAction[];
};

/**
 * One type's group on the Dossier Identifiers tab: the Identifier list with the Entity and the
 * type fixed, a page at a time, with the tab's columns and row actions. The cells read their
 * actions from the section's `IdentifierTableActionsProvider`.
 */
export function IdentifierTypeGroupTable({
  caseId,
  entityId,
  type,
  search,
  onSearchChange,
  display,
  getRowActions,
}: IdentifierTypeGroupTableProps) {
  const { type: _viewTypes, ...rest } = search;
  const list = useList(identifierListView, {
    scope: { caseId },
    fixed: { entityId, type: [type] },
    search: rest,
    onSearchChange,
  });
  const { table } = useListTable(list, {
    columns: dossierIdentifierColumns,
    sortColumns: {
      value: "value",
      created: "createdAt",
      updated: "updatedAt",
    },
    display,
  });
  return (
    <ListTable
      list={list}
      table={table}
      density={display.density}
      getRowActions={getRowActions}
    />
  );
}
