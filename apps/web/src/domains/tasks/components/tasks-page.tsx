import { PlusIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import { TaskBoard } from "@/domains/tasks/components/task-board";
import { TaskFormDialog } from "@/domains/tasks/components/task-form-dialog";
import { useTaskWorkspace } from "@/domains/tasks/hooks/use-task-workspace";
import { cn } from "@/lib/utils";
import { usePaletteCommands } from "@/shared/hooks/use-palette-commands";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import type { AppAction } from "@/shared/lib/app-action";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { PendingRegion } from "@/shared/ui/pending-region";
import { Button } from "@/shared/ui/primitives/button";
import { BoardSkeleton } from "@/shared/ui/skeletons";
import { FieldError } from "@watchdog/ui/components/field";

type Props = {
  entityId?: string;
  taskId?: string;
  onTaskIdChange?: (next?: string) => void;
};

function TasksActive({
  active,
  entityId,
  taskId,
  onTaskIdChange,
}: Props & { active: CaseRecord }) {
  const ws = useTaskWorkspace(active.id, { entityId });
  const { openCreate, handleSelect, pending, tasks } = ws;
  const paletteActions = useMemo<AppAction[]>(
    () => [
      {
        id: "tasks-new",
        label: "New task",
        group: "page",
        icon: PlusIcon,
        keywords: "create add todo",
        run: () => {
          openCreate("backlog");
        },
      },
    ],
    [openCreate]
  );
  usePaletteCommands(paletteActions);

  useEffect(() => {
    const normalizedTaskId = scopeOptionalUuid(taskId);
    if (!normalizedTaskId || pending) return;
    const task = tasks.find((row) => row.id === normalizedTaskId);
    if (!task) {
      onTaskIdChange?.();
      return;
    }
    handleSelect(task);
    onTaskIdChange?.();
  }, [taskId, pending, tasks, handleSelect, onTaskIdChange]);

  return (
    <Page density="split" className="gap-0">
      <PageHeader
        count={ws.pending ? undefined : ws.tasks.length}
        countOn="tasks"
        actions={
          <Button
            size="sm"
            onClick={() => {
              ws.openCreate("backlog");
            }}
          >
            <PlusIcon className="size-3.5" />
            New task
          </Button>
        }
      />

      <PendingRegion
        isLoading={ws.pending}
        label="Loading board"
        fallback={<BoardSkeleton />}
        // Board bleeds to the inset edges (undoes Page's side + bottom padding).
        className="-mx-3 -mb-3 flex min-h-0 min-w-0 flex-1 flex-col sm:-mx-4 sm:-mb-4"
      >
        {ws.tasksLoadError ? (
          <div className="px-3 sm:px-4">
            <FetchErrorAlert
              error={ws.tasksLoadError}
              onRetry={ws.handleRetryBoard}
            />
          </div>
        ) : (
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              placeholderDeemphasisClass(ws.tasksPlaceholder)
            )}
          >
            <div className="px-3 sm:px-4">
              <FieldError>{ws.quickCreateError}</FieldError>
            </div>
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
              entityById={ws.entityById}
            />
          </div>
        )}
      </PendingRegion>

      <TaskFormDialog
        mode="create"
        open={ws.isCreateOpen}
        onOpenChange={ws.handleCreateOpenChange}
        entities={ws.entities}
        defaultEntityId={entityId}
        defaultStatus={ws.createStatus}
        isBusy={ws.createBusy}
        error={ws.formError}
        onSubmit={ws.handleCreate}
      />

      <TaskFormDialog
        mode="edit"
        open={ws.selected !== null}
        onOpenChange={(open) => {
          if (!open) ws.closeSelected();
        }}
        task={ws.selected}
        entities={ws.entities}
        isBusy={ws.updateBusy}
        error={ws.formError}
        onSubmit={ws.handleUpdate}
        onDelete={ws.handleDelete}
      />
    </Page>
  );
}

export function TasksPage({ entityId, taskId, onTaskIdChange }: Props) {
  const active = useLiveWorkCase();

  return (
    <TasksActive
      key={active.id}
      active={active}
      entityId={entityId}
      taskId={taskId}
      onTaskIdChange={onTaskIdChange}
    />
  );
}
