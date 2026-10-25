import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArchiveRestoreIcon,
  CheckIcon,
  DownloadIcon,
  PlusIcon,
} from "lucide-react";
import { useMemo } from "react";

import { CreateCaseDialog } from "@/domains/cases/components/create-case-dialog";
import { DeleteCaseDialog } from "@/domains/cases/components/delete-case-dialog";
import { useCaseList } from "@/domains/cases/hooks/use-case-list";
import { caseCardActions } from "@/domains/cases/lib/case-card-actions";
import { exportCaseZip } from "@/domains/cases/lib/export-case-zip";
import { deletionPolicyQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { cn } from "@/lib/utils";
import { usePaletteCommands } from "@/shared/hooks/use-palette-commands";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { PageToolbar } from "@/shared/layout/page-toolbar";
import {
  filterActionsForSurface,
  type AppAction,
} from "@/shared/lib/app-action";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { ActionsContextMenu } from "@/shared/ui/actions-context-menu";
import {
  CASE_CARD_ACTIVE_CLASS,
  CASE_CARD_SHELL_CLASS,
  CASE_CREATE_SHELL_CLASS,
} from "@/shared/ui/case-card-shell";
import { Chip } from "@/shared/ui/chip";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { PendingRegion } from "@/shared/ui/pending-region";
import { Button } from "@/shared/ui/primitives/button";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { SearchField } from "@/shared/ui/search-field";
import { CardGridSkeleton } from "@/shared/ui/skeletons";
import { FieldError } from "@watchdog/ui/components/field";

type CaseCardProps = {
  caseRow: CaseRecord;
  isActive: boolean;
  isSelecting: boolean;
  onWork: () => void;
  onSetActiveOnly: () => void;
  /** Absent when the caller may not delete Cases: the action is not offered. */
  onDelete?: () => void;
};

function CaseCard({
  caseRow,
  isActive,
  isSelecting,
  onWork,
  onSetActiveOnly,
  onDelete,
}: CaseCardProps) {
  const actions = caseCardActions(caseRow, {
    onOpen: onWork,
    onSetActiveOnly: isActive ? undefined : onSetActiveOnly,
    onDelete,
    isSelecting,
  });
  const dropdownActions = filterActionsForSurface(actions, "dropdown");
  const shellClass = cn(
    CASE_CARD_SHELL_CLASS,
    "group flex h-full min-h-36 flex-col gap-3 p-5",
    isActive && CASE_CARD_ACTIVE_CLASS
  );

  return (
    <ActionsContextMenu
      actions={actions}
      trigger={<div className={shellClass} />}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight">{caseRow.name}</p>
        </div>
        {isActive ? (
          <Chip size="sm" className="shrink-0">
            <CheckIcon className="size-2.5" />
            Active
          </Chip>
        ) : null}
        <RowActionsMenu
          isAlwaysVisible
          label="Case actions"
          actions={dropdownActions}
        />
      </div>

      {caseRow.description ? (
        <p className="text-muted-foreground line-clamp-2 min-w-0 text-xs leading-snug">
          {caseRow.description}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs italic">No description</p>
      )}

      <Button
        variant="default"
        size="lg"
        className="mt-auto self-start"
        type="button"
        disabled={isSelecting}
        onClick={onWork}
      >
        Open
      </Button>
    </ActionsContextMenu>
  );
}

function NewCaseCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(CASE_CREATE_SHELL_CLASS, "h-full min-h-36 p-5")}
    >
      <PlusIcon className="size-5" />
      <span className="text-sm">New Case</span>
    </button>
  );
}

type CaseListHeaderActionsProps = {
  activeId: string;
  /** Owner or admin: may open Deleted Cases. */
  canManage: boolean;
  onCreate: () => void;
};

function CaseListHeaderActions({
  activeId,
  canManage,
  onCreate,
}: CaseListHeaderActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {canManage ? (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to="/deleted-cases" />}
        >
          <ArchiveRestoreIcon className="size-3.5" />
          Deleted Cases
        </Button>
      ) : null}
      {activeId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void exportCaseZip(activeId);
          }}
        >
          <DownloadIcon className="size-3.5" />
          Export
        </Button>
      ) : null}
      <Button type="button" size="sm" onClick={onCreate}>
        <PlusIcon className="size-3.5" />
        New Case
      </Button>
    </div>
  );
}

