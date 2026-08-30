import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { casesContextQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { TaskBoard } from "@/domains/tasks/components/task-board";
import { TaskFormDialog } from "@/domains/tasks/components/task-form-dialog";
import { useTaskWorkspace } from "@/domains/tasks/hooks/use-task-workspace";
import { cn } from "@/lib/utils";
import { Page, PageHeader } from "@/shared/layout/page";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { EmptyState } from "@/shared/ui/empty-state";
import { PendingRegion } from "@/shared/ui/pending-region";
import { Button } from "@/shared/ui/shadcn/button";
import { BoardSkeleton } from "@/shared/ui/skeletons";

interface Props {
  entityId?: string;
}

function TasksActive({ active, entityId }: Props & { active: CaseRecord }) {
  const ws = useTaskWorkspace(active.id, { entityId });

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
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            placeholderDeemphasisClass(ws.tasksPlaceholder)
          )}
        >
          <TaskBoard
            items={ws.tasks}
            selectedId={ws.selected?.id}
            onSelect={ws.handleSelect}
            onCommitDrop={ws.handleCommitDrop}
            onQuickCreate={ws.handleQuickCreate}
            quickCreateBusy={ws.quickCreateBusy}
            entityById={ws.entityById}
          />
        </div>
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

export function TasksPage({ entityId }: Props) {
  const { data: casesCtx } = useSuspenseQuery(casesContextQuery());

  if (!casesCtx.active) {
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
      key={casesCtx.active.id}
      active={casesCtx.active}
      entityId={entityId}
    />
  );
}
