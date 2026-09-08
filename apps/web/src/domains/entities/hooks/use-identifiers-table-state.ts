import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { CaseRecord } from "@/domains/cases/types";
import {
  identifiersGlobalFilterFn,
  identifiersTableColumns,
  type IdentifiersTableMeta,
} from "@/domains/entities/components/identifiers-table.columns";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { copyIdentifierValue } from "@/domains/entities/lib/entity-export";
import { entityOptionsFromRecords } from "@/domains/entities/lib/entity-options";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { mergeEvidenceRecords } from "@/domains/intake/lib/evidence";
import { evidenceListQuery } from "@/domains/intake/queries";
import type { EvidenceRecord } from "@/domains/intake/types";
import { errMessage } from "@/lib/utils";
import type { PageFilterChip } from "@/shared/layout/page-filter-menu";
import { listPending } from "@/shared/lib/list-pending";
import { useDataTable } from "@/shared/ui/data-table";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import {
  confidenceLabel,
  IDENTIFIER_TYPE_LABELS,
  statusLabel,
} from "@/shared/ui/vocab";
import type {
  ConfidenceTier,
  IdentifierStatus,
  IdentifierType,
} from "@watchdog/schemas";

import type { useIdentifiersTableMutations } from "./use-identifiers-table-mutations";

type IdentifiersTableMutations = ReturnType<
  typeof useIdentifiersTableMutations
>;

function identifierRowId(row: CaseIdentifierRecord): string {
  return row.id;
}

function evidenceOptionsFromRows(evidence: EvidenceRecord[]): EvidenceOption[] {
  return evidence.map((e) => ({
    id: e.id,
    kind: e.kind,
    label: e.label,
    sourceUrl: e.sourceUrl,
    sha256: e.sha256,
  }));
}

function identifierColumnFilters(
  typeFilter: IdentifierType[],
  statusFilter: IdentifierStatus[],
  confidenceFilter: ConfidenceTier[]
) {
  const next: { id: string; value: string[] }[] = [];
  if (typeFilter.length > 0) next.push({ id: "type", value: typeFilter });
  if (statusFilter.length > 0) {
    next.push({ id: "status", value: statusFilter });
  }
  if (confidenceFilter.length > 0) {
    next.push({ id: "confidence", value: confidenceFilter });
  }
  return next;
}

function withoutValue<T>(prev: T[], value: T): T[] {
  return prev.filter((x) => x !== value);
}

function filterClearHandler<T>(
  setFilter: Dispatch<SetStateAction<T[]>>,
  value: T
): () => void {
  return () => {
    setFilter((prev) => withoutValue(prev, value));
  };
}

function typeFilterChip(
  type: IdentifierType,
  setTypeFilter: Dispatch<SetStateAction<IdentifierType[]>>
): PageFilterChip {
  return {
    id: `type:${type}`,
    label: IDENTIFIER_TYPE_LABELS[type],
    onClear: filterClearHandler(setTypeFilter, type),
  };
}

function statusFilterChip(
  status: IdentifierStatus,
  setStatusFilter: Dispatch<SetStateAction<IdentifierStatus[]>>
): PageFilterChip {
  return {
    id: `status:${status}`,
    label: statusLabel(status),
    onClear: filterClearHandler(setStatusFilter, status),
  };
}

function confidenceFilterChip(
  confidence: ConfidenceTier,
  setConfidenceFilter: Dispatch<SetStateAction<ConfidenceTier[]>>
): PageFilterChip {
  return {
    id: `confidence:${confidence}`,
    label: confidenceLabel(confidence),
    onClear: filterClearHandler(setConfidenceFilter, confidence),
  };
}

function identifierFilterChips(
  typeFilter: IdentifierType[],
  statusFilter: IdentifierStatus[],
  confidenceFilter: ConfidenceTier[],
  setTypeFilter: Dispatch<SetStateAction<IdentifierType[]>>,
  setStatusFilter: Dispatch<SetStateAction<IdentifierStatus[]>>,
  setConfidenceFilter: Dispatch<SetStateAction<ConfidenceTier[]>>
): PageFilterChip[] {
  return [
    ...typeFilter.map((t) => typeFilterChip(t, setTypeFilter)),
    ...statusFilter.map((s) => statusFilterChip(s, setStatusFilter)),
    ...confidenceFilter.map((c) =>
      confidenceFilterChip(c, setConfidenceFilter)
    ),
  ];
}

function identifiersTableEmptyText(rowCount: number): string {
  return rowCount === 0
    ? "No identifiers yet — add one below."
    : "No identifiers match your filters.";
}

const EMPTY_ENTITIES: EntityRecord[] = [];

