import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useEffect } from "react";

import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import type { CaseRecord } from "@/domains/cases/types";
import { TaskBoard } from "@/domains/tasks/components/task-board";
import { TaskFormDialog } from "@/domains/tasks/components/task-form-dialog";
import { useTaskWorkspace } from "@/domains/tasks/hooks/use-task-workspace";
import { cn } from "@/lib/utils";
import { Page, PageHeader } from "@/shared/layout/page";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { PendingRegion } from "@/shared/ui/pending-region";
import { Button } from "@/shared/ui/shadcn/button";
import { BoardSkeleton } from "@/shared/ui/skeletons";

interface Props {
  entityId?: string;
  taskId?: string;
  onTaskIdChange?: (next?: string) => void;
}

function TasksActive({
  active,
  entityId,
  taskId,
  onTaskIdChange,
}: Props & { active: CaseRecord }) {
  const ws = useTaskWorkspace(active.id, { entityId });

  useEffect(() => {
    const normalizedTaskId = scopeOptionalUuid(taskId);
    if (!normalizedTaskId || ws.pending) return;
    const task = ws.tasks.find((row) => row.id === normalizedTaskId);
    if (!task) {
      onTaskIdChange?.();
      return;
    }
    ws.handleSelect(task);
    onTaskIdChange?.();
  }, [taskId, ws, onTaskIdChange]);

  return (
    <Page density="split" className="gap-3">
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
        loading={ws.pending}
        label="Loading board"
        fallback={<BoardSkeleton />}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {ws.tasksLoadError ? (
          <FetchErrorAlert
            error={ws.tasksLoadError}
            onRetry={ws.handleRetryBoard}
          />
        ) : (
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              placeholderDeemphasisClass(ws.tasksPlaceholder)
            )}
          >
            <FormInlineError>{ws.quickCreateError}</FormInlineError>
            <TaskBoard
              items={ws.tasks}
              selectedId={ws.selected?.id}
              onSelect={ws.handleSelect}
              onDelete={(task) => {
                void ws.handleDelete(task);
              }}
              onCommitDrop={ws.handleCommitDrop}
              onQuickCreate={ws.handleQuickCreate}
              quickCreateBusy={ws.quickCreateBusy}
              entityById={ws.entityById}
            />
          </div>
        )}
      </PendingRegion>

      <TaskFormDialog
        mode="create"
        open={ws.createOpen}
        onOpenChange={ws.handleCreateOpenChange}
        entities={ws.entities}
        defaultEntityId={entityId}
        defaultStatus={ws.createStatus}
        busy={ws.createBusy}
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
        busy={ws.updateBusy}
        error={ws.formError}
        onSubmit={ws.handleUpdate}
        onDelete={ws.handleDelete}
      />
    </Page>
  );
}

export function TasksPage({ entityId, taskId, onTaskIdChange }: Props) {
  const { active, pending, loadError, retry } = useCasesContext();

  if (loadError) {
    return (
      <Page>
        <PageHeader />
        <FetchErrorAlert error={loadError} onRetry={retry} />
      </Page>
    );
  }

  if (pending) {
    return (
      <Page>
        <PageHeader />
        <PendingRegion
          loading
          label="Loading active case"
          fallback={<BoardSkeleton />}
        >
          {null}
        </PendingRegion>
      </Page>
    );
  }

  if (!active) {
    return (
      <Page>
        <PageHeader />
        <EmptyState
          intent="blank-slate"
          items="cases"
          title="No Active Case"
          description={
            <>
              <Link to="/cases" className="underline">
                Select a Case
              </Link>{" "}
              to manage tasks.
            </>
          }
        />
      </Page>
    );
  }

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
