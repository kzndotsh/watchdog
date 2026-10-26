import { useMemo } from "react";

import { dossierTasksFallback } from "@/domains/dossier/components/dossier-tab-pending";
import type { DossierSectionProps } from "@/domains/dossier/types";
import { TaskBoard } from "@/domains/tasks/components/task-board";
import { TaskBoardNotice } from "@/domains/tasks/components/task-board-notice";
import { taskColumnLists } from "@/domains/tasks/components/task-column-lists";
import { LazyTaskFormDialog } from "@/domains/tasks/components/task-form-dialog-lazy";
import { useTaskWorkspace } from "@/domains/tasks/hooks/use-task-workspace";
import { taskListView } from "@/domains/tasks/queries";
import { cn } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { FieldError } from "@watchdog/ui/components/field";

type DossierTasksSectionProps = Pick<DossierSectionProps, "caseId"> & {
  /** The Dossier's Entity: the board is the Case's with `entityId` fixed. */
  entityId: string;
};

/** The tab has no toolbar: its view is its Entity, and no list param reaches the Dossier URL. */
const NO_SEARCH = {};
function ignoreSearchChange() {
  // No toolbar writes a view here.
}

export function DossierTasksSection({
  caseId,
  entityId,
}: DossierTasksSectionProps) {
  const scope = useMemo(() => ({ caseId }), [caseId]);
  const done = useList(taskListView, {
    scope,
    fixed: { status: ["done"], entityId },
    search: NO_SEARCH,
    onSearchChange: ignoreSearchChange,
  });
  const dropped = useList(taskListView, {
    scope,
    fixed: { status: ["dropped"], entityId },
    search: NO_SEARCH,
    onSearchChange: ignoreSearchChange,
  });
  const ws = useTaskWorkspace(caseId, { done, dropped });

  if (ws.pending) {
    return dossierTasksFallback();
  }

  return (
    <div
      className={cn(
        "border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border",
        placeholderDeemphasisClass(ws.tasksPlaceholder)
      )}
    >
      {ws.isTruncated ? (
        <div className="p-2">
          <TaskBoardNotice />
        </div>
      ) : null}
      <FieldError>{ws.quickCreateError}</FieldError>
      {ws.boardLoadError ? (
        <div className="p-2">
          <FetchErrorAlert
            error={ws.boardLoadError}
            onRetry={ws.handleRetryBoard}
          />
        </div>
      ) : (
        <TaskBoard
          items={ws.tasks}
          selectedId={ws.selected?.id}
          onSelect={ws.handleSelect}
          onDelete={(task) => {
            void ws.handleDelete(task);
          }}
          onCommitDrop={ws.handleCommitDrop}
          onQuickCreate={ws.handleQuickCreate}
          isQuickCreateBusy={ws.quickCreateBusy}
          columnLists={taskColumnLists({ done, dropped })}
        />
      )}

      <LazyTaskFormDialog
        mode="edit"
        open={ws.selected !== null}
        onOpenChange={(open) => {
          if (!open) ws.closeSelected();
        }}
        task={ws.selected}
        caseId={caseId}
        isBusy={ws.updateBusy}
        error={ws.formError}
        onSubmit={ws.handleUpdate}
        onDelete={ws.handleDelete}
      />
    </div>
  );
}
