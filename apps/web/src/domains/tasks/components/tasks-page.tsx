import { PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import { useEntityRefSource } from "@/domains/entities/hooks/use-entity-ref-source";
import { TaskBoard } from "@/domains/tasks/components/task-board";
import { TaskBoardNotice } from "@/domains/tasks/components/task-board-notice";
import { taskColumnLists } from "@/domains/tasks/components/task-column-lists";
import { LazyTaskFormDialog } from "@/domains/tasks/components/task-form-dialog-lazy";
import { useTaskWorkspace } from "@/domains/tasks/hooks/use-task-workspace";
import {
  DONE_COLUMN,
  DROPPED_COLUMN,
  type TasksSearch,
  type TasksSearchPatch,
} from "@/domains/tasks/lib/tasks-search";
import { taskListView } from "@/domains/tasks/queries";
import { cn } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { usePaletteCommands } from "@/shared/hooks/use-palette-commands";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import type { AppAction } from "@/shared/lib/app-action";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { ListCount } from "@/shared/ui/list/list-count";
import { ListToolbar } from "@/shared/ui/list/list-toolbar";
import { PendingRegion } from "@/shared/ui/pending-region";
import { Button } from "@/shared/ui/primitives/button";
import { BoardSkeleton } from "@/shared/ui/skeletons";
import { FieldError } from "@watchdog/ui/components/field";

type Props = {
  /** The route's view (`entityId`, `priority`, `q`, `sort`) and `taskId`. */
  search: TasksSearch;
  onSearchChange: (patch: TasksSearchPatch) => void;
};

function TasksActive({
  active,
  search,
  onSearchChange,
}: Props & { active: CaseRecord }) {
  const { taskId, ...listSearch } = search;
  const scope = useMemo(() => ({ caseId: active.id }), [active.id]);
  const done = useList(taskListView, {
    scope,
    fixed: DONE_COLUMN,
    search: listSearch,
    onSearchChange,
  });
  const dropped = useList(taskListView, {
    scope,
    fixed: DROPPED_COLUMN,
    search: listSearch,
    onSearchChange,
  });
  // The link's card is the open dialog until it closes; the dismissed id hides it for the frame
  // the URL takes to drop `taskId`.
  const [dismissedTaskId, setDismissedTaskId] = useState<string | null>(null);
  const linkedTaskId = taskId === dismissedTaskId ? undefined : taskId;
  const handleClearLink = useCallback(() => {
    setDismissedTaskId(taskId ?? null);
    onSearchChange({ taskId: undefined });
  }, [taskId, onSearchChange]);
  const ws = useTaskWorkspace(
    active.id,
    { done, dropped },
    { taskId: linkedTaskId, onClear: handleClearLink }
  );
  const display = useListDisplay("tasks");
  const entitySource = useEntityRefSource(
    active.id,
    done.query.filters.entityId
  );
  const { openCreate } = ws;

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

  const newTask = (
    <Button
      size="sm"
      onClick={() => {
        ws.openCreate("backlog");
      }}
    >
      <PlusIcon className="size-3.5" />
      New task
    </Button>
  );

  return (
    <Page density="split" className="gap-0">
      <PageHeader
        count={
          <ListCount
            count={ws.openCount}
            noun={done.def.noun}
            variant="compact"
            isLive={false}
          />
        }
        countOn="tasks"
      />
      <div className="flex flex-col gap-2 pb-3">
        <ListToolbar
          list={done}
          display={display}
          sources={{ entityId: entitySource }}
          actions={newTask}
        />
        {ws.isTruncated ? <TaskBoardNotice /> : null}
        {ws.linkError === null ? null : (
          <div className="flex flex-col items-start gap-2">
            <FetchErrorAlert
              error={ws.linkError}
              onRetry={ws.handleRetryLink}
            />
            <Button size="sm" variant="outline" onClick={handleClearLink}>
              Clear link
            </Button>
          </div>
        )}
      </div>

      <PendingRegion
        isLoading={ws.pending}
        label="Loading board"
        fallback={<BoardSkeleton />}
        // Board bleeds to the inset edges (undoes Page's side + bottom padding).
        className="-mx-3 -mb-3 flex min-h-0 min-w-0 flex-1 flex-col sm:-mx-4 sm:-mb-4"
      >
        {ws.boardLoadError ? (
          <div className="px-3 sm:px-4">
            <FetchErrorAlert
              error={ws.boardLoadError}
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
              columnLists={taskColumnLists({ done, dropped })}
            />
          </div>
        )}
      </PendingRegion>

      <LazyTaskFormDialog
        mode="create"
        open={ws.isCreateOpen}
        onOpenChange={ws.handleCreateOpenChange}
        caseId={active.id}
        defaultEntityId={ws.entityId}
        defaultStatus={ws.createStatus}
        isBusy={ws.createBusy}
        error={ws.formError}
        onSubmit={ws.handleCreate}
      />

      <LazyTaskFormDialog
        mode="edit"
        open={ws.selected !== null}
        onOpenChange={(open) => {
          if (!open) ws.closeSelected();
        }}
        task={ws.selected}
        caseId={active.id}
        isBusy={ws.updateBusy}
        error={ws.formError}
        onSubmit={ws.handleUpdate}
        onDelete={ws.handleDelete}
      />
    </Page>
  );
}

/**
 * The Case's Tasks board (#569): the open columns are one capped read (`tasks.board`), Done and
 * Dropped are the Task list a page at a time, and the toolbar's view (Entity, priority, search,
 * the finished columns' sort) lives in the URL and narrows every column.
 */
export function TasksPage({ search, onSearchChange }: Props) {
  const active = useLiveWorkCase();

  return (
    <TasksActive
      key={active.id}
      active={active}
      search={search}
      onSearchChange={onSearchChange}
    />
  );
}