function buildIdentifiersTableMeta(
  mutations: IdentifiersTableMutations,
  evidenceOptions: EvidenceOption[],
  actions: Pick<
    IdentifiersTableMeta,
    "onOpenSubject" | "onCopyValue" | "onDeleteIdentifier"
  >
): IdentifiersTableMeta {
  return {
    evidenceOptions,
    updateField: mutations.updateField,
    saveEvidence: mutations.saveEvidence,
    ...actions,
  };
}

export function useIdentifiersTableState(
  active: CaseRecord,
  rows: CaseIdentifierRecord[],
  mutations: IdentifiersTableMutations,
  identifiersPending: boolean,
  onDeleteIdentifier: (row: CaseIdentifierRecord) => void
) {
  const navigate = useNavigate();
  const entitiesQuery = useQuery(entitiesListQuery(active.id));
  const activeEvidenceQuery = useQuery(evidenceListQuery(active.id));
  const hiddenEvidenceQuery = useQuery(
    evidenceListQuery(active.id, { hiddenOnly: true })
  );
  const pending =
    identifiersPending ||
    listPending(entitiesQuery) ||
    listPending(activeEvidenceQuery) ||
    listPending(hiddenEvidenceQuery);
  const auxiliaryLoadError =
    !pending &&
    (entitiesQuery.isError ||
      activeEvidenceQuery.isError ||
      hiddenEvidenceQuery.isError)
      ? errMessage(
          entitiesQuery.error ??
            activeEvidenceQuery.error ??
            hiddenEvidenceQuery.error,
          "Failed to load identifier context"
        )
      : null;
  const auxiliaryPlaceholder =
    entitiesQuery.isPlaceholderData ||
    activeEvidenceQuery.isPlaceholderData ||
    hiddenEvidenceQuery.isPlaceholderData;
  const entities = entitiesQuery.data;
  const evidence = useMemo(
    () =>
      mergeEvidenceRecords(activeEvidenceQuery.data, hiddenEvidenceQuery.data),
    [activeEvidenceQuery.data, hiddenEvidenceQuery.data]
  );

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<IdentifierType[]>([]);
  const [statusFilter, setStatusFilter] = useState<IdentifierStatus[]>([]);
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceTier[]>(
    []
  );

  const evidenceOptions = useMemo(
    () => evidenceOptionsFromRows(evidence),
    [evidence]
  );

  const entityOptions = useMemo(
    () => entityOptionsFromRecords(entities ?? EMPTY_ENTITIES),
    [entities]
  );

  const columnFilters = useMemo(
    () => identifierColumnFilters(typeFilter, statusFilter, confidenceFilter),
    [typeFilter, statusFilter, confidenceFilter]
  );

  const onOpenSubject = useCallback(
    (row: CaseIdentifierRecord) => {
      void navigate({
        to: "/entities/$entitySlug",
        params: { entitySlug: row.entitySlug },
        search: { tab: "identifiers" },
      });
    },
    [navigate]
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

  const tableMeta = useMemo(
    () =>
      buildIdentifiersTableMeta(mutations, evidenceOptions, {
        onOpenSubject,
        onCopyValue,
        onDeleteIdentifier,
      }),
    [mutations, evidenceOptions, onOpenSubject, onCopyValue, onDeleteIdentifier]
  );

  const { table } = useDataTable({
    data: rows,
    columns: identifiersTableColumns,
    meta: tableMeta,
    getRowId: identifierRowId,
    globalFilter: search,
    onGlobalFilterChange: setSearch,
    columnFilters,
    globalFilterFn: identifiersGlobalFilterFn,
    initialSorting: [{ id: "entity", desc: false }],
    pageSize: 50,
  });

  const filterChips = useMemo(
    () =>
      identifierFilterChips(
        typeFilter,
        statusFilter,
        confidenceFilter,
        setTypeFilter,
        setStatusFilter,
        setConfidenceFilter
      ),
    [typeFilter, statusFilter, confidenceFilter]
  );

  const emptyText = identifiersTableEmptyText(rows.length);

  const onRowClick = useCallback(
    (row: { entitySlug: string }) => {
      void navigate({
        to: "/entities/$entitySlug",
        params: { entitySlug: row.entitySlug },
        search: { tab: "identifiers" },
      });
    },
    [navigate]
  );

  return {
    rows,
    pending,
    table,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    confidenceFilter,
    setConfidenceFilter,
    filterChips,
    emptyText,
    onRowClick,
    entityOptions,
    evidenceOptions,
    auxiliaryPlaceholder,
    auxiliaryLoadError,
    retryAuxiliary: () => {
      if (entitiesQuery.isError) void entitiesQuery.refetch();
      if (activeEvidenceQuery.isError) void activeEvidenceQuery.refetch();
      if (hiddenEvidenceQuery.isError) void hiddenEvidenceQuery.refetch();
    },
  };
}