type CaseListGridProps = {
  isPending: boolean;
  casesLoadError: string | null;
  onRetryCases: () => void;
  isCasesPlaceholder: boolean;
  casesLength: number;
  filtered: CaseRecord[];
  activeId: string;
  isSelecting: boolean;
  search: string;
  onClearSearch: () => void;
  onSelectCase: (id: string) => void;
  onWorkCase: (caseRow: CaseRecord) => void;
  /** Absent when the caller may not delete Cases. */
  onDeleteCase?: (caseRow: CaseRecord) => void;
  onCreate: () => void;
};

function CaseListGrid({
  isPending,
  casesLoadError,
  onRetryCases,
  isCasesPlaceholder,
  casesLength,
  filtered,
  activeId,
  isSelecting,
  search,
  onClearSearch,
  onSelectCase,
  onWorkCase,
  onDeleteCase,
  onCreate,
}: CaseListGridProps) {
  if (casesLoadError) {
    return (
      <div className="min-h-0 flex-1">
        <FetchErrorAlert error={casesLoadError} onRetry={onRetryCases} />
      </div>
    );
  }

  if (casesLength > 0 && filtered.length === 0 && !isPending) {
    return (
      <EmptyState
        intent="no-results"
        items="cases"
        query={search}
        onClearFilters={onClearSearch}
        className="min-h-0 flex-1"
      />
    );
  }

  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto",
        placeholderDeemphasisClass(!isPending && isCasesPlaceholder)
      )}
    >
      <PendingRegion
        isLoading={isPending}
        label="Loading cases"
        fallback={<CardGridSkeleton />}
      >
        <div className="grid auto-rows-[minmax(10rem,auto)] grid-cols-1 gap-3 p-px sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((caseRow) => (
            <CaseCard
              key={caseRow.id}
              caseRow={caseRow}
              isActive={caseRow.id === activeId}
              isSelecting={isSelecting}
              onWork={() => {
                onWorkCase(caseRow);
              }}
              onSetActiveOnly={() => {
                onSelectCase(caseRow.id);
              }}
              onDelete={
                onDeleteCase === undefined
                  ? undefined
                  : () => {
                      onDeleteCase(caseRow);
                    }
              }
            />
          ))}
          <NewCaseCard onClick={onCreate} />
        </div>
      </PendingRegion>
    </div>
  );
}

export function CaseList() {
  const {
    activeId,
    cases,
    search,
    setSearch,
    filtered,
    pending,
    casesLoadError,
    retryCases,
    casesPlaceholder,
    submitError,
    isCreateOpen,
    setCreateOpen,
    deleteTarget,
    selecting,
    selectCase,
    openCase,
    openCreate,
    clearSearch,
    beginDeleteCase,
    handleCreateSuccess,
    handleCreateError,
    closeDeleteDialog,
    handleCaseDeleted,
  } = useCaseList();
  const { data: policy } = useQuery(deletionPolicyQuery());
  // Delete, restore and purge are for owners and admins; the server enforces it too.
  const canManage = policy?.canManage === true;
  const paletteActions = useMemo<AppAction[]>(
    () => [
      {
        id: "cases-new",
        label: "New Case",
        group: "page",
        icon: PlusIcon,
        keywords: "create add investigation",
        run: openCreate,
      },
    ],
    [openCreate]
  );
  usePaletteCommands(paletteActions);

  return (
    <Page className="min-h-0 overflow-hidden">
      <PageHeader
        actions={
          <CaseListHeaderActions
            activeId={activeId}
            canManage={canManage}
            onCreate={openCreate}
          />
        }
      />

      <FieldError>{submitError}</FieldError>

      <PageToolbar
        center={
          <SearchField
            value={search}
            onValueChange={setSearch}
            placeholder="Search cases…"
            aria-label="Search cases"
          />
        }
      />

      <CaseListGrid
        isPending={pending}
        casesLoadError={casesLoadError}
        onRetryCases={retryCases}
        isCasesPlaceholder={casesPlaceholder}
        casesLength={cases.length}
        filtered={filtered}
        activeId={activeId}
        isSelecting={selecting}
        search={search}
        onClearSearch={clearSearch}
        onSelectCase={selectCase}
        onWorkCase={(caseRow) => {
          void openCase(caseRow);
        }}
        onDeleteCase={canManage ? beginDeleteCase : undefined}
        onCreate={openCreate}
      />

      <CreateCaseDialog
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreateSuccess}
        onError={handleCreateError}
      />

      <DeleteCaseDialog
        caseRow={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={closeDeleteDialog}
        onDeleted={handleCaseDeleted}
      />
    </Page>
  );
}
