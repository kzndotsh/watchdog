import { CheckIcon, DownloadIcon, PlusIcon } from "lucide-react";
import { useMemo } from "react";

import { CreateCaseDialog } from "@/domains/cases/components/create-case-dialog";
import { DeleteCaseDialog } from "@/domains/cases/components/delete-case-dialog";
import { useCaseList } from "@/domains/cases/hooks/use-case-list";
import { caseCardActions } from "@/domains/cases/lib/case-card-actions";
import type { CaseRecord } from "@/domains/cases/types";
import { cn } from "@/lib/utils";
import { Page, PageHeader } from "@/shared/layout/page";
import { PageToolbar } from "@/shared/layout/page-toolbar";
import {
  filterActionsForSurface,
  type AppAction,
} from "@/shared/lib/app-action";
import { usePaletteCommands } from "@/shared/lib/palette-commands";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { ActionsContextMenu } from "@/shared/ui/actions-context-menu";
import {
  CASE_CARD_ACTIVE_CLASS,
  CASE_CARD_MIN_HEIGHT_CLASS,
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

function CaseCard({
  caseRow,
  isActive,
  selecting,
  onWork,
  onSetActiveOnly,
  onDelete,
}: {
  caseRow: CaseRecord;
  isActive: boolean;
  selecting: boolean;
  onWork: () => void;
  onSetActiveOnly: () => void;
  onDelete: () => void;
}) {
  const actions = caseCardActions(caseRow, {
    onOpen: onWork,
    onSetActiveOnly: isActive ? undefined : onSetActiveOnly,
    onDelete,
    selecting,
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
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm leading-tight font-medium">
            {caseRow.name}
          </p>
          <p className="text-muted-foreground text-2xs truncate font-mono">
            {caseRow.slug}
          </p>
        </div>
        {isActive ? (
          <Chip size="sm" className="shrink-0">
            <CheckIcon className="size-2.5" />
            Active
          </Chip>
        ) : null}
        <RowActionsMenu
          alwaysVisible
          label="Case actions"
          actions={dropdownActions}
        />
      </div>

      {caseRow.description ? (
        <p className="text-muted-foreground line-clamp-2 min-w-0 text-xs leading-snug">
          {caseRow.description}
        </p>
      ) : (
        <p className="text-muted-foreground/70 text-xs italic">
          No description
        </p>
      )}

      <Button
        variant="default"
        size="sm"
        className="mt-auto h-8 self-start"
        type="button"
        disabled={selecting}
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
      <span className="text-sm font-medium">New Case</span>
    </button>
  );
}

function CaseSlotGhost() {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none", CASE_CARD_MIN_HEIGHT_CLASS)}
    />
  );
}

function exportActiveCaseZip(activeId: string): void {
  const a = document.createElement("a");
  a.href = `/api/v1/cases/${activeId}/export.zip`;
  a.click();
}

function CaseListHeaderActions({
  activeId,
  onCreate,
}: {
  activeId: string;
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {activeId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            exportActiveCaseZip(activeId);
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

function CaseListGrid({
  pending,
  casesLoadError,
  onRetryCases,
  casesPlaceholder,
  casesLength,
  filtered,
  activeId,
  selecting,
  ghostCount,
  search,
  onClearSearch,
  onSelectCase,
  onWorkCase,
  onDeleteCase,
  onCreate,
}: {
  pending: boolean;
  casesLoadError: string | null;
  onRetryCases: () => void;
  casesPlaceholder: boolean;
  casesLength: number;
  filtered: CaseRecord[];
  activeId: string;
  selecting: boolean;
  ghostCount: number;
  search: string;
  onClearSearch: () => void;
  onSelectCase: (id: string) => void;
  onWorkCase: (caseRow: CaseRecord) => void;
  onDeleteCase: (caseRow: CaseRecord) => void;
  onCreate: () => void;
}) {
  if (casesLoadError) {
    return (
      <div className="min-h-0 flex-1">
        <FetchErrorAlert error={casesLoadError} onRetry={onRetryCases} />
      </div>
    );
  }

  if (casesLength > 0 && filtered.length === 0 && !pending) {
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
        placeholderDeemphasisClass(!pending && casesPlaceholder)
      )}
    >
      <PendingRegion
        loading={pending}
        label="Loading cases"
        fallback={<CardGridSkeleton />}
      >
        <div className="grid h-full min-h-full auto-rows-[minmax(9rem,1fr)] grid-cols-1 gap-3 p-px sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((caseRow) => (
            <CaseCard
              key={caseRow.id}
              caseRow={caseRow}
              isActive={caseRow.id === activeId}
              selecting={selecting}
              onWork={() => {
                onWorkCase(caseRow);
              }}
              onSetActiveOnly={() => {
                onSelectCase(caseRow.id);
              }}
              onDelete={() => {
                onDeleteCase(caseRow);
              }}
            />
          ))}
          <NewCaseCard onClick={onCreate} />
          {Array.from({ length: ghostCount }, (_, i) => (
            <CaseSlotGhost key={`ghost-${i}`} />
          ))}
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
    ghostCount,
    pending,
    casesLoadError,
    retryCases,
    casesPlaceholder,
    submitError,
    createOpen,
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
          <CaseListHeaderActions activeId={activeId} onCreate={openCreate} />
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
        pending={pending}
        casesLoadError={casesLoadError}
        onRetryCases={retryCases}
        casesPlaceholder={casesPlaceholder}
        casesLength={cases.length}
        filtered={filtered}
        activeId={activeId}
        selecting={selecting}
        ghostCount={ghostCount}
        search={search}
        onClearSearch={clearSearch}
        onSelectCase={selectCase}
        onWorkCase={(caseRow) => {
          void openCase(caseRow);
        }}
        onDeleteCase={beginDeleteCase}
        onCreate={openCreate}
      />

      <CreateCaseDialog
        open={createOpen}
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
